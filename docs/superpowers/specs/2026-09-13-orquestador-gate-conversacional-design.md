# Gate conversacional del orquestador — diseño

**Fecha:** 2026-09-13
**Estado:** aprobado, pendiente de plan de implementación

## Problema

Hoy `orquestador_node` (`apps/agents/src/agents/orquestador/node.py`) empuja
cualquier `request_text` directo a `extract_circuit_spec`, que usa
`with_structured_output(CircuitSpec)`: el LLM está obligado a devolver un
circuito válido con al menos un bloque completo. No existe manera de que el
LLM responda "esto no es un pedido de diseño" o "me falta información".

Consecuencias observadas:

- Un mensaje como `"hola"` fuerza al LLM a intentar producir un `CircuitSpec`,
  falla la extracción o la validación, y el nodo devuelve
  `_rejected("llm_extraction_failed: ...")`. El server mapea cualquier
  `rejected` a `execution.status = "failed"`, y la UI lo muestra como una
  ejecución fallida con "Requiere atención" — para un simple saludo.
- Un mensaje como `"diseña una fuente"` (sin voltaje, corriente, ni tipo)
  tampoco tiene forma de pedir esos datos: el LLM debe inventar valores o
  fallar. El tipo `"generic"` (escape hatch para circuitos fuera del
  catálogo curado) agrava esto porque además exige un netlist completo en la
  misma pasada.

Este spec cubre **solo** el gate conversacional y el loop de aclaración. La
ampliación del catálogo curado (~30 tipos de componentes, extracción desde
datasheets en vez de fórmulas hardcodeadas) es un proyecto aparte, a
diseñarse después de que este quede implementado.

## Diseño

### 1. Salida discriminada del orquestador

`extract_circuit_spec` deja de forzar `CircuitSpec` y resuelve un
discriminated union nuevo, `OrchestratorOutcome`, con un campo `mode`:

- **`mode: "chat"`** — la solicitud no es un pedido de diseño de circuito.
  Trae `reply: str`, una respuesta conversacional directa (ej. saludo,
  pregunta sobre qué puede hacer el sistema).
- **`mode: "clarify"`** — hay intención de diseño pero falta información
  para completar al menos un bloque. Trae:
  - `question: str` — qué falta, en lenguaje natural, dirigido al usuario.
  - `partial_spec: dict` — lo que ya se pudo inferir (tipo de circuito si
    se identificó, parámetros ya dados). Puede ser `{}` si no se identificó
    nada todavía.
- **`mode: "design"`** — hay suficiente info para intentar el diseño. Trae
  el `CircuitSpec` completo (sin cambios respecto a hoy).

Una sola llamada LLM resuelve el modo; no hay paso de clasificación previo
separado (mismo costo/latencia que hoy).

`_SYSTEM_PROMPT` (`apps/agents/src/agents/llm/extraction.py`) se reescribe
para explicar los tres modos y el criterio de cuándo usar `clarify`: falta un
parámetro numérico requerido para el tipo identificado, o no se pudo
identificar ningún tipo (curado ni genérico) a partir del texto. `generic`
solo se usa cuando ya hay suficiente info para escribir el netlist completo,
nunca como relleno cuando falta algo.

### 2. Estado del grafo y ruteo

`CircuitState` (`apps/agents/src/agents/state.py`) gana un campo:

```python
outcome: dict | None  # {"mode": "chat", "reply": str}
                       # | {"mode": "clarify", "question": str, "partial_spec": dict}
                       # | {"mode": "design"}  (transitorio; ver nota abajo)
```

`verdict` sigue siendo exclusivamente el resultado `accepted`/`rejected` del
`curador` al final del camino de diseño — no se sobrecarga con estos modos.
Cuando `mode == "design"`, `orquestador_node` escribe `normalized_spec` /
`pending_blocks` / `iteration` igual que hoy y dispara la validación de
`CircuitSpec` en el camino estructurado; `outcome` puede quedar `None` en ese
caso (el resto del pipeline no lo necesita).

`route_after_orquestador` pasa de dos ramas a tres:

```python
def route_after_orquestador(state: CircuitState) -> str:
    if state["verdict"] is not None:
        return "reject"          # error real (LLM/validación) — sin cambios
    outcome = state.get("outcome")
    if outcome and outcome["mode"] in ("chat", "clarify"):
        return "stop"
    return "continue"
```

`build_graph` (`apps/agents/src/agents/graph.py`) agrega la rama `"stop":
END` junto a las existentes `"continue": "calculo"` y `"reject": END`.

Camino `circuit_spec` estructurado (no `request_text`): sigue yendo directo
a `design`, sin pasar por el LLM de triage — ya es una entrada estructurada,
sin ambigüedad de intención que resolver.

### 3. Memoria entre turnos de aclaración

`composeRequestText` (`apps/server/src/modules/workspace/workspace.context.ts`)
hoy reinyecta el primer mensaje de usuario + `execution.normalizedSpec` de la
*última corrida completa*. Para que una ronda 2 de aclaración vea la
respuesta a la ronda 1, se generaliza a reinyectar también el `partial_spec`
de una corrida que terminó en `clarify`:

- `execution.normalizedSpec` (columna jsonb existente, sin schema fijo)
  pasa a guardar `partial_spec` cuando `outcome.mode == "clarify"`, además
  de seguir guardando el `normalized_spec` real cuando el modo fue
  `design` y terminó con veredicto.
- `composeRequestText` compone: `Solicitud original` + `Lo que ya se
  estableció` (el spec parcial o normalizado más reciente, el que haya) +
  `Nueva instrucción`.

No se toca el checkpointer de LangGraph: cada turno de conversación sigue
siendo una corrida nueva del grafo con `thread_id` propio (ver
`apps/agents/src/agents/api.py`), la continuidad conversacional vive en el
texto compuesto por el server, igual que hoy con `normalized_spec`.

### 4. Mapeo servidor → estado de ejecución

`AgentsRunResult` (`apps/server/src/modules/workspace/workspace.runner.ts`)
gana el campo `outcome` que devuelve `/runs`. Reglas nuevas:

- `outcome.mode == "chat"` → `execution.status = "completed"`,
  `summary`/mensaje de assistant = `outcome.reply`. Sin artefactos (no se
  toca la tabla `artifact`).
- `outcome.mode == "clarify"` → `execution.status = "completed"`,
  `summary`/mensaje de assistant = `outcome.question`. Sin artefactos.
  `execution.normalizedSpec` guarda `outcome.partial_spec` (para el punto 3).
- `outcome.mode == "design"` (o ausente) → camino actual sin cambios
  (`mapVerdictToStatus` sobre `verdict`).

No se agrega ningún valor a `EXECUTION_STATUSES` ni migración de Drizzle: se
reutiliza `"completed"` para chat/clarify porque la corrida no falló, solo no
produjo un circuito. El problema visual reportado (tarjeta "Fallida" /
"Requiere atención" ante un saludo) es específicamente el camino `failed`,
que se deja de pisar en estos casos. No se prevén cambios de cliente: la UI
ya sabe renderizar un turno `completed` sin archivos como una respuesta
normal de assistant.

Errores reales de LLM/extracción (red caída, respuesta inválida que no
matchea ni `chat` ni `clarify` ni `design`) se mantienen igual que hoy:
`_rejected(...)` → `verdict` con `status: "rejected"` → `failed`. Eso sigue
siendo un fallo técnico, no un desenlace conversacional.

## Testing

- **`apps/agents`**:
  - `orquestador_node` con fakes de LLM que devuelven cada uno de los tres
    modos (`chat`, `clarify`, `design`), verificando el `outcome`/`verdict`
    resultante.
  - `route_after_orquestador` con las tres ramas (`continue`/`stop`/`reject`).
  - Camino `circuit_spec` estructurado: sigue sin pasar por el LLM de triage.
- **`apps/server`**:
  - `workspace.runner.test.ts` — mapeo de `outcome.mode="chat"|"clarify"` a
    `completed` sin artefactos, y de `outcome.mode="design"` al camino
    existente sin regresión.
  - `workspace.context.test.ts` — `composeRequestText` con `partial_spec` de
    una corrida en `clarify` reinyectado en el siguiente turno.

## Fuera de alcance

- Ampliación del catálogo curado más allá de
  `voltage_divider`/`rc_lowpass`/`led_resistor`/`noninverting_amp`/`generic`.
- Extracción de parámetros de componentes desde datasheets. Spec aparte,
  a diseñar después de que este gate esté implementado y funcionando.
- Límite de rondas de aclaración (cuántas veces puede el sistema seguir
  preguntando antes de forzar un intento o abandonar). No surgió como
  problema reportado; si aparece en la práctica, se ajusta con una regla
  simple en el prompt o un contador en `partial_spec`, sin rediseño.
