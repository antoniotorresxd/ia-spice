# El curador formalizado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el curador calcule la función de recompensa del marco teórico, decida aceptar o ajustar comparando recompensas en lugar de reglas fijas, y registre todo en el historial — con los pesos y factores en configuración externa.

**Architecture:** Se añade un cargador de configuración YAML (`agents/config.py`) que alimenta a todos los agentes. La recompensa vive en un módulo puro nuevo (`curador/reward.py`) y la decisión en el módulo de política existente (`curador/policy.py`), que gana la estimación por acción. `curador/node.py` pasa de dos `if` cableados a consultar la política. El shell empieza a reportar convergencia.

**Tech Stack:** Python 3.12, LangGraph, Pydantic, PyYAML, pytest. Todo se ejecuta con `uv` desde `project/apps/agents`.

Diseño de referencia: [`docs/superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md`](../specs/2026-08-19-cierre-de-la-tesina-design.md)
Auditoría de origen: [`docs/auditoria-tesina-vs-codigo.md`](../../auditoria-tesina-vs-codigo.md) — resuelve A1, A3, A4, A5 y D4.

---

## Entorno: léelo antes de la primera tarea

**1. `uv` sobre la ruta UNC está roto.** Todos los comandos se ejecutan con el `uv` nativo de WSL:

```bash
wsl.exe -e bash -lc "cd '/home/antonioxd/projects/spice/project/apps/agents' && uv run pytest"
```

Los comandos de este plan se escriben en su forma corta (`uv run pytest ...`); envuélvelos así al ejecutarlos.

**2. No se usan git worktrees.** Se trabaja directo en una rama con nombre creada desde `dev`. Créala antes de la Tarea 1:

```bash
git checkout -b feat/curador-formalizado
```

**3. `ngspice` debe estar en el `PATH`.** Las pruebas de simulación lo ejecutan de verdad; no hay mocks de ngspice en este proyecto y no se van a introducir.

**4. `uv` no carga `.env` solo.** Si una prueba necesita variables, se pasan: `uv run --env-file .env pytest`. Ninguna tarea de este plan lo requiere.

## La calibración de los parámetros, y por qué estos números

La fórmula del marco teórico es `R = -Σᵢ(wᵢ·APEᵢ) + β·c - γ·n`, con **APE en puntos porcentuales**
(un error del 5 % vale 5, no 0.05). Esa elección de unidad es la que fija la escala de todo lo demás.

La política elige entre aceptar y ajustar. Despejando `R_accept > R_adjust` se obtiene la condición
exacta bajo la cual conviene parar:

```
A < γ / (1 − ρ)        donde A = Σᵢ(wᵢ·APEᵢ) y ρ es la reducción esperada por ajuste
```

Con `γ = 3.0` y `ρ = 0.7`, el umbral es `A < 10`: el curador acepta cuando el error ponderado baja
de 10 puntos porcentuales, aunque siga fuera de la tolerancia del 5 %. **Ese es exactamente el
comportamiento nuevo que las reglas anteriores nunca tomaban**, y es lo que el criterio de terminado
número 4 del diseño exige demostrar.

Los valores por defecto están elegidos para que las cinco pruebas que ya existen en
`tests/test_curador.py` sigan pasando sin cambios. Verificado a mano:

| Caso existente | A (APE ponderado) | `R_accept` | `R_adjust` | Decisión |
|---|---|---|---|---|
| `v_out=3.31`, meta 3.3 | 0.30 | — | — | `accept` por respaldo determinista |
| `v_out=2.5`, meta 3.3, n=0 | 24.24 | −14.24 | −9.97 | `adjust` ✓ |
| `sim_error`, n=0 | 100.00 | −100.00 | −73.00 | `adjust` ✓ |
| `v_out=2.5`, n=4, max=5 | 24.24 | — | no disponible | `reject` ✓ |

**La recompensa dice cuándo parar; la tolerancia dice si el circuito sirve.** Son dos preguntas
distintas y hay que separarlas. `observed_reduction` se satura en ρ = 1.0 cuando el último ajuste
dejó de rendir, y ahí el álgebra colapsa a `R_adjust − R_accept = −γ`: negativo sea cual sea el
error, así que aceptar gana **siempre**. Como señal de "seguir ajustando ya no paga" es correcto,
pero por sí solo dejaría pasar como aceptado un circuito estancado lejísimos de su meta, lo que
inflaría justo la tasa de circuitos que cumplen las metas que el objetivo específico 6 compara
contra el best-of-N.

Por eso `accept_is_admissible` mide el desvío **en unidades de la tolerancia que el propio objetivo
declaró**, no en puntos de APE. Un tope global en APE trataría igual a un bloque con tolerancia del
1 % y a uno del 5 %, y aceptaría el primero incumpliendo su meta por seis veces — que es exactamente
lo que `tests/test_graph.py::test_led_requires_adjustment_then_converges` detectó cuando se intentó
con un tope global. Con `accept_tolerance_slack = 1.5`, un objetivo del 5 % admite hasta 7.5 % de
error y uno del 1 %, hasta 1.5 %.

**Rechazar no es una acción que la política elija.** Es el desenlace cuando ya no quedan
iteraciones y el circuito sigue fuera de tolerancia. Tratarlo como una opción más obliga a calibrar
`reject_reward` entre dos condiciones incompatibles (reintentar tras un error de simulación debe
ganarle a rechazar, pero rechazar debe ganarle a entregar un circuito muy desviado), y no existe
ningún valor que satisfaga ambas. Se conserva en la configuración porque se registra en el
historial como referencia, no porque dirija la decisión.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `config/curador.yaml` | **Nuevo.** Los pesos, factores y umbrales. Único lugar donde viven. |
| `src/agents/config.py` | **Nuevo.** Carga el YAML, cachea, permite sobreescribir la ruta por entorno. |
| `src/agents/curador/reward.py` | **Nuevo.** La fórmula del marco teórico. Funciones puras. |
| `src/agents/curador/policy.py` | Gana la estimación por acción y la elección. Conserva las reglas de ajuste. |
| `src/agents/curador/node.py` | Deja de decidir con `if` cableados; consulta la política y registra la recompensa. |
| `src/agents/shell/node.py` | Reporta `converged` en cada resultado de simulación. |
| `src/agents/calculo/formulas.py` | Sus constantes salen a la configuración. |
| `src/agents/llm/factory.py` | Pasa `temperature` al construir el modelo. |
| `pyproject.toml` | Añade `pyyaml`. |

Pruebas nuevas: `tests/test_config.py`, `tests/test_reward.py`. Se amplían `tests/test_curador.py`,
`tests/test_sintesis.py` y `tests/test_factory.py`.

---

### Task 1: La configuración externa

**Files:**
- Create: `project/apps/agents/config/curador.yaml`
- Create: `project/apps/agents/src/agents/config.py`
- Test: `project/apps/agents/tests/test_config.py`
- Modify: `project/apps/agents/pyproject.toml`

- [ ] **Step 1: Añade la dependencia**

En `project/apps/agents/pyproject.toml`, dentro de `dependencies`, en orden alfabético entre
`pyspice` y `uvicorn`:

```toml
    "pyspice>=1.5",
    "pyyaml>=6.0.2",
    "uvicorn>=0.42.0",
```

Luego sincroniza:

```bash
uv sync
```

- [ ] **Step 2: Escribe el archivo de configuración**

Crea `project/apps/agents/config/curador.yaml`:

```yaml
# Parámetros del curador y del cálculo. Externos al código a propósito: la
# evaluación experimental los ajusta sin recompilar (RNF-04.2 de la tesina).
#
# La recompensa es  R = -Σᵢ(wᵢ·APEᵢ) + β·c - γ·n
# con APE en PUNTOS PORCENTUALES (5 % es 5.0, no 0.05).

curador:
  # Peso wᵢ por métrica. 'default' aplica a las métricas sin peso propio.
  weights:
    default: 1.0

  # β: premio por que la simulación converja.
  beta: 10.0

  # γ: castigo por cada iteración consumida. Junto con
  # expected_error_reduction fija el umbral de parada temprana:
  #   se acepta cuando el error ponderado < γ / (1 - expected_error_reduction)
  #   con estos valores, cuando baja de 10 puntos porcentuales.
  gamma: 3.0

  # ρ: cuánto se espera que un ajuste reduzca el error. Se usa solo cuando el
  # historial no tiene aún dos iteraciones de las que estimarlo.
  expected_error_reduction: 0.7

  # APE que se le imputa a un bloque cuya simulación falló: no hay medición,
  # pero dejarlo fuera de la suma haría que fallar saliera gratis.
  failed_ape: 100.0

  # Lo que vale entregar nada. Se registra en el historial para trazabilidad;
  # no dirige la decisión (ver la nota de calibración del plan).
  reject_reward: -50.0

  # Cuánto puede un bloque salirse de SU PROPIA tolerancia y aún así ser
  # aceptable. Se mide en unidades de esa tolerancia, no en puntos de APE: un
  # bloque con tolerancia del 1 % y otro con 5 % no admiten el mismo desvío
  # absoluto. Con 1.5, un objetivo del 5 % tolera hasta 7.5 % de error; uno del
  # 1 %, hasta 1.5 %. La recompensa decide cuándo parar de iterar, esto decide
  # si lo que hay se puede entregar.
  accept_tolerance_slack: 1.5

  max_iterations: 5
  tolerance: 0.05

calculo:
  r1_default: 1000.0
  r_rc_default: 1000.0
  r_min: 1.0
  perturb_factor: 1.05

llm:
  # Fija la temperatura para que la evaluación sea repetible, que es un
  # criterio de aceptación explícito de la tesina.
  temperature: 0.0
```

- [ ] **Step 3: Escribe el test que falla**

Crea `project/apps/agents/tests/test_config.py`:

```python
import pytest
import yaml

from agents.config import get_config, load_config, reset_config_cache


@pytest.fixture(autouse=True)
def _clean_cache():
    reset_config_cache()
    yield
    reset_config_cache()


def test_load_config_reads_the_shipped_file():
    cfg = load_config()

    assert cfg["curador"]["beta"] == 10.0
    assert cfg["curador"]["gamma"] == 3.0
    assert cfg["curador"]["weights"]["default"] == 1.0
    assert cfg["calculo"]["r_min"] == 1.0
    assert cfg["llm"]["temperature"] == 0.0


def test_load_config_accepts_an_explicit_path(tmp_path):
    custom = tmp_path / "otro.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"beta": 99.0}}))

    assert load_config(custom)["curador"]["beta"] == 99.0


def test_env_var_overrides_the_path(tmp_path, monkeypatch):
    custom = tmp_path / "experimento.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"gamma": 7.0}}))
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))

    assert get_config()["curador"]["gamma"] == 7.0


def test_get_config_is_cached(tmp_path, monkeypatch):
    custom = tmp_path / "cacheada.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"beta": 1.0}}))
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))

    first = get_config()
    custom.write_text(yaml.safe_dump({"curador": {"beta": 2.0}}))

    # sin reset, la segunda lectura devuelve lo cacheado
    assert get_config()["curador"]["beta"] == 1.0
    reset_config_cache()
    assert get_config()["curador"]["beta"] == 2.0


def test_missing_file_fails_loudly(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "no-existe.yaml")
```

- [ ] **Step 4: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.config'`.

- [ ] **Step 5: Implementa**

Crea `project/apps/agents/src/agents/config.py`:

```python
"""Carga de la configuración externa de los agentes.

Los pesos, factores y umbrales viven en un YAML y no en el código para que la
evaluación experimental pueda moverlos sin tocar el repositorio. La ruta se
sobreescribe con CURADOR_CONFIG_PATH, que es como cada experimento usa la suya.
"""

import os
from pathlib import Path

import yaml

# src/agents/config.py -> parents[2] es apps/agents
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "curador.yaml"

_cache: dict | None = None


def load_config(path: str | Path | None = None) -> dict:
    """Lee el YAML de configuración. Sin caché: siempre toca disco."""
    resolved = Path(path) if path is not None else DEFAULT_CONFIG_PATH
    if not resolved.is_file():
        raise FileNotFoundError(f"config file not found: {resolved}")
    with resolved.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def get_config() -> dict:
    """Configuración cacheada en proceso. Es lo que consumen los nodos."""
    global _cache
    if _cache is None:
        _cache = load_config(os.environ.get("CURADOR_CONFIG_PATH"))
    return _cache


def reset_config_cache() -> None:
    """Invalida la caché. Existe para las pruebas y para recargar en caliente."""
    global _cache
    _cache = None
```

- [ ] **Step 6: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_config.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add project/apps/agents/config/curador.yaml project/apps/agents/src/agents/config.py project/apps/agents/tests/test_config.py project/apps/agents/pyproject.toml project/apps/agents/uv.lock
git commit -m "feat(agents): configuracion externa de curador y calculo"
```

---

### Task 2: La convergencia en los resultados de simulación

**Files:**
- Modify: `project/apps/agents/src/agents/shell/ngspice_runner.py`
- Modify: `project/apps/agents/tests/test_ngspice_runner.py`
- Modify: `project/apps/agents/src/agents/shell/node.py`
- Modify: `project/apps/agents/tests/test_sintesis.py`

El cambio en el nodo es aditivo: se añade una clave a cada resultado. Las pruebas existentes que
solo consultan `sim_error` siguen pasando sin tocarse.

Antes hay que tapar un agujero en el runner, descubierto al ejecutar esta tarea: `run_ngspice`
documenta que devuelve `(salida, error)` con exactamente uno en `None`, pero `subprocess.run`
puede **lanzar** `OSError` y hoy nadie lo captura. Pasa en dos casos reales: cuando el directorio
de trabajo no existe —una corrida retomada desde un checkpoint tras reiniciar el proceso, que es
justo lo que habilita la Fase 4— y, sobre todo, **cuando `ngspice` no está instalado en el `PATH`**.
En ambos el grafo entero revienta con una excepción no capturada en lugar de terminar como
ejecución fallida con un mensaje legible.

- [ ] **Step 1: Arregla el runner para que devuelva el error en vez de lanzarlo**

En `project/apps/agents/src/agents/shell/ngspice_runner.py`, añade una segunda cláusula `except`
justo después de la de `TimeoutExpired`:

```python
    except subprocess.TimeoutExpired:
        return None, "ngspice timed out after 30s"
    except OSError as exc:
        # El directorio de trabajo no existe, o ngspice no está en el PATH.
        # Esta función promete devolver el error en la tupla, no lanzarlo:
        # una corrida sin ngspice instalado debe terminar como ejecución
        # fallida con un mensaje legible, no como excepción no capturada.
        return None, f"could not run ngspice: {exc}"
```

- [ ] **Step 2: Prueba el camino nuevo del runner**

Añade al final de `project/apps/agents/tests/test_ngspice_runner.py` (sin duplicar el import de
`run_ngspice` si ya está arriba):

```python
def test_run_ngspice_reports_a_missing_working_directory_as_an_error():
    output_path, error = run_ngspice("/ruta/que/no/existe.cir")

    assert output_path is None
    assert error is not None
    assert "could not run ngspice" in error
```

Run: `uv run pytest tests/test_ngspice_runner.py -v`
Expected: PASS.

```bash
git add project/apps/agents/src/agents/shell/ngspice_runner.py project/apps/agents/tests/test_ngspice_runner.py
git commit -m "fix(agents): run_ngspice devuelve el error en vez de lanzarlo"
```

- [ ] **Step 3: Escribe el test que falla**

Añade al final de `project/apps/agents/tests/test_sintesis.py`:

```python
def test_sim_results_report_convergence():
    from agents.shell.node import shell_node

    state = {
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
        },
        "pending_blocks": ["div1"],
        "netlists": {"div1": {"path": "/ruta/que/no/existe.cir", "text": ""}},
    }

    result = shell_node(state)

    # el netlist no existe: ngspice falla y el bloque no converge
    assert result["sim_results"]["div1"]["sim_error"] is not None
    assert result["sim_results"]["div1"]["converged"] is False
```

Y añade esta comprobación dentro de la prueba que ya simula de verdad, junto a
`assert div["sim_error"] is None` en la línea 43:

```python
    assert div["converged"] is True
```

- [ ] **Step 4: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_sintesis.py -v`
Expected: FAIL — `KeyError: 'converged'` en la prueba de simulación real. La prueba nueva falla
por el mismo motivo **solo si ya hiciste el Step 1**; sin él revienta antes con `FileNotFoundError`.

- [ ] **Step 5: Implementa**

Reemplaza el contenido de `project/apps/agents/src/agents/shell/node.py`. Fíjate en que **no lleva
`try`/`except`**: convertir un fallo en un error es responsabilidad del runner, no del nodo.

```python
from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    goals = {b["id"]: b["goal"] for b in state["normalized_spec"]["blocks"]}

    sim_results = {}
    for block_id in state["pending_blocks"]:
        netlist_path = state["netlists"][block_id]["path"]
        raw_output_path, error = run_ngspice(netlist_path)

        # ngspice señala la no convergencia saliendo con código distinto de
        # cero o no escribiendo el archivo de salida; ambos casos llegan aquí
        # como `error`, así que converger equivale a haber podido medir.
        if error is not None:
            sim_results[block_id] = {
                "metrics": None,
                "converged": False,
                "sim_error": error,
            }
            continue

        try:
            value = parse_wrdata_scalar(raw_output_path)
        except ValueError as exc:
            sim_results[block_id] = {
                "metrics": None,
                "converged": False,
                "sim_error": str(exc),
            }
            continue

        metric = goals[block_id]["metric"]
        sim_results[block_id] = {
            "metrics": {metric: value},
            "converged": True,
            "sim_error": None,
        }

    return {"sim_results": sim_results}
```

- [ ] **Step 6: Corre las pruebas y verifica que pasan**

Run: `uv run pytest tests/test_sintesis.py tests/test_ngspice_runner.py -v`
Expected: PASS. Las pruebas antiguas no se tocaron y siguen verdes porque el cambio solo añade una clave.

Y la suite completa: `uv run pytest`
Expected: **93 passed, 5 skipped**. Eran 91 antes de esta tarea; las dos nuevas son la de
convergencia y la del runner.

- [ ] **Step 7: Commit**

```bash
git add project/apps/agents/src/agents/shell/node.py project/apps/agents/tests/test_sintesis.py
git commit -m "feat(agents): el shell reporta la convergencia de cada bloque"
```

---

### Task 3: La función de recompensa

**Files:**
- Create: `project/apps/agents/src/agents/curador/reward.py`
- Test: `project/apps/agents/tests/test_reward.py`

Cuatro funciones puras. Ninguna toca estado ni configuración global: la configuración se pasa como
argumento para que las pruebas fijen sus propios números.

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/agents/tests/test_reward.py`:

```python
import pytest

from agents.curador.reward import (
    build_measurements,
    compute_reward,
    weight_for,
    weighted_ape,
)

CFG = {
    "curador": {
        "weights": {"default": 1.0, "v_out": 2.0},
        "beta": 10.0,
        "gamma": 3.0,
        "failed_ape": 100.0,
    }
}


def test_weight_for_uses_the_specific_weight_when_present():
    assert weight_for("v_out", CFG) == 2.0


def test_weight_for_falls_back_to_default():
    assert weight_for("f_c", CFG) == 1.0


def test_build_measurements_converts_relative_error_to_percentage_points():
    blocks = [{"id": "div1", "goal": {"metric": "v_out"}}]
    evaluations = {"div1": ("off", 0.25)}

    assert build_measurements(blocks, evaluations, CFG) == [("v_out", 25.0)]


def test_build_measurements_imputes_failed_ape_when_there_is_no_measurement():
    blocks = [{"id": "div1", "goal": {"metric": "v_out"}}]
    evaluations = {"div1": ("error", None)}

    assert build_measurements(blocks, evaluations, CFG) == [("v_out", 100.0)]


def test_weighted_ape_applies_the_per_metric_weight():
    # v_out pesa 2.0, f_c usa el default 1.0
    assert weighted_ape([("v_out", 10.0), ("f_c", 5.0)], CFG) == pytest.approx(25.0)


def test_compute_reward_matches_the_thesis_formula():
    # R = -(2.0*10.0) + 10.0*1 - 3.0*2 = -20 + 10 - 6 = -16
    result = compute_reward([("v_out", 10.0)], converged=True, iteration=2, config=CFG)

    assert result == pytest.approx(-16.0)


def test_compute_reward_drops_the_beta_term_when_it_did_not_converge():
    # R = -(2.0*10.0) + 0 - 3.0*0 = -20
    result = compute_reward([("v_out", 10.0)], converged=False, iteration=0, config=CFG)

    assert result == pytest.approx(-20.0)


def test_compute_reward_with_no_measurements_is_just_convergence_and_iteration():
    assert compute_reward([], converged=True, iteration=1, config=CFG) == pytest.approx(7.0)


def test_a_perfect_circuit_on_the_first_iteration_scores_beta():
    assert compute_reward([("v_out", 0.0)], converged=True, iteration=0, config=CFG) == pytest.approx(10.0)
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_reward.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.curador.reward'`.

- [ ] **Step 3: Implementa**

Crea `project/apps/agents/src/agents/curador/reward.py`:

```python
"""La función de recompensa del curador.

    R = -Σᵢ (wᵢ · APEᵢ) + β·c - γ·n

APE va en PUNTOS PORCENTUALES: un error relativo de 0.25 es 25.0. La unidad
importa porque fija la escala de β y γ frente al término de error.
"""

Measurement = tuple[str, float]


def weight_for(metric: str, config: dict) -> float:
    weights = config["curador"]["weights"]
    return weights.get(metric, weights["default"])


def build_measurements(
    blocks: list[dict],
    evaluations: dict[str, tuple[str, float | None]],
    config: dict,
) -> list[Measurement]:
    """Arma la lista (métrica, APE) que consume la recompensa.

    Un bloque cuya simulación falló no tiene medición; se le imputa
    `failed_ape` porque dejarlo fuera de la suma haría que fallar saliera
    gratis y la recompensa premiaría no simular.
    """
    failed_ape = config["curador"]["failed_ape"]

    measurements: list[Measurement] = []
    for block in blocks:
        metric = block["goal"]["metric"]
        _, rel_err = evaluations[block["id"]]
        measurements.append(
            (metric, failed_ape if rel_err is None else rel_err * 100.0)
        )
    return measurements


def weighted_ape(measurements: list[Measurement], config: dict) -> float:
    """Σᵢ (wᵢ · APEᵢ) — el término de error de la recompensa, sin signo."""
    return sum(weight_for(metric, config) * ape for metric, ape in measurements)


def compute_reward(
    measurements: list[Measurement],
    converged: bool,
    iteration: int,
    config: dict,
) -> float:
    beta = config["curador"]["beta"]
    gamma = config["curador"]["gamma"]
    return (
        -weighted_ape(measurements, config)
        + beta * (1.0 if converged else 0.0)
        - gamma * iteration
    )
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_reward.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/reward.py project/apps/agents/tests/test_reward.py
git commit -m "feat(agents): funcion de recompensa del curador"
```

---

### Task 4: La política por recompensa

**Files:**
- Modify: `project/apps/agents/src/agents/curador/policy.py`
- Modify: `project/apps/agents/tests/test_curador.py`

Se añaden tres funciones puras al módulo de política. Las reglas de ajuste existentes no se tocan:
siguen siendo el respaldo determinista que la tesina describe.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `project/apps/agents/tests/test_curador.py`:

```python
from agents.curador.policy import (
    choose_action,
    estimate_action_rewards,
    observed_reduction,
)

POLICY_CFG = {
    "curador": {
        "weights": {"default": 1.0},
        "beta": 10.0,
        "gamma": 3.0,
        "failed_ape": 100.0,
        "expected_error_reduction": 0.7,
        "reject_reward": -50.0,
    }
}


def test_estimate_action_rewards_projects_the_adjustment():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)], converged=True, iteration=0, config=POLICY_CFG
    )

    # accept: -20 + 10 - 0 = -10
    assert rewards["accept"] == pytest.approx(-10.0)
    # adjust: -(20*0.7) + 10 - 3 = -14 + 7 = -7
    assert rewards["adjust"] == pytest.approx(-7.0)
    assert rewards["reject"] == pytest.approx(-50.0)


def test_estimate_action_rewards_prefers_the_observed_reduction():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)],
        converged=True,
        iteration=0,
        config=POLICY_CFG,
        reduction=0.5,
    )

    # adjust con ρ=0.5: -(20*0.5) + 10 - 3 = -3
    assert rewards["adjust"] == pytest.approx(-3.0)


def test_choose_action_adjusts_when_the_error_is_large():
    # A=24.24 supera el umbral γ/(1-ρ) = 10
    rewards = estimate_action_rewards(
        [("v_out", 24.24)], converged=True, iteration=0, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=True) == "adjust"


def test_choose_action_accepts_early_when_one_more_iteration_costs_more_than_it_gains():
    # A=7.0 queda por debajo del umbral: ajustar cuesta más de lo que quita
    rewards = estimate_action_rewards(
        [("v_out", 7.0)], converged=True, iteration=0, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=True) == "accept"


def test_choose_action_rejects_when_there_are_no_iterations_left():
    rewards = estimate_action_rewards(
        [("v_out", 24.24)], converged=True, iteration=4, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=False) == "reject"


def test_observed_reduction_is_the_ratio_of_the_last_two_iterations():
    history = [{"weighted_ape": 40.0}, {"weighted_ape": 10.0}]

    assert observed_reduction(history) == pytest.approx(0.25)


def test_observed_reduction_is_unavailable_with_a_single_iteration():
    assert observed_reduction([{"weighted_ape": 40.0}]) is None


def test_observed_reduction_never_exceeds_one():
    # el error empeoró: no se puede prometer una reducción
    history = [{"weighted_ape": 10.0}, {"weighted_ape": 40.0}]

    assert observed_reduction(history) == pytest.approx(1.0)
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_curador.py -v`
Expected: FAIL — `ImportError: cannot import name 'choose_action' from 'agents.curador.policy'`.

- [ ] **Step 3: Implementa**

Añade al final de `project/apps/agents/src/agents/curador/policy.py`, y añade el import arriba del
archivo, bajo la línea `R_MIN = 1.0`:

```python
from agents.curador.reward import Measurement, compute_reward
```

```python
def observed_reduction(history: list) -> float | None:
    """ρ estimado del historial: cuánto redujo el error el último ajuste.

    Devuelve None mientras no haya dos iteraciones que comparar. Se acota a 1.0
    porque un ajuste que empeoró el error no puede prometer mejorarlo.
    """
    scored = [r["weighted_ape"] for r in history if r.get("weighted_ape") is not None]
    if len(scored) < 2 or scored[-2] <= 0:
        return None
    return min(scored[-1] / scored[-2], 1.0)


def estimate_action_rewards(
    measurements: list[Measurement],
    converged: bool,
    iteration: int,
    config: dict,
    reduction: float | None = None,
) -> dict[str, float]:
    """Recompensa estimada de cada acción disponible desde el estado actual.

    `adjust` se proyecta multiplicando los APE por ρ y pagando una iteración
    más de castigo: es lo que valdría el circuito si el ajuste rindiera lo
    esperado.
    """
    rho = (
        reduction
        if reduction is not None
        else config["curador"]["expected_error_reduction"]
    )
    projected = [(metric, ape * rho) for metric, ape in measurements]

    return {
        "accept": compute_reward(measurements, converged, iteration, config),
        "adjust": compute_reward(projected, converged, iteration + 1, config),
        "reject": config["curador"]["reject_reward"],
    }


def choose_action(action_rewards: dict[str, float], adjust_available: bool) -> str:
    """Elige entre aceptar y ajustar por recompensa.

    Rechazar no compite: es el desenlace cuando ya no quedan iteraciones. Que
    fuera una opción más obligaría a calibrar su recompensa entre dos
    condiciones incompatibles — reintentar tras un error de simulación tiene
    que ganarle a rechazar, y rechazar tiene que ganarle a entregar un circuito
    muy desviado — y no hay ningún valor que cumpla las dos.
    """
    if not adjust_available:
        return "reject"
    return "accept" if action_rewards["accept"] >= action_rewards["adjust"] else "adjust"
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_curador.py -v`
Expected: PASS. Las 8 pruebas nuevas pasan y las 13 anteriores siguen verdes.

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/policy.py project/apps/agents/tests/test_curador.py
git commit -m "feat(agents): politica del curador por recompensa estimada"
```

---

### Task 5: El curador decide por recompensa

**Files:**
- Modify: `project/apps/agents/src/agents/curador/node.py`
- Modify: `project/apps/agents/tests/test_curador.py`

Es la tarea que junta todo. El nodo deja de decidir con dos `if` cableados y pasa a consultar la
política, registrando la recompensa y las recompensas por acción en el historial.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `project/apps/agents/tests/test_curador.py`:

```python
def test_curador_records_the_reward_and_the_action_rewards():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}})
    )

    record = result["history"][0]
    assert record["converged"] is True
    assert record["weighted_ape"] == pytest.approx(100.0 * 0.8 / 3.3)
    # accept = -A + β - γ·0
    assert record["reward"] == pytest.approx(-record["weighted_ape"] + 10.0)
    assert set(record["action_rewards"]) == {"accept", "adjust", "reject"}


def test_curador_accepts_early_when_adjusting_costs_more_than_it_gains():
    # 3.10 contra una meta de 3.3 es un 6.06 % de error: fuera de la tolerancia
    # del 5 %, pero por debajo del umbral γ/(1-ρ) = 10 puntos. Las reglas
    # anteriores habrían seguido ajustando; la política acepta.
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 3.10}, "converged": True, "sim_error": None}})
    )

    assert result["verdict"]["status"] == "accepted"
    assert result["history"][0]["decision"] == "accept"
    assert "recompensa" in result["verdict"]["reason"]


def test_curador_marks_the_block_as_not_converged_when_the_simulation_failed():
    result = curador_node(
        _state({"div1": {"metrics": None, "converged": False, "sim_error": "boom"}})
    )

    assert result["history"][0]["converged"] is False
    # APE imputado de 100 y sin premio de convergencia
    assert result["history"][0]["reward"] == pytest.approx(-100.0)


def test_best_iteration_is_the_one_with_the_highest_reward():
    result = curador_node(
        _state(
            {"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}},
            iteration=4,
            max_iterations=5,
            history=[
                {"iteration": 0, "decision": "adjust", "reward": -50.0, "weighted_ape": 60.0},
                {"iteration": 1, "decision": "adjust", "reward": -5.0, "weighted_ape": 12.0},
                {"iteration": 2, "decision": "adjust", "reward": -40.0, "weighted_ape": 47.0},
                {"iteration": 3, "decision": "adjust", "reward": -45.0, "weighted_ape": 52.0},
            ],
        )
    )

    assert result["verdict"]["status"] == "rejected"
    assert result["verdict"]["best_iteration"] == 1
```

También hay que actualizar el ayudante `_state` para que los resultados de simulación traigan la
clave nueva. Reemplaza las cinco llamadas existentes que pasan `sim_results` sin `converged`
añadiéndoles `"converged": True` cuando `sim_error` es `None` y `"converged": False` cuando no lo es.
Las llamadas a modificar están en las líneas 86, 97, 108, 118 y 136 del archivo.

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_curador.py -v`
Expected: FAIL — `KeyError: 'weighted_ape'` en el primer test nuevo.

- [ ] **Step 3: Implementa**

Reemplaza el contenido de `project/apps/agents/src/agents/curador/node.py`:

```python
from agents.config import get_config
from agents.curador.policy import (
    ADJUST_RULES,
    accept_is_admissible,
    choose_action,
    estimate_action_rewards,
    evaluate_block,
    observed_reduction,
    perturb,
)
from agents.curador.reward import build_measurements, weighted_ape
from agents.state import CircuitState

ACCEPTED_BY_TOLERANCE = "all blocks within tolerance"
ACCEPTED_BY_REWARD = (
    "aceptado por recompensa: otra iteración costaría más de lo que reduciría el error"
)


def curador_node(state: CircuitState) -> dict:
    cfg = get_config()
    spec = state["normalized_spec"]
    iteration = state["iteration"]
    blocks = spec["blocks"]
    max_iterations = spec.get("max_iterations") or cfg["curador"]["max_iterations"]

    evaluations = {
        block["id"]: evaluate_block(block["goal"], state["sim_results"][block["id"]])
        for block in blocks
    }

    failing = {bid: status for bid, (status, _) in evaluations.items() if status != "ok"}
    rel_errs = [err for _, err in evaluations.values() if err is not None]
    worst_rel_err = max(rel_errs) if rel_errs else None

    # c de la fórmula: la corrida converge si convergieron todos sus bloques
    converged = all(
        state["sim_results"][block["id"]].get("converged", False) for block in blocks
    )

    measurements = build_measurements(blocks, evaluations, cfg)
    action_rewards = estimate_action_rewards(
        measurements,
        converged=converged,
        iteration=iteration,
        config=cfg,
        reduction=observed_reduction(state["history"]),
    )

    record = {
        "iteration": iteration,
        "component_values": dict(state["component_values"]),
        "sim_results": dict(state["sim_results"]),
        "evaluations": {bid: status for bid, (status, _) in evaluations.items()},
        "worst_rel_err": worst_rel_err,
        "weighted_ape": weighted_ape(measurements, cfg),
        "converged": converged,
        "reward": action_rewards["accept"],
        "action_rewards": action_rewards,
    }

    # Respaldo determinista: dentro de tolerancia se acepta sin consultar la
    # política. Es la garantía de fiabilidad que la tesina describe — el
    # sistema siempre produce una decisión aunque la política no aplique.
    if not failing:
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": ACCEPTED_BY_TOLERANCE,
                "best_iteration": iteration,
            },
        }

    # La recompensa decide cuándo parar; la tolerancia decide si el circuito
    # sirve. Sin el tope, un circuito estancado lejos de la meta se aceptaría
    # (con ρ saturado en 1.0 aceptar gana siempre) e inflaría la tasa de éxito.
    action = choose_action(
        action_rewards,
        adjust_available=iteration + 1 < max_iterations,
        accept_admissible=accept_is_admissible(blocks, evaluations, cfg),
    )

    if action == "accept":
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": ACCEPTED_BY_REWARD,
                "best_iteration": iteration,
            },
        }

    if action == "reject":
        record["decision"] = "reject"
        sim_errors = [
            state["sim_results"][bid]["sim_error"]
            for bid, status in failing.items()
            if status == "error"
        ]
        reason = (
            f"simulation errors after {max_iterations} iterations: {sim_errors}"
            if sim_errors
            else f"goals not met after {max_iterations} iterations"
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
    blocks_by_id = {b["id"]: b for b in blocks}
    adjusted = {}
    for bid, status in failing.items():
        block = blocks_by_id[bid]
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
    """La mejor iteración es la de mayor recompensa.

    Antes se elegía por error relativo mínimo, que ignora la convergencia y el
    costo de las iteraciones; la recompensa las incorpora, que es justamente
    para lo que existe.
    """
    scored = [r for r in history if r.get("reward") is not None]
    if not scored:
        return None
    return max(scored, key=lambda r: r["reward"])["iteration"]


def route_after_curador(state: CircuitState) -> str:
    return "done" if state["verdict"] is not None else "adjust"
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_curador.py -v`
Expected: PASS. Las cuatro pruebas nuevas y las anteriores, todas verdes.

Si `test_curador_rejects_when_iterations_exhausted` falla porque `best_iteration` cambió: ese test
usaba registros con `worst_rel_err` y ahora la selección es por `reward`. Sus registros del
historial necesitan la clave `reward`; añádesela con los valores que ya trae el test nuevo
`test_best_iteration_is_the_one_with_the_highest_reward` como referencia.

- [ ] **Step 5: Corre toda la suite de agents**

Run: `uv run pytest -v`
Expected: PASS. Presta atención a `tests/test_graph.py`, que ejercita el lazo completo con ngspice
real: es el que revelaría una regresión de integración.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/src/agents/curador/node.py project/apps/agents/tests/test_curador.py
git commit -m "feat(agents): el curador decide por recompensa y registra la traza"
```

---

### Task 6: Las constantes de cálculo salen a la configuración

**Files:**
- Modify: `project/apps/agents/src/agents/calculo/formulas.py`
- Modify: `project/apps/agents/src/agents/curador/policy.py`
- Modify: `project/apps/agents/tests/test_calculo.py`

Cierra el hallazgo A3: hoy `R1_DEFAULT`, `R_RC_DEFAULT`, `R_MIN` y el factor de perturbación están
incrustados en dos archivos.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `project/apps/agents/tests/test_calculo.py`:

```python
import yaml

from agents.config import reset_config_cache
from agents.calculo.formulas import FORMULAS


def test_formulas_read_their_defaults_from_the_config(tmp_path, monkeypatch):
    custom = tmp_path / "otra.yaml"
    custom.write_text(
        yaml.safe_dump(
            {
                "curador": {
                    "weights": {"default": 1.0},
                    "beta": 10.0,
                    "gamma": 3.0,
                    "failed_ape": 100.0,
                    "expected_error_reduction": 0.7,
                    "reject_reward": -50.0,
                    "max_iterations": 5,
                    "tolerance": 0.05,
                },
                "calculo": {
                    "r1_default": 4700.0,
                    "r_rc_default": 1000.0,
                    "r_min": 1.0,
                    "perturb_factor": 1.05,
                },
                "llm": {"temperature": 0.0},
            }
        )
    )
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))
    reset_config_cache()

    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 2.5})

    assert values["r1"] == 4700.0
    reset_config_cache()
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_calculo.py -v`
Expected: FAIL — `assert 1000.0 == 4700.0`.

- [ ] **Step 3: Implementa**

Reemplaza el contenido de `project/apps/agents/src/agents/calculo/formulas.py`:

```python
import math

from agents.config import get_config


def _calculo_cfg() -> dict:
    # Se lee por llamada, no al importar: si se leyera al importar, cambiar la
    # configuración exigiría reimportar el módulo y las pruebas no podrían
    # sustituirla.
    return get_config()["calculo"]


def voltage_divider_values(params: dict) -> dict:
    cfg = _calculo_cfg()
    v_in, v_out = params["v_in"], params["v_out"]
    r1 = cfg["r1_default"]
    if v_out >= v_in:
        # meta físicamente inalcanzable: emitir un valor válido y dejar que
        # el lazo del curador la rechace al agotar iteraciones
        return {"r1": r1, "r2": cfg["r_min"]}
    return {"r1": r1, "r2": r1 * v_out / (v_in - v_out)}


def rc_lowpass_values(params: dict) -> dict:
    r = _calculo_cfg()["r_rc_default"]
    return {"r": r, "c": 1.0 / (2 * math.pi * r * params["f_c"])}


def led_resistor_values(params: dict) -> dict:
    r = (params["v_in"] - params["v_f"]) / params["i_led"]
    return {"r": max(r, _calculo_cfg()["r_min"])}


FORMULAS = {
    "voltage_divider": voltage_divider_values,
    "rc_lowpass": rc_lowpass_values,
    "led_resistor": led_resistor_values,
}
```

Y en `project/apps/agents/src/agents/curador/policy.py`, sustituye la constante del principio del
archivo y la función `perturb`. Borra la línea `R_MIN = 1.0` y añade el import de la configuración
junto al que ya añadiste en la Tarea 4:

```python
from agents.config import get_config
from agents.curador.reward import Measurement, compute_reward
```

Reemplaza las tres funciones de ajuste y `perturb` para que lean el piso y el factor de la
configuración:

```python
def _adjust_voltage_divider(values: dict, target: float, actual: float) -> dict:
    r_min = get_config()["calculo"]["r_min"]
    if actual <= 0:
        return {**values, "r2": values["r2"] * 2}
    return {**values, "r2": max(values["r2"] * target / actual, r_min)}


def _adjust_rc_lowpass(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "c": values["c"] / 2}
    return {**values, "c": values["c"] * actual / target}


def _adjust_led_resistor(values: dict, target: float, actual: float) -> dict:
    r_min = get_config()["calculo"]["r_min"]
    if actual <= 0:
        return {**values, "r": max(values["r"] / 2, r_min)}
    return {**values, "r": max(values["r"] * actual / target, r_min)}


def perturb(values: dict) -> dict:
    """Reintento tras sim_error: perturbación simple de todos los valores."""
    factor = get_config()["calculo"]["perturb_factor"]
    return {k: v * factor for k, v in values.items()}
```

- [ ] **Step 4: Corre las pruebas y verifica que pasan**

Run: `uv run pytest tests/test_calculo.py tests/test_curador.py -v`
Expected: PASS. `test_perturb_scales_all_values` sigue verde porque el factor por defecto de la
configuración es el mismo `1.05` que estaba cableado.

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/calculo/formulas.py project/apps/agents/src/agents/curador/policy.py project/apps/agents/tests/test_calculo.py
git commit -m "feat(agents): las constantes de calculo y ajuste salen a la configuracion"
```

---

### Task 7: La temperatura fija del LLM

**Files:**
- Modify: `project/apps/agents/src/agents/llm/factory.py`
- Modify: `project/apps/agents/tests/test_factory.py`

Cierra el hallazgo D4. Sin temperatura fija la evaluación de la Fase 5 no es repetible y el criterio
de aceptación de la tesina no se cumple.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `project/apps/agents/tests/test_factory.py`:

```python
def test_build_chat_model_passes_the_configured_temperature(monkeypatch):
    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr("agents.llm.factory.init_chat_model", fake_init_chat_model)

    build_chat_model(
        AgentLlmConfig(
            provider="openai",
            model="gpt-4o-mini",
            api_key="sk-test",
            base_url=None,
        )
    )

    assert captured["temperature"] == 0.0
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_factory.py -v`
Expected: FAIL — `KeyError: 'temperature'`.

- [ ] **Step 3: Implementa**

Reemplaza el contenido de `project/apps/agents/src/agents/llm/factory.py`:

```python
from langchain.chat_models import init_chat_model

from agents.config import get_config
from agents.llm.settings_client import AgentLlmConfig

_PROVIDER_MAP = {
    "anthropic": "anthropic",
    "openai": "openai",
    "google": "google_genai",
    "openai_compatible": "openai",
}


class UnsupportedProviderError(Exception):
    pass


def build_chat_model(config: AgentLlmConfig):
    if config.provider not in _PROVIDER_MAP:
        raise UnsupportedProviderError(f"unsupported provider: {config.provider}")

    kwargs: dict = {
        "model": config.model,
        "model_provider": _PROVIDER_MAP[config.provider],
        # Fija la temperatura para que la evaluación experimental sea
        # repetible: es un criterio de aceptación de la tesina, no una
        # preferencia de estilo.
        "temperature": get_config()["llm"]["temperature"],
    }
    # api_key es opcional para openai_compatible (algunos endpoints locales
    # no exigen key); init_chat_model requiere un valor no vacío igual.
    kwargs["api_key"] = config.api_key or "not-required"
    if config.provider == "openai_compatible":
        kwargs["base_url"] = config.base_url

    return init_chat_model(**kwargs)
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_factory.py -v`
Expected: PASS.

- [ ] **Step 5: Corre toda la suite**

Run: `uv run pytest -v`
Expected: PASS, sin saltados salvo los marcados `live_llm`.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/src/agents/llm/factory.py project/apps/agents/tests/test_factory.py
git commit -m "feat(agents): temperatura del LLM fija desde configuracion"
```

---

## Verificación final de la fase

- [ ] `uv run pytest` verde con `ngspice` en el `PATH`, sin saltados fuera de `live_llm`.
- [ ] El historial de una corrida real trae `reward`, `converged`, `weighted_ape` y `action_rewards`
      en cada registro. Compruébalo levantando agents y mirando la respuesta de `POST /runs`:

```bash
uv run uvicorn agents.api:app --port 8000
```

- [ ] Existe una prueba que demuestra que la política acepta un circuito que las reglas anteriores
      habrían seguido ajustando (`test_curador_accepts_early_when_adjusting_costs_more_than_it_gains`).
- [ ] Cambiar `gamma` en `config/curador.yaml` cambia el comportamiento sin tocar código: súbelo a
      `20.0` y esa misma prueba debe seguir aceptando; bájalo a `0.1` y debe pasar a ajustar.
      Devuelve el valor a `3.0` al terminar.
- [ ] El server sigue traduciendo bien el resultado: `bun test` verde en `project/apps/server`, en
      particular `workspace.runner.test.ts`, que consume `verdict` e `history`.
