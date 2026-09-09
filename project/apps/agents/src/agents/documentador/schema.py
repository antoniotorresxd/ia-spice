from pydantic import BaseModel


class CircuitDocumentation(BaseModel):
    """Salida estructurada de la documentación de un bloque del circuito."""

    summary: str
    tags: list[str]
    components: dict[str, str]
    measurement_explanation: str
