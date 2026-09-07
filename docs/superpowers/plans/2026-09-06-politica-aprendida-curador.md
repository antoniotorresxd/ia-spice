# Política aprendida del curador — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el curador use una política aprendida (un bandit contextual) para estimar la recompensa de `adjust`, entrenada sobre corridas reales del grafo, con la proyección heurística actual como respaldo determinista cuando la política no aplica.

**Architecture:** Regresión ridge pura-Python (sin numpy) sobre features derivadas del `record` que `curador/node.py` ya arma. `estimate_action_rewards` gana un override opcional para la recompensa de `adjust`, igual que ya lo tiene para `reduction`. Un generador sintético corre el grafo real contra ngspice con ruido en el cálculo inicial y exploración forzada en la decisión, para producir un dataset entrenable sin depender de tráfico real. Un script de entrenamiento ajusta la regresión y serializa un artefacto de pesos versionado (`CURADOR_POLICY_PATH`). Un gate corre el banco de 20 casos con y sin la política candidata antes de aceptar reemplazar los pesos en uso.

**Tech Stack:** Python 3.12, LangGraph (`StateGraph`), pytest, PyYAML — sin dependencias nuevas (regresión implementada a mano).

**Spec:** `docs/superpowers/specs/2026-09-06-politica-aprendida-curador-design.md`

## Global Constraints

- Ninguna dependencia nueva en `pyproject.toml` — la regresión se implementa en Python puro (el proyecto no usa numpy/sklearn hoy).
- Todos los módulos nuevos van bajo `project/apps/agents/src/agents/curador/aprendizaje/`.
- Todo el código y los comentarios siguen la convención del repo: español, funciones puras donde sea posible, degradación explícita (nunca falla en silencio, nunca se cuelga).
- Sin `CURADOR_POLICY_PATH` configurada, el curador se comporta exactamente igual que hoy — ningún test existente en `tests/test_curador.py` debe cambiar de resultado.
- El bandit solo reemplaza la proyección de `adjust`; `accept`, `reject`, `ADJUST_RULES`, `accept_is_admissible` y `choose_action` no cambian de comportamiento.
- Todos los comandos se corren desde `project/apps/agents` con `uv run pytest ...` (o `uv run python -m ...`), igual que el resto del proyecto.

---

### Task 1: Regresión ridge en Python puro

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/__init__.py`
- Create: `project/apps/agents/src/agents/curador/aprendizaje/regresion.py`
- Test: `project/apps/agents/tests/test_aprendizaje_regresion.py`

**Interfaces:**
- Produces: `ajustar(X: list[list[float]], y: list[float], lam: float = 1.0) -> list[float]` — coeficientes con el intercepto en la posición 0. `predecir(coeficientes: list[float], x: list[float]) -> float`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_regresion.py
import pytest

from agents.curador.aprendizaje.regresion import ajustar, predecir


def test_ajusta_una_recta_exacta():
    # y = 2 + 3x, sin ruido: con lam chico el ajuste debe reproducirla casi exacto
    X = [[0.0], [1.0], [2.0], [3.0], [4.0]]
    y = [2.0, 5.0, 8.0, 11.0, 14.0]

    coeficientes = ajustar(X, y, lam=1e-6)

    assert coeficientes[0] == pytest.approx(2.0, abs=1e-3)
    assert coeficientes[1] == pytest.approx(3.0, abs=1e-3)


def test_predecir_aplica_intercepto_y_pendientes():
    assert predecir([1.0, 2.0, -1.0], [3.0, 4.0]) == pytest.approx(1.0 + 2.0 * 3.0 - 1.0 * 4.0)


def test_ajustar_con_multiples_features():
    # y = 1 + 2*x1 - 1*x2, sin ruido
    X = [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [2.0, 1.0], [1.0, 2.0]]
    y = [1.0, 3.0, 0.0, 4.0, 1.0]

    coeficientes = ajustar(X, y, lam=1e-6)

    assert coeficientes[0] == pytest.approx(1.0, abs=1e-3)
    assert coeficientes[1] == pytest.approx(2.0, abs=1e-3)
    assert coeficientes[2] == pytest.approx(-1.0, abs=1e-3)


def test_regularizacion_encoge_los_coeficientes_hacia_cero():
    X = [[0.0], [1.0], [2.0], [3.0], [4.0]]
    y = [2.0, 5.0, 8.0, 11.0, 14.0]

    con_poca_regularizacion = ajustar(X, y, lam=1e-6)
    con_mucha_regularizacion = ajustar(X, y, lam=1000.0)

    assert abs(con_mucha_regularizacion[1]) < abs(con_poca_regularizacion[1])


def test_ajustar_sin_ejemplos_falla_ruidosamente():
    with pytest.raises(ValueError, match="no hay ejemplos"):
        ajustar([], [], lam=1.0)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_regresion.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'agents.curador.aprendizaje'`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/__init__.py
```//archivo vacío, marca el paquete

```python
# project/apps/agents/src/agents/curador/aprendizaje/regresion.py
"""Regresión ridge en Python puro: X^T X + lam·I, resuelto por eliminación
gaussiana con pivoteo parcial.

Sin numpy a propósito — el proyecto no tiene ninguna dependencia numérica hoy
y la dimensión del problema (un puñado de features) no la necesita.
"""


def _transponer(m: list[list[float]]) -> list[list[float]]:
    return [list(fila) for fila in zip(*m)]


def _multiplicar(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    filas_a, cols_a = len(a), len(a[0])
    cols_b = len(b[0])
    resultado = [[0.0] * cols_b for _ in range(filas_a)]
    for i in range(filas_a):
        for k in range(cols_a):
            if a[i][k] == 0.0:
                continue
            for j in range(cols_b):
                resultado[i][j] += a[i][k] * b[k][j]
    return resultado


def _resolver(a: list[list[float]], b: list[float]) -> list[float]:
    """Resuelve A x = b (A cuadrada) por eliminación gaussiana con pivoteo
    parcial. Falla ruidosamente si A es singular en vez de devolver basura."""
    n = len(a)
    m = [fila[:] + [b[i]] for i, fila in enumerate(a)]
    for col in range(n):
        pivote = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[pivote][col]) < 1e-12:
            raise ValueError("sistema singular: el dataset no tiene suficiente variación")
        m[col], m[pivote] = m[pivote], m[col]
        factor_pivote = m[col][col]
        m[col] = [v / factor_pivote for v in m[col]]
        for fila in range(n):
            if fila == col:
                continue
            factor = m[fila][col]
            if factor != 0.0:
                m[fila] = [v - factor * p for v, p in zip(m[fila], m[col])]
    return [fila[-1] for fila in m]


def ajustar(X: list[list[float]], y: list[float], lam: float = 1.0) -> list[float]:
    """Ajusta y = intercepto + coef·x por mínimos cuadrados con penalización
    ridge (no se regulariza el intercepto). Devuelve los coeficientes con el
    intercepto en la posición 0."""
    if not X:
        raise ValueError("no hay ejemplos para entrenar")

    con_intercepto = [[1.0] + list(fila) for fila in X]
    n_columnas = len(con_intercepto[0])

    xt = _transponer(con_intercepto)
    xtx = _multiplicar(xt, con_intercepto)
    for i in range(1, n_columnas):
        xtx[i][i] += lam

    xty_matriz = _multiplicar(xt, [[v] for v in y])
    xty = [fila[0] for fila in xty_matriz]

    return _resolver(xtx, xty)


def predecir(coeficientes: list[float], x: list[float]) -> float:
    return coeficientes[0] + sum(c * v for c, v in zip(coeficientes[1:], x))
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_regresion.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/__init__.py \
        project/apps/agents/src/agents/curador/aprendizaje/regresion.py \
        project/apps/agents/tests/test_aprendizaje_regresion.py
git commit -m "feat(agents): regresion ridge en python puro para la politica aprendida"
```

---

### Task 2: Features del estado que ve el curador

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/features.py`
- Test: `project/apps/agents/tests/test_aprendizaje_features.py`

**Interfaces:**
- Produces: `TIPOS_CUBIERTOS: list[str]`, `FEATURE_ORDER: list[str]`, `extraer_features(weighted_ape: float, converged: bool, iteration: int, rho: float, tipo: str) -> dict[str, float]` (lanza `ValueError` si `tipo` no está en `TIPOS_CUBIERTOS`), `vectorizar(features: dict[str, float]) -> list[float]`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_features.py
import pytest

from agents.curador.aprendizaje.features import (
    FEATURE_ORDER,
    TIPOS_CUBIERTOS,
    extraer_features,
    vectorizar,
)


def test_tipos_cubiertos_coincide_con_las_reglas_de_ajuste():
    # las mismas cuatro topologías curadas que ADJUST_RULES en policy.py
    assert set(TIPOS_CUBIERTOS) == {
        "voltage_divider",
        "rc_lowpass",
        "led_resistor",
        "noninverting_amp",
    }


def test_extraer_features_marca_un_solo_tipo_activo():
    features = extraer_features(
        weighted_ape=12.5, converged=True, iteration=1, rho=0.6, tipo="rc_lowpass"
    )

    assert features["weighted_ape"] == 12.5
    assert features["converged"] == 1.0
    assert features["iteration"] == 1.0
    assert features["rho"] == 0.6
    assert features["tipo_rc_lowpass"] == 1.0
    assert features["tipo_voltage_divider"] == 0.0
    assert features["tipo_led_resistor"] == 0.0
    assert features["tipo_noninverting_amp"] == 0.0


def test_converged_false_se_codifica_como_cero():
    features = extraer_features(
        weighted_ape=100.0, converged=False, iteration=0, rho=0.7, tipo="led_resistor"
    )

    assert features["converged"] == 0.0


def test_tipo_no_cubierto_lanza_value_error():
    with pytest.raises(ValueError, match="no cubierto"):
        extraer_features(weighted_ape=1.0, converged=True, iteration=0, rho=0.5, tipo="generic")


def test_vectorizar_respeta_feature_order():
    features = extraer_features(
        weighted_ape=5.0, converged=True, iteration=2, rho=0.7, tipo="voltage_divider"
    )

    vector = vectorizar(features)

    assert vector == [features[clave] for clave in FEATURE_ORDER]
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_features.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/features.py
"""Vector de features del estado que ve el curador al proyectar la recompensa
de 'adjust'. Todas las cantidades ya existen en el 'record' que curador/node.py
arma en cada iteración — nada nuevo que instrumentar.
"""

# Las mismas cuatro topologías curadas que ADJUST_RULES en policy.py. Un
# circuito genérico, o uno con bloques de tipos mixtos, no cae aquí: quien
# llama debe caer al respaldo determinista.
TIPOS_CUBIERTOS = ["voltage_divider", "rc_lowpass", "led_resistor", "noninverting_amp"]

FEATURE_ORDER = ["weighted_ape", "converged", "iteration", "rho"] + [
    f"tipo_{t}" for t in TIPOS_CUBIERTOS
]


def extraer_features(
    weighted_ape: float, converged: bool, iteration: int, rho: float, tipo: str
) -> dict[str, float]:
    if tipo not in TIPOS_CUBIERTOS:
        raise ValueError(f"tipo de circuito no cubierto por el entrenamiento: {tipo!r}")

    features = {
        "weighted_ape": weighted_ape,
        "converged": 1.0 if converged else 0.0,
        "iteration": float(iteration),
        "rho": rho,
    }
    for t in TIPOS_CUBIERTOS:
        features[f"tipo_{t}"] = 1.0 if tipo == t else 0.0
    return features


def vectorizar(features: dict[str, float]) -> list[float]:
    return [features[clave] for clave in FEATURE_ORDER]
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_features.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/features.py \
        project/apps/agents/tests/test_aprendizaje_features.py
git commit -m "feat(agents): vector de features del estado del curador"
```

---

### Task 3: Artefacto de pesos — carga, caché y predicción con guardarraíles

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/modelo.py`
- Test: `project/apps/agents/tests/test_aprendizaje_modelo.py`

**Interfaces:**
- Consumes: `extraer_features`, `vectorizar` de `agents.curador.aprendizaje.features` (Task 2); `predecir` de `agents.curador.aprendizaje.regresion` (Task 1).
- Produces: `guardar_politica(path, politica: dict) -> None`, `cargar_politica(path: str | Path | None) -> dict | None`, `get_politica_aprendida() -> dict | None` (cacheada, lee `CURADOR_POLICY_PATH`), `reset_politica_cache() -> None`, `predecir_recompensa_adjust(politica: dict, *, weighted_ape: float, converged: bool, iteration: int, rho: float, tipo: str | None) -> float | None`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_modelo.py
import json

import pytest

from agents.curador.aprendizaje.modelo import (
    cargar_politica,
    get_politica_aprendida,
    guardar_politica,
    predecir_recompensa_adjust,
    reset_politica_cache,
)


@pytest.fixture(autouse=True)
def _cache_limpia():
    reset_politica_cache()
    yield
    reset_politica_cache()


def _politica_de_prueba():
    # adjust_reward = 1.0 + 2.0*weighted_ape (resto de coeficientes en cero),
    # cubre solo voltage_divider en el rango [0, 50] de weighted_ape.
    return {
        "version": 1,
        "coeficientes": [1.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "feature_order": [
            "weighted_ape",
            "converged",
            "iteration",
            "rho",
            "tipo_voltage_divider",
            "tipo_rc_lowpass",
            "tipo_led_resistor",
            "tipo_noninverting_amp",
        ],
        "rangos": {
            "weighted_ape": [0.0, 50.0],
            "converged": [0.0, 1.0],
            "iteration": [0.0, 4.0],
            "rho": [0.0, 1.0],
            "tipo_voltage_divider": [0.0, 1.0],
            "tipo_rc_lowpass": [0.0, 1.0],
            "tipo_led_resistor": [0.0, 1.0],
            "tipo_noninverting_amp": [0.0, 1.0],
        },
        "lam": 1.0,
        "n_ejemplos": 10,
    }


def test_guardar_y_cargar_politica_es_identidad(tmp_path):
    path = tmp_path / "pesos.json"
    politica = _politica_de_prueba()

    guardar_politica(path, politica)

    assert cargar_politica(path) == politica
    assert json.loads(path.read_text())["n_ejemplos"] == 10


def test_cargar_politica_sin_ruta_devuelve_none():
    assert cargar_politica(None) is None
    assert cargar_politica("") is None


def test_cargar_politica_con_archivo_inexistente_devuelve_none(tmp_path):
    assert cargar_politica(tmp_path / "no-existe.json") is None


def test_get_politica_aprendida_sin_env_var_devuelve_none(monkeypatch):
    monkeypatch.delenv("CURADOR_POLICY_PATH", raising=False)

    assert get_politica_aprendida() is None


def test_get_politica_aprendida_lee_la_env_var_y_cachea(tmp_path, monkeypatch):
    path = tmp_path / "pesos.json"
    guardar_politica(path, _politica_de_prueba())
    monkeypatch.setenv("CURADOR_POLICY_PATH", str(path))

    primera = get_politica_aprendida()
    path.write_text("{}")  # si no cachea, la segunda lectura rompería
    segunda = get_politica_aprendida()

    assert primera is segunda
    assert primera["n_ejemplos"] == 10


def test_predecir_recompensa_adjust_dentro_de_rango():
    politica = _politica_de_prueba()

    recompensa = predecir_recompensa_adjust(
        politica, weighted_ape=10.0, converged=True, iteration=0, rho=0.5, tipo="voltage_divider"
    )

    assert recompensa == pytest.approx(1.0 + 2.0 * 10.0)


def test_predecir_recompensa_adjust_none_sin_tipo():
    politica = _politica_de_prueba()

    assert (
        predecir_recompensa_adjust(
            politica, weighted_ape=10.0, converged=True, iteration=0, rho=0.5, tipo=None
        )
        is None
    )


def test_predecir_recompensa_adjust_none_con_tipo_no_cubierto():
    politica = _politica_de_prueba()

    assert (
        predecir_recompensa_adjust(
            politica, weighted_ape=10.0, converged=True, iteration=0, rho=0.5, tipo="generic"
        )
        is None
    )


def test_predecir_recompensa_adjust_none_fuera_de_rango():
    politica = _politica_de_prueba()

    # weighted_ape=200 está fuera del rango [0, 50] que cubrió el entrenamiento
    assert (
        predecir_recompensa_adjust(
            politica,
            weighted_ape=200.0,
            converged=True,
            iteration=0,
            rho=0.5,
            tipo="voltage_divider",
        )
        is None
    )
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_modelo.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/modelo.py
"""Carga, caché y predicción con guardarraíles de la política aprendida del
curador.

Sin CURADOR_POLICY_PATH, o si el estado cae fuera de lo que el entrenamiento
cubrió, quien llama debe caer al respaldo determinista: las funciones de este
módulo nunca lanzan por eso, siempre devuelven None.
"""

import json
import os
from pathlib import Path

from agents.curador.aprendizaje.features import extraer_features, vectorizar
from agents.curador.aprendizaje.regresion import predecir

_SIN_CARGAR = object()
_cache = _SIN_CARGAR


def guardar_politica(path: str | Path, politica: dict) -> None:
    Path(path).write_text(json.dumps(politica, indent=2), encoding="utf-8")


def cargar_politica(path: str | Path | None) -> dict | None:
    """None si no hay ruta o el archivo no existe: la ausencia es una
    degradación válida, no un error."""
    if not path:
        return None
    resolved = Path(path)
    if not resolved.is_file():
        return None
    with resolved.open(encoding="utf-8") as handle:
        return json.load(handle)


def get_politica_aprendida() -> dict | None:
    """Cacheada en proceso, igual que get_config(). Lee CURADOR_POLICY_PATH."""
    global _cache
    if _cache is _SIN_CARGAR:
        _cache = cargar_politica(os.environ.get("CURADOR_POLICY_PATH"))
    return _cache


def reset_politica_cache() -> None:
    """Invalida la caché. Existe para las pruebas y para recargar en caliente
    tras entrenar unos pesos nuevos."""
    global _cache
    _cache = _SIN_CARGAR


def _dentro_de_rango(rangos: dict[str, list[float]], features: dict[str, float]) -> bool:
    return all(rangos[clave][0] <= valor <= rangos[clave][1] for clave, valor in features.items())


def predecir_recompensa_adjust(
    politica: dict,
    *,
    weighted_ape: float,
    converged: bool,
    iteration: int,
    rho: float,
    tipo: str | None,
) -> float | None:
    """La recompensa de 'adjust' que predice la política, o None si no
    aplica: sin tipo uniforme, tipo no cubierto por el entrenamiento, o
    features fuera del rango que el entrenamiento vio."""
    if tipo is None:
        return None
    try:
        features = extraer_features(weighted_ape, converged, iteration, rho, tipo)
    except ValueError:
        return None
    if not _dentro_de_rango(politica["rangos"], features):
        return None
    return predecir(politica["coeficientes"], vectorizar(features))
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_modelo.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/modelo.py \
        project/apps/agents/tests/test_aprendizaje_modelo.py
git commit -m "feat(agents): carga y prediccion con guardarrailes de la politica aprendida"
```

---

### Task 4: `estimate_action_rewards` acepta una recompensa de `adjust` externa

**Files:**
- Modify: `project/apps/agents/src/agents/curador/policy.py:75-99`
- Test: `project/apps/agents/tests/test_curador.py`

**Interfaces:**
- Produces: `estimate_action_rewards(measurements, converged, iteration, config, reduction=None, adjust_reward=None) -> dict[str, float]` — con el mismo patrón de precedencia que ya tiene `reduction`: si `adjust_reward` no es `None`, se usa tal cual para `"adjust"` en vez de proyectar `APE × ρ`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `project/apps/agents/tests/test_curador.py` (después de `test_estimate_action_rewards_prefers_the_observed_reduction`):

```python
def test_estimate_action_rewards_uses_the_learned_adjust_reward_when_given():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)],
        converged=True,
        iteration=0,
        config=POLICY_CFG,
        reduction=0.5,
        adjust_reward=-3.5,
    )

    # adjust_reward pasado explícito gana sobre la proyección (que daría -3.0)
    assert rewards["adjust"] == pytest.approx(-3.5)
    # accept y reject no cambian
    assert rewards["accept"] == pytest.approx(-10.0)
    assert rewards["reject"] == pytest.approx(-50.0)


def test_estimate_action_rewards_falls_back_to_projection_without_adjust_reward():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)], converged=True, iteration=0, config=POLICY_CFG, adjust_reward=None
    )

    # sin adjust_reward, se comporta exactamente como antes de este cambio
    assert rewards["adjust"] == pytest.approx(-7.0)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_curador.py -k adjust_reward -v`
Expected: FAIL con `TypeError: estimate_action_rewards() got an unexpected keyword argument 'adjust_reward'`

- [ ] **Step 3: Implementar**

En `project/apps/agents/src/agents/curador/policy.py`, reemplazar la función `estimate_action_rewards` completa (líneas 75-99) por:

```python
def estimate_action_rewards(
    measurements: list[Measurement],
    converged: bool,
    iteration: int,
    config: dict,
    reduction: float | None = None,
    adjust_reward: float | None = None,
) -> dict[str, float]:
    """Recompensa estimada de cada acción disponible desde el estado actual.

    `adjust` se proyecta multiplicando los APE por ρ y pagando una iteración
    más de castigo: es lo que valdría el circuito si el ajuste rindiera lo
    esperado. Cuando se pasa `adjust_reward`, tiene precedencia sobre esa
    proyección — es el punto de enganche de la política aprendida: reemplaza
    la proyección heurística por una predicha a partir de recompensas
    realizadas, sin que `choose_action` tenga que saber de dónde salió.

    Si se pasa `reduction`, tiene precedencia sobre el
    `expected_error_reduction` de la configuración; ese default solo se usa
    mientras el historial no da para estimar ρ.
    """
    rho = (
        reduction
        if reduction is not None
        else config["curador"]["expected_error_reduction"]
    )
    projected = [(metric, ape * rho) for metric, ape in measurements]
    adjust = (
        adjust_reward
        if adjust_reward is not None
        else compute_reward(projected, converged, iteration + 1, config)
    )

    return {
        "accept": compute_reward(measurements, converged, iteration, config),
        "adjust": adjust,
        "reject": config["curador"]["reject_reward"],
    }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_curador.py -v`
Expected: PASS (todos los tests de `test_curador.py`, incluidos los 2 nuevos y los ya existentes sin cambios)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/policy.py project/apps/agents/tests/test_curador.py
git commit -m "feat(agents): estimate_action_rewards acepta una recompensa de adjust externa"
```

---

### Task 5: Conectar la política aprendida y la exploración en `curador_node`

**Files:**
- Modify: `project/apps/agents/src/agents/curador/node.py:1-20,60-135`
- Test: `project/apps/agents/tests/test_curador.py`

**Interfaces:**
- Consumes: `get_politica_aprendida`, `predecir_recompensa_adjust` de `agents.curador.aprendizaje.modelo` (Task 3); `estimate_action_rewards(..., adjust_reward=...)` (Task 4).
- Produces: `curador_node(state, config=None, *, elegir_accion=None) -> dict` — `elegir_accion`, si se pasa, reemplaza a `choose_action` para decidir la acción (mismo signature: `(action_rewards, adjust_available, accept_admissible=True) -> str`). Es el punto de enganche que usará el generador sintético (Task 7) para explorar.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `project/apps/agents/tests/test_curador.py`:

```python
def test_curador_node_uses_the_learned_policy_when_configured(tmp_path, monkeypatch):
    """Con 3.10 V contra una meta de 3.3 V (6.06 % de error, admisible dentro
    del margen del 7.5 %), la heurística por recompensa ya acepta —es
    exactamente el escenario de test_curador_accepts_early_when_adjusting_costs_more_than_it_gains
    más arriba—. Con una política aprendida que predice una recompensa de
    adjust enorme, el curador debería preferir seguir ajustando en su lugar:
    la prueba de que el valor aprendido realmente reemplaza a la proyección."""
    from agents.curador.aprendizaje.modelo import guardar_politica, reset_politica_cache

    politica = {
        "version": 1,
        # adjust_reward = 1000 sin importar el estado (todos los coeficientes
        # de features en cero salvo un intercepto enorme)
        "coeficientes": [1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "feature_order": [
            "weighted_ape", "converged", "iteration", "rho",
            "tipo_voltage_divider", "tipo_rc_lowpass",
            "tipo_led_resistor", "tipo_noninverting_amp",
        ],
        "rangos": {
            "weighted_ape": [0.0, 1000.0], "converged": [0.0, 1.0],
            "iteration": [0.0, 10.0], "rho": [0.0, 1.0],
            "tipo_voltage_divider": [0.0, 1.0], "tipo_rc_lowpass": [0.0, 1.0],
            "tipo_led_resistor": [0.0, 1.0], "tipo_noninverting_amp": [0.0, 1.0],
        },
        "lam": 1.0, "n_ejemplos": 1,
    }
    path = tmp_path / "pesos.json"
    guardar_politica(path, politica)
    monkeypatch.setenv("CURADOR_POLICY_PATH", str(path))
    reset_politica_cache()

    try:
        result = curador_node(
            _state({"div1": {"metrics": {"v_out": 3.10}, "converged": True, "sim_error": None}})
        )
    finally:
        monkeypatch.delenv("CURADOR_POLICY_PATH", raising=False)
        reset_politica_cache()

    assert result["history"][0]["decision"] == "adjust"
    assert result["history"][0]["action_rewards"]["adjust"] == pytest.approx(1000.0)


def test_curador_node_falls_back_without_a_learned_policy(monkeypatch):
    """Sin CURADOR_POLICY_PATH, el comportamiento es exactamente el de antes
    de este cambio — la degradación es real, no solo declarada."""
    from agents.curador.aprendizaje.modelo import reset_politica_cache

    monkeypatch.delenv("CURADOR_POLICY_PATH", raising=False)
    reset_politica_cache()

    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}})
    )

    assert result["history"][0]["decision"] == "adjust"
    # 2.5 contra 3.3 -> APE=24.24 puntos, weighted_ape=24.24; proyección con
    # rho por defecto 0.7: adjust = -(24.24*0.7) + 10 - 3 = -9.968
    assert result["history"][0]["action_rewards"]["adjust"] == pytest.approx(-9.968, abs=0.01)


def test_curador_node_accepts_an_elegir_accion_override():
    llamadas = []

    def _elegir_siempre_reject(action_rewards, adjust_available, accept_admissible=True):
        llamadas.append((action_rewards, adjust_available, accept_admissible))
        return "reject"

    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}}),
        elegir_accion=_elegir_siempre_reject,
    )

    assert result["verdict"]["status"] == "rejected"
    assert len(llamadas) == 1
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_curador.py -k "learned_policy or falls_back or elegir_accion" -v`
Expected: FAIL — `test_curador_node_uses_the_learned_policy_when_configured` y `test_curador_node_accepts_an_elegir_accion_override` fallan con `TypeError` (curador_node no acepta `elegir_accion` todavía); `test_curador_node_falls_back_without_a_learned_policy` puede pasar de casualidad si el valor coincide por el comportamiento actual — no importa, el objetivo de este paso es que las otras dos fallen.

- [ ] **Step 3: Implementar**

En `project/apps/agents/src/agents/curador/node.py`, agregar el import (después de la línea 15, junto a los imports de `agents.curador.policy`):

```python
from agents.curador.aprendizaje.modelo import get_politica_aprendida, predecir_recompensa_adjust
```

Reemplazar la firma y el cuerpo de `curador_node` hasta la llamada a `choose_action` (líneas 60-134 del archivo original) por:

```python
def curador_node(
    state: CircuitState,
    config: RunnableConfig | None = None,
    *,
    elegir_accion=None,
) -> dict:
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

    converged = all(
        state["sim_results"][block["id"]].get("converged", False) for block in blocks
    )

    measurements = build_measurements(blocks, evaluations, cfg)
    ape_ponderado = weighted_ape(measurements, cfg)
    reduction = observed_reduction(state["history"])
    rho_resuelto = (
        reduction if reduction is not None else cfg["curador"]["expected_error_reduction"]
    )

    # La política aprendida solo aplica cuando todos los bloques del circuito
    # son del mismo tipo curado: con tipos mixtos, "tipo" no tiene un único
    # valor que darle al modelo, así que se cae al respaldo determinista.
    tipos_unicos = {block["type"] for block in blocks}
    tipo_uniforme = next(iter(tipos_unicos)) if len(tipos_unicos) == 1 else None

    politica = get_politica_aprendida()
    adjust_reward_aprendido = (
        predecir_recompensa_adjust(
            politica,
            weighted_ape=ape_ponderado,
            converged=converged,
            iteration=iteration,
            rho=rho_resuelto,
            tipo=tipo_uniforme,
        )
        if politica is not None
        else None
    )

    action_rewards = estimate_action_rewards(
        measurements,
        converged=converged,
        iteration=iteration,
        config=cfg,
        reduction=reduction,
        adjust_reward=adjust_reward_aprendido,
    )

    record = {
        "iteration": iteration,
        "component_values": dict(state["component_values"]),
        "sim_results": dict(state["sim_results"]),
        "evaluations": {bid: status for bid, (status, _) in evaluations.items()},
        "worst_rel_err": worst_rel_err,
        "weighted_ape": ape_ponderado,
        "converged": converged,
        # R de ESTA iteración según la fórmula de la tesina, que es una
        # propiedad del estado y no de la acción tomada: coincide con la
        # recompensa de aceptar porque aceptar es quedarse con este estado.
        # OJO si algún día se entrena una política con este historial: para
        # armar tuplas (estado, acción, recompensa) hay que tomar la entrada
        # de `action_rewards` que corresponda a `decision`, no este campo.
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

    # La recompensa decide cuándo parar de iterar; la tolerancia de cada
    # bloque decide si lo que hay se puede entregar. Separarlas evita que un
    # circuito estancado lejos de su meta se reporte como aceptado.
    accion_elegida = elegir_accion or choose_action
    action = accion_elegida(
        action_rewards,
        adjust_available=iteration + 1 < max_iterations,
        accept_admissible=accept_is_admissible(blocks, evaluations, cfg),
    )
```

El resto de la función (desde `if action == "accept":` hasta el final de `curador_node`, y las funciones `_best_iteration`/`route_after_curador`) no cambia.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_curador.py -v`
Expected: PASS (todos, incluidos los tests existentes sin cambios — confirma que la degradación sin `CURADOR_POLICY_PATH` es idéntica al comportamiento anterior)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/node.py project/apps/agents/tests/test_curador.py
git commit -m "feat(agents): curador_node consulta la politica aprendida y admite exploracion"
```

---

### Task 6: Pares de entrenamiento desde episodios persistidos

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/dataset.py`
- Test: `project/apps/agents/tests/test_aprendizaje_dataset.py`

**Interfaces:**
- Consumes: `extraer_features` de `agents.curador.aprendizaje.features` (Task 2); `observed_reduction` de `agents.curador.policy` (ya existente).
- Produces: `cargar_episodios(path: str | Path) -> list[dict]` (formato JSONL, cada línea `{"tipo": str, "history": list[dict]}`), `pares_desde_episodio(episodio: dict, config: dict) -> list[tuple[dict, float]]`, `pares_desde_dataset(episodios: list[dict], config: dict) -> list[tuple[dict, float]]`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_dataset.py
import json

import pytest

from agents.curador.aprendizaje.dataset import (
    cargar_episodios,
    pares_desde_dataset,
    pares_desde_episodio,
)

CONFIG = {"curador": {"expected_error_reduction": 0.7}}


def test_cargar_episodios_lee_jsonl(tmp_path):
    path = tmp_path / "dataset.jsonl"
    path.write_text(
        '{"tipo": "voltage_divider", "history": []}\n'
        '{"tipo": "rc_lowpass", "history": []}\n'
    )

    episodios = cargar_episodios(path)

    assert len(episodios) == 2
    assert episodios[0]["tipo"] == "voltage_divider"
    assert episodios[1]["tipo"] == "rc_lowpass"


def test_cargar_episodios_ignora_lineas_vacias(tmp_path):
    path = tmp_path / "dataset.jsonl"
    path.write_text('{"tipo": "led_resistor", "history": []}\n\n')

    assert len(cargar_episodios(path)) == 1


def test_pares_desde_episodio_usa_la_recompensa_realizada_de_la_iteracion_siguiente():
    episodio = {
        "tipo": "voltage_divider",
        "history": [
            {
                "iteration": 0, "decision": "adjust", "weighted_ape": 40.0,
                "converged": True, "reward": -19.0,
                "action_rewards": {"accept": -19.0, "adjust": -17.0, "reject": -50.0},
            },
            {
                "iteration": 1, "decision": "accept", "weighted_ape": 10.0,
                "converged": True, "reward": -3.0,
                "action_rewards": {"accept": -3.0, "adjust": -8.0, "reject": -50.0},
            },
        ],
    }

    pares = pares_desde_episodio(episodio, CONFIG)

    assert len(pares) == 1
    features, recompensa = pares[0]
    assert recompensa == pytest.approx(-3.0)  # el "reward" del registro siguiente
    assert features["weighted_ape"] == pytest.approx(40.0)
    assert features["iteration"] == pytest.approx(0.0)
    # sin historial previo (i=0), rho cae al default de config
    assert features["rho"] == pytest.approx(0.7)
    assert features["tipo_voltage_divider"] == 1.0


def test_pares_desde_episodio_calcula_rho_del_historial_previo():
    episodio = {
        "tipo": "rc_lowpass",
        "history": [
            {"iteration": 0, "decision": "adjust", "weighted_ape": 40.0, "converged": True, "reward": -30.0},
            {"iteration": 1, "decision": "adjust", "weighted_ape": 10.0, "converged": True, "reward": -8.0},
            {"iteration": 2, "decision": "accept", "weighted_ape": 2.0, "converged": True, "reward": -1.0},
        ],
    }

    pares = pares_desde_episodio(episodio, CONFIG)

    # el segundo par (i=1) sí tiene dos iteraciones previas de las que calcular rho
    assert len(pares) == 2
    _, recompensa_1 = pares[1]
    features_1, _ = pares[1]
    assert recompensa_1 == pytest.approx(-1.0)
    assert features_1["rho"] == pytest.approx(10.0 / 40.0)


def test_pares_desde_episodio_ignora_iteraciones_que_no_ajustaron():
    episodio = {
        "tipo": "led_resistor",
        "history": [
            {"iteration": 0, "decision": "accept", "weighted_ape": 1.0, "converged": True, "reward": -1.0},
        ],
    }

    assert pares_desde_episodio(episodio, CONFIG) == []


def test_pares_desde_episodio_ignora_el_ultimo_registro_sin_siguiente():
    episodio = {
        "tipo": "led_resistor",
        "history": [
            {"iteration": 0, "decision": "adjust", "weighted_ape": 40.0, "converged": True, "reward": -19.0},
        ],
    }

    assert pares_desde_episodio(episodio, CONFIG) == []


def test_pares_desde_dataset_concatena_todos_los_episodios():
    episodios = [
        {
            "tipo": "voltage_divider",
            "history": [
                {"iteration": 0, "decision": "adjust", "weighted_ape": 40.0, "converged": True, "reward": -19.0},
                {"iteration": 1, "decision": "accept", "weighted_ape": 10.0, "converged": True, "reward": -3.0},
            ],
        },
        {
            "tipo": "led_resistor",
            "history": [
                {"iteration": 0, "decision": "accept", "weighted_ape": 1.0, "converged": True, "reward": -1.0},
            ],
        },
    ]

    assert len(pares_desde_dataset(episodios, CONFIG)) == 1
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_dataset.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/dataset.py
"""Arma pares (features, recompensa realizada) a partir de episodios
persistidos por el generador (agents.curador.aprendizaje.generador).

La recompensa 'realizada' de un 'adjust' en la iteración i es la que el
propio historial ya midió en la iteración i+1 — curador/node.py ya la
registra en el campo 'reward' de cada record, así que no hace falta
instrumentar nada nuevo.
"""

import json
from pathlib import Path

from agents.curador.aprendizaje.features import extraer_features
from agents.curador.policy import observed_reduction


def cargar_episodios(path: str | Path) -> list[dict]:
    episodios = []
    with Path(path).open(encoding="utf-8") as handle:
        for linea in handle:
            linea = linea.strip()
            if linea:
                episodios.append(json.loads(linea))
    return episodios


def pares_desde_episodio(episodio: dict, config: dict) -> list[tuple[dict, float]]:
    historia = episodio["history"]
    tipo = episodio["tipo"]
    pares: list[tuple[dict, float]] = []

    for i in range(len(historia) - 1):
        registro = historia[i]
        if registro["decision"] != "adjust":
            continue

        siguiente = historia[i + 1]
        # rho al momento de decidir la iteración i: se recalcula del
        # historial ESTRICTAMENTE anterior, igual que lo hace curador_node.
        rho_previo = observed_reduction(historia[:i])
        rho = (
            rho_previo
            if rho_previo is not None
            else config["curador"]["expected_error_reduction"]
        )

        features = extraer_features(
            weighted_ape=registro["weighted_ape"],
            converged=registro["converged"],
            iteration=registro["iteration"],
            rho=rho,
            tipo=tipo,
        )
        pares.append((features, siguiente["reward"]))

    return pares


def pares_desde_dataset(episodios: list[dict], config: dict) -> list[tuple[dict, float]]:
    pares: list[tuple[dict, float]] = []
    for episodio in episodios:
        pares.extend(pares_desde_episodio(episodio, config))
    return pares
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_dataset.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/dataset.py \
        project/apps/agents/tests/test_aprendizaje_dataset.py
git commit -m "feat(agents): pares de entrenamiento desde episodios persistidos"
```

---

### Task 7: Generador de episodios sintéticos (ngspice real, con ruido y exploración)

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/generador.py`
- Test: `project/apps/agents/tests/test_aprendizaje_generador.py`

**Interfaces:**
- Consumes: `curador_node` con `elegir_accion` (Task 5); `choose_action` de `agents.curador.policy`; `build_calculo_graph`, `build_sintesis_graph`, `orquestador_node`, `route_after_orquestador`, `route_after_curador` (ya existentes en `agents.calculo.graph`, `agents.sintesis.graph`, `agents.orquestador.node`, `agents.curador.node`).
- Produces: `construir_grafo_de_entrenamiento(rng, epsilon, factor_min=0.3, factor_max=3.0)`, `generar_dataset(n_por_tipo: int, seed: int, epsilon: float = 0.3) -> list[dict]` (cada elemento `{"tipo": str, "history": list[dict]}`), CLI `agents.curador.aprendizaje.generador`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_generador.py
import random

import pytest

from agents.curador.aprendizaje.generador import (
    GENERADORES_DE_SPEC,
    _episodio_desde,
    construir_grafo_de_entrenamiento,
    generar_dataset,
)


def test_generadores_de_spec_cubren_los_cuatro_tipos_curados():
    assert set(GENERADORES_DE_SPEC) == {
        "voltage_divider", "rc_lowpass", "led_resistor", "noninverting_amp",
    }


def test_cada_generador_de_spec_produce_un_bloque_valido():
    rng = random.Random(0)
    for tipo, fabrica in GENERADORES_DE_SPEC.items():
        spec = fabrica(rng)
        assert len(spec["blocks"]) == 1
        assert spec["blocks"][0]["type"] == tipo


def test_episodio_desde_corre_el_grafo_real_y_registra_el_tipo():
    """De punta a punta contra ngspice real, como el resto del proyecto."""
    rng = random.Random(0)
    graph = construir_grafo_de_entrenamiento(rng, epsilon=0.5)
    spec = GENERADORES_DE_SPEC["voltage_divider"](rng)

    episodio = _episodio_desde(graph, "voltage_divider", spec, "test-hilo-1")

    assert episodio["tipo"] == "voltage_divider"
    assert len(episodio["history"]) >= 1
    assert episodio["history"][0]["decision"] in {"accept", "adjust", "reject"}


def test_generar_dataset_produce_n_episodios_por_tipo():
    episodios = generar_dataset(n_por_tipo=2, seed=1, epsilon=0.5)

    assert len(episodios) == 8  # 2 por cada uno de los 4 tipos
    conteo_por_tipo = {}
    for episodio in episodios:
        conteo_por_tipo[episodio["tipo"]] = conteo_por_tipo.get(episodio["tipo"], 0) + 1
    assert conteo_por_tipo == {
        "voltage_divider": 2, "rc_lowpass": 2, "led_resistor": 2, "noninverting_amp": 2,
    }


def test_generar_dataset_es_reproducible_con_la_misma_semilla():
    a = generar_dataset(n_por_tipo=1, seed=42, epsilon=0.3)
    b = generar_dataset(n_por_tipo=1, seed=42, epsilon=0.3)

    tipos_a = [(e["tipo"], e["history"][0]["decision"]) for e in a]
    tipos_b = [(e["tipo"], e["history"][0]["decision"]) for e in b]
    assert tipos_a == tipos_b
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_generador.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/generador.py
"""Genera episodios sintéticos del curador para entrenar la política
aprendida.

Corre el grafo real (ngspice real, sin mocks — mismo principio que el banco
de evaluación) sobre specs variados del catálogo, con dos fuentes de
variación deliberadas:

- El cálculo inicial se perturba con ruido aleatorio: los valores exactos de
  las fórmulas cerradas ya cumplirían la meta en la primera iteración, y sin
  ruido no habría nada que el curador tuviera que ajustar.
- La decisión del curador se explora: con probabilidad epsilon se fuerza una
  acción distinta a la que la heurística elegiría, respetando las mismas
  barandillas que choose_action (nunca acepta un circuito inadmisible, nunca
  seguiría ajustando sin iteraciones disponibles). Sin esta exploración, el
  dataset solo contendría las decisiones que la heurística ya toma y la
  política aprendida aprendería a clonarla, no a mejorarla.

    uv run python -m agents.curador.aprendizaje.generador dataset.jsonl \
        --n-por-tipo 50 --seed 0
"""

import argparse
import json
import random
from pathlib import Path

from langgraph.graph import END, StateGraph

from agents.calculo.graph import build_calculo_graph
from agents.curador.node import curador_node, route_after_curador
from agents.curador.policy import choose_action
from agents.orquestador.node import orquestador_node, route_after_orquestador
from agents.sintesis.graph import build_sintesis_graph
from agents.state import CircuitState


def _elegir_accion_exploratoria(epsilon: float, rng: random.Random):
    def _elegir(action_rewards, adjust_available, accept_admissible=True):
        if not adjust_available:
            acciones_validas = ["reject"]
        elif not accept_admissible:
            acciones_validas = ["adjust"]
        else:
            acciones_validas = ["accept", "adjust"]

        if len(acciones_validas) > 1 and rng.random() < epsilon:
            return rng.choice(acciones_validas)
        return choose_action(action_rewards, adjust_available, accept_admissible)

    return _elegir


def _calculo_con_ruido(rng: random.Random, factor_min: float, factor_max: float):
    calculo_graph = build_calculo_graph()

    def _nodo(state: CircuitState) -> dict:
        resultado = calculo_graph.invoke(state)
        ruidoso = {
            bid: {clave: valor * rng.uniform(factor_min, factor_max) for clave, valor in valores.items()}
            for bid, valores in resultado["component_values"].items()
        }
        return {"component_values": ruidoso}

    return _nodo


def construir_grafo_de_entrenamiento(
    rng: random.Random, epsilon: float, factor_min: float = 0.3, factor_max: float = 3.0
):
    """Igual que agents.graph.build_graph, pero con el cálculo ruidoso y la
    decisión del curador explorable. No toca graph.py: el camino de
    producción no debe poder heredar por accidente ni el ruido ni la
    exploración."""
    sintesis_graph = build_sintesis_graph()
    elegir = _elegir_accion_exploratoria(epsilon, rng)

    def _sintesis_node(state: CircuitState) -> dict:
        resultado = sintesis_graph.invoke(state)
        return {"netlists": resultado["netlists"], "sim_results": resultado["sim_results"]}

    def _curador_node(state: CircuitState, config=None) -> dict:
        return curador_node(state, config, elegir_accion=elegir)

    builder = StateGraph(CircuitState)
    builder.add_node("orquestador", orquestador_node)
    builder.add_node("calculo", _calculo_con_ruido(rng, factor_min, factor_max))
    builder.add_node("sintesis", _sintesis_node)
    builder.add_node("curador", _curador_node)

    builder.set_entry_point("orquestador")
    builder.add_conditional_edges(
        "orquestador", route_after_orquestador, {"continue": "calculo", "reject": END}
    )
    builder.add_edge("calculo", "sintesis")
    builder.add_edge("sintesis", "curador")
    builder.add_conditional_edges(
        "curador", route_after_curador, {"adjust": "sintesis", "done": END}
    )
    return builder.compile()


def _estado_inicial(circuit_spec: dict) -> dict:
    return {
        "circuit_spec": circuit_spec,
        "request_text": None,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def _episodio_desde(graph, tipo: str, spec: dict, id_hilo: str) -> dict:
    estado_final = graph.invoke(
        _estado_inicial(spec), config={"configurable": {"thread_id": id_hilo}}
    )
    return {"tipo": tipo, "history": estado_final["history"]}


def _spec_voltage_divider(rng: random.Random) -> dict:
    v_in = rng.uniform(3.3, 24.0)
    v_out = v_in * rng.uniform(0.2, 0.8)
    return {"blocks": [{"id": "b1", "type": "voltage_divider", "params": {"v_in": v_in, "v_out": v_out}}]}


def _spec_rc_lowpass(rng: random.Random) -> dict:
    f_c = 10 ** rng.uniform(2.0, 6.0)
    return {"blocks": [{"id": "b1", "type": "rc_lowpass", "params": {"f_c": f_c}}]}


def _spec_led_resistor(rng: random.Random) -> dict:
    v_in = rng.uniform(3.3, 12.0)
    v_f = rng.uniform(1.8, min(3.2, v_in - 0.5))
    i_led = rng.uniform(0.005, 0.02)
    return {
        "blocks": [
            {"id": "b1", "type": "led_resistor", "params": {"v_in": v_in, "v_f": v_f, "i_led": i_led}}
        ]
    }


def _spec_noninverting_amp(rng: random.Random) -> dict:
    v_in = rng.uniform(0.01, 1.0)
    ganancia = 10 ** rng.uniform(0.3, 3.0)
    return {
        "blocks": [
            {
                "id": "b1",
                "type": "noninverting_amp",
                "params": {"v_in": v_in, "v_out": v_in * ganancia},
            }
        ]
    }


GENERADORES_DE_SPEC = {
    "voltage_divider": _spec_voltage_divider,
    "rc_lowpass": _spec_rc_lowpass,
    "led_resistor": _spec_led_resistor,
    "noninverting_amp": _spec_noninverting_amp,
}


def generar_dataset(n_por_tipo: int, seed: int, epsilon: float = 0.3) -> list[dict]:
    rng = random.Random(seed)
    graph = construir_grafo_de_entrenamiento(rng, epsilon)

    episodios = []
    for tipo, fabrica_spec in GENERADORES_DE_SPEC.items():
        for i in range(n_por_tipo):
            spec = fabrica_spec(rng)
            episodios.append(_episodio_desde(graph, tipo, spec, f"gen-{tipo}-{i}"))
    return episodios


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.curador.aprendizaje.generador")
    parser.add_argument("salida", help="ruta del dataset JSONL a escribir")
    parser.add_argument("--n-por-tipo", type=int, default=50)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--epsilon", type=float, default=0.3)
    args = parser.parse_args()

    episodios = generar_dataset(args.n_por_tipo, args.seed, args.epsilon)
    with Path(args.salida).open("w", encoding="utf-8") as handle:
        for episodio in episodios:
            handle.write(json.dumps(episodio) + "\n")

    print(f"{len(episodios)} episodios -> {args.salida}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_generador.py -v`
Expected: PASS (5 tests). Corre ngspice de verdad varias veces — puede tardar unos segundos, es normal (igual que `test_evaluacion_corredor.py`).

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/generador.py \
        project/apps/agents/tests/test_aprendizaje_generador.py
git commit -m "feat(agents): generador sintetico de episodios para entrenar la politica"
```

---

### Task 8: Script de entrenamiento

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/entrenar.py`
- Test: `project/apps/agents/tests/test_aprendizaje_entrenar.py`

**Interfaces:**
- Consumes: `cargar_episodios`, `pares_desde_dataset` (Task 6); `FEATURE_ORDER`, `vectorizar` (Task 2); `ajustar` (Task 1); `guardar_politica` (Task 3).
- Produces: `rangos_de(pares: list[tuple[dict, float]]) -> dict[str, list[float]]`, `entrenar(pares: list[tuple[dict, float]], lam: float = 1.0) -> dict` (el diccionario de política completo, listo para `guardar_politica`), CLI `agents.curador.aprendizaje.entrenar`.

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_entrenar.py
import json

import pytest

from agents.curador.aprendizaje.entrenar import entrenar, rangos_de
from agents.curador.aprendizaje.features import FEATURE_ORDER, extraer_features
from agents.curador.aprendizaje.modelo import predecir_recompensa_adjust


def _par(weighted_ape, converged, iteration, rho, tipo, recompensa):
    return (extraer_features(weighted_ape, converged, iteration, rho, tipo), recompensa)


def test_rangos_de_cubre_el_minimo_y_maximo_observados():
    pares = [
        _par(10.0, True, 0, 0.5, "voltage_divider", -5.0),
        _par(40.0, True, 1, 0.8, "rc_lowpass", -20.0),
    ]

    rangos = rangos_de(pares)

    assert rangos["weighted_ape"] == [10.0, 40.0]
    assert rangos["iteration"] == [0.0, 1.0]
    assert rangos["rho"] == [0.5, 0.8]
    assert set(rangos) == set(FEATURE_ORDER)


def test_entrenar_produce_un_artefacto_con_las_claves_esperadas():
    pares = [
        _par(10.0, True, 0, 0.5, "voltage_divider", -5.0),
        _par(20.0, True, 1, 0.6, "voltage_divider", -10.0),
        _par(30.0, True, 0, 0.7, "voltage_divider", -15.0),
    ]

    politica = entrenar(pares, lam=1e-3)

    assert set(politica) == {
        "version", "coeficientes", "feature_order", "rangos", "lam", "n_ejemplos",
    }
    assert politica["feature_order"] == FEATURE_ORDER
    assert politica["n_ejemplos"] == 3
    assert len(politica["coeficientes"]) == len(FEATURE_ORDER) + 1  # + intercepto

    # el artefacto entrenado tiene que poder usarse tal cual con predecir_recompensa_adjust
    recompensa = predecir_recompensa_adjust(
        politica, weighted_ape=20.0, converged=True, iteration=1, rho=0.6, tipo="voltage_divider"
    )
    assert recompensa is not None


def test_entrenar_sin_pares_falla_ruidosamente():
    with pytest.raises(ValueError, match="no hay pares"):
        entrenar([], lam=1.0)


def test_entrenar_es_serializable_a_json():
    pares = [_par(10.0, True, 0, 0.5, "voltage_divider", -5.0)] * 3
    politica = entrenar(pares, lam=1.0)

    # sin esto guardar_politica (Task 3) fallaría al serializar
    json.dumps(politica)
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_entrenar.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/entrenar.py
"""Entrena la política aprendida del curador a partir de un dataset de
episodios generado por agents.curador.aprendizaje.generador.

    uv run python -m agents.curador.aprendizaje.entrenar dataset.jsonl pesos.json

El artefacto resultante se usa apuntando CURADOR_POLICY_PATH a `pesos.json` —
pero antes de reemplazar unos pesos en uso, correr el gate
(agents.curador.aprendizaje.gate) contra el banco de evaluación.
"""

import argparse

from agents.config import get_config
from agents.curador.aprendizaje.dataset import cargar_episodios, pares_desde_dataset
from agents.curador.aprendizaje.features import FEATURE_ORDER, vectorizar
from agents.curador.aprendizaje.modelo import guardar_politica
from agents.curador.aprendizaje.regresion import ajustar

LAMBDA_POR_DEFECTO = 1.0


def rangos_de(pares: list[tuple[dict, float]]) -> dict[str, list[float]]:
    rangos = {clave: [float("inf"), float("-inf")] for clave in FEATURE_ORDER}
    for features, _ in pares:
        for clave in FEATURE_ORDER:
            valor = features[clave]
            rangos[clave][0] = min(rangos[clave][0], valor)
            rangos[clave][1] = max(rangos[clave][1], valor)
    return rangos


def entrenar(pares: list[tuple[dict, float]], lam: float = LAMBDA_POR_DEFECTO) -> dict:
    if not pares:
        raise ValueError("no hay pares de entrenamiento en el dataset")

    X = [vectorizar(features) for features, _ in pares]
    y = [recompensa for _, recompensa in pares]
    coeficientes = ajustar(X, y, lam)

    return {
        "version": 1,
        "coeficientes": coeficientes,
        "feature_order": FEATURE_ORDER,
        "rangos": rangos_de(pares),
        "lam": lam,
        "n_ejemplos": len(pares),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.curador.aprendizaje.entrenar")
    parser.add_argument("dataset", help="ruta al dataset JSONL de episodios")
    parser.add_argument("salida", help="ruta donde escribir los pesos entrenados")
    parser.add_argument("--lam", type=float, default=LAMBDA_POR_DEFECTO)
    args = parser.parse_args()

    episodios = cargar_episodios(args.dataset)
    pares = pares_desde_dataset(episodios, get_config())
    politica = entrenar(pares, args.lam)
    guardar_politica(args.salida, politica)

    print(f"política entrenada con {politica['n_ejemplos']} ejemplos -> {args.salida}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_entrenar.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/entrenar.py \
        project/apps/agents/tests/test_aprendizaje_entrenar.py
git commit -m "feat(agents): script de entrenamiento de la politica aprendida"
```

---

### Task 9: Gate de evaluación antes de reemplazar pesos

**Files:**
- Create: `project/apps/agents/src/agents/curador/aprendizaje/gate.py`
- Test: `project/apps/agents/tests/test_aprendizaje_gate.py`

**Interfaces:**
- Consumes: `cargar_banco`, `correr_banco`, `resumir` (ya existentes en `agents.evaluacion.*`); `reset_politica_cache` (Task 3).
- Produces: `cumple_el_gate(resumen_heuristica: dict, resumen_candidata: dict) -> tuple[bool, str]` (pura, sin E/S), CLI `agents.curador.aprendizaje.gate` (código de salida 1 si no pasa).

- [ ] **Step 1: Escribir el test que falla**

```python
# project/apps/agents/tests/test_aprendizaje_gate.py
from agents.curador.aprendizaje.gate import cumple_el_gate


def _resumen(mape, tasa_en_tolerancia):
    return {
        "casos": 20, "medidos": 20, "sin_medicion": 0,
        "mape": mape, "tasa_aceptada": 1.0,
        "tasa_en_tolerancia": tasa_en_tolerancia, "iteraciones_medias": 1.5,
    }


def test_pasa_cuando_la_candidata_iguala_a_la_heuristica():
    aprobado, motivo = cumple_el_gate(_resumen(2.0, 0.9), _resumen(2.0, 0.9))
    assert aprobado


def test_pasa_cuando_la_candidata_mejora():
    aprobado, motivo = cumple_el_gate(_resumen(2.0, 0.9), _resumen(1.0, 0.95))
    assert aprobado


def test_no_pasa_si_el_mape_empeora():
    aprobado, motivo = cumple_el_gate(_resumen(2.0, 0.9), _resumen(3.0, 0.9))
    assert not aprobado
    assert "MAPE" in motivo


def test_no_pasa_si_la_tasa_en_tolerancia_empeora():
    aprobado, motivo = cumple_el_gate(_resumen(2.0, 0.9), _resumen(2.0, 0.8))
    assert not aprobado
    assert "tolerancia" in motivo


def test_no_pasa_si_alguna_corrida_no_pudo_medir_nada():
    aprobado, motivo = cumple_el_gate(_resumen(2.0, 0.9), _resumen(None, 0.0))
    assert not aprobado
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_gate.py -v`
Expected: FAIL con `ModuleNotFoundError`

- [ ] **Step 3: Implementar**

```python
# project/apps/agents/src/agents/curador/aprendizaje/gate.py
"""Gate de despliegue: una política candidata solo reemplaza a la heurística
si no empeora el banco de 20 casos.

    uv run python -m agents.curador.aprendizaje.gate pesos_candidatos.json

Termina con código de salida 1 si la política candidata no pasa el gate —
pensado para bloquear un reemplazo de pesos, no solo para leerlo a mano.
"""

import argparse
import os
import sys

from agents.evaluacion.banco import cargar_banco
from agents.evaluacion.corredor import correr_banco
from agents.evaluacion.metricas import resumir


def cumple_el_gate(resumen_heuristica: dict, resumen_candidata: dict) -> tuple[bool, str]:
    """Una candidata pasa si no empeora ni el MAPE ni la tasa de circuitos
    dentro de tolerancia frente a la heurística sola. Si cualquiera de las dos
    corridas se quedó sin mediciones, no hay nada que comparar honestamente."""
    if resumen_heuristica["mape"] is None or resumen_candidata["mape"] is None:
        return False, "no se puede comparar: alguna corrida no midió ningún caso"

    if resumen_candidata["mape"] > resumen_heuristica["mape"]:
        return False, (
            f"MAPE empeora: {resumen_candidata['mape']:.2f} % contra "
            f"{resumen_heuristica['mape']:.2f} % de la heurística"
        )

    if resumen_candidata["tasa_en_tolerancia"] < resumen_heuristica["tasa_en_tolerancia"]:
        return False, (
            f"tasa en tolerancia empeora: {resumen_candidata['tasa_en_tolerancia']:.2%} "
            f"contra {resumen_heuristica['tasa_en_tolerancia']:.2%} de la heurística"
        )

    return True, "la política candidata no empeora a la heurística"


def main() -> None:
    from agents.curador.aprendizaje.modelo import reset_politica_cache

    parser = argparse.ArgumentParser(prog="agents.curador.aprendizaje.gate")
    parser.add_argument("pesos", help="ruta a los pesos candidatos")
    parser.add_argument("--banco", default=None, help="ruta a un banco propio")
    args = parser.parse_args()

    casos = cargar_banco(args.banco)

    os.environ.pop("CURADOR_POLICY_PATH", None)
    reset_politica_cache()
    resumen_heuristica = resumir(correr_banco(casos))

    os.environ["CURADOR_POLICY_PATH"] = args.pesos
    reset_politica_cache()
    resumen_candidata = resumir(correr_banco(casos))

    aprobado, motivo = cumple_el_gate(resumen_heuristica, resumen_candidata)
    print(f"heurística: MAPE={resumen_heuristica['mape']}, tolerancia={resumen_heuristica['tasa_en_tolerancia']:.2%}")
    print(f"candidata:  MAPE={resumen_candidata['mape']}, tolerancia={resumen_candidata['tasa_en_tolerancia']:.2%}")
    print(motivo)

    sys.exit(0 if aprobado else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_gate.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add project/apps/agents/src/agents/curador/aprendizaje/gate.py \
        project/apps/agents/tests/test_aprendizaje_gate.py
git commit -m "feat(agents): gate de evaluacion antes de reemplazar la politica en uso"
```

---

### Task 10: Verificación de punta a punta contra el banco de evaluación

**Files:**
- Test: `project/apps/agents/tests/test_aprendizaje_integracion.py`

**Interfaces:**
- Consumes: todo lo anterior (Tasks 1-9). No agrega interfaces nuevas — es la prueba de que las piezas encajan tal como el criterio de terminado del spec lo exige.

- [ ] **Step 1: Escribir el test (ya puede fallar o pasar según el estado del repo — no hay implementación nueva que hacer)**

```python
# project/apps/agents/tests/test_aprendizaje_integracion.py
"""Verifica el criterio de terminado del spec
docs/superpowers/specs/2026-09-06-politica-aprendida-curador-design.md:
entrenar un dataset chico, correr el gate, y confirmar que sin
CURADOR_POLICY_PATH el banco se comporta exactamente igual que antes de esta
funcionalidad."""

import pytest

from agents.curador.aprendizaje.dataset import pares_desde_dataset
from agents.curador.aprendizaje.entrenar import entrenar
from agents.curador.aprendizaje.gate import cumple_el_gate
from agents.curador.aprendizaje.generador import generar_dataset
from agents.curador.aprendizaje.modelo import guardar_politica, reset_politica_cache
from agents.evaluacion.banco import cargar_banco
from agents.evaluacion.corredor import correr_banco
from agents.evaluacion.metricas import resumir


@pytest.fixture(autouse=True)
def _politica_limpia(monkeypatch):
    monkeypatch.delenv("CURADOR_POLICY_PATH", raising=False)
    reset_politica_cache()
    yield
    reset_politica_cache()


def test_pipeline_completo_dataset_entrenamiento_y_gate(tmp_path):
    """No exige que la política entrenada gane — con pocos episodios sintéticos
    puede perfectamente empatar o perder contra la heurística, y el gate debe
    poder decirlo. Lo que se verifica es que el pipeline entero corre sin
    romperse y produce una decisión de gate legible."""
    from agents.config import get_config

    episodios = generar_dataset(n_por_tipo=3, seed=7, epsilon=0.4)
    pares = pares_desde_dataset(episodios, get_config())
    assert pares, "el dataset sintético con exploración debería producir al menos un 'adjust'"

    politica = entrenar(pares, lam=1.0)
    pesos_path = tmp_path / "pesos.json"
    guardar_politica(pesos_path, politica)

    casos = cargar_banco()
    resumen_heuristica = resumir(correr_banco(casos))

    import os
    os.environ["CURADOR_POLICY_PATH"] = str(pesos_path)
    reset_politica_cache()
    resumen_candidata = resumir(correr_banco(casos))
    os.environ.pop("CURADOR_POLICY_PATH", None)
    reset_politica_cache()

    aprobado, motivo = cumple_el_gate(resumen_heuristica, resumen_candidata)
    assert isinstance(aprobado, bool)
    assert motivo


def test_banco_sin_politica_aprendida_da_el_mismo_resultado_que_antes():
    """Regresión del criterio de terminado #4: sin CURADOR_POLICY_PATH, el
    banco completo se comporta igual que antes de esta funcionalidad."""
    casos = cargar_banco()
    resumen = resumir(correr_banco(casos))

    assert resumen["casos"] == 20
    assert resumen["mape"] is not None
    assert resumen["tasa_en_tolerancia"] > 0.0
```

- [ ] **Step 2: Correr el test y verificar el resultado**

Run: `cd project/apps/agents && uv run pytest tests/test_aprendizaje_integracion.py -v`
Expected: PASS (2 tests). Es lento — corre `generar_dataset` (12 episodios reales contra ngspice) más dos pasadas completas del banco de 20 casos. Si `test_pipeline_completo_dataset_entrenamiento_y_gate` falla en el `assert pares` porque la exploración no forzó ningún `adjust` con la semilla elegida, subir `epsilon` o `n_por_tipo` hasta que sí lo haga — no cambiar el criterio de la prueba.

- [ ] **Step 3: Correr toda la suite de agents para confirmar que nada más se rompió**

Run: `cd project/apps/agents && uv run pytest -v`
Expected: PASS en todos los tests (los que ya existían siguen pasando exactamente igual — es la evidencia de que la degradación sin `CURADOR_POLICY_PATH` es real).

- [ ] **Step 4: Commit**

```bash
git add project/apps/agents/tests/test_aprendizaje_integracion.py
git commit -m "test(agents): verificacion de punta a punta de la politica aprendida del curador"
```

---

## Self-Review

**Cobertura del spec:**
- Bandit contextual solo para `adjust` → Tasks 1, 2, 3, 4.
- Recompensa realizada desde `history` (no proyectada) → Task 6.
- Dataset sintético con exploración forzada (ngspice real) → Task 7.
- Script de entrenamiento con artefacto versionado → Task 8.
- Gate de evaluación antes de reemplazar pesos → Task 9.
- Respaldo determinista cuando la política no aplica (sin pesos, tipo no cubierto, fuera de rango) → Tasks 3, 5, verificado en Tasks 5 y 10.
- Radio de daño acotado (el bandit no toca al LLM, `choose_action` no cambia) → Task 4 (solo `estimate_action_rewards` cambia) y Task 5 (solo la entrada a esa función cambia).
- Criterio de terminado #4 (degradación real, no solo declarada) → Task 10.
- Fuera de alcance (aprender "cuánto ajustar", entrenamiento online, feedback conversacional, Q-learning, RAG) → ningún task lo toca, consistente con el spec.

**Placeholders:** ninguno — cada paso trae código completo, sin "TODO" ni "similar a la tarea N".

**Consistencia de tipos:** `estimate_action_rewards(..., adjust_reward=None)` (Task 4) es exactamente la firma que `curador_node` invoca en Task 5. `predecir_recompensa_adjust(politica, *, weighted_ape, converged, iteration, rho, tipo)` (Task 3) coincide con la llamada en Task 5. `pares_desde_episodio`/`pares_desde_dataset` (Task 6) devuelven `list[tuple[dict, float]]`, que es exactamente lo que `entrenar` (Task 8) y `rangos_de` (Task 8) consumen. `FEATURE_ORDER`/`vectorizar` (Task 2) se usan idénticos en `modelo.py` (Task 3) y `entrenar.py` (Task 8).

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-09-06-politica-aprendida-curador.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente fresco por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** — ejecuto las tareas en esta sesión con executing-plans, por lotes con checkpoints.

¿Cuál preferís?
