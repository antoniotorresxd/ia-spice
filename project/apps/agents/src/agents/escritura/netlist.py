import json
import re
from typing import Any

from pydantic import BaseModel, model_validator

from agents.knowledge.circuit_client import CircuitKnowledgeItem, fetch_circuit_detail
from agents.orquestador.schema import find_unresolved_placeholders


class WriterNetlist(BaseModel):
    """Salida del agente de escritura: netlist SPICE completo y ejecutable."""

    netlist: str

    @model_validator(mode="after")
    def _validate_netlist(self):
        if "output.txt" not in self.netlist:
            raise ValueError(
                "el netlist debe escribir su medición en output.txt "
                "(wrdata output.txt ..., o echo $&var > output.txt)"
            )
        if ".control" not in self.netlist:
            raise ValueError("el netlist debe traer un bloque .control que ejecute el análisis")
        unresolved = find_unresolved_placeholders(self.netlist)
        if unresolved:
            raise ValueError(
                f"placeholders sin resolver: {', '.join(unresolved)}; deben sustituirse "
                "por el valor numérico calculado o definirse mediante .param antes de "
                "usarse en el netlist final"
            )
        return self


def _ensure_title_line(netlist: str, title: str = "Circuit") -> str:
    """SPICE trata obligatoriamente la primera línea como título.
    Si el netlist no empieza con '*', anteponer una línea de título
    para evitar que ngspice descarte el primer componente."""
    stripped = netlist.lstrip()
    if not stripped.startswith("*"):
        return f"* {title}\n" + netlist
    return netlist


def _format_spice_value(val: Any) -> str:
    if isinstance(val, (int, float)):
        val_f = float(val)
        if val_f == int(val_f) and abs(val_f) < 1e9:
            return str(int(val_f))
        if 0 < abs(val_f) < 1e-3 or abs(val_f) >= 1e6:
            return f"{val_f:.4e}"
        return f"{val_f:.4f}".rstrip("0").rstrip(".")
    return str(val)


def build_catalog_netlist(params: dict, values: dict) -> str:
    """Construye el netlist a partir del spiceTemplate de la topología en el catálogo."""
    circuit_id = params["circuit_id"]
    circuit = fetch_circuit_detail(circuit_id)
    if not circuit or not circuit.spiceTemplate:
        raise ValueError(f"Topología '{circuit_id}' no encontrada en el catálogo o sin spiceTemplate")

    template = circuit.spiceTemplate
    combined = dict(values)
    for k, v in params.get("params", {}).items():
        if k not in combined:
            combined[k] = v

    def _replace_match(m: re.Match) -> str:
        name = m.group(1)
        if name in combined:
            return _format_spice_value(combined[name])
        for k, v in combined.items():
            if k.lower().replace("_", "") == name.lower().replace("_", ""):
                return _format_spice_value(v)
        return m.group(0)

    netlist = re.sub(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", _replace_match, template)
    unresolved = re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", netlist)
    if unresolved:
        raise ValueError(
            f"Topología '{circuit_id}' tiene parámetros sin resolver en su plantilla SPICE: {', '.join(unresolved)}"
        )
    return _ensure_title_line(netlist, circuit.name)


def generate_writer_netlist(
    chat_model,
    *,
    circuit: CircuitKnowledgeItem,
    params: dict[str, Any],
    goal: dict[str, Any],
    computed_values: dict[str, Any] | None = None,
) -> str:
    """Invoca al LLM asignado al rol de escritor (writer) para redactar el netlist SPICE."""
    structured_model = chat_model.with_structured_output(WriterNetlist)
    computed_str = (
        f"Valores de componentes ya calculados:\n{json.dumps(computed_values, indent=2)}\n\n"
        if computed_values
        else ""
    )
    user_prompt = (
        f"Eres un ingeniero experto en diseño de circuitos electrónicos analógicos y SPICE (ngspice).\n"
        f"Tu tarea es redactar el netlist SPICE completo y ejecutable para el siguiente circuito:\n\n"
        f"Nombre: {circuit.name} (id: {circuit.id})\n"
        f"Categoría: {circuit.category}\n"
        f"Descripción: {circuit.description}\n"
        f"Topología: {circuit.topologySummary}\n\n"
        f"Plantilla SPICE de referencia:\n```spice\n{circuit.spiceTemplate}\n```\n\n"
        f"Parámetros solicitados por el usuario:\n{json.dumps(params, indent=2)}\n\n"
        f"{computed_str}"
        f"Meta de diseño:\nMétrica: {goal.get('metric')}\nObjetivo numérico: {goal.get('target')}\n\n"
        f"Reglas estrictas:\n"
        f"1. Sustituye TODOS los marcadores entre llaves {{...}} por su valor numérico real (usando los valores calculados provistos). NO dejes ningún placeholder {{...}}.\n"
        f"2. La primera línea debe ser un comentario de título (* ...).\n"
        f"3. Conserva o adapta el bloque .control con la medición requerida hacia output.txt. Si la métrica es ganancia (gain), mide la magnitud positiva (ej. let gain = mag(v(vout)[...]) / ... o abs(...)).\n"
        f"4. Sé directo: emite el netlist sin razonamientos extensos para evitar truncamiento.\n"
    )

    messages = [
        {"role": "system", "content": "Genera el netlist SPICE final ejecutable siguiendo la plantilla y requerimientos."},
        {"role": "user", "content": user_prompt},
    ]
    try:
        result = structured_model.invoke(messages)
    except Exception as exc:
        if "structured outputs not support" in str(exc).lower() or "json_schema" in str(exc).lower():
            try:
                fallback_model = chat_model.with_structured_output(
                    WriterNetlist, method="function_calling"
                )
                result = fallback_model.invoke(messages)
            except Exception as fallback_exc:
                raise ValueError(f"Fallo en generación de netlist con LLM: {fallback_exc}") from fallback_exc
        else:
            raise

    if isinstance(result, WriterNetlist):
        return _ensure_title_line(result.netlist, circuit.name)
    if isinstance(result, dict) and "netlist" in result:
        return _ensure_title_line(result["netlist"], circuit.name)
    raise ValueError(f"Respuesta inesperada del LLM escritor: {result}")


NETLIST_BUILDERS = {
    "catalog": build_catalog_netlist,
    "generic": lambda params, values: _ensure_title_line(
        values.get("netlist", ""), params.get("description", "Generic Circuit")
    ),
}
