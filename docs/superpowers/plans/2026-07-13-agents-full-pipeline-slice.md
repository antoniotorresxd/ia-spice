# Pipeline completo determinista (segundo corte de agentes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la topología completa del pipeline de agentes (orquestador → cálculo → síntesis → curador con lazo de ajuste) con lógica determinista, según el spec `docs/superpowers/specs/2026-07-13-agents-full-pipeline-slice-design.md`.

**Architecture:** Grafo padre de LangGraph con 4 unidades: nodo `orquestador` (validación Pydantic), subgrafo `calculo` (Master-Worker con Send API), subgrafo `sintesis` (escritura → shell, generalizado a 3 tipos de circuito keyed por sub-bloque), y nodo `curador` (política por reglas con arista condicional accept/reject → END, adjust → sintesis). Estado `CircuitState` con reducers de merge para los campos escritos en paralelo/incremental.

**Tech Stack:** Python 3.12, uv, LangGraph 1.2.x, PySpice, Pydantic, pytest, ngspice real (binario en PATH, sin mocks).

**Working directory:** todos los comandos se corren desde `project/apps/agents/`.

**Nota de transición:** la Task 1 reescribe `CircuitState` y elimina el e2e viejo (`tests/test_graph.py`); el grafo padre queda sin e2e hasta la Task 11, que lo recablea y escribe los e2e nuevos. Los tests unitarios de escritura/shell se mantienen verdes en cada commit porque se actualizan en la misma task que su código.

---

### Task 1: Dependencia Pydantic + nuevo `CircuitState` con reducers

**Files:**
- Modify: `pyproject.toml`
- Modify: `src/agents/state.py`
- Create: `tests/test_state.py`
- Delete: `tests/test_graph.py` (se recrea en Task 11)

- [ ] **Step 1: Agregar pydantic como dependencia directa**

Run: `uv add pydantic`
Expected: `pyproject.toml` gana `"pydantic>=2..."` en `dependencies` (ya está en el lock como transitiva de langgraph).

- [ ] **Step 2: Escribir el test del reducer**

`tests/test_state.py`:

```python
from agents.state import merge_dicts


def test_merge_dicts_merges_by_top_level_key():
    left = {"b1": {"r1": 1000}, "b2": {"r": 150}}
    right = {"b2": {"r": 141}}

    merged = merge_dicts(left, right)

    assert merged == {"b1": {"r1": 1000}, "b2": {"r": 141}}


def test_merge_dicts_tolerates_none_sides():
    assert merge_dicts(None, {"a": 1}) == {"a": 1}
    assert merge_dicts({"a": 1}, None) == {"a": 1}
    assert merge_dicts(None, None) == {}
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `uv run pytest tests/test_state.py -v`
Expected: FAIL — `ImportError: cannot import name 'merge_dicts'`.

- [ ] **Step 4: Reescribir `src/agents/state.py`**

```python
# project/apps/agents/src/agents/state.py
import operator
from typing import Annotated, TypedDict


def merge_dicts(left: dict | None, right: dict | None) -> dict:
    """Reducer: merge por clave de primer nivel (las claves son block_ids)."""
    return {**(left or {}), **(right or {})}


class CircuitState(TypedDict):
    # Entrada cruda del caller
    circuit_spec: dict

    # Escrito por 'orquestador'
    normalized_spec: dict | None
    pending_blocks: list | None

    # Escrito por los workers de 'calculo' (en paralelo) y mutado por 'curador'
    component_values: Annotated[dict, merge_dicts]

    # Escrito por 'sintesis', keyed por block_id; merge para conservar los
    # bloques no re-sintetizados en iteraciones posteriores
    netlists: Annotated[dict, merge_dicts]
    sim_results: Annotated[dict, merge_dicts]

    # Escrito por 'curador'
    iteration: int
    history: Annotated[list, operator.add]
    verdict: dict | None
```

- [ ] **Step 5: Borrar el e2e viejo**

Run: `rm tests/test_graph.py`
(El e2e nuevo se escribe en Task 11; los nodos viejos de escritura/shell se reescriben en Tasks 6-7.)

- [ ] **Step 6: Correr la suite**

Run: `uv run pytest -v`
Expected: PASS — `test_state.py`, `test_netlist.py`, `test_ngspice_runner.py` (los tests de nodos llaman las funciones directamente con dicts, no dependen del TypedDict).

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock src/agents/state.py tests/test_state.py
git rm tests/test_graph.py
git commit -m "feat(agents): CircuitState extendido con reducers para el pipeline completo"
```

---

### Task 2: Orquestador — schema Pydantic y nodo de validación

**Files:**
- Create: `src/agents/orquestador/__init__.py` (vacío)
- Create: `src/agents/orquestador/schema.py`
- Create: `src/agents/orquestador/node.py`
- Test: `tests/test_orquestador.py`

- [ ] **Step 1: Escribir los tests**

`tests/test_orquestador.py`:

```python
from agents.orquestador.node import orquestador_node, route_after_orquestador


def _state(circuit_spec):
    return {
        "circuit_spec": circuit_spec,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


VALID_SPEC = {
    "blocks": [
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
        {"id": "led1", "type": "led_resistor", "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02}},
    ]
}


def test_valid_spec_produces_normalized_spec_with_defaults():
    result = orquestador_node(_state(VALID_SPEC))

    spec = result["normalized_spec"]
    assert spec["max_iterations"] == 5
    assert [b["id"] for b in spec["blocks"]] == ["div1", "led1"]
    div = spec["blocks"][0]
    assert div["goal"] == {"metric": "v_out", "target": 3.3, "tolerance": 0.05}
    led = spec["blocks"][1]
    assert led["goal"] == {"metric": "i_led", "target": 0.02, "tolerance": 0.05}
    assert result["pending_blocks"] == ["div1", "led1"]
    assert result["iteration"] == 0


def test_spec_overrides_max_iterations_and_tolerance():
    spec_in = {**VALID_SPEC, "max_iterations": 3, "tolerance": 0.01}
    result = orquestador_node(_state(spec_in))

    assert result["normalized_spec"]["max_iterations"] == 3
    assert result["normalized_spec"]["blocks"][0]["goal"]["tolerance"] == 0.01


def test_invalid_spec_sets_rejected_verdict_without_raising():
    result = orquestador_node(_state({"blocks": [{"id": "x", "type": "nope", "params": {}}]}))

    assert result["verdict"]["status"] == "rejected"
    assert "circuit_spec" in result["verdict"]["reason"]


def test_empty_blocks_rejected():
    result = orquestador_node(_state({"blocks": []}))
    assert result["verdict"]["status"] == "rejected"


def test_duplicate_block_ids_rejected():
    dup = {
        "blocks": [
            {"id": "b1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
            {"id": "b1", "type": "rc_lowpass", "params": {"f_c": 1000.0}},
        ]
    }
    result = orquestador_node(_state(dup))
    assert result["verdict"]["status"] == "rejected"


def test_route_after_orquestador():
    assert route_after_orquestador({"verdict": None}) == "continue"
    assert route_after_orquestador({"verdict": {"status": "rejected"}}) == "reject"
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_orquestador.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.orquestador'`.

- [ ] **Step 3: Implementar el schema**

`src/agents/orquestador/schema.py`:

```python
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
```

- [ ] **Step 4: Implementar el nodo**

`src/agents/orquestador/node.py`:

```python
from pydantic import ValidationError

from agents.orquestador.schema import CircuitSpec
from agents.state import CircuitState

# metric name y de qué parámetro sale el target, por tipo de circuito
_GOALS = {
    "voltage_divider": ("v_out", "v_out"),
    "rc_lowpass": ("f_c", "f_c"),
    "led_resistor": ("i_led", "i_led"),
}


def orquestador_node(state: CircuitState) -> dict:
    try:
        spec = CircuitSpec.model_validate(state["circuit_spec"])
    except ValidationError as exc:
        return {
            "verdict": {
                "status": "rejected",
                "reason": f"invalid circuit_spec: {exc}",
                "best_iteration": None,
            }
        }

    blocks = []
    for block in spec.blocks:
        params = block.params.model_dump()
        metric, target_param = _GOALS[block.type]
        blocks.append(
            {
                "id": block.id,
                "type": block.type,
                "params": params,
                "goal": {
                    "metric": metric,
                    "target": params[target_param],
                    "tolerance": spec.tolerance,
                },
            }
        )

    return {
        "normalized_spec": {"blocks": blocks, "max_iterations": spec.max_iterations},
        "pending_blocks": [b["id"] for b in blocks],
        "iteration": 0,
    }


def route_after_orquestador(state: CircuitState) -> str:
    return "reject" if state["verdict"] is not None else "continue"
```

- [ ] **Step 5: Crear `src/agents/orquestador/__init__.py` vacío y correr los tests**

Run: `uv run pytest tests/test_orquestador.py -v`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/agents/orquestador tests/test_orquestador.py
git commit -m "feat(agents): orquestador determinista con validacion Pydantic"
```

---

### Task 3: Cálculo — fórmulas cerradas por tipo

**Files:**
- Create: `src/agents/calculo/__init__.py` (vacío)
- Create: `src/agents/calculo/formulas.py`
- Test: `tests/test_calculo.py`

- [ ] **Step 1: Escribir los tests de fórmulas**

`tests/test_calculo.py`:

```python
import math

import pytest

from agents.calculo.formulas import FORMULAS


def test_voltage_divider_values_satisfy_ratio():
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 3.3})

    r1, r2 = values["r1"], values["r2"]
    assert 5.0 * r2 / (r1 + r2) == pytest.approx(3.3, rel=1e-9)


def test_voltage_divider_unreachable_target_clamps_r2():
    # v_out >= v_in no tiene solución física; el worker no debe producir
    # resistencias negativas — el curador rechazará tras agotar iteraciones
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 6.0})
    assert values["r2"] == 1.0


def test_rc_lowpass_values_hit_cutoff():
    values = FORMULAS["rc_lowpass"]({"f_c": 1000.0})

    f_c = 1.0 / (2 * math.pi * values["r"] * values["c"])
    assert f_c == pytest.approx(1000.0, rel=1e-9)


def test_led_resistor_values_ohms_law():
    values = FORMULAS["led_resistor"]({"v_in": 5.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == pytest.approx((5.0 - 2.0) / 0.02, rel=1e-9)


def test_led_resistor_clamps_minimum_resistance():
    values = FORMULAS["led_resistor"]({"v_in": 2.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == 1.0
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_calculo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.calculo'`.

- [ ] **Step 3: Implementar**

`src/agents/calculo/formulas.py`:

```python
import math

R1_DEFAULT = 1000.0
R_RC_DEFAULT = 1000.0
R_MIN = 1.0  # ohms: piso para no emitir resistencias <= 0


def voltage_divider_values(params: dict) -> dict:
    v_in, v_out = params["v_in"], params["v_out"]
    r1 = R1_DEFAULT
    if v_out >= v_in:
        # meta físicamente inalcanzable: emitir un valor válido y dejar que
        # el lazo del curador la rechace al agotar iteraciones
        return {"r1": r1, "r2": R_MIN}
    return {"r1": r1, "r2": r1 * v_out / (v_in - v_out)}


def rc_lowpass_values(params: dict) -> dict:
    r = R_RC_DEFAULT
    return {"r": r, "c": 1.0 / (2 * math.pi * r * params["f_c"])}


def led_resistor_values(params: dict) -> dict:
    r = (params["v_in"] - params["v_f"]) / params["i_led"]
    return {"r": max(r, R_MIN)}


FORMULAS = {
    "voltage_divider": voltage_divider_values,
    "rc_lowpass": rc_lowpass_values,
    "led_resistor": led_resistor_values,
}
```

- [ ] **Step 4: Crear `__init__.py` vacío, correr los tests**

Run: `uv run pytest tests/test_calculo.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/calculo tests/test_calculo.py
git commit -m "feat(agents): formulas deterministas de calculo por tipo de circuito"
```

---

### Task 4: Cálculo — subgrafo Master-Worker con Send API

**Files:**
- Create: `src/agents/calculo/graph.py`
- Test: `tests/test_calculo.py` (agregar al final)

- [ ] **Step 1: Escribir el test del subgrafo**

Agregar al final de `tests/test_calculo.py`:

```python
from agents.calculo.graph import build_calculo_graph


def test_calculo_subgraph_fans_out_one_worker_per_block():
    graph = build_calculo_graph()
    state = {
        "circuit_spec": {},
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "rc1",
                    "type": "rc_lowpass",
                    "params": {"f_c": 1000.0},
                    "goal": {"metric": "f_c", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "rc1"],
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final_state = graph.invoke(state)

    values = final_state["component_values"]
    assert set(values.keys()) == {"div1", "rc1"}
    assert values["div1"]["r1"] == 1000.0
    assert "c" in values["rc1"]
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_calculo.py::test_calculo_subgraph_fans_out_one_worker_per_block -v`
Expected: FAIL — `ModuleNotFoundError` o import error de `build_calculo_graph`.

- [ ] **Step 3: Implementar el subgrafo**

`src/agents/calculo/graph.py`:

```python
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from agents.calculo.formulas import FORMULAS
from agents.state import CircuitState


class WorkerInput(TypedDict):
    block: dict


def master_node(state: CircuitState) -> dict:
    # el master no muta estado; el fan-out ocurre en la arista condicional
    return {}


def dispatch_workers(state: CircuitState) -> list[Send]:
    return [
        Send("worker", {"block": block})
        for block in state["normalized_spec"]["blocks"]
    ]


def worker_node(payload: WorkerInput) -> dict:
    block = payload["block"]
    values = FORMULAS[block["type"]](block["params"])
    return {"component_values": {block["id"]: values}}


def build_calculo_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("master", master_node)
    builder.add_node("worker", worker_node)
    builder.add_edge(START, "master")
    builder.add_conditional_edges("master", dispatch_workers, ["worker"])
    builder.add_edge("worker", END)
    return builder.compile()
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_calculo.py -v`
Expected: PASS (6 tests). Los dos workers corren en paralelo y el reducer `merge_dicts` de `component_values` junta ambos bloques.

- [ ] **Step 5: Commit**

```bash
git add src/agents/calculo/graph.py tests/test_calculo.py
git commit -m "feat(agents): subgrafo Master-Worker de calculo con Send API"
```

---

### Task 5: Escritura — generadores de netlist para los 3 tipos + registro

**Files:**
- Modify: `src/agents/escritura/netlist.py`
- Test: `tests/test_netlist.py` (agregar tests; los existentes del divisor no cambian)

- [ ] **Step 1: Escribir los tests nuevos**

Agregar al final de `tests/test_netlist.py` (el import de `escritura_node` y su test viejo se eliminan en Task 6; por ahora solo agregar):

```python
from agents.escritura.netlist import (
    NETLIST_BUILDERS,
    build_led_resistor_netlist,
    build_rc_lowpass_netlist,
)


def test_rc_lowpass_netlist_has_ac_analysis_and_meas():
    netlist = build_rc_lowpass_netlist(r=1000.0, c=1.59155e-7)

    assert "ac dec" in netlist
    assert "meas ac fc" in netlist.lower()
    assert "output.txt" in netlist
    assert netlist.strip().endswith(".end")


def test_led_resistor_netlist_has_diode_model_and_current_probe():
    netlist = build_led_resistor_netlist(v_in=5.0, r=150.0)

    assert ".model" in netlist.lower()
    assert "iled" in netlist.lower()
    assert "wrdata" in netlist
    assert netlist.strip().endswith(".end")


def test_netlist_builders_registry_covers_all_types():
    assert set(NETLIST_BUILDERS.keys()) == {
        "voltage_divider",
        "rc_lowpass",
        "led_resistor",
    }
    netlist = NETLIST_BUILDERS["voltage_divider"](
        {"v_in": 5.0, "v_out": 3.3}, {"r1": 1000.0, "r2": 1941.18}
    )
    assert "1941.18" in netlist
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_netlist.py -v`
Expected: FAIL — `ImportError: cannot import name 'NETLIST_BUILDERS'`.

- [ ] **Step 3: Implementar**

Agregar a `src/agents/escritura/netlist.py` (conservar `build_voltage_divider_netlist` tal cual):

```python
def build_rc_lowpass_netlist(r: float, c: float) -> str:
    """RC pasa-bajas con análisis AC; mide la frecuencia de corte (-3 dB)
    con `meas` y la escribe a output.txt vía redirección de echo."""
    circuit = Circuit("RC Lowpass")
    circuit.V("input", "vin", circuit.gnd, "DC 0 AC 1")
    circuit.R(1, "vin", "vout", r)
    circuit.C(1, "vout", circuit.gnd, c)

    control_block = (
        ".control\n"
        "ac dec 100 1 1e9\n"
        "meas ac fc WHEN vdb(vout)=-3\n"
        "echo $&fc > output.txt\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block


def build_led_resistor_netlist(v_in: float, r: float) -> str:
    """LED (diodo con modelo fijo) + resistencia limitadora; mide la
    corriente del lazo en el punto de operación."""
    circuit = Circuit("LED Resistor")
    circuit.V("input", "vin", circuit.gnd, v_in)
    circuit.R(1, "vin", "vled", r)
    circuit.D(1, "vled", circuit.gnd, model="LED")
    circuit.model("LED", "D", IS=1e-20, N=2)

    control_block = (
        ".control\n"
        "op\n"
        "let iled = -i(vinput)\n"
        "wrdata output.txt iled\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block


# firma uniforme: (params_del_bloque, component_values_del_bloque) -> netlist
NETLIST_BUILDERS = {
    "voltage_divider": lambda params, values: build_voltage_divider_netlist(
        v_in=params["v_in"], r1=values["r1"], r2=values["r2"]
    ),
    "rc_lowpass": lambda params, values: build_rc_lowpass_netlist(
        r=values["r"], c=values["c"]
    ),
    "led_resistor": lambda params, values: build_led_resistor_netlist(
        v_in=params["v_in"], r=values["r"]
    ),
}
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_netlist.py -v`
Expected: PASS.

- [ ] **Step 5: Verificación manual contra ngspice real (los netlists nuevos deben simular)**

Run:

```bash
uv run python - <<'EOF'
import subprocess, tempfile, os
from agents.escritura.netlist import build_rc_lowpass_netlist, build_led_resistor_netlist

for name, text in [
    ("rc", build_rc_lowpass_netlist(r=1000.0, c=1.59155e-7)),
    ("led", build_led_resistor_netlist(v_in=5.0, r=150.0)),
]:
    d = tempfile.mkdtemp()
    p = os.path.join(d, "c.cir")
    open(p, "w").write(text)
    r = subprocess.run(["ngspice", "-b", p], cwd=d, capture_output=True, text=True)
    out = os.path.join(d, "output.txt")
    print(name, "rc=", r.returncode, "output:", open(out).read().strip() if os.path.exists(out) else "MISSING")
EOF
```

Expected: `rc` imprime un valor cercano a `1e3` (Hz) y `led` un valor cercano a `1.9e-2` (A). Si algo sale MISSING, depurar el netlist antes de continuar (el resto del plan asume que estos dos netlists simulan).

- [ ] **Step 6: Commit**

```bash
git add src/agents/escritura/netlist.py tests/test_netlist.py
git commit -m "feat(agents): netlists rc_lowpass y led_resistor + registro por tipo"
```

---

### Task 6: Escritura — nodo generalizado por sub-bloque

**Files:**
- Modify: `src/agents/escritura/node.py` (reescritura completa)
- Modify: `tests/test_netlist.py` (reemplazar el test viejo de `escritura_node`)

- [ ] **Step 1: Reemplazar el test del nodo**

En `tests/test_netlist.py`, borrar `test_escritura_node_writes_netlist_file_and_state` (y el import de `escritura_node` si queda huérfano) y agregar:

```python
import os

from agents.escritura.node import escritura_node


def _pipeline_state():
    return {
        "circuit_spec": {},
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "led1",
                    "type": "led_resistor",
                    "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02},
                    "goal": {"metric": "i_led", "target": 0.02, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "led1"],
        "component_values": {
            "div1": {"r1": 1000.0, "r2": 1941.18},
            "led1": {"r": 150.0},
        },
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def test_escritura_node_writes_one_netlist_per_pending_block():
    result = escritura_node(_pipeline_state())

    assert set(result["netlists"].keys()) == {"div1", "led1"}
    for entry in result["netlists"].values():
        assert os.path.exists(entry["path"])
        with open(entry["path"]) as f:
            assert f.read() == entry["text"]


def test_escritura_node_only_writes_pending_blocks():
    state = _pipeline_state()
    state["pending_blocks"] = ["led1"]

    result = escritura_node(state)

    assert set(result["netlists"].keys()) == {"led1"}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_netlist.py -v`
Expected: FAIL — `escritura_node` actual espera `spec["v_in"]` plano y truena con KeyError.

- [ ] **Step 3: Reescribir el nodo**

`src/agents/escritura/node.py` (reemplazo completo):

```python
# project/apps/agents/src/agents/escritura/node.py
import os
import tempfile

from agents.escritura.netlist import NETLIST_BUILDERS
from agents.state import CircuitState


def escritura_node(state: CircuitState) -> dict:
    blocks = {b["id"]: b for b in state["normalized_spec"]["blocks"]}

    netlists = {}
    for block_id in state["pending_blocks"]:
        block = blocks[block_id]
        values = state["component_values"][block_id]
        netlist_text = NETLIST_BUILDERS[block["type"]](block["params"], values)

        work_dir = tempfile.mkdtemp(prefix=f"agents-escritura-{block_id}-")
        netlist_path = os.path.join(work_dir, "circuit.cir")
        with open(netlist_path, "w") as f:
            f.write(netlist_text)

        netlists[block_id] = {"path": netlist_path, "text": netlist_text}

    return {"netlists": netlists}
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_netlist.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/escritura/node.py tests/test_netlist.py
git commit -m "feat(agents): escritura generalizada por sub-bloque pendiente"
```

---

### Task 7: Shell — nodo generalizado por sub-bloque y métrica

**Files:**
- Modify: `src/agents/shell/node.py` (reescritura completa; `ngspice_runner.py` no cambia)
- Modify: `tests/test_ngspice_runner.py` (reemplazar los tests de `shell_node`)

- [ ] **Step 1: Reemplazar los tests del nodo**

En `tests/test_ngspice_runner.py`, borrar los tres tests de `shell_node` (`test_shell_node_sets_metrics_for_valid_netlist`, `test_shell_node_sets_sim_error_for_broken_netlist`, `test_shell_node_sets_sim_error_for_malformed_output_file`) y el import de `shell_node`; los tests de `run_ngspice`/`parse_wrdata_scalar` quedan igual. Agregar:

```python
from agents.shell.node import shell_node


def _pipeline_state(netlists, pending):
    return {
        "circuit_spec": {},
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "bad1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": pending,
        "component_values": {},
        "netlists": netlists,
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def test_shell_node_simulates_each_pending_block():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    state = _pipeline_state(
        netlists={"div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST}},
        pending=["div1"],
    )
    result = shell_node(state)

    div = result["sim_results"]["div1"]
    assert div["sim_error"] is None
    assert div["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)


def test_shell_node_isolates_errors_per_block():
    good_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    bad_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(good_dir, VOLTAGE_DIVIDER_NETLIST)
    bad = _write_netlist(bad_dir, BROKEN_NETLIST)

    state = _pipeline_state(
        netlists={
            "div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST},
            "bad1": {"path": bad, "text": BROKEN_NETLIST},
        },
        pending=["div1", "bad1"],
    )
    result = shell_node(state)

    assert result["sim_results"]["div1"]["sim_error"] is None
    assert result["sim_results"]["bad1"]["sim_error"] is not None
    assert result["sim_results"]["bad1"]["metrics"] is None


def test_shell_node_skips_non_pending_blocks():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    state = _pipeline_state(
        netlists={"div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST}},
        pending=[],
    )
    result = shell_node(state)

    assert result["sim_results"] == {}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_ngspice_runner.py -v`
Expected: FAIL — `shell_node` actual espera `state["netlist_path"]` (KeyError).

- [ ] **Step 3: Reescribir el nodo**

`src/agents/shell/node.py` (reemplazo completo):

```python
from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    goals = {b["id"]: b["goal"] for b in state["normalized_spec"]["blocks"]}

    sim_results = {}
    for block_id in state["pending_blocks"]:
        netlist_path = state["netlists"][block_id]["path"]
        raw_output_path, error = run_ngspice(netlist_path)

        if error is not None:
            sim_results[block_id] = {"metrics": None, "sim_error": error}
            continue

        try:
            value = parse_wrdata_scalar(raw_output_path)
        except ValueError as exc:
            sim_results[block_id] = {"metrics": None, "sim_error": str(exc)}
            continue

        metric = goals[block_id]["metric"]
        sim_results[block_id] = {"metrics": {metric: value}, "sim_error": None}

    return {"sim_results": sim_results}
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_ngspice_runner.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/shell/node.py tests/test_ngspice_runner.py
git commit -m "feat(agents): shell generalizado por sub-bloque con metrica por tipo"
```

---

### Task 8: Subgrafo síntesis (escritura → shell)

**Files:**
- Create: `src/agents/sintesis/__init__.py` (vacío)
- Create: `src/agents/sintesis/graph.py`
- Test: `tests/test_sintesis.py`

- [ ] **Step 1: Escribir el test de integración (ngspice real)**

`tests/test_sintesis.py`:

```python
import pytest

from agents.sintesis.graph import build_sintesis_graph


def test_sintesis_generates_and_simulates_mixed_blocks():
    graph = build_sintesis_graph()
    state = {
        "circuit_spec": {},
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "rc1",
                    "type": "rc_lowpass",
                    "params": {"f_c": 1000.0},
                    "goal": {"metric": "f_c", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "rc1"],
        "component_values": {
            "div1": {"r1": 1000.0, "r2": 1941.1764705882354},
            "rc1": {"r": 1000.0, "c": 1.5915494309189535e-07},
        },
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final_state = graph.invoke(state)

    div = final_state["sim_results"]["div1"]
    assert div["sim_error"] is None
    assert div["metrics"]["v_out"] == pytest.approx(3.3, rel=1e-3)

    rc = final_state["sim_results"]["rc1"]
    assert rc["sim_error"] is None
    # el punto -3 dB medido difiere ~0.3% del f_c analítico de primer orden
    assert rc["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.02)
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_sintesis.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.sintesis'`.

- [ ] **Step 3: Implementar**

`src/agents/sintesis/graph.py`:

```python
from langgraph.graph import END, START, StateGraph

from agents.escritura.node import escritura_node
from agents.shell.node import shell_node
from agents.state import CircuitState


def build_sintesis_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("escritura", escritura_node)
    builder.add_node("shell", shell_node)
    builder.add_edge(START, "escritura")
    builder.add_edge("escritura", "shell")
    builder.add_edge("shell", END)
    return builder.compile()
```

- [ ] **Step 4: Crear `__init__.py` vacío y correr los tests**

Run: `uv run pytest tests/test_sintesis.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/sintesis tests/test_sintesis.py
git commit -m "feat(agents): subgrafo de sintesis (escritura -> shell)"
```

---

### Task 9: Curador — política por reglas

**Files:**
- Create: `src/agents/curador/__init__.py` (vacío)
- Create: `src/agents/curador/policy.py`
- Test: `tests/test_curador.py`

- [ ] **Step 1: Escribir los tests de la política**

`tests/test_curador.py`:

```python
import pytest

from agents.curador.policy import ADJUST_RULES, evaluate_block, perturb


GOAL = {"metric": "v_out", "target": 3.3, "tolerance": 0.05}


def test_evaluate_block_ok_within_tolerance():
    status, rel_err = evaluate_block(GOAL, {"metrics": {"v_out": 3.31}, "sim_error": None})
    assert status == "ok"
    assert rel_err == pytest.approx(0.01 / 3.3)


def test_evaluate_block_off_outside_tolerance():
    status, rel_err = evaluate_block(GOAL, {"metrics": {"v_out": 4.0}, "sim_error": None})
    assert status == "off"
    assert rel_err > 0.05


def test_evaluate_block_error_when_sim_failed():
    status, rel_err = evaluate_block(GOAL, {"metrics": None, "sim_error": "boom"})
    assert status == "error"
    assert rel_err is None


def test_adjust_voltage_divider_scales_r2_toward_target():
    values = ADJUST_RULES["voltage_divider"](
        {"r1": 1000.0, "r2": 1000.0}, target=3.3, actual=2.5
    )
    assert values["r2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert values["r1"] == 1000.0


def test_adjust_rc_lowpass_scales_c():
    values = ADJUST_RULES["rc_lowpass"](
        {"r": 1000.0, "c": 1e-7}, target=1000.0, actual=1200.0
    )
    assert values["c"] == pytest.approx(1e-7 * 1200.0 / 1000.0)


def test_adjust_led_resistor_scales_r():
    values = ADJUST_RULES["led_resistor"]({"r": 150.0}, target=0.02, actual=0.0188)
    assert values["r"] == pytest.approx(150.0 * 0.0188 / 0.02)


def test_adjust_rules_guard_against_nonpositive_actual():
    v = ADJUST_RULES["voltage_divider"]({"r1": 1000.0, "r2": 500.0}, target=3.3, actual=0.0)
    assert v["r2"] == 1000.0  # duplica en vez de dividir por cero


def test_perturb_scales_all_values():
    assert perturb({"r": 100.0, "c": 2.0}) == {"r": 105.0, "c": 2.1}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_curador.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.curador'`.

- [ ] **Step 3: Implementar**

`src/agents/curador/policy.py`:

```python
R_MIN = 1.0


def evaluate_block(goal: dict, sim_result: dict) -> tuple[str, float | None]:
    """Evalúa un bloque: ('ok' | 'off' | 'error', error_relativo | None)."""
    if sim_result["sim_error"] is not None:
        return "error", None
    actual = sim_result["metrics"][goal["metric"]]
    rel_err = abs(actual - goal["target"]) / abs(goal["target"])
    return ("ok" if rel_err <= goal["tolerance"] else "off"), rel_err


def _adjust_voltage_divider(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "r2": values["r2"] * 2}
    return {**values, "r2": max(values["r2"] * target / actual, R_MIN)}


def _adjust_rc_lowpass(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "c": values["c"] / 2}
    return {**values, "c": values["c"] * actual / target}


def _adjust_led_resistor(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "r": max(values["r"] / 2, R_MIN)}
    return {**values, "r": max(values["r"] * actual / target, R_MIN)}


# regla proporcional sobre el componente dominante, por tipo de circuito
ADJUST_RULES = {
    "voltage_divider": _adjust_voltage_divider,
    "rc_lowpass": _adjust_rc_lowpass,
    "led_resistor": _adjust_led_resistor,
}


def perturb(values: dict) -> dict:
    """Reintento tras sim_error: perturbación simple de todos los valores."""
    return {k: v * 1.05 for k, v in values.items()}
```

- [ ] **Step 4: Crear `__init__.py` vacío y correr los tests**

Run: `uv run pytest tests/test_curador.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/curador tests/test_curador.py
git commit -m "feat(agents): politica por reglas del curador (evaluar/ajustar/perturbar)"
```

---

### Task 10: Curador — nodo de decisión y ruteo

**Files:**
- Create: `src/agents/curador/node.py`
- Test: `tests/test_curador.py` (agregar al final)

- [ ] **Step 1: Escribir los tests del nodo**

Agregar al final de `tests/test_curador.py`:

```python
from agents.curador.node import curador_node, route_after_curador


def _state(sim_results, iteration=0, max_iterations=5, history=None):
    return {
        "circuit_spec": {},
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
            "max_iterations": max_iterations,
        },
        "pending_blocks": ["div1"],
        "component_values": {"div1": {"r1": 1000.0, "r2": 1000.0}},
        "netlists": {},
        "sim_results": sim_results,
        "iteration": iteration,
        "history": history or [],
        "verdict": None,
    }


def test_curador_accepts_when_all_blocks_within_tolerance():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 3.31}, "sim_error": None}})
    )

    assert result["verdict"]["status"] == "accepted"
    assert result["verdict"]["best_iteration"] == 0
    assert len(result["history"]) == 1
    assert result["history"][0]["decision"] == "accept"


def test_curador_adjusts_failing_block_and_stays_unverdicted():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "sim_error": None}})
    )

    assert "verdict" not in result
    assert result["iteration"] == 1
    assert result["pending_blocks"] == ["div1"]
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_perturbs_on_sim_error_with_iterations_left():
    result = curador_node(_state({"div1": {"metrics": None, "sim_error": "boom"}}))

    assert "verdict" not in result
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1050.0)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_rejects_when_iterations_exhausted():
    result = curador_node(
        _state(
            {"div1": {"metrics": {"v_out": 2.5}, "sim_error": None}},
            iteration=4,
            max_iterations=5,
            history=[
                {"iteration": i, "decision": "adjust", "worst_rel_err": 1.0 - i * 0.1}
                for i in range(4)
            ],
        )
    )

    assert result["verdict"]["status"] == "rejected"
    # la mejor iteración según worst_rel_err es la del registro actual o
    # la mínima del history; aquí history[3] tiene 0.7 y la actual ~0.24
    assert result["verdict"]["best_iteration"] == 4


def test_curador_rejects_with_diagnosis_when_sim_error_and_no_iterations_left():
    result = curador_node(
        _state({"div1": {"metrics": None, "sim_error": "boom"}}, iteration=4)
    )

    assert result["verdict"]["status"] == "rejected"
    assert "boom" in result["verdict"]["reason"]


def test_route_after_curador():
    assert route_after_curador({"verdict": None}) == "adjust"
    assert route_after_curador({"verdict": {"status": "accepted"}}) == "done"
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_curador.py -v`
Expected: FAIL — `ModuleNotFoundError` / import error de `curador_node`.

- [ ] **Step 3: Implementar el nodo**

`src/agents/curador/node.py`:

```python
from agents.curador.policy import ADJUST_RULES, evaluate_block, perturb
from agents.state import CircuitState


def curador_node(state: CircuitState) -> dict:
    spec = state["normalized_spec"]
    iteration = state["iteration"]

    evaluations = {}
    for block in spec["blocks"]:
        evaluations[block["id"]] = evaluate_block(
            block["goal"], state["sim_results"][block["id"]]
        )

    failing = {bid: status for bid, (status, _) in evaluations.items() if status != "ok"}
    rel_errs = [err for _, err in evaluations.values() if err is not None]
    worst_rel_err = max(rel_errs) if rel_errs and not any(
        status == "error" for status in failing.values()
    ) else None

    record = {
        "iteration": iteration,
        "component_values": dict(state["component_values"]),
        "sim_results": dict(state["sim_results"]),
        "evaluations": {bid: status for bid, (status, _) in evaluations.items()},
        "worst_rel_err": worst_rel_err,
    }

    if not failing:
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": "all blocks within tolerance",
                "best_iteration": iteration,
            },
        }

    if iteration + 1 >= spec["max_iterations"]:
        record["decision"] = "reject"
        sim_errors = [
            state["sim_results"][bid]["sim_error"]
            for bid, status in failing.items()
            if status == "error"
        ]
        reason = (
            f"simulation errors after {spec['max_iterations']} iterations: {sim_errors}"
            if sim_errors
            else f"goals not met after {spec['max_iterations']} iterations"
        )
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "rejected",
                "reason": reason,
                "best_iteration": _best_iteration(state["history"] + [record]),
            },
        }

    record["decision"] = "adjust"
    blocks = {b["id"]: b for b in spec["blocks"]}
    adjusted = {}
    for bid, status in failing.items():
        block = blocks[bid]
        values = state["component_values"][bid]
        if status == "error":
            adjusted[bid] = perturb(values)
        else:
            actual = state["sim_results"][bid]["metrics"][block["goal"]["metric"]]
            adjusted[bid] = ADJUST_RULES[block["type"]](
                values, target=block["goal"]["target"], actual=actual
            )

    return {
        "history": [record],
        "component_values": adjusted,
        "pending_blocks": list(failing.keys()),
        "iteration": iteration + 1,
    }


def _best_iteration(history: list) -> int | None:
    scored = [r for r in history if r.get("worst_rel_err") is not None]
    if not scored:
        return None
    return min(scored, key=lambda r: r["worst_rel_err"])["iteration"]


def route_after_curador(state: CircuitState) -> str:
    return "done" if state["verdict"] is not None else "adjust"
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_curador.py -v`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/curador/node.py tests/test_curador.py
git commit -m "feat(agents): nodo curador con decision accept/adjust/reject y ruteo"
```

---

### Task 11: Grafo padre + e2e del pipeline completo

**Files:**
- Modify: `src/agents/graph.py` (reescritura completa)
- Create: `tests/test_graph.py` (nuevo e2e)

- [ ] **Step 1: Escribir los e2e**

`tests/test_graph.py`:

```python
# project/apps/agents/tests/test_graph.py
import pytest

from agents.graph import build_graph


def _initial_state(circuit_spec):
    return {
        "circuit_spec": circuit_spec,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def _run(circuit_spec, thread_id):
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    return graph.invoke(_initial_state(circuit_spec), config)


def test_voltage_divider_converges_first_iteration():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ]
    }

    final = _run(spec, "e2e-divider")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) == 1
    v_out = final["sim_results"]["div1"]["metrics"]["v_out"]
    assert v_out == pytest.approx(3.3, rel=0.05)


def test_led_requires_adjustment_then_converges():
    # el modelo de diodo tiene Vf ~2.18 V a 20 mA, distinto del v_f=2.0 del
    # spec, así que la primera iteración queda ~6% fuera con tolerancia 1%
    # y el curador debe ajustar al menos una vez antes de converger
    spec = {
        "blocks": [
            {"id": "led1", "type": "led_resistor", "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02}}
        ],
        "tolerance": 0.01,
    }

    final = _run(spec, "e2e-led-adjust")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) >= 2
    assert final["history"][0]["decision"] == "adjust"
    i_led = final["sim_results"]["led1"]["metrics"]["i_led"]
    assert i_led == pytest.approx(0.02, rel=0.01)


def test_impossible_spec_rejected_at_max_iterations():
    # v_out > v_in: inalcanzable; el ajuste empuja r2 hacia arriba pero
    # v_out nunca supera v_in
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 6.0}}
        ],
        "max_iterations": 3,
    }

    final = _run(spec, "e2e-impossible")

    assert final["verdict"]["status"] == "rejected"
    assert len(final["history"]) == 3
    assert final["verdict"]["best_iteration"] is not None


def test_mixed_blocks_evaluated_globally():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
            {"id": "rc1", "type": "rc_lowpass", "params": {"f_c": 1000.0}},
        ]
    }

    final = _run(spec, "e2e-mixed")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(3.3, rel=0.05)
    assert final["sim_results"]["rc1"]["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.05)


def test_invalid_spec_rejected_without_simulation():
    final = _run({"blocks": []}, "e2e-invalid")

    assert final["verdict"]["status"] == "rejected"
    assert final["normalized_spec"] is None
    assert final["sim_results"] == {}


def test_graph_checkpoints_state_by_thread_id():
    graph = build_graph()
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 9.0, "v_out": 6.0}}
        ]
    }
    config = {"configurable": {"thread_id": "e2e-checkpoint"}}

    graph.invoke(_initial_state(spec), config)
    snapshot = graph.get_state(config)

    assert snapshot.values["verdict"]["status"] == "accepted"
    assert snapshot.values["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(
        6.0, rel=0.05
    )
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_graph.py -v`
Expected: FAIL — el `build_graph` actual solo tiene escritura/shell y truena (estado viejo / nodos incompatibles).

- [ ] **Step 3: Reescribir el grafo padre**

`src/agents/graph.py` (reemplazo completo):

```python
# project/apps/agents/src/agents/graph.py
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.calculo.graph import build_calculo_graph
from agents.curador.node import curador_node, route_after_curador
from agents.orquestador.node import orquestador_node, route_after_orquestador
from agents.sintesis.graph import build_sintesis_graph
from agents.state import CircuitState


def build_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("orquestador", orquestador_node)
    builder.add_node("calculo", build_calculo_graph())
    builder.add_node("sintesis", build_sintesis_graph())
    builder.add_node("curador", curador_node)

    builder.set_entry_point("orquestador")
    builder.add_conditional_edges(
        "orquestador",
        route_after_orquestador,
        {"continue": "calculo", "reject": END},
    )
    builder.add_edge("calculo", "sintesis")
    builder.add_edge("sintesis", "curador")
    builder.add_conditional_edges(
        "curador",
        route_after_curador,
        {"adjust": "sintesis", "done": END},
    )

    return builder.compile(checkpointer=MemorySaver())
```

- [ ] **Step 4: Correr los e2e**

Run: `uv run pytest tests/test_graph.py -v`
Expected: PASS (6 tests, con ngspice real; el del LED tarda un par de iteraciones).

- [ ] **Step 5: Correr la suite completa**

Run: `uv run pytest -v`
Expected: PASS — toda la suite.

- [ ] **Step 6: Commit**

```bash
git add src/agents/graph.py tests/test_graph.py
git commit -m "feat(agents): grafo padre completo con lazo iterativo del curador"
```

---

### Task 12: Actualizar documentación (CLAUDE.md y README de agents)

**Files:**
- Modify: `CLAUDE.md` (raíz del repo — párrafo "Architecture" de la sección Agents)
- Modify: `project/apps/agents/README.md`

- [ ] **Step 1: Reemplazar el párrafo de arquitectura en `CLAUDE.md`**

Localizar el párrafo que empieza con "Architecture: a LangGraph `StateGraph` (`src/agents/graph.py`, `build_graph()`) wires two nodes..." y reemplazarlo por:

```markdown
Architecture: a LangGraph `StateGraph` (`src/agents/graph.py`, `build_graph()`) wires the full deterministic pipeline — `orquestador` (Pydantic validation/normalization of `circuit_spec`, `src/agents/orquestador/`) → `calculo` (Master-Worker subgraph fanning out one worker per sub-block via the Send API, closed-form component formulas, `src/agents/calculo/`) → `sintesis` (subgraph `escritura → shell`: PySpice netlist per sub-block, real `ngspice` subprocess, metrics keyed per block) → `curador` (rule-based accept/adjust/reject policy, `src/agents/curador/`) — over a shared `CircuitState` TypedDict with merge reducers (`src/agents/state.py`). The curador closes the iterative loop (`curador → sintesis` on adjust, bounded by `max_iterations`, default 5); invalid specs and exhausted iterations end at `END` with a populated `verdict` instead of raising. Supported circuit types: `voltage_divider`, `rc_lowpass`, `led_resistor`. The graph is compiled with a `MemorySaver` checkpointer (no DB persistence yet). Tests in `tests/` run the real ngspice binary end-to-end; no mocks. This is the second of several planned slices (see `docs/superpowers/specs/` and `docs/superpowers/plans/`) — LLM-based NL extraction in the orquestador and the RL policy in the curador are not implemented yet; `circuit_spec` is a structured JSON/dict supplied by the caller, validated against the Pydantic schema in `src/agents/orquestador/schema.py`.
```

- [ ] **Step 2: Actualizar `project/apps/agents/README.md`**

Reemplazar la frase descriptiva del pipeline (la que menciona solo escritura y shell) por una versión que refleje el pipeline completo, por ejemplo:

```markdown
LangGraph-based agent subsystem of ia-spice: a StateGraph pipeline that validates a structured circuit spec (orquestador), computes component values per sub-block in parallel (calculo, Master-Worker), generates SPICE netlists (escritura), simulates them through the ngspice binary (shell), and iteratively accepts/adjusts/rejects results against the spec's goals (curador, rule-based policy).
```

(Conservar el resto del README: instrucciones de `uv sync`, `uv run pytest`, requisito de ngspice en PATH.)

- [ ] **Step 3: Correr la suite una última vez**

Run: `uv run pytest -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md project/apps/agents/README.md
git commit -m "docs: actualizar arquitectura de agents al pipeline completo"
```
