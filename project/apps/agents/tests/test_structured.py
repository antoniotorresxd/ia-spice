"""Structured output con providers que rechazan el JSON schema por defecto
(Groq exige el modo estricto): se reintenta por tool calling."""

import pytest

from agents.llm.structured import invocar_estructurado

ERROR_GROQ = (
    "Error code: 400 - {'error': {'message': \"invalid JSON schema for response_format: "
    "'OrchestratorResult': /properties/outcome/oneOf/0: additionalProperties:false must be set "
    "on every object\", 'type': 'invalid_request_error', 'param': 'response_format'}}"
)


class _Modelo:
    """Falla con `error` en el modo por defecto; por tool calling responde `respuesta`."""

    def __init__(self, error: Exception, respuesta="ok"):
        self.error, self.respuesta, self.metodos = error, respuesta, []

    def with_structured_output(self, schema, method=None):
        self.metodos.append(method)
        modelo = self

        class _Estructurado:
            def invoke(self, messages):
                if method is None:
                    raise modelo.error
                return modelo.respuesta

        return _Estructurado()


def test_si_el_provider_rechaza_el_schema_se_reintenta_por_tool_calling():
    modelo = _Modelo(Exception(ERROR_GROQ))

    assert invocar_estructurado(modelo, dict, []) == "ok"
    assert modelo.metodos == [None, "function_calling"]


def test_otro_error_no_se_reintenta():
    modelo = _Modelo(Exception("Error code: 401 - invalid api key"))

    with pytest.raises(Exception, match="invalid api key"):
        invocar_estructurado(modelo, dict, [])
    assert modelo.metodos == [None]
