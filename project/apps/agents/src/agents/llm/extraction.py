from agents.orquestador.schema import CircuitSpec

_SYSTEM_PROMPT = """\
Eres un asistente que convierte descripciones en lenguaje natural de \
circuitos electrónicos analógicos en una especificación estructurada.

Tipos de circuito soportados, con sus parámetros (todos en unidades SI \
salvo que se indique):
- voltage_divider: divisor de voltaje resistivo. params: v_in (V), \
  v_out objetivo (V).
- rc_lowpass: filtro RC pasa-bajas. params: f_c objetivo, frecuencia de \
  corte (Hz).
- led_resistor: LED con resistencia limitadora. params: v_in (V), v_f, \
  voltage forward del LED (V), i_led objetivo, corriente (A).
- noninverting_amp: amplificador no inversor con amplificador operacional \
  (macromodelo). params: v_in (V), v_out objetivo (V). La ganancia es \
  v_out/v_in y tiene que ser mayor que 1: un no inversor no atenúa.

Cada bloque del circuito necesita un "id" único de tu elección (string \
corto, ej. "div1"). Si el usuario no especifica tolerancia ni número \
máximo de iteraciones, omite esos campos (tienen defaults). Devuelve \
únicamente la especificación estructurada, sin explicación adicional.
"""


class ExtractionError(Exception):
    """El LLM no produjo una CircuitSpec válida."""


def extract_circuit_spec(chat_model, request_text: str) -> CircuitSpec:
    structured_model = chat_model.with_structured_output(CircuitSpec)
    try:
        result = structured_model.invoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": request_text},
            ]
        )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, CircuitSpec):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result
