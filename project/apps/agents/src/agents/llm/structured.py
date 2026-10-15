"""Structured output que funciona con cualquier provider.

`with_structured_output` usa por defecto `response_format` con JSON schema,
y cada provider lo acepta distinto: Groq exige el modo estricto
(`additionalProperties: false` en cada objeto, todos los campos required),
otros directamente no lo soportan. Cuando el provider rechaza el schema se
reintenta por tool calling, que todos los modelos con herramientas aceptan.
"""

# Fragmentos (en minúsculas) de los errores con que los providers rechazan
# el `response_format`, no el contenido del pedido.
_RECHAZOS_DE_SCHEMA = (
    "structured outputs not support",
    "json_schema",
    "json schema",
    "response_format",
    "additionalproperties",
)


def es_rechazo_de_schema(exc: Exception) -> bool:
    texto = str(exc).lower()
    return any(fragmento in texto for fragmento in _RECHAZOS_DE_SCHEMA)


def invocar_estructurado(chat_model, schema, messages):
    """`chat_model.with_structured_output(schema).invoke(messages)`, con el
    reintento por tool calling si el provider rechaza el JSON schema. Si el
    reintento también falla, lanza su error (el del schema ya no importa)."""
    try:
        return chat_model.with_structured_output(schema).invoke(messages)
    except Exception as exc:  # noqa: BLE001 - se decide por el mensaje
        if not es_rechazo_de_schema(exc):
            raise
    return chat_model.with_structured_output(schema, method="function_calling").invoke(messages)
