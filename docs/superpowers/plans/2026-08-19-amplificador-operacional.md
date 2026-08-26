# El amplificador no inversor — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un cuarto tipo de circuito —amplificador no inversor con macromodelo de amplificador operacional— para que el catálogo deje de ser tres topologías triviales y cubra lo que los límites de la tesina prometen.

**Architecture:** Un tipo de bloque nuevo recorre las seis capas que ya existen: esquema Pydantic → meta del orquestador → prompt del LLM → ecuación de diseño → netlist con `.subckt` → regla de ajuste del curador. Ninguna capa cambia de forma; cada una gana una entrada.

**Tech Stack:** Python 3.12, LangGraph, Pydantic, PySpice, ngspice real, pytest.

Diseño de referencia: [`docs/superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md`](../specs/2026-08-19-cierre-de-la-tesina-design.md) — Fase 2.
Auditoría de origen: [`docs/auditoria-tesina-vs-codigo.md`](../../auditoria-tesina-vs-codigo.md) — resuelve C1.

---

## Entorno

**1. `uv` sobre la ruta UNC está roto.** Todo comando va envuelto para el WSL nativo:

```bash
wsl.exe -e bash -lc "cd '/home/antonioxd/projects/spice/project/apps/agents' && uv run pytest"
```

**2. Rama:** `feat/amplificador-operacional`, ya creada desde `dev`. No crear worktrees.

**3. `ngspice` debe estar en el `PATH`.** Las pruebas lo ejecutan de verdad; no hay mocks.

**4. Línea base al empezar: `130 passed, 5 skipped`.** Los 5 saltados son `live_llm`.

## Por qué este circuito y no otro

Los límites de la tesina (`tesina/doc/main/sections/limites_alcances.tex:6`) prometen *"resistores,
capacitores, inductores, fuentes, diodos, transistores y amplificadores operacionales descritos por
su macromodelo"*, y el marco teórico usa como ejemplo de ecuación de diseño *"un amplificador no
inversor con amplificador operacional, donde la ganancia se relaciona con el cociente de dos
resistencias"*. Hoy el código no tiene ni un operacional ni un macromodelo.

Este bloque cierra esa brecha con el circuito exacto que el documento ya cita, e introduce dos
cosas que ninguna de las tres topologías actuales tiene: **realimentación** y un **macromodelo de
comportamiento en terminales**, que es justo lo que los límites describen frente al modelado a
nivel de transistor.

## El circuito, verificado contra ngspice antes de escribir este plan

Amplificador no inversor: la entrada va a la pata no inversora, y la red `Rf`–`Rg` realimenta a la
inversora.

```
Av = 1 + Rf/Rg          ⟹     Rf = Rg·(Av − 1),  con Av = v_out/v_in
```

`Rg` se fija desde configuración (`rg_default`) y `Rf` sale de la ecuación, igual que el divisor
fija `R1` y despeja `R2`.

El operacional entra como macromodelo de un polo — resistencia de entrada, fuente controlada con la
ganancia en lazo abierto, red RC del polo dominante y etapa de salida:

```spice
.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends
```

En continua el capacitor está abierto, así que el polo no altera el punto de operación; está ahí
porque es lo que hace de esto un macromodelo y no una fuente ideal, y porque deja la puerta abierta
a un análisis en frecuencia más adelante.

**Resultado real medido** con `v_in = 1 V`, `Rg = 1 kΩ`, `Rf = 2 kΩ` (ganancia ideal 3):

```
 1.00000000e+00  2.99990994e+00
```

2.99991 V en lugar de 3.00000 V. Ese desvío del 0.003 % **no es ruido numérico: es la ganancia
finita en lazo abierto**, `Av_real = Av / (1 + Av/A_ol)`. Es exactamente el tipo de discrepancia
entre la ecuación ideal y la simulación que el marco teórico invoca para justificar que la
simulación actúe de árbitro, y ahora el sistema lo exhibe de verdad.

También se verificó que PySpice emite la llamada al subcircuito correctamente:

```
Vinput vin 0 1.0
X1 vin vfb vout opamp
Rf vout vfb 2000.0
Rg vfb 0 1000.0
```

## La regla de ajuste, despejada

Para el amplificador ideal `v_out = v_in·(Rg + Rf)/Rg`. Buscando el `Rf` que lleva la salida
medida al objetivo:

```
target / actual = (Rg + Rf_nuevo) / (Rg + Rf)
⟹  Rf_nuevo = (Rg + Rf)·target/actual − Rg
```

Es **exacta**, no una heurística proporcional como las de los otros tres bloques, y se calcula solo
con lo que la firma de `ADJUST_RULES` ya recibe (`values`, `target`, `actual`) — no hace falta
`v_in`.

## Estructura de archivos

| Archivo | Qué gana |
|---|---|
| `src/agents/orquestador/schema.py` | `NonInvertingAmpParams`, `NonInvertingAmpBlock`, entrada en el union `Block` |
| `src/agents/orquestador/node.py` | una entrada en `_GOALS` |
| `src/agents/llm/extraction.py` | la descripción del tipo en el prompt del sistema |
| `config/curador.yaml` | `rg_default` en la sección `calculo` |
| `src/agents/calculo/formulas.py` | `noninverting_amp_values` + entrada en `FORMULAS` |
| `src/agents/escritura/netlist.py` | `OPAMP_SUBCKT`, `build_noninverting_amp_netlist` + entrada en `NETLIST_BUILDERS` |
| `src/agents/curador/policy.py` | `_adjust_noninverting_amp` + entrada en `ADJUST_RULES` |

Pruebas: se amplían `tests/test_orquestador.py`, `tests/test_calculo.py`, `tests/test_netlist.py`,
`tests/test_curador.py` y `tests/test_graph.py`.

---

### Task 1: La entrada y la ecuación de diseño

**Files:** `orquestador/schema.py`, `orquestador/node.py`, `llm/extraction.py`, `config/curador.yaml`, `calculo/formulas.py`, y sus pruebas.

- [ ] **Step 1: Escribe los tests que fallan**

En `tests/test_orquestador.py`:

```python
def test_noninverting_amp_block_is_accepted_and_gets_its_goal():
    from agents.orquestador.node import _normalize
    from agents.orquestador.schema import CircuitSpec

    spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {
                    "id": "amp1",
                    "type": "noninverting_amp",
                    "params": {"v_in": 1.0, "v_out": 3.0},
                }
            ]
        }
    )
    result = _normalize(spec)
    block = result["normalized_spec"]["blocks"][0]

    assert block["type"] == "noninverting_amp"
    assert block["goal"]["metric"] == "v_out"
    assert block["goal"]["target"] == 3.0


def test_noninverting_amp_rejects_nonpositive_params():
    from pydantic import ValidationError

    from agents.orquestador.schema import CircuitSpec

    with pytest.raises(ValidationError):
        CircuitSpec.model_validate(
            {
                "blocks": [
                    {"id": "amp1", "type": "noninverting_amp", "params": {"v_in": 0.0, "v_out": 3.0}}
                ]
            }
        )
```

En `tests/test_calculo.py`:

```python
def test_noninverting_amp_solves_the_feedback_ratio():
    # Av = 3 con Rg = 1k  ->  Rf = Rg·(Av-1) = 2k
    values = FORMULAS["noninverting_amp"]({"v_in": 1.0, "v_out": 3.0})

    assert values["rg"] == 1000.0
    assert values["rf"] == pytest.approx(2000.0)


def test_noninverting_amp_with_unreachable_gain_emits_a_valid_circuit():
    """Un no inversor no atenúa. La meta es inalcanzable, pero se emite un
    circuito válido y el curador la rechaza al agotar iteraciones."""
    values = FORMULAS["noninverting_amp"]({"v_in": 5.0, "v_out": 2.0})

    assert values["rf"] > 0
    assert values["rg"] > 0
```

- [ ] **Step 2: Corre y verifica que fallan**

`uv run pytest tests/test_orquestador.py tests/test_calculo.py -v` → FAIL por el tipo desconocido y por `KeyError: 'noninverting_amp'`.

- [ ] **Step 3: Implementa**

En `src/agents/orquestador/schema.py`, junto a las otras clases de parámetros:

```python
class NonInvertingAmpParams(BaseModel):
    v_in: float = Field(gt=0)
    v_out: float = Field(gt=0)
```

junto a los otros bloques:

```python
class NonInvertingAmpBlock(BaseModel):
    id: str
    type: Literal["noninverting_amp"]
    params: NonInvertingAmpParams
```

y en el union:

```python
Block = Annotated[
    VoltageDividerBlock | RcLowpassBlock | LedResistorBlock | NonInvertingAmpBlock,
    Field(discriminator="type"),
]
```

En `src/agents/orquestador/node.py`, en `_GOALS`:

```python
_GOALS = {
    "voltage_divider": ("v_out", "v_out"),
    "rc_lowpass": ("f_c", "f_c"),
    "led_resistor": ("i_led", "i_led"),
    "noninverting_amp": ("v_out", "v_out"),
}
```

En `src/agents/llm/extraction.py`, dentro de `_SYSTEM_PROMPT`, tras la línea del `led_resistor`:

```
- noninverting_amp: amplificador no inversor con amplificador operacional
  (macromodelo). params: v_in (V), v_out objetivo (V). La ganancia es
  v_out/v_in y tiene que ser mayor que 1: un no inversor no atenúa.
```

En `config/curador.yaml`, en la sección `calculo`, tras `r_rc_default`:

```yaml
  # Resistencia a tierra del no inversor. Se fija y se despeja Rf, igual que el
  # divisor fija R1 y despeja R2.
  rg_default: 1000.0
```

En `src/agents/calculo/formulas.py`:

```python
def noninverting_amp_values(params: dict) -> dict:
    cfg = _calculo_cfg()
    rg = cfg["rg_default"]
    gain = params["v_out"] / params["v_in"]
    if gain <= 1.0:
        # un no inversor no puede atenuar: meta físicamente inalcanzable.
        # Se emite un circuito válido (ganancia ~1) y el lazo del curador la
        # rechaza al agotar iteraciones, como hace el divisor.
        return {"rg": rg, "rf": cfg["r_min"]}
    return {"rg": rg, "rf": rg * (gain - 1.0)}
```

y en `FORMULAS`:

```python
    "noninverting_amp": noninverting_amp_values,
```

- [ ] **Step 4: Verifica**

`uv run pytest -v` → **134 passed, 5 skipped**.

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/orquestador/ project/apps/agents/src/agents/llm/extraction.py project/apps/agents/src/agents/calculo/formulas.py project/apps/agents/config/curador.yaml project/apps/agents/tests/test_orquestador.py project/apps/agents/tests/test_calculo.py
git commit -m "feat(agents): entrada y ecuacion de diseno del amplificador no inversor"
```

---

### Task 2: El netlist con macromodelo y el lazo completo

**Files:** `escritura/netlist.py`, `curador/policy.py`, `tests/test_netlist.py`, `tests/test_curador.py`, `tests/test_graph.py`.

- [ ] **Step 1: Escribe los tests que fallan**

En `tests/test_netlist.py`:

```python
def test_noninverting_amp_netlist_simulates_to_the_expected_gain():
    """Contra ngspice de verdad: ganancia 3 sobre 1 V debe medir ~3 V.
    El desvío que quede es la ganancia finita en lazo abierto del macromodelo,
    no ruido numérico."""
    import os
    import tempfile

    from agents.escritura.netlist import NETLIST_BUILDERS
    from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

    text = NETLIST_BUILDERS["noninverting_amp"](
        {"v_in": 1.0, "v_out": 3.0}, {"rg": 1000.0, "rf": 2000.0}
    )
    assert ".subckt opamp" in text
    assert "X1" in text

    work_dir = tempfile.mkdtemp(prefix="agents-test-amp-")
    path = os.path.join(work_dir, "circuit.cir")
    with open(path, "w") as fh:
        fh.write(text)

    output_path, error = run_ngspice(path)

    assert error is None
    assert parse_wrdata_scalar(output_path) == pytest.approx(3.0, rel=0.001)
```

En `tests/test_curador.py`:

```python
def test_adjust_noninverting_amp_solves_rf_exactly():
    # v_out = v_in·(rg+rf)/rg. Con rg=1k, rf=2k la salida es 3·v_in; para
    # llevar 3.0 medido a 4.0 objetivo hace falta rf = (1k+2k)·4/3 - 1k = 3k
    values = ADJUST_RULES["noninverting_amp"](
        {"rg": 1000.0, "rf": 2000.0}, target=4.0, actual=3.0
    )

    assert values["rf"] == pytest.approx(3000.0)
    assert values["rg"] == 1000.0


def test_adjust_noninverting_amp_guards_against_nonpositive_actual():
    values = ADJUST_RULES["noninverting_amp"](
        {"rg": 1000.0, "rf": 2000.0}, target=4.0, actual=0.0
    )

    assert values["rf"] == pytest.approx(4000.0)
```

En `tests/test_graph.py`, siguiendo el estilo de los demás tests de ese archivo (usan el ayudante `_run(spec, thread_id)`):

```python
def test_noninverting_amp_converges_end_to_end():
    """El lazo completo contra ngspice real con un circuito realimentado."""
    spec = {
        "blocks": [
            {
                "id": "amp1",
                "type": "noninverting_amp",
                "params": {"v_in": 1.0, "v_out": 3.0},
            }
        ],
        "tolerance": 0.01,
    }

    final = _run(spec, "e2e-amp")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["amp1"]["metrics"]["v_out"] == pytest.approx(3.0, rel=0.01)
    assert ".subckt opamp" in final["netlists"]["amp1"]["text"]
```

- [ ] **Step 2: Corre y verifica que fallan**

`uv run pytest tests/test_netlist.py tests/test_curador.py tests/test_graph.py -v` → FAIL por `KeyError: 'noninverting_amp'`.

- [ ] **Step 3: Implementa**

En `src/agents/escritura/netlist.py`, arriba tras el import:

```python
# Macromodelo de un polo: resistencia de entrada, ganancia en lazo abierto,
# red RC del polo dominante y etapa de salida. Describe el comportamiento en
# los terminales sin modelar transistores, que es lo que los límites de la
# tesina entienden por macromodelo. En continua el capacitor está abierto, así
# que el polo no altera el punto de operación.
OPAMP_SUBCKT = (
    ".subckt opamp inp inn out\n"
    "Rin inp inn 1e6\n"
    "Egain n1 0 inp inn 1e5\n"
    "Rp n1 n2 1k\n"
    "Cp n2 0 159n\n"
    "Eout out 0 n2 0 1\n"
    ".ends\n"
)
```

y el constructor:

```python
def build_noninverting_amp_netlist(v_in: float, rf: float, rg: float) -> str:
    """Amplificador no inversor con macromodelo de operacional; mide la salida
    en el punto de operación. La ganancia es 1 + Rf/Rg."""
    circuit = Circuit("Non-inverting Amplifier")
    circuit.V("input", "vin", circuit.gnd, v_in)
    circuit.X("1", "opamp", "vin", "vfb", "vout")
    circuit.R("f", "vout", "vfb", rf)
    circuit.R("g", "vfb", circuit.gnd, rg)

    control_block = (
        ".control\n"
        "op\n"
        "wrdata output.txt v(vout)\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + OPAMP_SUBCKT + control_block
```

y en `NETLIST_BUILDERS`:

```python
    "noninverting_amp": lambda params, values: build_noninverting_amp_netlist(
        v_in=params["v_in"], rf=values["rf"], rg=values["rg"]
    ),
```

En `src/agents/curador/policy.py`:

```python
def _adjust_noninverting_amp(values: dict, target: float, actual: float) -> dict:
    # v_out = v_in·(rg+rf)/rg, así que (rg+rf_nuevo)/(rg+rf) = target/actual.
    # El despeje es exacto, no proporcional como en los otros bloques.
    r_min = get_config()["calculo"]["r_min"]
    rg, rf = values["rg"], values["rf"]
    if actual <= 0:
        return {**values, "rf": max(rf * 2, r_min)}
    return {**values, "rf": max((rg + rf) * target / actual - rg, r_min)}
```

y en `ADJUST_RULES`:

```python
    "noninverting_amp": _adjust_noninverting_amp,
```

- [ ] **Step 4: Verifica**

`uv run pytest -v` → **139 passed, 5 skipped**.

Presta atención a `tests/test_graph.py`: es el que ejercita el lazo entero contra ngspice.

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/escritura/netlist.py project/apps/agents/src/agents/curador/policy.py project/apps/agents/tests/
git commit -m "feat(agents): netlist con macromodelo de operacional y su regla de ajuste"
```

---

## Verificación final de la fase

- [ ] `uv run pytest` verde con `ngspice` real, sin saltados fuera de `live_llm`.
- [ ] Un `noninverting_amp` pedido con `circuit_spec` estructurado produce un netlist que contiene
      `.subckt opamp`, lo simula y converge dentro del 1 %.
- [ ] `grep -rn noninverting_amp src/` devuelve las seis capas: esquema, meta, prompt, ecuación,
      netlist y regla de ajuste. Si falta una, el tipo está a medio conectar.
