"""Curva de simulación para visualizar cualquier netlist.

La medición (`output.txt`) y la curva son dos corridas de ngspice separadas:
la curva se obtiene de una copia del netlist (`curve.cir`) con un `wrdata`
extra, así que un fallo acá nunca altera la métrica que juzga el curador. Es
best-effort: si algo sale mal, no hay curva y listo.

Para un análisis `op` —un solo punto— se barre la primera fuente
independiente con `dc`, de modo que el resultado sea la característica de
transferencia del circuito (p. ej. la regulación de línea de una fuente Zener)
en vez de un punto aislado.
"""

import os
import re
import subprocess

_CURVE_FILE = "curve.txt"
_CURVE_NETLIST = "curve.cir"
_MEASURE_FILE = "curve_measure.txt"
_SWEEP_STEPS = 100

_ANALYSIS_RE = re.compile(r"^\s*(op|ac|tran|dc)\b(.*)$", re.IGNORECASE | re.MULTILINE)
_DOT_ANALYSIS_RE = re.compile(r"^\s*\.(op|ac|tran|dc)\b(.*)$", re.IGNORECASE | re.MULTILINE)
_VECTOR_RE = re.compile(r"\b(vdb|vm|vp|vr|vi|v|i)\(\s*([^()]+?)\s*\)", re.IGNORECASE)
_SOURCE_RE = re.compile(r"^\s*([VI]\S*)\s+\S+\s+\S+(.*)$", re.IGNORECASE)
_CONTROL_RE = re.compile(r"^\s*\.control\b(.*?)^\s*\.endc\b", re.IGNORECASE | re.MULTILINE | re.DOTALL)
_STOP_RE = re.compile(r"^[ \t]*(quit|exit)\b|^[ \t]*\.endc\b", re.IGNORECASE | re.MULTILINE)

_SUFFIXES = {
    "t": 1e12, "g": 1e9, "meg": 1e6, "k": 1e3, "m": 1e-3,
    "u": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15,
}


def _parse_spice_number(token: str) -> float | None:
    match = re.fullmatch(r"([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(meg|[tgkmunpf])?[a-z]*", token.lower())
    if not match:
        return None
    return float(match.group(1)) * _SUFFIXES.get(match.group(2) or "", 1.0)


def _circuit_lines(netlist_text: str) -> list[str]:
    """Líneas de elementos del nivel superior: sin .control ni .subckt."""
    body = _CONTROL_RE.sub("", netlist_text)
    lines, in_subckt = [], False
    for line in body.splitlines():
        lower = line.strip().lower()
        if lower.startswith(".subckt"):
            in_subckt = True
        elif lower.startswith(".ends"):
            in_subckt = False
        elif not in_subckt and lower and not lower.startswith(("*", ".")):
            lines.append(line)
    return lines


def _first_source(netlist_text: str) -> tuple[str, float] | None:
    for line in _circuit_lines(netlist_text):
        match = _SOURCE_RE.match(line)
        if not match:
            continue
        tokens = match.group(2).split()
        value = None
        for idx, tok in enumerate(tokens):
            if tok.lower() == "dc" and idx + 1 < len(tokens):
                value = _parse_spice_number(tokens[idx + 1])
                break
        if value is None and tokens:
            value = _parse_spice_number(tokens[0])
        return match.group(1), value or 0.0
    return None


def _measured_vector(control: str, netlist_text: str) -> tuple[str, str] | None:
    """(función, argumento) del primer vector que el propio netlist usa para
    medir; si no nombra ninguno, un nodo llamado vout/out."""
    match = _VECTOR_RE.search(control)
    if match:
        return match.group(1).lower(), match.group(2)
    nodes = {tok.lower() for line in _circuit_lines(netlist_text) for tok in line.split()[1:]}
    for candidate in ("vout", "out"):
        if candidate in nodes:
            return "v", candidate
    return None


def plan_curve(netlist_text: str) -> dict | None:
    """Decide qué análisis, qué vector y qué comandos extra producen la curva.

    Devuelve None si el netlist no tiene bloque .control, análisis o vector
    reconocible.
    """
    control_match = _CONTROL_RE.search(netlist_text)
    if not control_match:
        return None
    control = control_match.group(1)

    analyses = _ANALYSIS_RE.findall(control) or _DOT_ANALYSIS_RE.findall(netlist_text)
    if not analyses:
        return None
    # El último análisis es el plot activo cuando corre el wrdata inyectado.
    analysis, args = analyses[-1][0].lower(), analyses[-1][1].split()

    measured = _measured_vector(control, netlist_text)
    if measured is None:
        return None
    func, arg = measured
    is_current = func == "i"

    extra: list[str] = []
    x_label = None
    if analysis == "op":
        source = _first_source(netlist_text)
        if source is None:
            return None
        name, value = source
        span = abs(value) * 1.5 or 1.0
        start, stop = (-span, 0.0) if value < 0 else (0.0, span)
        extra.append(f"dc {name} {start:g} {stop:g} {(stop - start) / _SWEEP_STEPS:g}")
        analysis, x_label = "dc", name
    elif analysis == "dc" and args:
        x_label = args[0]

    if analysis == "ac":
        if is_current:
            vector, y_unit = f"mag(i({arg}))", "A"
        elif func == "vp":
            vector, y_unit = f"vp({arg})", "rad"
        elif func in ("vr", "vi"):
            vector, y_unit = f"{func}({arg})", "V"
        else:
            vector, y_unit = f"vdb({arg})", "dB"
    else:
        vector, y_unit = (f"i({arg})", "A") if is_current else (f"v({arg})", "V")

    if analysis == "ac":
        x_unit = "Hz"
    elif analysis == "tran":
        x_unit = "s"
    else:
        x_unit = "A" if (x_label or "").lower().startswith("i") else "V"

    return {
        "analysis_type": analysis,
        "x_unit": x_unit,
        "y_unit": y_unit,
        "x_label": x_label,
        "vector": vector,
        "commands": [*extra, f"wrdata {_CURVE_FILE} {vector}"],
    }


def build_curve_netlist(netlist_text: str, plan: dict) -> str:
    """Copia del netlist con los comandos de curva antes del primer
    quit/exit/.endc, y la medición redirigida para no pisar output.txt."""
    text = re.sub(r"\boutput\.txt\b", _MEASURE_FILE, netlist_text, flags=re.IGNORECASE)
    control = _CONTROL_RE.search(text)
    stop = _STOP_RE.search(text, control.start(1))
    insert = "".join(f"{cmd}\n" for cmd in plan["commands"])
    return text[: stop.start()] + insert + text[stop.start():]


def parse_wrdata_curve(path: str, max_points: int = 100) -> list[dict[str, float]]:
    """Lee el archivo generado por wrdata y devuelve los puntos (x, y)
    muestreados uniformemente para su visualización gráfica."""
    if not os.path.exists(path):
        return []
    points = []
    try:
        with open(path) as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        points.append({"x": float(parts[0]), "y": float(parts[-1])})
                    except ValueError:
                        continue
    except OSError:
        return []

    if len(points) <= max_points:
        return points

    step = (len(points) - 1) / (max_points - 1)
    sampled = [points[int(round(i * step))] for i in range(max_points - 1)]
    sampled.append(points[-1])
    return sampled


def extract_curve(netlist_path: str) -> dict | None:
    """Corre ngspice sobre una copia del netlist y devuelve
    {curve, analysis_type, x_unit, y_unit, x_label}, o None si no hay curva."""
    try:
        with open(netlist_path, encoding="utf-8") as f:
            netlist_text = f.read()
    except OSError:
        return None

    plan = plan_curve(netlist_text)
    if plan is None:
        return None

    work_dir = os.path.dirname(os.path.abspath(netlist_path))
    curve_path = os.path.join(work_dir, _CURVE_FILE)
    try:
        if os.path.exists(curve_path):
            os.remove(curve_path)
        with open(os.path.join(work_dir, _CURVE_NETLIST), "w", encoding="utf-8") as f:
            f.write(build_curve_netlist(netlist_text, plan))
        subprocess.run(
            ["ngspice", "-b", _CURVE_NETLIST],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    curve = parse_wrdata_curve(curve_path)
    if not curve:
        return None
    return {
        "curve": curve,
        "analysis_type": plan["analysis_type"],
        "x_unit": plan["x_unit"],
        "y_unit": plan["y_unit"],
        "x_label": plan["x_label"],
    }
