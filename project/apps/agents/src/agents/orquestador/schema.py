import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

from agents.config import get_config


def find_unresolved_placeholders(netlist: str) -> list[str]:
    """Identificadores de plantilla sin una definición .param en el netlist."""
    names = re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", netlist)
    defined = {
        name.lower()
        for name in re.findall(
            r"^[ \t]*\.param[ \t]+([A-Za-z_][A-Za-z0-9_]*)\b",
            netlist,
            flags=re.IGNORECASE | re.MULTILINE,
        )
    }
    return list(dict.fromkeys(name for name in names if name.lower() not in defined))


class GenericParams(BaseModel):
    """Un circuito fuera del catálogo curado.

    El LLM entrega el netlist ya hecho. Eso no lo vuelve confiable: ngspice
    sigue siendo el árbitro, igual que con los tipos curados. La diferencia con
    los trabajos que generan netlists con un LLM no es que aquí se genere
    mejor, es que aquí no se cree lo generado.
    """

    description: str = Field(min_length=1)
    metric: str = Field(min_length=1)
    target: float
    netlist: str = Field(min_length=1)

    @model_validator(mode="after")
    def _el_netlist_mide_algo(self):
        # Sin esto el shell corre ngspice y no encuentra nada que leer, y el
        # bloque falla con un error de parseo que no dice cuál fue el problema.
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
                "usarse en el netlist final, no dejarse literales como en el "
                "spiceTemplate de referencia del catálogo de circuitos"
            )
        return self


class CatalogParams(BaseModel):
    """Un circuito derivado del catálogo de topologías disponibles.

    El LLM del orquestador identifica la topología (`circuit_id`) y extrae los
    parámetros técnicos según su parametersSchema, además de la meta.
    """

    circuit_id: str = Field(min_length=1)
    params: dict[str, float] = Field(default_factory=dict)
    metric: str = Field(min_length=1)
    target: float
    description: str = Field(default="")


class CatalogBlock(BaseModel):
    id: str
    type: Literal["catalog"] = "catalog"
    params: CatalogParams


class GenericBlock(BaseModel):
    id: str
    type: Literal["generic"]
    params: GenericParams


Block = Annotated[
    CatalogBlock
    | GenericBlock,
    Field(discriminator="type"),
]


class CircuitSpec(BaseModel):
    """Interfaz de entrada del pipeline; el futuro LLM del orquestador
    deberá producir exactamente este schema."""

    blocks: list[Block] = Field(min_length=1)
    # Los valores por omisión salen de config/curador.yaml, no del código: el
    # RNF-04.2 de la tesina exige poder ajustar el máximo de iteraciones y la
    # tolerancia durante la evaluación experimental sin recompilar. Se leen con
    # default_factory (por instancia, no al importar) para que un experimento
    # que apunte CURADOR_CONFIG_PATH a otro archivo surta efecto.
    max_iterations: int = Field(
        default_factory=lambda: get_config()["curador"]["max_iterations"],
        ge=1,
        le=10,
        description="Número máximo de iteraciones para el curador (entre 1 y 10). Omitir si no se especificó.",
    )
    tolerance: float = Field(
        default_factory=lambda: get_config()["curador"]["tolerance"],
        gt=0,
        description="Tolerancia del diseño (ej. 0.05 para 5%). Omitir si no se especificó.",
    )

    @field_validator("max_iterations")
    @classmethod
    def _max_iterations_dentro_del_limite(cls, v: int, info: ValidationInfo) -> int:
        if v < 3 and any(getattr(b, "type", None) == "generic" for b in info.data.get("blocks", [])):
            v = 3
        # ge=1 en el Field de arriba no pone techo. Sin este límite, una
        # extracción del LLM (o un circuit_spec estructurado) que pida un
        # número grande deja correr el lazo del curador sin freno real: con
        # temperature=0, una reparación que no logra avanzar se repite
        # idéntica hasta agotar lo que se le haya dado, no los 5 del default.
        limite = get_config()["curador"]["max_iterations_cap"]
        if v > limite:
            raise ValueError(f"max_iterations ({v}) supera el límite configurado ({limite})")
        return v

    @model_validator(mode="after")
    def _unique_block_ids(self):
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("block ids must be unique")
        return self


class ChatOutcome(BaseModel):
    """El mensaje no era un pedido de diseño."""

    mode: Literal["chat"]
    reply: str = Field(min_length=1)


class ClarifyOutcome(BaseModel):
    """Hay intención de diseño pero falta información para completar un bloque."""

    mode: Literal["clarify"]
    question: str = Field(min_length=1)
    partial_spec: dict = Field(default_factory=dict)


class DesignOutcome(BaseModel):
    """Hay suficiente información: la especificación completa de siempre."""

    mode: Literal["design"]
    spec: CircuitSpec


class OrchestratorResult(BaseModel):
    """Envoltorio de nivel superior para el structured output del LLM.

    El discriminador vive en un campo (outcome.mode), no en la raíz: varios
    proveedores no aceptan una unión suelta como schema de nivel superior
    para tool calling, pero sí un objeto con un campo discriminado adentro.
    """

    pensamiento_ingenieril: str = Field(
        default="",
        description=(
            "Analiza el problema con conceptos de ingeniería electrónica (Sedra/Boylestad): "
            "identifica si se resuelve con una topología del catálogo, si se compone en cascada "
            "por etapas (ej. pasa-banda = pasa-altos + pasa-bajos), o si requiere clarificación."
        ),
    )
    outcome: Annotated[
        ChatOutcome | ClarifyOutcome | DesignOutcome,
        Field(discriminator="mode"),
    ]
