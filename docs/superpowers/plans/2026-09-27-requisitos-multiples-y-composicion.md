# Requisitos múltiples y composición de etapas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un bloque pueda declarar varios requisitos (`Requirement`: medida + comparador + valor + tolerancia) en vez de un único `metric`/`target`, que el curador juzgue y ajuste sobre el conjunto de requisitos (no por bloque), y que topologías del catálogo se puedan encadenar en un solo netlist compuesto vía `connections` — sin romper el camino de hoy para el caso de un bloque con un solo requisito y sin conexiones.

**Architecture:** `orquestador/schema.py` reemplaza `metric`/`target` sueltos en `CatalogParams`/`GenericParams` por `requirements: list[Requirement]`, y `CircuitSpec` gana `connections`. `orquestador/node.py` normaliza a una lista `requirements` por bloque (en vez de un único `goal`). `curador/reward.py` deja de indexar mediciones por bloque y pasa a indexar por requisito; `curador/policy.py` evalúa y ajusta por requisito; `curador/reparacion.py` le manda al LLM la lista de requisitos incumplidos de un bloque genérico, no uno solo. Los tipos curados pasan a `.subckt` con puertos y un ensamblador arma el netlist compuesto a partir de `connections` (Slice B); el banco de evaluación pasa a referencia por requisito (Slice C).

**Tech Stack:** Python 3.12, LangGraph, Pydantic, pytest. Todo se ejecuta con `uv` desde `project/apps/agents`.

Diseño de referencia: [`docs/superpowers/specs/2026-09-27-requisitos-multiples-y-composicion-design.md`](../specs/2026-09-27-requisitos-multiples-y-composicion-design.md)

---

## Entorno: léelo antes de la primera tarea

**1. No hay mocks de `ngspice`.** Las pruebas de simulación corren el binario real; tiene que estar en el `PATH`.

**2. `RunnableConfig` tipado, no `dict`.** LangGraph solo inyecta `config.configurable.user_id` cuando el segundo parámetro del nodo está anotado `RunnableConfig`. Tiparlo `dict` da `None` en silencio.

**3. `uv` no carga `.env` solo.** Si una prueba necesita variables de entorno: `uv run --env-file .env pytest`. Ninguna tarea de Slice A lo requiere.

**4. Para providers `openai_compatible`,** el `baseUrl` necesita el sufijo `/v1`. No aplica a Slice A (no toca `llm/`), se deja anotado para B/C si prueban contra un LLM real.

**5. No hay migración de datos.** El esquema viejo (`metric`/`target`/`tolerance` global) no tiene estado persistido fuera de `tests/` y `evaluacion/banco.yaml`; se actualizan deliberadamente, no se mantiene un camino de compatibilidad de *entrada* del schema. Lo que sí se preserva es el **comportamiento observable**: un bloque con un solo `Requirement` (comparador `approx`, sin `node` de composición) y un `CircuitSpec` sin `connections` debe producir exactamente las mismas decisiones (`accept`/`adjust`/`reject`), la misma `weighted_ape` y el mismo `reward` que hoy con `metric`/`target`/`tolerance`.

---

## Slice A — Fundacional: esquema `Requirement` + curador generalizado

**Estado: implementado y verde.** `uv run pytest` desde `project/apps/agents`:
301 passed, 6 skipped, 1 failed — el único rojo (`test_prompts.py::test_api_attaches_handler_and_run_metadata_only_when_configured[True]`)
es una contaminación de estado entre tests de Langfuse preexistente, no relacionada
con `Requirement`/`connections` (falla igual en `dev` antes de este slice).

**Alcance:** `orquestador/schema.py`, `orquestador/node.py` (solo la normalización a `requirements`, no la extracción por LLM de `connections` ni de `node` — eso es Slice B), `curador/reward.py`, `curador/policy.py`, `curador/reparacion.py`, `curador/node.py`, y las pruebas correspondientes. **No** toca `escritura/`, `shell/`, `calculo/formulas.py` (los workers de cálculo siguen leyendo `block["params"]`, ajeno a `goal`/`requirements`), ni `evaluacion/`.

**Contrato de `Requirement` para Slice A** (el vocabulario cerrado de `measure` y la resolución de `node` a partir de lenguaje natural quedan para Slice B; en Slice A `measure` sigue siendo el nombre de métrica libre que hoy es `metric`, p. ej. `"v_out"`, `"gain"`, `"fc"` — la clave con la que se lee `sim_result["metrics"][...]`):

```python
class Requirement(BaseModel):
    measure: str = Field(min_length=1)          # hoy: metric
    node: str = ""                               # reservado para Slice B; no se usa aún
    comparator: Literal["approx", "le", "ge"] = "approx"
    value: float                                  # hoy: target
    tolerance: float | None = None                # None hereda CircuitSpec.tolerance
```

`CatalogParams`/`GenericParams` cambian `metric: str` + `target: float` por `requirements: list[Requirement] = Field(min_length=1)`. `CircuitSpec` gana:

```python
    connections: list[tuple[str, str]] = Field(default_factory=list)
```

(un par `"block_id.port"` ↔ `"block_id.port"`; en Slice A siempre vacío en la práctica porque nada la puebla ni la consume todavía — se declara ahora para que el schema no cambie otra vez en Slice B).

### Task 1: `Requirement` en el esquema

**Files:**
- Modify: `src/agents/orquestador/schema.py`
- Modify: `tests/test_orquestador.py`

- [x] **Step 1: Test que falla** — en `tests/test_orquestador.py`, sustituye cada `CatalogParams(..., metric=..., target=...)` / `GenericParams(..., metric=..., target=...)` y cada dict crudo `{"metric": ..., "target": ...}` dentro de `circuit_spec` por `{"requirements": [{"measure": ..., "value": ...}]}` (comparator y tolerance por defecto). Añade un caso explícito con dos requisitos en un bloque (`requirements: [{...}, {...}]`) que hoy no existe, solo para confirmar que Pydantic lo acepta.
- [x] **Step 2: Implementa** — añade `Requirement` a `orquestador/schema.py`; cambia `CatalogParams`/`GenericParams` a `requirements: list[Requirement]`; añade `CircuitSpec.connections: list[tuple[str, str]] = Field(default_factory=list)`. Actualiza el docstring de `GenericParams` si hace falta (sigue siendo el LLM quien entrega el netlist; ahora entrega también la lista de requisitos).
- [x] **Step 3:** `uv run pytest tests/test_orquestador.py -v` — corrígelo hasta que pase.

### Task 2: Normalización a `requirements` por bloque

**Files:**
- Modify: `src/agents/orquestador/node.py`
- Modify: `tests/test_orquestador.py` (los `assert block["goal"] == {...}` pasan a `assert block["requirements"] == [...]`)

- [x] **Step 1:** Renombra `_goal_for` a `_requirements_for(block, params, tolerance) -> list[dict]`. Por cada `Requirement` en `params["requirements"]`: resuelve `tolerance` (usa la del propio requisito si no es `None`, si no la del diseño) y aplica la misma heurística anti-alucinación que hoy tiene `_goal_for` (target/valor `>= 1e6` en valor absoluto → recuperarlo de `block_params`), pero por requisito, usando `req["measure"]` en vez de `metric` y `req["value"]` en vez de `target`.
- [x] **Step 2:** `_normalize` deja de escribir `"goal": _goal_for(...)` y escribe `"requirements": _requirements_for(...)` (lista). Propaga `spec.connections` a `normalized_spec` (`{"blocks": ..., "max_iterations": ..., "connections": [...]}"`) aunque nada la consuma todavía, para que el shape de `normalized_spec` no cambie otra vez en Slice B.
- [x] **Step 3:** `uv run pytest tests/test_orquestador.py -v`.

### Task 3: `curador/reward.py` sobre requisitos

**Files:**
- Modify: `src/agents/curador/reward.py`
- Modify: `tests/test_reward.py`

- [x] **Step 1: Test que falla** — en `tests/test_reward.py`, cambia los fixtures `blocks = [{"id": "div1", "goal": {"metric": "v_out"}}]` por `blocks = [{"id": "div1", "requirements": [{"measure": "v_out"}]}]`, y `evaluations` pasa de `{block_id: (status, rel_err)}` a `{(block_id, req_index): (status, rel_err)}` — indexado por requisito, no por bloque. Añade un caso nuevo con un bloque de dos requisitos donde uno falla y el otro no, y confirma que `build_measurements` devuelve dos entradas (una por requisito) con sus propios `weight_for(measure, ...)`.
- [x] **Step 2: Implementa** — `build_measurements` itera `(block, req_index, requirement)` para cada requisito de cada bloque en vez de una vez por bloque; la clave de `evaluations` pasa a `(block_id, req_index)`. `weight_for` no cambia de firma (sigue tomando un nombre de métrica). El resto de `weighted_ape`/`compute_reward` no cambian: siguen sumando sobre la lista de `Measurement`, que ahora tiene una entrada por requisito en vez de por bloque — es exactamente el cambio que pide el diseño ("R pasa a sumar sobre requisitos, no sobre bloques").
- [x] **Step 3:** `uv run pytest tests/test_reward.py -v`.

### Task 4: `curador/policy.py` sobre requisitos

**Files:**
- Modify: `src/agents/curador/policy.py`
- Modify: `tests/test_curador.py` (la parte de `policy`, no todavía `curador_node`)

- [x] **Step 1:** Renombra `evaluate_block(goal, sim_result)` a `evaluate_requirement(requirement, sim_result)`. Añade soporte a los tres comparadores:
  - `approx` (hoy: único caso) — error relativo `|actual - value| / max(|value|, 1e-12)`, con la misma excepción de magnitud para `gain`/`av`/`a_v` que hoy tiene `evaluate_block`.
  - `le` — `actual <= value` es `"ok"` con `rel_err = 0.0`; si no, `rel_err = (actual - value) / max(|value|, 1e-12)` (positivo, cuánto se pasó).
  - `ge` — simétrico: `actual >= value` es `"ok"`; si no, `rel_err = (value - actual) / max(|value|, 1e-12)`.
  Todos comparan `rel_err <= requirement["tolerance"]` igual que hoy para decidir `"ok"` vs `"off"`.
- [x] **Step 2:** `accept_is_admissible` pasa a recibir la lista aplanada de `(block, req_index, requirement)` en vez de `blocks` solo, y su `evaluations` usa la clave `(block_id, req_index)` de la Task 3. Conserva la semántica: ningún requisito puede faltar por medir (`error`), y ninguno puede exceder `slack * su propia tolerancia`.
  - **Nota para quien implemente:** para no reescribir la firma de `accept_is_admissible` en cada bloque llamador, acepta una lista de tuplas `(block_id, req_index, tolerance)` ya aplanada — quien la arma (`curador_node`) hace el join contra `blocks`/`requirements`.
- [x] **Step 3:** `_adjust_catalog` **no cambia de firma** en Slice A (sigue tomando `values, target, actual` — un solo par). Documenta explícitamente en el docstring de `curador_node` (Task 5) que, cuando un bloque `catalog` tiene más de un requisito fallando a la vez, Slice A ajusta usando **el requisito con mayor `rel_err`** de ese bloque (el peor) y dejar el ajuste multi-requisito con solver propio para una iteración posterior — no lo resuelve este slice. Añade un comentario `# TODO(slice-b/c): ...` en el punto exacto donde se elige ese requisito dentro de `curador_node`.
- [x] **Step 4:** `uv run pytest tests/test_curador.py -v -k policy or admissib` (o el subconjunto que corresponda; ajusta el nombre de los tests migrados).

### Task 5: `curador/node.py` y `curador/reparacion.py` sobre requisitos

**Files:**
- Modify: `src/agents/curador/node.py`
- Modify: `src/agents/curador/reparacion.py`
- Modify: `tests/test_curador.py`, `tests/test_reparacion.py`

- [x] **Step 1: Test que falla** — actualiza los fixtures `_state`/`_two_block_state` de `tests/test_curador.py`: cada bloque cambia `"goal": {...}` por `"requirements": [{...}]`. Los asserts sobre decisiones (`accept`/`adjust`/`reject`), `reward`, `weighted_ape` y los valores ajustados de `component_values` **deben seguir dando exactamente los mismos números** — es la prueba de compatibilidad comportamental del diseño. Si algún assert numérico cambia, es una señal de bug, no de "hay que actualizar el número".
- [x] **Step 2:** En `curador_node`: `evaluations` pasa a construirse aplanando bloque × requisito (clave `(block_id, req_index)`); `failing` agrupa por requisito pero el bucle de ajuste sigue siendo por **bloque** (el ajuste toca `component_values[bid]`, que es por bloque, no por requisito). Para un bloque `catalog` con requisitos fallando, usa el peor (Task 4, Step 3) para `_adjust_catalog`/`perturb`. Para un bloque `generic`, `reparar_netlist_del_bloque` deja de recibir un único `goal` y recibe la lista de requisitos incumplidos de ese bloque (con su medición o `sim_error`).
- [x] **Step 3:** En `curador/reparacion.py`, `repair_netlist` cambia su firma de `metric: str, target: float, measured: float | None` a `requirements_fallidos: list[dict]` (cada uno con su `measure`/`comparator`/`value`/`tolerance` y su medición o `None`), y arma el `user_content` enumerando todos los requisitos incumplidos en vez de uno solo. `_resultado_medicion` pasa a operar por requisito individual y se llama una vez por cada uno en el mensaje.
- [x] **Step 4:** `uv run pytest tests/test_curador.py tests/test_reparacion.py -v`.

### Task 6: Suite completa de Slice A

**Files:** ninguno nuevo — cierre.

- [x] **Step 1:** `uv run pytest` desde `project/apps/agents` y confirma verde. `tests/test_graph.py`, `tests/test_calculo.py` y `tests/test_evaluacion_corredor.py`/`test_evaluacion_banco.py` construyen `circuit_spec`/`normalized_spec` a mano con `"metric"/"target"/"goal"` — necesitan el mismo reemplazo mecánico de la Task 1/2 (`{"metric": X, "target": Y}` → `{"requirements": [{"measure": X, "value": Y}]}`, `"goal": {...}` → `"requirements": [{...}]`) aunque no ejerciten `curador/` directamente.
- [x] **Step 2:** Si algo sigue en rojo, diagnostica antes de tocar más código — no es de esperar tocar `escritura/`, `shell/`, `calculo/formulas.py` ni `evaluacion/*.py` (solo sus *fixtures* de test) para que Slice A cierre en verde.

---

## Slice B — `.subckt` por tipo curado + ensamblador de composición (no arrancar todavía)

**Alcance:** `escritura/netlist.py`, `escritura/node.py`, `orquestador/schema.py` (vocabulario cerrado de `measure` + resolución de `node`), `orquestador/node.py` (extracción LLM de `connections`), `calculo/` (sin cambios de fórmulas, pero el resultado se sustituye en un `.subckt` en vez de un netlist top-level).

**Corrección sobre el catálogo real (2026-09-27):** la lista de cuatro tipos
curados de `CLAUDE.md` (`voltage_divider`, `rc_lowpass`, `led_resistor`,
`noninverting_amp`) está desactualizada. El catálogo real
(`knowledge/circuit_client.py`, `FALLBACK_CIRCUITS`, más lo que sirva el
server) tiene hoy 12 `circuit_id` (`rc_lowpass_passive`, `bjt_voltage_divider`,
`diode_clamper`, `diode_clipper`, `opamp_highpass_active`,
`opamp_noninverting_amp`, `voltage_divider`, `zener_regulated_power_supply`,
`double_ended_clipper`, `bjt_common_emitter_amp`, `opamp_integrator_practical`,
`sallen_key_lowpass_butterworth`). `led_resistor` no existe. Cada
`spiceTemplate` es hoy un circuito completo y autónomo: trae su propia fuente
independiente (`Vin ... 0 ...`) y su propio bloque `.control` que escribe
`output.txt`, y usa consistentemente `vin`/`vout`/`0` como nodos de
entrada/salida/tierra (confirmado a mano sobre varios templates).

**Task B2 se reduce en alcance:** no conviertas los 12 templates a `.subckt`.
Escribe un *transformador genérico* (una función, no una plantilla por tipo)
que tome cualquier `spiceTemplate` de este catálogo, después de la
sustitución de parámetros de siempre, y lo reduzca a un `.subckt <nombre>
vin vout 0 ... : (a) elimina su fuente independiente `Vin` (se conserva solo
en el bloque que sea la cabeza de la cadena), (b) elimina su bloque
`.control`/`.endc` (el ensamblador emite uno solo, combinado, para todo el
diseño), (c) **renombra con un prefijo por instancia** todo nodo interno y
todo nombre de dispositivo/subcircuito que no sea `vin`, `vout` o `0` —
varios templates definen su propio `.subckt opamp` con los mismos nombres
internos (`n1`, `n2`, `Rin`, `Egain`, ...); instanciar dos bloques que
definen `.subckt opamp` sin renombrar colisiona. Prueba esta transformación
end-to-end contra exactamente el par que ya aparece en el diseño y en el
banco de ejemplos: `opamp_highpass_active` (filtro) → `opamp_noninverting_amp`
(amplificador) — es el ejemplo "filtro pasa-altas + ganancia 4" del diseño.
No hace falta demostrarlo contra los 12 tipos en este slice.

- [ ] **Task B1:** Definir el vocabulario cerrado de `measure` (`max`, `min`, `peak_to_peak`, `dc`, `current`, `fc_-3db`, `gain_at_freq`, `ripple`) y su traducción determinista a `.meas` de ngspice — una función pura por medida, sin plantillas por tipo de circuito. El nombre de cada `.meas` (y por tanto la clave que aparece en `sim_result["metrics"]`) debe coincidir exactamente con `curador.policy.metric_key(requirement)` (ver nota más abajo): sin `node`, la clave es `measure`; con `node`, es `f"{measure}@{node}"`.
- [ ] **Task B2:** Transformador genérico spiceTemplate → `.subckt` con puertos `vin`/`vout`/`0`, con renombrado por instancia, como se describe arriba. Probado contra `opamp_highpass_active` + `opamp_noninverting_amp`.
- [ ] **Task B3:** Ensamblador: dado `normalized_spec.blocks` + `normalized_spec.connections`, instancia cada `.subckt` con su transformador de B2, cablea las conexiones (el `vout` namespaced de un bloque se vuelve el `vin` namespaced del siguiente), conserva la fuente independiente solo en el bloque cabeza de cadena, y emite un único bloque `.control` con un `.meas` por `Requirement` (vía B1) resuelto sobre el nodo namespaced correspondiente del circuito compuesto.
- [ ] **Task B4:** Eliminar en `escritura/node.py` el camino `if block["type"] == "catalog" and iteration == 0 and chat_model is not None` — la sustitución de parámetros en el `.subckt` ya resuelve la síntesis determinista; el LLM de escritura queda solo para `generic`.
- [ ] **Task B5:** `shell/node.py`/`shell/ngspice_runner.py`: confirmar que corren sobre un netlist por *diseño* (no por bloque) sin cambios de fondo — puede que solo cambie cómo se buscan los tempdirs/outputs (uno por diseño, no uno por `block_id`).

**Ya resuelto, no lo repitas:** el bug de identidad de métrica que Slice B
iba a exponer (dos requisitos con el mismo `measure` en nodos distintos
colisionando en `sim_result["metrics"]`) ya se corrigió en Slice A/B:
`curador/policy.py` expone `metric_key(requirement) -> str` (sufija con
`@node` solo si `requirement["node"]` no está vacío) y tanto
`evaluate_requirement` como `curador/node.py` ya lo usan en vez de indexar
`metrics` por `requirement["measure"]` a secas. B1/B3 solo tienen que producir
`.meas` cuyo nombre siga esa misma convención — no toques `curador/` de
nuevo para esto.

## Slice C — Banco de evaluación por requisito (no arrancar todavía)

**Alcance:** `evaluacion/banco.yaml`, `evaluacion/corredor.py`, `evaluacion/metricas.py`, `evaluacion/reporte.py`.

- [ ] **Task C1:** `banco.yaml`: cada caso gana `referencia: list[{requisito, metrica, objetivo, componentes}]` en vez de un único `metrica`/`objetivo`/`componentes`.
- [ ] **Task C2:** `corredor.py`: recorre requisitos, no bloques, para comparar contra la referencia.
- [ ] **Task C3:** `metricas.py`/`reporte.py`: agregan por requisito; el reporte lista cada requisito con su propio APE, no un promedio por bloque.
- [ ] **Task C4:** Cargar los ejemplos 1–16 del diseño (más el prompt combinado "filtro pasa-altas + ganancia 4, error < 5 %") como casos nuevos del banco.

---

## Notas para quien retome Slice B/C

- El shape de `normalized_spec` después de Slice A es `{"blocks": [{"id", "type", "params", "requirements": [...]}, ...], "max_iterations", "connections": []}`. `connections` existe pero está vacía en la práctica: nada la puebla (el orquestador no la extrae todavía) ni la consume (no hay ensamblador todavía).
- `curador/policy.evaluate_requirement` ya soporta `le`/`ge` aunque Slice A solo los ejercita en tests unitarios — ningún camino real produce hoy un requisito que no sea `approx`, porque el orquestador todavía no extrae comparadores de lenguaje natural. Slice B es quien primero los ejercita end-to-end.
- El ajuste multi-requisito de un bloque `catalog` (Task 4, Step 3 de Slice A) es una limitación conocida: elige el peor requisito, no resuelve el sistema completo. Si el criterio de terminado 4 del diseño ("recalibra solo la consigna del requisito que falló") necesita algo más fino que "el peor gana", es trabajo de Slice B/C, marcado con `TODO(slice-b/c)` en `curador/node.py`.
