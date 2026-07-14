from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


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
    max_iterations: int = Field(default=5, ge=1)
    tolerance: float = Field(default=0.05, gt=0)

    @model_validator(mode="after")
    def _unique_block_ids(self):
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("block ids must be unique")
        return self
