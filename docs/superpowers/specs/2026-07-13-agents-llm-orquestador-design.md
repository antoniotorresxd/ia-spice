# Diseño: LLM en el orquestador de agents (iteración 3, lado agents)

Fecha: 2026-07-13

## Contexto

La iteración 2 dejó el pipeline completo determinista: `orquestador →
cálculo → síntesis → curador` con lazo iterativo, donde `circuit_spec` es un
dict estructurado que el caller valida contra el schema Pydantic de
`src/agents/orquestador/schema.py` (`CircuitSpec`). Ese schema se diseñó
explícitamente como "la interfaz que el futuro LLM deberá producir" — este
corte cobra esa deuda: el orquestador acepta **lenguaje natural** y usa un
LLM para convertirlo en `CircuitSpec`.

El LLM **no se configura en agents**. El server centraliza el catálogo de
providers/keys/modelos y expone únicamente el LLM activo mediante un endpoint
interno (ver spec del lado server:
`2026-07-13-server-llm-config-design.md`). Agents lo consume, construye el
chat model y lo usa; cambiar de provider es una operación del server, sin
tocar agents.

## Alcance de este corte

- Módulo `llm/` en `project/apps/agents`: cliente del endpoint interno del
  server (con cache) y factory del chat model multi-provider.
- Orquestador **dual**: nuevo campo de estado `request_text`; si viene texto,
  el LLM lo convierte a `CircuitSpec`; si viene `circuit_spec` estructurado,
  el camino actual queda intacto.
- Manejo de fallos sin excepciones: cualquier problema (server inalcanzable,
  sin LLM activo, salida inválida del LLM, timeout) termina en `verdict`
  rejected con diagnóstico.

Explícitamente fuera de alcance:

- Exponer agents por HTTP (el server aún no invoca el pipeline; los callers
  siguen siendo tests/scripts locales).
- LLM en cualquier otro nodo (curador RL, cálculo, autocorrección de netlists
  — iteraciones futuras).
- Administración del catálogo de LLMs (vive en el server).
- Streaming, conversación multi-turno, memoria del LLM.

## Contrato con el server

`GET {SERVER_BASE_URL}/api/internal/llm/active` con header
`Authorization: Bearer <AGENTS_SERVICE_TOKEN>`.

- `200`:

```json
{
  "provider": "anthropic | openai | google | openai_compatible",
  "model": "claude-sonnet-5",
  "api_key": "sk-... | null",
  "base_url": "http://localhost:11434/v1 | null"
}
```

- `404` — no hay LLM activo configurado.
- `401` — token inválido.

Env nuevos en agents (sin librería de settings; leídos con `os.environ` y un
default razonable de timeout): `SERVER_BASE_URL`, `AGENTS_SERVICE_TOKEN`.

## Módulo `llm/`

### `llm/settings_client.py`

- `ActiveLlmConfig` — modelo Pydantic del payload del contrato (validación
  estricta del JSON recibido).
- `fetch_active_llm() -> ActiveLlmConfig` — GET con `httpx` (dependencia
  nueva), timeout corto (5 s). Errores tipados: `LlmSettingsError` con motivo
  legible (conexión rechazada, 401, 404, payload inválido) — el orquestador
  los convierte en `verdict` rejected, nunca burbujean.
- Cache en memoria de proceso con TTL de 60 s: dentro de una corrida (y entre
  corridas cercanas) no se golpea al server repetidamente; al expirar se
  refetcha. La key vive solo en memoria; jamás se loggea ni se persiste.

### `llm/factory.py`

- `build_chat_model(config: ActiveLlmConfig)` — usa `init_chat_model` de
  LangChain (ya dependencia del proyecto) con el mapeo:

| `provider` | `init_chat_model` |
|---|---|
| `anthropic` | `model_provider="anthropic"`, `api_key` |
| `openai` | `model_provider="openai"`, `api_key` |
| `google` | `model_provider="google_genai"`, `api_key` |
| `openai_compatible` | `model_provider="openai"`, `base_url`, `api_key` (dummy si es null) |

- Los extras de integración (`langchain-anthropic`, `langchain-openai`,
  `langchain-google-genai`) se agregan como dependencias.

### `llm/extraction.py`

- `extract_circuit_spec(chat_model, request_text) -> CircuitSpec` — usa
  `chat_model.with_structured_output(CircuitSpec)` con un system prompt fijo
  (en español, describiendo los 3 tipos de circuito soportados, sus
  parámetros y unidades) — el LLM está forzado a emitir el schema exacto que
  el orquestador ya valida hoy.
- Si el LLM devuelve algo no parseable/inválido, se propaga como error tipado
  (`ExtractionError`) con el detalle.

## Cambios al estado y al orquestador

`CircuitState` gana un campo de entrada:

```python
request_text: str | None   # descripción en lenguaje natural (opcional)
```

`orquestador_node` decide el camino:

1. **`request_text` presente** (no vacío): resolver LLM
   (`fetch_active_llm` → `build_chat_model` → `extract_circuit_spec`) y
   obtener un `CircuitSpec`; continuar con la **misma** normalización actual
   (goals, defaults, pending_blocks). El `circuit_spec` del estado se
   sobreescribe con el dict extraído, de modo que `history`/depuración
   muestren qué entendió el LLM.
2. **Solo `circuit_spec`**: camino actual sin ningún cambio.
3. **Ninguno de los dos**: `verdict` rejected ("no input provided").

Fallos del camino LLM (settings, factory, extracción) → `verdict` rejected
con el motivo (`reason` incluye la categoría: `llm_settings_unavailable`,
`llm_extraction_failed`, etc.), el grafo llega a `END` limpiamente — la misma
filosofía de `sim_error` y del rechazo por spec inválido.

Para poder testear sin red, el chat model es **inyectable**: el nodo resuelve
el LLM a través de una función indirecta (ej. `get_chat_model()` a nivel de
módulo) que los tests pueden sustituir por un fake determinista.

## Pruebas y manejo de errores

Los 49 tests existentes no se tocan y siguen pasando (el camino estructurado
es idéntico). ngspice sigue siendo real en todos los tests que simulan; el
LLM sí se fakea en unit/integración (es una dependencia externa de red, no
una herramienta local como ngspice).

- `test_settings_client.py`: contra un servidor HTTP local fake (`httpx`
  permite `MockTransport`; sin red real): 200 → config validada; 404/401/
  timeout/JSON inválido → `LlmSettingsError` con motivo correcto; el cache
  TTL evita el segundo fetch y expira correctamente.
- `test_factory.py`: construcción del chat model para los 4 providers
  (verifica tipo/parámetros del objeto; no llama a ninguna API).
- `test_extraction.py`: con un chat model fake que devuelve un `CircuitSpec`
  fijo — verifica prompt/flujo; con un fake que lanza — `ExtractionError`.
- `test_orquestador.py` (extensión): con fake inyectado — `request_text` de
  un divisor produce `normalized_spec` correcto; fallo de settings →
  rejected con categoría correcta; sin `request_text` ni `circuit_spec` →
  rejected; los tests actuales del camino estructurado quedan intactos.
- `test_graph.py` (extensión): e2e con fake LLM + ngspice real —
  `request_text` → pipeline completo → accepted.
- E2e opcional con LLM vivo: `@pytest.mark.live_llm`, se salta si
  `SERVER_BASE_URL`/`AGENTS_SERVICE_TOKEN` no están definidos o el server no
  responde — para validación manual con el server corriendo.

## Siguientes cortes (fuera de alcance aquí, para referencia futura)

1. **API HTTP de agents**: exponer el pipeline (FastAPI o similar) para que
   el server lo invoque con el texto del usuario y el thread_id del
   workspace; cerrar el ciclo cliente → server → agents.
2. **Curador con RL** (o LLM-asistido): política aprendida usando `history`
   como señal de recompensa; la política por reglas queda como fallback.
3. **Autocorrección de netlists con LLM**: ante `sim_error` sintáctico, un
   paso de corrección del netlist antes de reintentar (≤3 intentos, como
   preveía el cronograma).
4. **Persistencia del checkpointer en BD** (Postgres) para reanudar corridas
   entre procesos.
5. **Ampliar el catálogo de circuitos** (más tipos de bloque, composición
   multi-etapa) — el prompt de extracción crece junto con el schema.
