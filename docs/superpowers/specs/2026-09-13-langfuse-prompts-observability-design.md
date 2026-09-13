# Prompts en Langfuse + observabilidad del pipeline de agents

**Fecha:** 2026-09-13
**Estado:** Aprobado para implementación
**Alcance:** `project/apps/agents` únicamente

## Contexto

El pipeline de `agents` tiene 3 puntos de llamada a LLM, cada uno con su
system prompt hardcodeado como constante Python:

- `src/agents/llm/extraction.py` (`_SYSTEM_PROMPT`, línea 3) — orquestador,
  interpreta `request_text` en `ChatOutcome | ClarifyOutcome | DesignOutcome`.
- `src/agents/documentador/node.py` (`_SYSTEM_PROMPT`, línea 29) — redacta la
  documentación final de cada bloque del circuito.
- `src/agents/curador/reparacion.py` (`_SYSTEM_PROMPT`, línea 58) — repara un
  netlist "generic" que no alcanzó su meta.

Los tres construyen su chat model vía `build_chat_model` (`llm/factory.py`),
que resuelve provider/modelo/api key por usuario contra el server
(`llm/settings_client.py`, `GET /api/internal/llm/agent/:agentId?userId=`,
cache 60s). Ese mecanismo de credenciales no cambia — es un concern distinto
del contenido del prompt (credencial por usuario vs. plantilla compartida).

No hay instrumentación de observabilidad (Langfuse, LangSmith, OpenTelemetry)
en ningún punto del repo hoy — es una integración desde cero.

`langchain` ya es dependencia de `apps/agents`
(`langchain`, `langchain-anthropic`, `langchain-google-genai`,
`langchain-openai`), así que el enganche con el callback handler de Langfuse
para LangChain es directo.

## Objetivo

1. Sacar los 3 prompts del código a Langfuse, para poder iterarlos sin
   desplegar.
2. Instrumentar el pipeline con tracing completo por corrida (tokens, costo,
   spans por nodo) vía Langfuse.

## Fuera de alcance

- Generalizar `calculo`/`escritura` para que compongan fórmulas vía LLM en
  vez de una función cerrada por tipo de circuito — es un proyecto de diseño
  aparte (rediseño del Master-Worker de `calculo/`), a brainstormear después
  de este.
- Cambios en `project/apps/server` — no hace falta, `agents` habla directo
  con Langfuse (los prompts no son datos por-usuario, no hace falta que el
  server los proxee como sí hace con las credenciales de LLM).
- Editor de prompts en la UI del producto — se administran directo desde
  Langfuse.
- Parámetros configurables por agente (temperatura, etc.) desde la UI del
  producto — queda para una iteración posterior, no entra en este diseño.

## Diseño

### 1. Cliente de prompts (`src/agents/llm/prompts.py`, nuevo)

Mismo patrón que `settings_client.py`:

```python
def fetch_prompt(name: str) -> str:
    """Trae un system prompt de Langfuse por nombre.

    Cachea vía el propio SDK de Langfuse (TTL por defecto del cliente).
    Cualquier fallo (Langfuse inalcanzable, prompt inexistente) se tipa como
    PromptFetchError y nunca se propaga sin capturar fuera del nodo que lo
    llama -- mismo contrato que LlmSettingsError.
    """
```

Implementación sobre el SDK oficial `langfuse` (Python), usando
`langfuse_client.get_prompt(name, label="production")` y devolviendo
`.prompt` (texto compilado). Un módulo separado de `settings_client.py`
porque resuelve una cosa distinta (contenido de prompt vs. credencial de
modelo) contra un servicio distinto.

El label `production` es explícito y obligatorio: permite editar/probar una
versión nueva en Langfuse sin que afecte al pipeline hasta promoverla.

### 2. Dependencias y config

- Agregar `langfuse` a `pyproject.toml` de `apps/agents`.
- Agregar `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` a
  `.env.example` de `apps/agents` (si existe un `.env.example` propio; si no,
  documentar junto a `SERVER_BASE_URL`/`AGENTS_SERVICE_TOKEN` donde
  corresponda).

### 3. Migración de los 3 prompts

Ya creados en Langfuse (vía MCP, contenido idéntico al actual, cero cambio de
comportamiento el día 1), con label `production`:

- `orquestador-system` (v1)
- `documentador-system` (v1)
- `curador-reparacion-system` (v1)

### 4. Cambios en los 3 call sites

En cada uno de los tres archivos, reemplazar la constante `_SYSTEM_PROMPT`
por una llamada a `fetch_prompt("<nombre>")` en el punto donde hoy se arma el
mensaje `{"role": "system", "content": _SYSTEM_PROMPT}`. Las funciones
`get_chat_model(user_id)` existentes no cambian de forma — siguen siendo el
punto de indirección que los tests monkeypatchean.

### 5. Observabilidad (tracing completo por corrida)

En `src/agents/api.py`, `create_run` (línea ~112), se agrega el
`CallbackHandler` de `langfuse.langchain` al `config` del `invoke`:

```python
config={
    "configurable": {"user_id": body.user_id, "thread_id": thread_id},
    "callbacks": [langfuse_handler],
    "metadata": {
        "langfuse_session_id": thread_id,
        "langfuse_user_id": body.user_id,
    },
}
```

`thread_id` (= `execution_id` si se pasó, si no un UUID nuevo) se usa como
`session_id` de Langfuse: agrupa todas las llamadas LLM de una corrida del
grafo en un solo trace. Como LangGraph propaga `config` a todo nodo/llamada
LLM automáticamente, esto instrumenta las 3 llamadas sin tocar cada nodo
individualmente.

El cliente Langfuse (y el handler) se inicializan una sola vez a nivel de
proceso (mismo lifecycle que el grafo en `lifespan`), no por request.

### 6. Manejo de errores

Si Langfuse no responde al pedir un prompt: `PromptFetchError` se propaga
igual que hoy se propaga `LlmSettingsError` en cada nodo — el path LLM de ese
nodo queda deshabilitado para esa corrida (orquestador: `request_text` no
disponible, igual que sin LLM configurado; documentador: el bloque queda sin
documentación sin romper la corrida, ya es el comportamiento documentado;
curador/reparacion: la reparación LLM de ese tipo "generic" falla, mismo
efecto que sin LLM). No hay copia local de fallback de los prompts — el
prompt "real" vive en un solo lugar (Langfuse).

## Testing

- Nuevo: tests de `llm/prompts.py` mockeando el cliente de Langfuse (mismo
  estilo que los tests de `settings_client.py` con `httpx.MockTransport`, o
  monkeypatch del cliente Langfuse).
- Los 3 call sites: ningún test referencia `_SYSTEM_PROMPT` directamente hoy
  (confirmado por grep), así que los tests existentes no deberían necesitar
  cambios más allá de monkeypatchear `fetch_prompt` donde haga falta evitar
  red real.
- Verificación final: `uv run pytest`.

## Siguiente paso

Implementación delegada al subagente `langgraph` (que a su vez delega a
Codex CLI), con este documento como contexto. Verificación con
`uv run pytest`.
