"""Turns one curated block's already-rendered spiceTemplate into a `.subckt`
with `vin`/`vout`/`0` ports, so several curated blocks can be instantiated
together in one composed netlist (Slice B's `connections`).

Every node, device name and nested `.subckt`/`.model` name that isn't `vin`,
`vout` or `0` is prefixed with the block's own id. Two different curated
templates can (and do: `opamp_highpass_active` and `opamp_noninverting_amp`
both define a nested `.subckt opamp ...`) reuse the same internal names —
without this renaming, instantiating both in the same file would redefine
`opamp` twice. The block's own independent source (always named `Vin` by
catalog convention, e.g. `Vin vin 0 DC ...`) is dropped entirely: only the
composition assembler decides which block (if any) keeps an independent
source, since a block fed by an upstream connection must not have one.
"""
import re
from dataclasses import dataclass

from agents.escritura.netlist import build_catalog_netlist

RESERVED_NODES = {"vin", "vout", "0"}


@dataclass(frozen=True)
class SubcircuitPart:
    block_id: str
    text: str


def _rename_node(prefix: str, node: str) -> str:
    return node if node.lower() in RESERVED_NODES else f"{prefix}_{node}"


def _rename_name(prefix: str, name: str) -> str:
    """Renames a device instance name, keeping its leading type letter (SPICE
    requires it: `Egain` must stay `E...`, not become `hp_Egain`)."""
    return f"{name[0]}{prefix}_{name[1:]}" if len(name) > 1 else name


def _rename_plain(prefix: str, name: str) -> str:
    """Renames a `.subckt`/`.model` name, or an X-line's subckt reference —
    these are plain identifiers, not type-coded device instance names."""
    return f"{prefix}_{name}"


def _transform_line(line: str, prefix: str) -> str:
    tokens = line.split()
    head = tokens[0]
    low = head.lower()

    if low == ".subckt":
        name, ports = tokens[1], tokens[2:]
        new_ports = [_rename_node(prefix, p) for p in ports]
        return " ".join([".subckt", _rename_plain(prefix, name), *new_ports])

    if low == ".ends":
        return line

    if low == ".model":
        name, rest = tokens[1], tokens[2:]
        return " ".join([".model", _rename_plain(prefix, name), *rest])

    devtype = head[0].upper()
    if devtype == "X":
        *nodes, subckt_ref = tokens[1:]
        new_nodes = [_rename_node(prefix, n) for n in nodes]
        return " ".join([_rename_name(prefix, head), *new_nodes, _rename_plain(prefix, subckt_ref)])

    if devtype in ("R", "C", "L"):
        n1, n2, value = tokens[1], tokens[2], " ".join(tokens[3:])
        return " ".join([_rename_name(prefix, head), _rename_node(prefix, n1), _rename_node(prefix, n2), value])

    if devtype in ("E", "G"):
        n1, n2, n3, n4, value = tokens[1], tokens[2], tokens[3], tokens[4], " ".join(tokens[5:])
        nodes = [_rename_node(prefix, n) for n in (n1, n2, n3, n4)]
        return " ".join([_rename_name(prefix, head), *nodes, value])

    if devtype in ("D", "Q"):
        *nodes, model = tokens[1:]
        new_nodes = [_rename_node(prefix, n) for n in nodes]
        return " ".join([_rename_name(prefix, head), *new_nodes, _rename_plain(prefix, model)])

    if devtype == "V":
        # Only ever hit for a secondary source (the block's own `Vin` line is
        # dropped before this runs) — rename its two nodes, leave the rest
        # (DC/AC/SIN/... and their numeric args) untouched.
        n1, n2, rest = tokens[1], tokens[2], " ".join(tokens[3:])
        return " ".join([_rename_name(prefix, head), _rename_node(prefix, n1), _rename_node(prefix, n2), rest])

    # Unknown device type: best effort, rename every token but the last
    # (assumed to be a value/model reference) and the device name's suffix.
    *mid, last = tokens[1:]
    mid = [_rename_node(prefix, m) for m in mid]
    return " ".join([_rename_name(prefix, head), *mid, last])


def template_to_subcircuit(netlist_text: str, block_id: str) -> SubcircuitPart:
    body_lines: list[str] = []
    in_control = False
    for raw in netlist_text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("*"):
            continue
        low = stripped.lower()
        if low.startswith(".control"):
            in_control = True
            continue
        if low.startswith(".endc"):
            in_control = False
            continue
        if in_control or low == ".end":
            continue
        if re.match(r"^vin\s", stripped, re.IGNORECASE):
            # The block's own independent source; the assembler decides
            # which block (if any) gets one, not the template itself.
            continue
        body_lines.append(_transform_line(stripped, block_id))

    body = "\n".join(body_lines)
    text = f".subckt {block_id} vin vout 0\n{body}\n.ends\n"
    return SubcircuitPart(block_id=block_id, text=text)


def assemble_composed_netlist(blocks: list[dict], connections: list, component_values: dict) -> str:
    """Builds one netlist for a whole cascade of catalog blocks.

    Wiring: each block gets a canonical `{id}_vin`/`{id}_vout` node pair.
    A connection `("a.vout", "b.vin")` unifies b's input with a's output —
    b is then fed directly by a's output node, not a fresh one. A block
    whose input was never unified this way is a chain head and gets its own
    independent small-signal source (`V{id}_in {id}_vin 0 DC 0 AC 1`); a
    non-head block gets none, since its input node is already driven by its
    upstream block's output.

    A `Requirement` with no `node` is measured at its own block's output
    (the natural per-stage default); `input_node` for ratio-based measures
    (gain, cutoff) is always the block's own resolved input node, so a
    downstream stage's gain is measured relative to what actually drives it,
    not the original chain input.
    """
    from agents.curador.policy import metric_key
    from agents.escritura.measurements import measurement_commands

    in_node = {b["id"]: f'{b["id"]}_vin' for b in blocks}
    out_node = {b["id"]: f'{b["id"]}_vout' for b in blocks}

    def _split_port(endpoint: str, default_port: str) -> tuple[str, str]:
        # El orquestador (LLM) no siempre incluye el puerto — a veces manda
        # solo el id del bloque ("hp" en vez de "hp.vout"), porque para una
        # cadena simple vout->vin el puerto es inferible. Como hoy solo se
        # soporta esa forma de cadena de todos modos, faltarlo no es
        # ambiguo: se completa con el default en vez de fallar.
        block_id, sep, port = endpoint.partition(".")
        return block_id, port if sep else default_port

    fed_blocks = set()
    for src, dst in connections:
        src_block, src_port = _split_port(src, "vout")
        dst_block, dst_port = _split_port(dst, "vin")
        if src_port != "vout" or dst_port != "vin":
            raise ValueError(f"unsupported connection ports: {src} -> {dst} (only vout -> vin)")
        in_node[dst_block] = out_node[src_block]
        fed_blocks.add(dst_block)

    definitions: list[str] = []
    # Fuente muda que measure_dc/measure_current (Slice B) necesitan para su
    # barrido de un solo punto — ver measurements.py. Inerte cuando ningún
    # requisito del diseño la usa; más simple que emitirla condicionalmente.
    instances: list[str] = ["V__measure __measure 0 0"]
    control: list[str] = []
    for block in blocks:
        bid = block["id"]
        values = component_values.get(bid, {})
        rendered = build_catalog_netlist(block["params"], values)
        definitions.append(template_to_subcircuit(rendered, bid).text)
        instances.append(f"X{bid} {in_node[bid]} {out_node[bid]} 0 {bid}")
        if bid not in fed_blocks:
            instances.append(f"V{bid}_in {in_node[bid]} 0 DC 0 AC 1")

        for requirement in block["requirements"]:
            node = requirement.get("node") or out_node[bid]
            commands = measurement_commands(
                requirement, node=node, input_node=in_node[bid], values=values
            )
            control.extend(commands)
            key = metric_key(requirement)
            control.append(f"echo {bid} {key} $&{key} >> output.txt")

    body = "\n".join(definitions) + "\n" + "\n".join(instances)
    control_block = ".control\n" + "\n".join(control) + "\nquit\n.endc\n"
    return f"* Composed design\n{body}\n{control_block}.end\n"
