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

**Estado: implementado y verde (2026-09-27).** `uv run pytest` desde
`project/apps/agents`: 312 passed, 6 skipped, 1 failed — el único rojo sigue
siendo el mismo `test_prompts.py::test_api_attaches_handler_and_run_metadata_only_when_configured[True]`
preexistente y ajeno (contaminación de estado entre tests de Langfuse), ya
anotado como tal en Slice A. `tests/test_composition.py`: 11/11 en verde.

- [x] **Task B1:** Definir el vocabulario cerrado de `measure` (`max`, `min`, `peak_to_peak`, `dc`, `current`, `fc_-3db`, `gain_at_freq`, `ripple`) y su traducción determinista a `.meas` de ngspice — una función pura por medida, sin plantillas por tipo de circuito. El nombre de cada `.meas` (y por tanto la clave que aparece en `sim_result["metrics"]`) coincide exactamente con `curador.policy.metric_key(requirement)`: sin `node`, la clave es `measure`; con `node`, es `f"{measure}__at__{node}"` (el separador cambió de `@` a `__at__` durante la implementación: ngspice acepta `-` en un nombre de `.meas`/variable, pero **no** `@` — `$&measure@node` falla con "bad variable name"; ver `src/agents/escritura/measurements.py`). Implementado en `src/agents/escritura/measurements.py`.
- [x] **Task B2:** Transformador genérico spiceTemplate → `.subckt` con puertos `vin`/`vout`/`0`, con renombrado por instancia. Implementado en `src/agents/escritura/composition.py::template_to_subcircuit`. Probado contra `opamp_highpass_active` + `opamp_noninverting_amp` (`tests/test_composition.py::test_subcircuit_transform_renames_nested_definitions`).
- [x] **Task B3:** Ensamblador en `src/agents/escritura/composition.py::assemble_composed_netlist`: dado `blocks` + `connections`, instancia cada `.subckt` con B2, cablea las conexiones (el `vout` namespaced de un bloque se vuelve el `vin` namespaced del siguiente), conserva la fuente independiente (`V{id}_in {id}_vin 0 DC 0 AC 1`) solo en el/los bloque(s) cabeza de cadena (los que ninguna conexión alimenta), y emite un único bloque `.control` con un `.meas`+`echo {block_id} {key} $&{key} >> output.txt` por `Requirement`. Un requisito sin `node` se mide en la salida propia del bloque (`{id}_vout`), con `input_node` = la entrada real de ese bloque tras el cableado — así la ganancia de una etapa aguas abajo se mide contra lo que de verdad la alimenta, no contra la entrada original de la cadena.
- [x] **Task B4:** Eliminado en `escritura/node.py` el camino `if block["type"] == "catalog" and iteration == 0 and chat_model is not None`. `get_chat_model`/`AGENT_ID="writer"` se conservan en el módulo (sin llamador propio) porque `tests/test_composition.py::test_catalog_never_resolves_writer_llm` los monkeypatchea — borrarlos rompería ese test sin necesidad.
- [x] **Task B5:** `shell/node.py` gana `_composed_shell` (rama nueva, activada cuando `normalized_spec["connections"]` no está vacío): corre ngspice **una vez** sobre el netlist compartido y reparte las mediciones (vía la nueva `parse_measurements` en `shell/ngspice_runner.py`) entre los `sim_results` de cada bloque según la etiqueta de bloque que trae cada línea `echo`. El camino legacy (sin `connections`) no cambia una sola línea.

**Descubrimientos durante la implementación (no estaban en el diseño):**
- El catálogo real (`knowledge/circuit_client.py::FALLBACK_CIRCUITS`) usa
  siempre `vin`/`vout`/`0` como nodos de E/S y cada plantilla trae su propia
  fuente `Vin` y su propio `.control` — son circuitos completos y autónomos,
  no fragmentos componibles. `template_to_subcircuit` depende de esa
  convención; una plantilla que no la siguiera necesitaría trabajo aparte.
- `.meas`/`$&var` con `FIND ... AT=X` en ngspice necesita un **intervalo**,
  no un punto: un barrido `dc`/`ac` de un solo punto en `X` falla con
  "out of interval" aunque `X` sea exactamente el punto pedido. Por eso
  `measure_dc`/`measure_current` barren `0` a `1` (no `0` a `0`) y
  `measure_gain_at_freq` barre ±10 % alrededor de la frecuencia objetivo en
  vez de un único punto.
- `.startswith(".end")` en un parser de líneas SPICE es una trampa: matchea
  tanto `.end` (fin de archivo) como `.ends` (fin de subcircuito). El primer
  intento de `template_to_subcircuit` se comía todos los `.ends` anidados
  por este bug — el chequeo correcto es `== ".end"`.

**Ya resuelto, no lo repitas:** el bug de identidad de métrica que Slice B
iba a exponer (dos requisitos con el mismo `measure` en nodos distintos
colisionando en `sim_result["metrics"]`) ya se corrigió en Slice A/B:
`curador/policy.py` expone `metric_key(requirement) -> str` (sufija con
`__at__node` solo si `requirement["node"]` no está vacío) y tanto
`evaluate_requirement` como `curador/node.py` ya lo usan en vez de indexar
`metrics` por `requirement["measure"]` a secas. B1/B3 solo tienen que producir
`.meas` cuyo nombre siga esa misma convención — no toques `curador/` de
nuevo para esto.

**Fuera de alcance de este slice, anotado para Slice C o futuro:**
- Solo se probó el par `opamp_highpass_active → opamp_noninverting_amp`; los
  otros 10 `circuit_id` del catálogo no pasaron por `template_to_subcircuit`
  y podrían tener device types no cubiertos por
  `composition._transform_line` (ej. BJT con 4 nodos, u otros formatos de
  `.model`) — revisar caso por caso si Slice C los necesita en cascada.
- El orquestador todavía no extrae `connections`/`Requirement.node` de
  lenguaje natural (`request_text`); solo el camino `circuit_spec`
  estructurado los puebla hoy. Eso seguía fuera de alcance, tal como decía
  el diseño original.
- El ajuste del curador para un bloque `catalog` compuesto sigue usando "el
  peor requisito" (limitación heredada de Slice A, sin cambios aquí).

## Slice C — Banco de evaluación por requisito

**Estado: implementado y verde (2026-09-27).** `uv run pytest` desde
`project/apps/agents`: 315 passed, 6 skipped, 1 failed (el mismo fallo
preexistente de Langfuse, ajeno). `uv run python -m agents.evaluacion`
corre el banco completo end-to-end contra ngspice real: **17 filas
(16 casos, la cascada aporta 2), 100 % aceptado, 100 % en tolerancia,
MAPE 0.07 %**.

**Alcance:** `evaluacion/banco.yaml`, `evaluacion/banco.py`,
`evaluacion/corredor.py`. `metricas.py`/`reporte.py` no necesitaron tocarse
(ver Task C3).

- [x] **Task C1:** `banco.yaml` gana `referencia: list[{requisito, metrica, objetivo, componentes}]`. `banco.py::validar_caso` valida esa forma (antes comprobaba claves de un dict único; ahora itera la lista). **Descubrimiento no anticipado por el diseño:** el banco original (20 casos, `circuit_id` `voltage_divider`/`rc_lowpass`/`led_resistor`/`noninverting_amp`) ya estaba desalineado con el catálogo real *antes* de este slice — `calculo/catalog_solver.py` no reconoce `rc_lowpass` ni `noninverting_amp` (son `rc_lowpass_passive`/`opamp_noninverting_amp`) y no tiene ningún `circuit_id` de LED+resistencia. Los 5 casos de LED se eliminaron (no hay a qué migrarlos); los de divisor/filtro se migraron al `circuit_id` real, con `componentes` recalculado contra el solver de verdad (el default de `R1` del divisor pasó de 1 kΩ a 10 kΩ, y el filtro fija `C` y resuelve `R` en vez de al revés). El banco quedó en 16 casos, no 20.
- [x] **Task C2:** `corredor.py::resultado_desde_estado`/`correr_caso` devuelven `list[dict]` (una fila por requisito) en vez de un único dict; `correr_banco` aplana. Cierra el `TODO(slice-c)` que tenía `tests/test_evaluacion_corredor.py`: ya no lee la proyección `goal` heredada, resuelve la tolerancia buscando el `Requirement` real por `measure` en `normalized_spec.blocks[i].requirements`.
- [x] **Task C3:** **No hicieron falta cambios.** `metricas.resumir` y `reporte.tabla_markdown`/`tabla_latex` ya operaban sobre una lista plana de filas sin asumir "una fila = un caso"; darles una lista con más filas que casos (por la cascada) ya agrega por requisito sin tocar su código.
- [x] **Task C4 (parcial, con nota):** se agregó **un** caso de composición (`cascada-pasaaltas-ganancia-4`, el ejemplo "filtro pasa-altas + ganancia 4" del diseño), que reusa el par `opamp_highpass_active`/`opamp_noninverting_amp` ya validado en `tests/test_composition.py`. **No se cargaron los ejemplos 1–16 completos del diseño** (Zener, BJT, diodos clamper/clipper, etc.): la mayoría necesita ecuaciones de referencia y verificación contra `catalog_solver.py` caso por caso, y varios (recortador con dos límites, Zener en peor caso) necesitan justamente la capacidad de "un bloque con varios requisitos sin `connections`" que este slice descubrió que **todavía no es medible** (ver nota abajo). Autorearlos a ciegas arriesgaba valores de referencia incorrectos; queda como trabajo de seguimiento, no de este slice.

**Descubrimiento que limita la cobertura futura de Slice C:** un bloque
`catalog` **sin** `connections` sigue produciendo una sola medición por
plantilla (lo que su propio `.control` calcula, vía `wrdata`/`echo $&var`) —
el vocabulario de medidas de Slice B (`measurement_commands`,
`assemble_composed_netlist`) solo se invoca desde el ensamblador de
composición. Un caso como el Zener del diseño ("9 V con carga ≤ 50 mA", dos
requisitos sobre el MISMO bloque sin conexiones) no es medible hoy: haría
falta extender el camino no compuesto para que también use el vocabulario de
B1, o forzar cualquier bloque con 2+ requisitos por el ensamblador aunque no
tenga conexiones. Ninguna de las dos está hecha; es la limitación más
concreta que queda para retomar Slice C.

## Post-mortem: bugs reales encontrados probando la app en vivo (2026-09-28)

Tras cerrar A/B/C, se probó la app real (`docker` local: `spice-agents-1`,
`spice-server-1`, `spice-client-1`) con pedidos en lenguaje natural, no solo
con el banco estructurado. Dos hallazgos distintos:

**1. No es un bug de esta sesión — un `circuit_id` que falta.** "Diseña un
circuito con un diodo que rectifique... obteniendo únicamente los
semiciclos positivos" no tiene equivalente en el catálogo: `diode_clipper`
(recortar) y `diode_clamper` (desplazar nivel DC) no son un rectificador. El
orquestador fuerza el pedido a `diode_clipper` con `v_recorte: 0`, cuya
métrica `vclip` nunca puede alcanzar el objetivo de 10 V que el propio LLM
le puso — rechaza tras 5 iteraciones, siempre. Preexistente, no relacionado
con Slice A/B/C. Aparte, la UI mostraba el mensaje genérico "No pudimos
ejecutar el diseño" en vez del motivo real ("goals not met after 5
iterations") — un llamado directo y sin streaming a `/runs` sí devuelve el
motivo legible, así que el problema está en cómo el cliente/servidor
consume el streaming SSE de `/runs`, no en agents. No investigado más:
ninguno de los dos es de este slice.

**2. Bugs reales de Slice B, encontrados y arreglados:** al pedir en
lenguaje natural un filtro pasa-altas seguido de un amplificador (el caso
que Slice B sí sabe resolver), fallaba con
`unknown measure 'fc'; must be one of [...]`. Tres problemas en cadena,
los tres en `escritura/composition.py`/`escritura/measurements.py`/
`orquestador/schema.py`:

- El orquestador (LLM) no tiene ninguna descripción de campo que le diga que
  `Requirement.measure` debe salir del vocabulario cerrado de B1 cuando el
  bloque es parte de una composición — sigue usando nombres libres ("fc",
  "gain") como en el camino sin componer. **Fix:** `MEASURE_ALIASES` en
  `measurements.py` normaliza los sinónimos obvios (fc→fc_-3db, gain→
  gain_at_freq, vout→dc, etc.) antes de exigir el vocabulario cerrado, y se
  agregaron descripciones a `Requirement.measure`/`.node` y a
  `CircuitSpec.connections` para que el LLM tenga más chance de acertar
  directamente.
- `Requirement` no declaraba `frequency_hz` como campo — Pydantic lo
  descartaba en silencio (extra ignorado por default), así que
  `gain_at_freq` nunca recibía la frecuencia que el LLM sí intentaba mandar.
  **Fix:** se agregó `frequency_hz: float | None = None` al modelo.
- El orquestador manda `connections` como pares de solo id de bloque (`["hp",
  "amp"]`), no `"hp.vout"`/`"amp.vin"` como asumía
  `assemble_composed_netlist`, y reventaba con
  `ValueError: not enough values to unpack`. **Fix:** `_split_port` en
  `composition.py` acepta ambas formas, completando el puerto por default
  (`vout`/`vin`) cuando falta — hoy solo se soporta esa forma de cadena de
  todos modos, así que no es ambiguo.
- El ensamblador nunca emitía el dispositivo `V__measure` que
  `measure_dc`/`measure_current` (Slice B) necesitan para su barrido de un
  solo punto — solo existía en el netlist de prueba escrito a mano del test
  aislado, nunca en el netlist real que arma `assemble_composed_netlist`.
  **Fix:** se agrega `V__measure __measure 0 0` como dispositivo fijo del
  diseño compuesto (inerte si ningún requisito lo usa).

**Limitación real que queda sin resolver, encontrada en el mismo caso:** la
fuente de cabeza de cadena que arma el ensamblador es
`V{id}_in {id}_vin 0 DC 0 AC 1` — sirve para medidas en dominio AC
(`fc_-3db`, `gain_at_freq`), pero no tiene ninguna forma de onda transitoria
ni sesgo DC real, así que `max`/`min`/`peak_to_peak`/`ripple` (que corren
`.tran`) y `dc`/`current` miden 0 en cualquier circuito compuesto hoy — no
hay nada que medir. En el caso probado, el LLM eligió `dc` para "amplificar
con ganancia 5" (debería haber sido `gain_at_freq`), así que el síntoma
observado fue ese, pero el problema de fondo es más amplio: el ensamblador
compuesto solo sostiene mediciones en dominio AC por ahora. Extenderlo
exigiría que la fuente de cabeza cargue la forma de onda/sesgo que el
diseño realmente pide, no un `DC 0 AC 1` fijo — trabajo futuro, no de esta
sesión.

**3. Bug preexistente encontrado y arreglado — polarización BJT nunca
convergía.** "Diseña un circuito de polarización para un transistor BJT NPN
con VCC=12V, IC≈2mA, VCE≈6V" (`bjt_voltage_divider`, un solo bloque, sin
composición — nada que ver con Slice A/B/C) rechazaba siempre tras 5
iteraciones, con la recompensa empeorando en cada una. Dos bugs distintos,
ninguno introducido por esta sesión, ambos confirmados simulando a mano en
ngspice antes de tocar código:

- `calculo/catalog_solver.py::solve_bjt_voltage_divider` tenía `RB1`/`RB2`
  **invertidas** (`rb1 = r_th*vcc/(vcc-v_th)`, debía ser
  `r_th*vcc/v_th`, y viceversa) — sobrepolarizaba la base entregando un
  Thevenin de ~9.8 V en vez de ~2.2 V, saturando el transistor (VCE≈0.05 V
  en vez de ~6 V) sin importar qué tan bien resuelto estuviera todo lo
  demás. La función hermana `solve_bjt_common_emitter_amp`, a dos
  topologías de distancia en el mismo archivo, ya tenía la fórmula
  correcta — sirvió de confirmación independiente del bug.
- Con la fórmula corregida, el punto de partida ya caía cerca del objetivo
  (9.3 V contra 6 V), pero el curador seguía sin converger: `curador/
  policy.py::_adjust_catalog`'s rama `"RC" in new_values` escalaba `RC` por
  `target/actual` (la regla correcta para R2/Rf, donde más resistencia
  SUBE la salida) — pero en un divisor de polarización BJT, VCEQ **baja**
  al subir RC (más caída de tensión en el colector), así que esa regla
  empujaba en la dirección que empeora el error, cada iteración un poco
  peor. Se cambió esa rama a `RC / ratio` (misma dirección que la rama
  RZ/R-con-C, que también es inversa).

Con ambos fixes, el mismo pedido converge en 2 iteraciones (VCE medido
6.32 V contra el objetivo de 6.0 V, aceptado).

---

## Notas para quien retome Slice B/C

- El shape de `normalized_spec` después de Slice A es `{"blocks": [{"id", "type", "params", "requirements": [...]}, ...], "max_iterations", "connections": []}`. `connections` existe pero está vacía en la práctica: nada la puebla (el orquestador no la extrae todavía) ni la consume (no hay ensamblador todavía).
- `curador/policy.evaluate_requirement` ya soporta `le`/`ge` aunque Slice A solo los ejercita en tests unitarios — ningún camino real produce hoy un requisito que no sea `approx`, porque el orquestador todavía no extrae comparadores de lenguaje natural. Slice B es quien primero los ejercita end-to-end.
- El ajuste multi-requisito de un bloque `catalog` (Task 4, Step 3 de Slice A) es una limitación conocida: elige el peor requisito, no resuelve el sistema completo. Si el criterio de terminado 4 del diseño ("recalibra solo la consigna del requisito que falló") necesita algo más fino que "el peor gana", es trabajo de Slice B/C, marcado con `TODO(slice-b/c)` en `curador/node.py`.
