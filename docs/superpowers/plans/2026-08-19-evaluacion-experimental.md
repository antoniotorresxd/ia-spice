# La evaluación experimental — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir el desempeño del sistema sobre un banco de circuitos con solución de referencia —MAPE, tasa de circuitos que cumplen las metas, iteraciones medias— y contrastarlo con una línea base *best-of-N*, produciendo tablas listas para el capítulo de pruebas.

**Architecture:** Un paquete `agents.evaluacion` con cuatro piezas separadas por responsabilidad: el banco (datos), las métricas (funciones puras), el corredor (ejecuta el grafo real) y el reporte (rinde tablas). Un `__main__` los une en un comando.

**Tech Stack:** Python 3.12, LangGraph, ngspice real, PyYAML, pytest.

Diseño de referencia: [`docs/superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md`](../specs/2026-08-19-cierre-de-la-tesina-design.md) — Fase 5.
Auditoría de origen: [`docs/auditoria-tesina-vs-codigo.md`](../../auditoria-tesina-vs-codigo.md) — resuelve F1 y habilita F2.

Cumple el **objetivo específico 6** de la tesina, que hoy está sin empezar por completo.

---

## Entorno

**1. `uv` sobre la ruta UNC está roto.** Todo comando va envuelto para el WSL nativo:

```bash
wsl.exe -e bash -lc "cd '/home/antonioxd/projects/spice/project/apps/agents' && uv run pytest"
```

**2. Rama:** `feat/evaluacion-experimental`, creada desde `dev`. No worktrees.

**3. `ngspice` debe estar en el `PATH`.** El corredor lo ejecuta de verdad, 20 veces.

**4. Línea base al empezar: `140 passed, 5 skipped`.** Los 5 saltados son `live_llm`.

**5. El núcleo no necesita LLM.** El banco entra por `circuit_spec` estructurado, así que el corredor, las métricas y el reporte corren sin ningún modelo configurado. Solo la línea base *best-of-N* (Tarea 3) necesita uno, y va marcada `live_llm` como las demás pruebas que lo exigen.

## Qué se mide, y por qué así

**MAPE.** El error porcentual absoluto medio entre la métrica que ngspice mide y la meta que el caso declara. Se promedia **solo sobre los casos que llegaron a medirse**; los que no simularon se cuentan aparte en `sin_medicion`. Ocultarlos dentro del promedio con un valor imputado maquillaría el número.

**Dos tasas, no una.** Esta distinción importa y es donde la evaluación se gana la credibilidad:

- `tasa_aceptada` — la fracción con veredicto `accepted`.
- `tasa_en_tolerancia` — la fracción cuyo error medido cae dentro de la tolerancia que el caso declaró.

No son iguales, a propósito. El curador puede aceptar por recompensa un circuito ligeramente fuera de tolerancia cuando otra iteración costaría más de lo que quitaría. **La tasa honesta, la que va al capítulo de resultados como "tasa de circuitos que cumplen las metas", es `tasa_en_tolerancia`.** Reportar solo la de aceptación inflaría el resultado; reportar las dos hace visible y auditable el comportamiento del curador.

**Iteraciones medias.** Cuánto le cuesta al lazo llegar. Es la otra mitad de la comparación contra *best-of-N*: no basta acertar más, hay que decir a qué precio.

## El banco: 20 casos con solución de referencia

Cinco por topología, con dificultad creciente dentro de cada familia. Los valores de referencia están calculados a mano con las ecuaciones de diseño, y van en el archivo para que el banco sea auditable — no se usan para puntuar (la puntuación es sobre la métrica medida), sino para que cualquiera pueda comprobar que el caso está bien planteado.

Dos familias son deliberadamente incómodas, y ahí está la gracia:

- Los **LED** declaran un `v_f` que no coincide con el que el modelo de diodo del sistema exhibe (≈2.18 V a 20 mA). La ecuación ideal falla y el lazo tiene que corregir.
- Los **amplificadores** de ganancia alta sufren la ganancia finita en lazo abierto: con `Av = 1000` la ecuación ideal se desvía casi un 1 %.

Un banco donde todo converge a la primera no mediría nada.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `evaluacion/banco.yaml` | Los 20 casos con su solución de referencia. Solo datos. |
| `src/agents/evaluacion/banco.py` | Carga y valida el banco. Falla ruidosamente si un caso está mal formado. |
| `src/agents/evaluacion/metricas.py` | APE, MAPE, tasas, iteraciones. Funciones puras, sin E/S. |
| `src/agents/evaluacion/corredor.py` | Ejecuta el grafo real sobre cada caso y normaliza el resultado. |
| `src/agents/evaluacion/reporte.py` | Rinde las tablas: markdown para leer, LaTeX para pegar en la tesina. |
| `src/agents/evaluacion/__main__.py` | El comando: `uv run python -m agents.evaluacion`. |
| `src/agents/evaluacion/baseline.py` | La línea base *best-of-N*. Tarea 3, necesita LLM. |

Pruebas: `tests/test_evaluacion_banco.py`, `tests/test_evaluacion_metricas.py`, `tests/test_evaluacion_corredor.py`, `tests/test_evaluacion_reporte.py`.

---

### Task 1: El banco y las métricas

**Files:** `evaluacion/banco.yaml`, `src/agents/evaluacion/__init__.py`, `src/agents/evaluacion/banco.py`, `src/agents/evaluacion/metricas.py`, `tests/test_evaluacion_banco.py`, `tests/test_evaluacion_metricas.py`.

- [ ] **Step 1: Escribe el banco**

Crea `project/apps/agents/evaluacion/banco.yaml`. Los 20 casos, con la referencia calculada a mano:

```yaml
# Banco de circuitos de prueba con solución de referencia.
#
# `referencia.componentes` está calculado a mano con la ecuación de diseño de
# cada topología. No se usa para puntuar —eso se hace sobre la métrica que
# ngspice mide— sino para que el banco sea auditable: cualquiera puede
# verificar que el caso está bien planteado.
#
# `descripcion` es la entrada en lenguaje natural que consume la línea base
# best-of-N, para que compita sobre exactamente el mismo enunciado.

casos:
  # --- Divisores de voltaje: R2 = R1·v_out/(v_in − v_out), con R1 = 1 kΩ ---
  - id: divisor-12-5
    descripcion: "un divisor de voltaje que baje 12 V a 5 V"
    spec:
      blocks: [{id: div1, type: voltage_divider, params: {v_in: 12.0, v_out: 5.0}}]
    referencia: {metrica: v_out, objetivo: 5.0, componentes: {r1: 1000.0, r2: 714.29}}

  - id: divisor-5-3v3
    descripcion: "un divisor de voltaje de 5 V a 3.3 V"
    spec:
      blocks: [{id: div1, type: voltage_divider, params: {v_in: 5.0, v_out: 3.3}}]
    referencia: {metrica: v_out, objetivo: 3.3, componentes: {r1: 1000.0, r2: 1941.18}}

  - id: divisor-9-5
    descripcion: "un divisor de voltaje de 9 V a 5 V"
    spec:
      blocks: [{id: div1, type: voltage_divider, params: {v_in: 9.0, v_out: 5.0}}]
    referencia: {metrica: v_out, objetivo: 5.0, componentes: {r1: 1000.0, r2: 1250.0}}

  - id: divisor-24-12
    descripcion: "un divisor de voltaje que reduzca 24 V a la mitad"
    spec:
      blocks: [{id: div1, type: voltage_divider, params: {v_in: 24.0, v_out: 12.0}}]
    referencia: {metrica: v_out, objetivo: 12.0, componentes: {r1: 1000.0, r2: 1000.0}}

  - id: divisor-3v3-1v8
    descripcion: "un divisor de voltaje de 3.3 V a 1.8 V"
    spec:
      blocks: [{id: div1, type: voltage_divider, params: {v_in: 3.3, v_out: 1.8}}]
    referencia: {metrica: v_out, objetivo: 1.8, componentes: {r1: 1000.0, r2: 1200.0}}

  # --- Filtros RC pasa-bajas: C = 1/(2π·R·f_c), con R = 1 kΩ ---
  - id: rc-100hz
    descripcion: "un filtro RC pasa-bajas con frecuencia de corte de 100 Hz"
    spec:
      blocks: [{id: rc1, type: rc_lowpass, params: {f_c: 100.0}}]
    referencia: {metrica: f_c, objetivo: 100.0, componentes: {r: 1000.0, c: 1.5915e-06}}

  - id: rc-1khz
    descripcion: "un filtro RC pasa-bajas de 1 kHz de corte"
    spec:
      blocks: [{id: rc1, type: rc_lowpass, params: {f_c: 1000.0}}]
    referencia: {metrica: f_c, objetivo: 1000.0, componentes: {r: 1000.0, c: 1.5915e-07}}

  - id: rc-10khz
    descripcion: "un filtro RC pasa-bajas de 10 kHz"
    spec:
      blocks: [{id: rc1, type: rc_lowpass, params: {f_c: 10000.0}}]
    referencia: {metrica: f_c, objetivo: 10000.0, componentes: {r: 1000.0, c: 1.5915e-08}}

  - id: rc-50khz
    descripcion: "un filtro RC pasa-bajas con corte en 50 kHz"
    spec:
      blocks: [{id: rc1, type: rc_lowpass, params: {f_c: 50000.0}}]
    referencia: {metrica: f_c, objetivo: 50000.0, componentes: {r: 1000.0, c: 3.1831e-09}}

  - id: rc-1mhz
    descripcion: "un filtro RC pasa-bajas de 1 MHz"
    spec:
      blocks: [{id: rc1, type: rc_lowpass, params: {f_c: 1000000.0}}]
    referencia: {metrica: f_c, objetivo: 1000000.0, componentes: {r: 1000.0, c: 1.5915e-10}}

  # --- LED con resistencia: R = (v_in − v_f)/i_led ---
  # El v_f declarado no coincide con el del modelo de diodo (~2.18 V a 20 mA):
  # la ecuación ideal falla y el lazo tiene que corregir. Es a propósito.
  - id: led-5v-20ma
    descripcion: "un LED de 2 V a 20 mA alimentado con 5 V"
    spec:
      blocks: [{id: led1, type: led_resistor, params: {v_in: 5.0, v_f: 2.0, i_led: 0.02}}]
    referencia: {metrica: i_led, objetivo: 0.02, componentes: {r: 150.0}}

  - id: led-12v-10ma
    descripcion: "un LED de 2.1 V a 10 mA con fuente de 12 V"
    spec:
      blocks: [{id: led1, type: led_resistor, params: {v_in: 12.0, v_f: 2.1, i_led: 0.01}}]
    referencia: {metrica: i_led, objetivo: 0.01, componentes: {r: 990.0}}

  - id: led-3v3-5ma
    descripcion: "un LED de 1.8 V a 5 mA con 3.3 V"
    spec:
      blocks: [{id: led1, type: led_resistor, params: {v_in: 3.3, v_f: 1.8, i_led: 0.005}}]
    referencia: {metrica: i_led, objetivo: 0.005, componentes: {r: 300.0}}

  - id: led-9v-15ma
    descripcion: "un LED de 2 V a 15 mA alimentado con 9 V"
    spec:
      blocks: [{id: led1, type: led_resistor, params: {v_in: 9.0, v_f: 2.0, i_led: 0.015}}]
    referencia: {metrica: i_led, objetivo: 0.015, componentes: {r: 466.67}}

  - id: led-5v-3v2
    descripcion: "un LED azul de 3.2 V a 20 mA con fuente de 5 V"
    spec:
      blocks: [{id: led1, type: led_resistor, params: {v_in: 5.0, v_f: 3.2, i_led: 0.02}}]
    referencia: {metrica: i_led, objetivo: 0.02, componentes: {r: 90.0}}

  # --- Amplificadores no inversores: Rf = Rg·(Av − 1), con Rg = 1 kΩ ---
  # Las ganancias altas sufren la ganancia finita en lazo abierto del
  # macromodelo: con Av = 1000 la ecuación ideal se desvía casi un 1 %.
  - id: amp-ganancia-2
    descripcion: "un amplificador no inversor de ganancia 2 para una señal de 1 V"
    spec:
      blocks: [{id: amp1, type: noninverting_amp, params: {v_in: 1.0, v_out: 2.0}}]
    referencia: {metrica: v_out, objetivo: 2.0, componentes: {rg: 1000.0, rf: 1000.0}}

  - id: amp-ganancia-3
    descripcion: "un amplificador no inversor que lleve 1 V a 3 V"
    spec:
      blocks: [{id: amp1, type: noninverting_amp, params: {v_in: 1.0, v_out: 3.0}}]
    referencia: {metrica: v_out, objetivo: 3.0, componentes: {rg: 1000.0, rf: 2000.0}}

  - id: amp-ganancia-10
    descripcion: "un amplificador no inversor de ganancia 10 para 0.5 V de entrada"
    spec:
      blocks: [{id: amp1, type: noninverting_amp, params: {v_in: 0.5, v_out: 5.0}}]
    referencia: {metrica: v_out, objetivo: 5.0, componentes: {rg: 1000.0, rf: 9000.0}}

  - id: amp-ganancia-100
    descripcion: "un amplificador no inversor de ganancia 100 para 0.1 V"
    spec:
      blocks: [{id: amp1, type: noninverting_amp, params: {v_in: 0.1, v_out: 10.0}}]
    referencia: {metrica: v_out, objetivo: 10.0, componentes: {rg: 1000.0, rf: 99000.0}}

  - id: amp-ganancia-1000
    descripcion: "un amplificador no inversor de ganancia 1000 para una señal de 10 mV"
    spec:
      blocks: [{id: amp1, type: noninverting_amp, params: {v_in: 0.01, v_out: 10.0}}]
    referencia: {metrica: v_out, objetivo: 10.0, componentes: {rg: 1000.0, rf: 999000.0}}
```

- [ ] **Step 2: Escribe los tests que fallan**

Crea `project/apps/agents/tests/test_evaluacion_banco.py`:

```python
import pytest

from agents.evaluacion.banco import CasoInvalido, cargar_banco, validar_caso


def test_el_banco_de_la_tesina_tiene_veinte_casos_bien_formados():
    casos = cargar_banco()

    assert len(casos) == 20
    assert len({c["id"] for c in casos}) == 20, "hay ids repetidos"


def test_el_banco_cubre_las_cuatro_topologias():
    tipos = {c["spec"]["blocks"][0]["type"] for c in cargar_banco()}

    assert tipos == {"voltage_divider", "rc_lowpass", "led_resistor", "noninverting_amp"}


def test_cada_caso_declara_su_objetivo_y_su_referencia():
    for caso in cargar_banco():
        assert caso["descripcion"].strip(), f"{caso['id']} sin descripción"
        assert caso["referencia"]["objetivo"] > 0
        assert caso["referencia"]["componentes"], f"{caso['id']} sin solución de referencia"


def test_el_objetivo_declarado_coincide_con_el_parametro_del_spec():
    """La referencia y el spec tienen que contar la misma historia; si se
    separan, el banco mide una cosa y el sistema resuelve otra."""
    for caso in cargar_banco():
        params = caso["spec"]["blocks"][0]["params"]
        metrica = caso["referencia"]["metrica"]

        assert params[metrica] == pytest.approx(caso["referencia"]["objetivo"]), caso["id"]


def test_validar_caso_rechaza_uno_sin_referencia():
    with pytest.raises(CasoInvalido):
        validar_caso({"id": "x", "descripcion": "algo", "spec": {"blocks": []}})


def test_cargar_banco_acepta_una_ruta_propia(tmp_path):
    import yaml

    propio = tmp_path / "mini.yaml"
    propio.write_text(
        yaml.safe_dump(
            {
                "casos": [
                    {
                        "id": "uno",
                        "descripcion": "un divisor",
                        "spec": {
                            "blocks": [
                                {
                                    "id": "d1",
                                    "type": "voltage_divider",
                                    "params": {"v_in": 5.0, "v_out": 3.3},
                                }
                            ]
                        },
                        "referencia": {
                            "metrica": "v_out",
                            "objetivo": 3.3,
                            "componentes": {"r1": 1000.0, "r2": 1941.18},
                        },
                    }
                ]
            }
        )
    )

    assert [c["id"] for c in cargar_banco(propio)] == ["uno"]
```

Crea `project/apps/agents/tests/test_evaluacion_metricas.py`:

```python
import pytest

from agents.evaluacion.metricas import ape, mape, resumir


def test_ape_en_puntos_porcentuales():
    # 4.75 contra una meta de 5.0 es un 5 % de error
    assert ape(4.75, 5.0) == pytest.approx(5.0)


def test_ape_es_absoluto_no_importa_el_signo_del_desvio():
    assert ape(5.25, 5.0) == pytest.approx(ape(4.75, 5.0))


def test_mape_promedia():
    assert mape([2.0, 4.0, 6.0]) == pytest.approx(4.0)


def test_mape_sin_mediciones_es_none_no_cero():
    """Cero significaría 'perfecto'. Ninguna medición no es perfección."""
    assert mape([]) is None


def _resultado(**kwargs):
    base = {
        "id": "x",
        "tipo": "voltage_divider",
        "estado": "accepted",
        "medido": 5.0,
        "objetivo": 5.0,
        "ape": 0.0,
        "en_tolerancia": True,
        "iteraciones": 1,
    }
    return {**base, **kwargs}


def test_resumir_separa_la_tasa_aceptada_de_la_tasa_en_tolerancia():
    """La distinción que sostiene la honestidad del capítulo de resultados: el
    curador puede aceptar por recompensa algo ligeramente fuera de tolerancia."""
    resultados = [
        _resultado(id="a"),
        _resultado(id="b", ape=6.0, en_tolerancia=False),
        _resultado(id="c", estado="rejected", ape=40.0, en_tolerancia=False),
    ]

    resumen = resumir(resultados)

    assert resumen["casos"] == 3
    assert resumen["tasa_aceptada"] == pytest.approx(2 / 3)
    assert resumen["tasa_en_tolerancia"] == pytest.approx(1 / 3)


def test_resumir_calcula_el_mape_solo_sobre_los_medidos():
    """Un caso que no simuló no tiene error que promediar. Imputarle un valor
    maquillaría el MAPE; se cuenta aparte."""
    resultados = [
        _resultado(id="a", ape=2.0),
        _resultado(id="b", ape=4.0),
        _resultado(id="c", estado="rejected", medido=None, ape=None, en_tolerancia=False),
    ]

    resumen = resumir(resultados)

    assert resumen["mape"] == pytest.approx(3.0)
    assert resumen["medidos"] == 2
    assert resumen["sin_medicion"] == 1


def test_resumir_promedia_las_iteraciones():
    resultados = [_resultado(id="a", iteraciones=1), _resultado(id="b", iteraciones=3)]

    assert resumir(resultados)["iteraciones_medias"] == pytest.approx(2.0)


def test_resumir_de_una_lista_vacia_no_revienta():
    resumen = resumir([])

    assert resumen["casos"] == 0
    assert resumen["mape"] is None
    assert resumen["tasa_en_tolerancia"] == 0.0
```

- [ ] **Step 3: Corre y verifica que fallan**

`uv run pytest tests/test_evaluacion_banco.py tests/test_evaluacion_metricas.py -v` → FAIL, `ModuleNotFoundError: No module named 'agents.evaluacion'`.

- [ ] **Step 4: Implementa**

Crea `project/apps/agents/src/agents/evaluacion/__init__.py` vacío.

Crea `project/apps/agents/src/agents/evaluacion/banco.py`:

```python
"""Carga del banco de circuitos de prueba.

El banco es datos, no código: vive en YAML para que añadir un caso no exija
tocar Python y para que el conjunto sea auditable de un vistazo.
"""

from pathlib import Path

import yaml

# src/agents/evaluacion/banco.py -> parents[3] es apps/agents
BANCO_POR_DEFECTO = Path(__file__).resolve().parents[3] / "evaluacion" / "banco.yaml"

_CLAVES = ("id", "descripcion", "spec", "referencia")
_CLAVES_REFERENCIA = ("metrica", "objetivo", "componentes")


class CasoInvalido(ValueError):
    """Un caso mal formado. Se falla ruidosamente al cargar: un banco a medias
    produciría métricas silenciosamente incompletas."""


def validar_caso(caso: dict) -> dict:
    for clave in _CLAVES:
        if clave not in caso:
            raise CasoInvalido(f"caso sin '{clave}': {caso.get('id', caso)}")

    referencia = caso["referencia"]
    for clave in _CLAVES_REFERENCIA:
        if clave not in referencia:
            raise CasoInvalido(f"referencia de '{caso['id']}' sin '{clave}'")

    if not caso["spec"].get("blocks"):
        raise CasoInvalido(f"caso '{caso['id']}' sin bloques")

    return caso


def cargar_banco(path: str | Path | None = None) -> list[dict]:
    resolved = Path(path) if path is not None else BANCO_POR_DEFECTO
    if not resolved.is_file():
        raise FileNotFoundError(f"banco no encontrado: {resolved}")

    with resolved.open(encoding="utf-8") as handle:
        contenido = yaml.safe_load(handle) or {}

    casos = [validar_caso(caso) for caso in contenido.get("casos", [])]

    ids = [caso["id"] for caso in casos]
    if len(ids) != len(set(ids)):
        raise CasoInvalido("hay ids repetidos en el banco")

    return casos
```

Crea `project/apps/agents/src/agents/evaluacion/metricas.py`:

```python
"""Métricas de la evaluación. Funciones puras, sin E/S ni estado."""


def ape(medido: float, objetivo: float) -> float:
    """Error porcentual absoluto, en puntos porcentuales."""
    return abs(medido - objetivo) / abs(objetivo) * 100.0


def mape(apes: list[float]) -> float | None:
    """Error porcentual absoluto medio.

    Devuelve None sin mediciones, no cero: cero significaría error nulo, o sea
    perfección, que es lo contrario de no haber medido nada.
    """
    return sum(apes) / len(apes) if apes else None


def resumir(resultados: list[dict]) -> dict:
    """Agrega los resultados de una corrida completa del banco.

    Se reportan DOS tasas a propósito. `tasa_aceptada` es la fracción con
    veredicto favorable; `tasa_en_tolerancia` es la fracción que de verdad
    cumple la meta que declaró. El curador puede aceptar por recompensa un
    circuito ligeramente fuera de tolerancia, así que la segunda es la que va
    al capítulo de resultados como "tasa de circuitos que cumplen las metas".
    Publicar solo la primera inflaría el resultado.
    """
    total = len(resultados)
    if total == 0:
        return {
            "casos": 0,
            "medidos": 0,
            "sin_medicion": 0,
            "mape": None,
            "tasa_aceptada": 0.0,
            "tasa_en_tolerancia": 0.0,
            "iteraciones_medias": 0.0,
        }

    apes = [r["ape"] for r in resultados if r["ape"] is not None]

    return {
        "casos": total,
        "medidos": len(apes),
        "sin_medicion": total - len(apes),
        "mape": mape(apes),
        "tasa_aceptada": sum(r["estado"] == "accepted" for r in resultados) / total,
        "tasa_en_tolerancia": sum(r["en_tolerancia"] for r in resultados) / total,
        "iteraciones_medias": sum(r["iteraciones"] for r in resultados) / total,
    }
```

- [ ] **Step 5: Verifica**

`uv run pytest -v` → **154 passed, 5 skipped**.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/evaluacion/ project/apps/agents/src/agents/evaluacion/ project/apps/agents/tests/test_evaluacion_banco.py project/apps/agents/tests/test_evaluacion_metricas.py
git commit -m "feat(agents): banco de circuitos de prueba y metricas de evaluacion"
```

---

### Task 2: El corredor y el reporte

**Files:** `src/agents/evaluacion/corredor.py`, `src/agents/evaluacion/reporte.py`, `src/agents/evaluacion/__main__.py`, `tests/test_evaluacion_corredor.py`, `tests/test_evaluacion_reporte.py`.

- [ ] **Step 1: Escribe los tests que fallan**

Crea `project/apps/agents/tests/test_evaluacion_corredor.py`:

```python
import pytest

from agents.evaluacion.corredor import correr_caso, resultado_desde_estado

CASO = {
    "id": "divisor-5-3v3",
    "descripcion": "un divisor de 5 V a 3.3 V",
    "spec": {
        "blocks": [{"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}]
    },
    "referencia": {"metrica": "v_out", "objetivo": 3.3, "componentes": {"r1": 1000.0}},
}


def test_resultado_desde_estado_extrae_medicion_error_e_iteraciones():
    estado = {
        "verdict": {"status": "accepted", "reason": "ok", "best_iteration": 0},
        "sim_results": {"div1": {"metrics": {"v_out": 3.4}, "converged": True, "sim_error": None}},
        "normalized_spec": {"blocks": [{"id": "div1", "goal": {"tolerance": 0.05}}]},
        "iteration": 0,
        "history": [{"iteration": 0, "reward": 1.0}],
    }

    resultado = resultado_desde_estado(CASO, estado)

    assert resultado["estado"] == "accepted"
    assert resultado["medido"] == pytest.approx(3.4)
    assert resultado["ape"] == pytest.approx(abs(3.4 - 3.3) / 3.3 * 100)
    assert resultado["iteraciones"] == 1


def test_en_tolerancia_se_juzga_contra_la_tolerancia_del_caso_no_contra_el_veredicto():
    """Un circuito aceptado por recompensa puede estar fuera de tolerancia. El
    resultado tiene que decir la verdad sobre eso."""
    estado = {
        "verdict": {"status": "accepted", "reason": "aceptado por recompensa", "best_iteration": 0},
        # 3.6 contra 3.3 es 9.1 %, fuera de la tolerancia del 5 %
        "sim_results": {"div1": {"metrics": {"v_out": 3.6}, "converged": True, "sim_error": None}},
        "normalized_spec": {"blocks": [{"id": "div1", "goal": {"tolerance": 0.05}}]},
        "iteration": 0,
        "history": [],
    }

    resultado = resultado_desde_estado(CASO, estado)

    assert resultado["estado"] == "accepted"
    assert resultado["en_tolerancia"] is False


def test_un_caso_sin_medicion_no_inventa_un_ape():
    estado = {
        "verdict": {"status": "rejected", "reason": "boom", "best_iteration": None},
        "sim_results": {"div1": {"metrics": None, "converged": False, "sim_error": "boom"}},
        "normalized_spec": {"blocks": [{"id": "div1", "goal": {"tolerance": 0.05}}]},
        "iteration": 4,
        "history": [],
    }

    resultado = resultado_desde_estado(CASO, estado)

    assert resultado["medido"] is None
    assert resultado["ape"] is None
    assert resultado["en_tolerancia"] is False


def test_correr_caso_ejecuta_el_grafo_real_contra_ngspice():
    """De punta a punta con el binario de verdad, como todas las pruebas de
    este proyecto."""
    resultado = correr_caso(CASO)

    assert resultado["id"] == "divisor-5-3v3"
    assert resultado["estado"] == "accepted"
    assert resultado["en_tolerancia"] is True
    assert resultado["ape"] < 5.0
```

Crea `project/apps/agents/tests/test_evaluacion_reporte.py`:

```python
from agents.evaluacion.reporte import tabla_latex, tabla_markdown

RESULTADOS = [
    {
        "id": "divisor-12-5",
        "tipo": "voltage_divider",
        "estado": "accepted",
        "medido": 5.01,
        "objetivo": 5.0,
        "ape": 0.2,
        "en_tolerancia": True,
        "iteraciones": 1,
    },
    {
        "id": "led-5v-20ma",
        "tipo": "led_resistor",
        "estado": "rejected",
        "medido": None,
        "objetivo": 0.02,
        "ape": None,
        "en_tolerancia": False,
        "iteraciones": 5,
    },
]

RESUMEN = {
    "casos": 2,
    "medidos": 1,
    "sin_medicion": 1,
    "mape": 0.2,
    "tasa_aceptada": 0.5,
    "tasa_en_tolerancia": 0.5,
    "iteraciones_medias": 3.0,
}


def test_la_tabla_markdown_lista_cada_caso():
    salida = tabla_markdown(RESULTADOS, RESUMEN)

    assert "divisor-12-5" in salida
    assert "led-5v-20ma" in salida
    assert "MAPE" in salida


def test_un_caso_sin_medicion_se_marca_no_se_deja_en_blanco():
    salida = tabla_markdown(RESULTADOS, RESUMEN)

    assert "sin medición" in salida


def test_la_tabla_latex_es_pegable_en_la_tesina():
    salida = tabla_latex(RESULTADOS, RESUMEN)

    assert "\\begin{tabular}" in salida
    assert "\\end{tabular}" in salida
    # los ids llevan guiones, que en LaTeX hay que proteger
    assert "divisor-12-5" in salida or "divisor\\-12\\-5" in salida


def test_las_dos_tasas_aparecen_en_ambos_formatos():
    for salida in (tabla_markdown(RESULTADOS, RESUMEN), tabla_latex(RESULTADOS, RESUMEN)):
        assert "50.0" in salida or "0.50" in salida
```

- [ ] **Step 2: Corre y verifica que fallan**

`uv run pytest tests/test_evaluacion_corredor.py tests/test_evaluacion_reporte.py -v` → FAIL, módulos inexistentes.

- [ ] **Step 3: Implementa**

Crea `project/apps/agents/src/agents/evaluacion/corredor.py`:

```python
"""Ejecuta el grafo real sobre cada caso del banco.

Entra por `circuit_spec` estructurado, no por lenguaje natural, para que la
medición del sistema no dependa de tener un LLM configurado ni herede su
variabilidad. La línea base best-of-N sí usa la descripción.
"""

from agents.evaluacion.metricas import ape
from agents.graph import build_graph


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


def resultado_desde_estado(caso: dict, estado: dict) -> dict:
    """Normaliza el estado final del grafo al registro que consumen las
    métricas. Función pura: separada de `correr_caso` para poder probarla sin
    ejecutar ngspice."""
    referencia = caso["referencia"]
    objetivo = referencia["objetivo"]
    block_id = caso["spec"]["blocks"][0]["id"]
    tipo = caso["spec"]["blocks"][0]["type"]

    sim = (estado.get("sim_results") or {}).get(block_id) or {}
    metrics = sim.get("metrics")
    medido = metrics.get(referencia["metrica"]) if metrics else None

    tolerancia = estado["normalized_spec"]["blocks"][0]["goal"]["tolerance"]

    error = ape(medido, objetivo) if medido is not None else None
    # La tolerancia viaja como fracción (0.05) y el APE en puntos (5.0).
    en_tolerancia = error is not None and error <= tolerancia * 100.0

    verdict = estado.get("verdict") or {}

    return {
        "id": caso["id"],
        "tipo": tipo,
        "estado": verdict.get("status", "error"),
        "medido": medido,
        "objetivo": objetivo,
        "ape": error,
        "en_tolerancia": en_tolerancia,
        "iteraciones": estado.get("iteration", 0) + 1,
        "razon": verdict.get("reason", ""),
    }


def correr_caso(caso: dict) -> dict:
    graph = build_graph()
    estado = graph.invoke(
        _estado_inicial(caso["spec"]),
        config={"configurable": {"thread_id": f"eval-{caso['id']}"}},
    )
    return resultado_desde_estado(caso, estado)


def correr_banco(casos: list[dict]) -> list[dict]:
    return [correr_caso(caso) for caso in casos]
```

Crea `project/apps/agents/src/agents/evaluacion/reporte.py`:

```python
"""Rinde los resultados en las dos formas que hacen falta: markdown para
leerlos, LaTeX para pegarlos en el capítulo de pruebas."""

SIN_MEDICION = "sin medición"


def _fmt(valor: float | None, decimales: int = 2) -> str:
    return SIN_MEDICION if valor is None else f"{valor:.{decimales}f}"


def tabla_markdown(resultados: list[dict], resumen: dict) -> str:
    lineas = [
        "| Caso | Tipo | Objetivo | Medido | APE (%) | En tolerancia | Iteraciones | Veredicto |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in resultados:
        lineas.append(
            f"| {r['id']} | {r['tipo']} | {_fmt(r['objetivo'], 4)} | "
            f"{_fmt(r['medido'], 4)} | {_fmt(r['ape'])} | "
            f"{'sí' if r['en_tolerancia'] else 'no'} | {r['iteraciones']} | {r['estado']} |"
        )

    lineas += [
        "",
        "## Resumen",
        "",
        f"- Casos: **{resumen['casos']}** ({resumen['medidos']} medidos, "
        f"{resumen['sin_medicion']} sin medición)",
        f"- **MAPE**: {_fmt(resumen['mape'])} % (sobre los casos medidos)",
        f"- **Tasa en tolerancia**: {resumen['tasa_en_tolerancia'] * 100:.1f} % "
        "— la tasa de circuitos que cumplen su meta",
        f"- Tasa aceptada: {resumen['tasa_aceptada'] * 100:.1f} % "
        "— incluye los aceptados por recompensa fuera de tolerancia",
        f"- Iteraciones medias: {resumen['iteraciones_medias']:.2f}",
    ]
    return "\n".join(lineas)


def tabla_latex(resultados: list[dict], resumen: dict) -> str:
    filas = []
    for r in resultados:
        # el guion bajo y el guion medio no necesitan escape dentro de \texttt,
        # pero el id va en \texttt para que se lea como identificador
        filas.append(
            f"\\texttt{{{r['id']}}} & {_fmt(r['objetivo'], 4)} & {_fmt(r['medido'], 4)} & "
            f"{_fmt(r['ape'])} & {'sí' if r['en_tolerancia'] else 'no'} & "
            f"{r['iteraciones']} \\\\"
        )

    cuerpo = "\n".join(filas)
    return (
        "\\begin{tabular}{lrrrcr}\n"
        "\\toprule\n"
        "\\textbf{Caso} & \\textbf{Objetivo} & \\textbf{Medido} & "
        "\\textbf{APE (\\%)} & \\textbf{En tol.} & \\textbf{Iter.} \\\\\n"
        "\\midrule\n"
        f"{cuerpo}\n"
        "\\midrule\n"
        f"\\multicolumn{{6}}{{l}}{{MAPE: {_fmt(resumen['mape'])} \\% — "
        f"tasa en tolerancia: {resumen['tasa_en_tolerancia'] * 100:.1f} \\% — "
        f"tasa aceptada: {resumen['tasa_aceptada'] * 100:.1f} \\% — "
        f"iteraciones medias: {resumen['iteraciones_medias']:.2f}}} \\\\\n"
        "\\bottomrule\n"
        "\\end{tabular}"
    )
```

Crea `project/apps/agents/src/agents/evaluacion/__main__.py`:

```python
"""Corre la evaluación completa:

    uv run python -m agents.evaluacion

Escribe el reporte en markdown por stdout y, con --latex, la tabla lista para
el capítulo de pruebas.
"""

import argparse

from agents.evaluacion.banco import cargar_banco
from agents.evaluacion.corredor import correr_banco
from agents.evaluacion.metricas import resumir
from agents.evaluacion.reporte import tabla_latex, tabla_markdown


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.evaluacion")
    parser.add_argument("--banco", default=None, help="ruta a un banco propio")
    parser.add_argument("--latex", action="store_true", help="emite la tabla LaTeX")
    args = parser.parse_args()

    casos = cargar_banco(args.banco)
    resultados = correr_banco(casos)
    resumen = resumir(resultados)

    print(tabla_latex(resultados, resumen) if args.latex else tabla_markdown(resultados, resumen))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Verifica**

`uv run pytest -v` → **162 passed, 5 skipped**.

- [ ] **Step 5: Corre la evaluación de verdad**

```bash
uv run python -m agents.evaluacion
```

Tarda: son 20 casos y cada uno lanza ngspice al menos una vez. **Pega la salida completa en tu reporte** — es el resultado que va al capítulo de pruebas de la tesina, y es el entregable real de esta tarea.

No ajustes el banco para que los números salgan bonitos. Si un caso falla o queda fuera de tolerancia, **eso es el hallazgo**, y hay que reportarlo tal cual.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/src/agents/evaluacion/ project/apps/agents/tests/test_evaluacion_corredor.py project/apps/agents/tests/test_evaluacion_reporte.py
git commit -m "feat(agents): corredor de la evaluacion y reporte de resultados"
```

---

### Task 3: La línea base best-of-N

Pendiente de que haya un LLM configurado. Pide al modelo `N` netlists completos para la misma
descripción, sin realimentación, los simula y conserva el mejor; se compara a igual presupuesto de
llamadas. Va marcada `live_llm` como las demás pruebas que necesitan un modelo real.

Se planifica aparte cuando las Tareas 1 y 2 estén verdes y haya credenciales.

---

## Verificación final de la fase

- [ ] `uv run pytest` verde con `ngspice` real.
- [ ] `uv run python -m agents.evaluacion` produce las 20 filas y el resumen.
- [ ] `uv run python -m agents.evaluacion --latex` produce una tabla que compila.
- [ ] El reporte distingue `tasa_en_tolerancia` de `tasa_aceptada`, y el capítulo de pruebas usa la
      primera como "tasa de circuitos que cumplen las metas".
