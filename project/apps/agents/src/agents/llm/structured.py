"""Structured output que funciona con cualquier provider.

`with_structured_output` usa por defecto `response_format` con JSON schema,
y cada provider lo acepta distinto: Groq exige el modo estricto
(`additionalProperties: false` en cada objeto, todos los campos required),
otros directamente no lo soportan. Cuando el provider rechaza el schema se
reintenta por tool calling, que todos los modelos con herramientas aceptan.

Aparte, una respuesta que llega pero no pasa la validación del schema (un
netlist todo en una línea, sin `.control`) se le devuelve al modelo una vez
con el error exacto: es un error de forma que sabe corregir, y sin esto el
nodo se rendía (el curador abandonaba una reparación correcta en contenido).
"""

import re

# Fragmentos (en minúsculas) de los errores con que los providers rechazan
# el `response_format`, no el contenido del pedido.
_RECHAZOS_DE_SCHEMA = (
    "structured outputs not support",
    "json_schema",
    "json schema",
    "response_format",
    "additionalproperties",
)

# Fragmentos de los errores de una respuesta que llegó pero no valida.
_SALIDA_INVALIDA = ("failed to parse", "validation error")

TEXTO_FORMATO = (
    "Tu respuesta anterior no se pudo usar porque no cumple el formato pedido: {error}\n"
    "Devuelve la respuesta completa otra vez, corrigiendo solo eso. En un netlist, cada "
    "elemento y cada directiva van en su propia línea (separadas con saltos de línea)."
)


def es_rechazo_de_schema(exc: Exception) -> bool:
    texto = str(exc).lower()
    return any(fragmento in texto for fragmento in _RECHAZOS_DE_SCHEMA)


def es_salida_invalida(exc: Exception) -> bool:
    texto = str(exc).lower()
    return any(fragmento in texto for fragmento in _SALIDA_INVALIDA)


def _motivo(exc: Exception) -> str:
    """Lo útil del error de validación de pydantic ("Value error, el netlist
    llegó en una sola línea…"), sin la respuesta entera que lo acompaña."""
    texto = str(exc)
    m = re.search(r"Value error, (.+?)(?: \[type=|$)", texto, re.DOTALL)
    return (m.group(1) if m else texto)[:600].strip()


def _invocar(chat_model, schema, messages):
    try:
        return chat_model.with_structured_output(schema).invoke(messages)
    except Exception as exc:  # noqa: BLE001 - se decide por el mensaje
        if not es_rechazo_de_schema(exc):
            raise
    return chat_model.with_structured_output(schema, method="function_calling").invoke(messages)


def invocar_estructurado(chat_model, schema, messages):
    """`chat_model.with_structured_output(schema).invoke(messages)`, con el
    reintento por tool calling si el provider rechaza el JSON schema y un
    reintento con el error si la respuesta no valida. Si el reintento
    también falla, lanza su error."""
    try:
        return _invocar(chat_model, schema, messages)
    except Exception as exc:  # noqa: BLE001 - se decide por el mensaje
        if not es_salida_invalida(exc):
            raise
        correccion = {"role": "user", "content": TEXTO_FORMATO.format(error=_motivo(exc))}
        return _invocar(chat_model, schema, [*messages, correccion])
