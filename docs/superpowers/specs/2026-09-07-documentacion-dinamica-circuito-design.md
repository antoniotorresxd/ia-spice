# Documentación dinámica de circuitos vía LLM

**Fecha:** 2026-09-07
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto y problema

El `NetlistDiagram` del cliente (`project/apps/client/src/features/workspace/model/netlist-diagram.ts`) explica "qué hace el circuito" con `describeCircuit()`, una función de patrón fijo que solo reconoce 4 topologías (`voltage_divider`, `rc_lowpass`, `led_resistor`, `noninverting_amp`). El pipeline de agentes ya no está limitado a esas 4 topologías (decisión de sesión anterior: "no me gustaría limitarlo tantísimo, a que solo sepa hacer una cosa"), así que un circuito genérico cae siempre al mensaje por defecto ("no encaja en las cuatro topologías del catálogo"). Hardcodear más patrones en el cliente no escala: el árbol de topologías crece con el catálogo de circuitos que el agente puede resolver, y esa información —qué hace el circuito, qué rol cumple cada componente, qué mide la medición— ya existe en el pipeline de agentes en el momento en que el circuito queda resuelto.

Los datos estructurales del diagrama (nodos, componentes, valores, conexiones) **no** necesitan LLM: son 100% derivables del netlist SPICE y ya se calculan así (`parseNetlist`, `buildDiagram`). Lo que falta generar dinámicamente es solo la capa explicativa: resumen en lenguaje natural, tags/topología, rol de cada componente, y explicación de la medición.

## Decisiones

- **Cuándo se genera:** una sola vez, en el nodo que cierra el lazo del curador (`route_after_curador` → `"done"`), para **todos** los casos en que el lazo termina (aceptado, rechazado, iteraciones agotadas) — no solo cuando el veredicto es `accepted`. Un artifact parcial de un circuito fallido también se muestra en el visor de netlists y merece su resumen.
- **Qué LLM la genera:** un agente nuevo y propio, `documenter`, asignable desde Settings igual que `orchestrator`/`calculation`/`writer`/`curator`. No se reutiliza el LLM del curador ni del orquestador — mezclar la generación de texto libre con lógica de reglas (curador) o con la interpretación de la petición inicial (orquestador) acopla responsabilidades que hoy están separadas.
- **Qué genera exactamente:**
  - `summary: str` — reemplaza `describeCircuit()`: qué hace el circuito, en lenguaje natural.
  - `tags: list[str]` — topología/categoría corta (ej. `["filtro", "RC", "pasabajos"]`).
  - `components: dict[str, str]` — rol de cada componente real del netlist (ej. `{"R1": "limita la corriente hacia el LED"}`).
  - `measurement_explanation: str` — reemplaza `measurementText()`: qué mide el `.meas` de ese bloque, si existe.
- **Validación de la salida:** los nombres de componente que el LLM devuelva en `components` se validan contra los nombres reales parseados del netlist de ese bloque. Un nombre que no exista se descarta (no se rechaza toda la respuesta por eso).
- **Fallback si falla:** si `fetch_agent_llm` falla (no configurado, red, timeout) o la salida no pasa validación estructural, ese bloque queda con `documentation[block_id] = None`. El run **no falla** por esto — se guarda igual que hoy se guarda un circuito sin LLM de orquestador configurado. El cliente cae al `describeCircuit()`/`measurementText()` heurístico existente como respaldo visual cuando la documentación es `null` — esa función **no se borra**, pasa a ser el fallback.

## Cambios por proyecto

### 1. Agents (`project/apps/agents`)

**Nuevo módulo `agents/documentador/`:**

- `schema.py` — `CircuitDocumentation(BaseModel)`: `summary: str`, `tags: list[str]`, `components: dict[str, str]`, `measurement_explanation: str`. Sin `model_validator` de invariantes de dominio (a diferencia de `NetlistReparado`): la única validación es el filtrado de nombres de componente inexistentes, que ocurre en el nodo (necesita el netlist real, no algo que la pydantic model pueda ver por sí sola).
- `node.py` — `AGENT_ID = "documenter"`, `get_chat_model(user_id)` (mismo patrón de indirección que `orquestador`/`curador`, sustituible en tests). `documentador_node(state, config)`:
  - Por cada `block_id` en `state["normalized_spec"]["blocks"]` con netlist en `state["netlists"]`:
    - Arma el prompt con la descripción del bloque, el netlist completo, y el resultado de `state["sim_results"][block_id]` (métrica medida o error de simulación).
    - Llama a `chat_model.with_structured_output(CircuitDocumentation)`.
    - Filtra `components` a solo los nombres que existan de verdad en ese netlist (parseo simple de nombres R/C/V/D/L/X por línea, ya no PySpice — no hace falta reconstruir el netlist, solo extraer nombres).
    - Cualquier excepción (`LlmSettingsError`, fallo del modelo, `ValidationError`) se captura y ese bloque queda en `None`. Nunca propaga.
  - Devuelve `{"documentation": {block_id: dict | None, ...}}`.

**`state.py`:** nuevo campo `documentation: Annotated[dict, merge_dicts]` (mismo reducer que `netlists`/`sim_results`).

**`graph.py`:**
```
builder.add_node("documentador", documentador_node)
builder.add_conditional_edges("curador", route_after_curador, {"adjust": "sintesis", "done": "documentador"})
builder.add_edge("documentador", END)
```

**`api.py`:** el `initial_state` de `create_run` agrega `"documentation": {}`; la respuesta de `POST /runs` agrega `"documentation": final_state["documentation"]`.

**Tests:** `tests/test_documentador.py` (nodo con LLM fake vía monkeypatch, caso de éxito, caso de nombre de componente inventado filtrado, caso de `LlmSettingsError` → bloque en `None`), actualizar `tests/test_graph.py` para verificar que el grafo pasa por `documentador` antes de `END` y que `documentation` queda poblado.

### 2. Server (`project/apps/server`)

**`llm.model.ts`:** `AGENT_IDS` gana `"documenter"`. Sin migración propia (columna `agent_id` es `text` con enum a nivel de aplicación, `GET /api/llm/assignments` ya materializa filas ausentes).

**`workspace.model.ts`:** en la tabla `artifact`, 4 columnas nuevas, todas nullable:
- `summary: text("summary")`
- `tags: jsonb("tags").$type<string[]>()`
- `components: jsonb("components").$type<Record<string, string>>()`
- `measurementExplanation: text("measurement_explanation")`

Migración: `bun run db:generate` + `bun run db:migrate` desde `apps/server`.

**`workspace.runner.ts`:**
- `AgentsRunResult` gana `documentation: Record<string, { summary: string; tags: string[]; components: Record<string, string>; measurement_explanation: string } | null> | null`.
- `ArtifactDraft` gana los 4 campos (nullable).
- `toArtifactDrafts` mergea `result.documentation?.[blockId]` al draft de ese `blockId`; si es `null`/ausente, los 4 campos quedan `null`.

**`workspace.schemas.ts`:** `toConversationDetail` expone `summary`, `tags`, `components`, `measurementExplanation` en cada `file`.

**`workspace-types.ts` (tipo compartido, ver client):** `WorkspaceFile` gana los mismos 4 campos, nullable.

**Tests:** `workspace.runner.test.ts` (merge de documentation por blockId, caso `null`), `workspace.schemas.test.ts` (los 4 campos viajan en `toConversationDetail`).

### 3. Client (`project/apps/client`)

**`workspace-types.ts`:** `WorkspaceFile` gana `summary: string | null`, `tags: string[] | null`, `components: Record<string, string> | null`, `measurementExplanation: string | null`.

**`NetlistDiagram.tsx`:** nueva prop opcional `documentation?: { summary: string | null; tags: string[] | null; components: Record<string, string> | null; measurementExplanation: string | null }`.
- Resumen: `documentation?.summary ?? describeCircuit(netlist)`.
- Medición: `documentation?.measurementExplanation ?? measurementText(netlist.measurements)`.
- Tags: si `documentation?.tags` tiene items, se renderizan como chips junto al badge de nodos/componentes; si no, no se muestra esa fila (no hay tags heurísticos que inventar).
- Tabla de componentes: nueva columna "Rol", con `documentation?.components?.[e.name] ?? '—'`.
- `describeCircuit()` y `measurementText()` en `netlist-diagram.ts` **no se eliminan** — pasan a ser el fallback documentado arriba.

**`ConversationScreen.tsx`:** al renderizar cada `NetlistDiagram`, pasa `documentation={{ summary: file.summary, tags: file.tags, components: file.components, measurementExplanation: file.measurementExplanation }}`.

**Tests:** `netlist-diagram.test.ts` sin cambios (sigue probando el fallback puro). `NetlistDiagram` gana un test de render con `documentation` presente (usa el resumen/tags/roles dados, no llama a `describeCircuit`) y uno sin ella (fallback). `ConversationScreen.test.tsx` actualiza el fixture para cubrir ambos casos si hace falta.

## Fuera de alcance

- No se re-genera documentación cuando el usuario continúa la conversación sobre un circuito ya documentado salvo que el curador vuelva a correr el lazo completo (eso ya re-invoca todo el grafo, incluido `documentador`).
- No hay endpoint bajo demanda para (re)generar documentación desde el cliente.
- No se traduce/versiona la documentación generada; vive en el idioma que el LLM produzca (se le pide en español, igual que el resto de los prompts del proyecto).
