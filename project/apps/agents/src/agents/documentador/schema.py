from pydantic import BaseModel, Field


class CircuitDocumentation(BaseModel):
    """Salida estructurada de la documentación de un bloque del circuito."""

    summary: str
    tags: list[str]
    components: dict[str, str]
    measurement_explanation: str
    chat_summary: str = Field(
        description=(
            "Mensaje breve para el chat (2 a 4 frases, Markdown, en español, en primera "
            "persona): qué circuito se diseñó, qué midió la simulación frente al objetivo "
            "y si quedó dentro de tolerancia. Sin nombres de variables internas."
        ),
    )
    design_walkthrough: str = Field(
        description=(
            "Explicación paso a paso de cómo se diseñó, en Markdown con fórmulas LaTeX "
            "($...$ en línea, $$...$$ en bloque), usando solo los datos del diseño dados."
        ),
    )
