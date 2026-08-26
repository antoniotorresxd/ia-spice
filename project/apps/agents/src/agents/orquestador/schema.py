from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from agents.config import get_config


class VoltageDividerParams(BaseModel):
    v_in: float = Field(gt=0)
    v_out: float = Field(gt=0)


class RcLowpassParams(BaseModel):
    f_c: float = Field(gt=0)


class LedResistorParams(BaseModel):
    v_in: float = Field(gt=0)
    v_f: float = Field(gt=0)
    i_led: float = Field(gt=0)


class VoltageDividerBlock(BaseModel):
    id: str
    type: Literal["voltage_divider"]
    params: VoltageDividerParams


class RcLowpassBlock(BaseModel):
    id: str
    type: Literal["rc_lowpass"]
    params: RcLowpassParams


class LedResistorBlock(BaseModel):
    id: str
    type: Literal["led_resistor"]
    params: LedResistorParams


Block = Annotated[
    VoltageDividerBlock | RcLowpassBlock | LedResistorBlock,
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
        default_factory=lambda: get_config()["curador"]["max_iterations"], ge=1
    )
    tolerance: float = Field(
        default_factory=lambda: get_config()["curador"]["tolerance"], gt=0
    )

    @model_validator(mode="after")
    def _unique_block_ids(self):
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("block ids must be unique")
        return self
