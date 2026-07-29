# Llaves LLM de punta a punta

Fecha: 2026-07-29
Estado: aprobado, listo para plan de implementación

## Objetivo

Que un usuario autenticado configure sus credenciales de LLM en la interfaz, queden
cifradas en el server, y el orquestador de agents las consuma para generar. Es la
primera rebanada vertical que conecta las tres apps del repo.

Fuera de alcance: proyectos y conversaciones persistidos, entrypoint HTTP en agents,
invocación del grafo desde el server, y especialización con LLM de los agentes de
cálculo, escritura y curador.

## Vocabulario

La tesina llama "subsistema cliente" al Hono + la app web, y "subsistema servidor" al
ecosistema de agentes. En el repo los directorios usan la convención opuesta
(`apps/server` es el Hono, `apps/agents` es el pipeline Python). Este documento usa los
nombres del repo: **server** = Hono, **client** = app web, **agents** = pipeline Python.

## Estado del que se parte

| Pieza | Estado |
|---|---|
| server: `auth` | funcional |
| server: `llm` CRUD `/api/llm` | funcional, por usuario, con cifrado y un `isActive` |
| server: `/api/internal/llm/active` | existe, exige `?userId=` |
| client: `auth` | conectado al server |
| client: `settings` | UI completa contra `SettingsService` mockeado |
| client: `workspace` | UI completa contra `WorkspaceService` mockeado |
| agents: grafo LangGraph | funcional end-to-end con ngspice |
| agents: entrypoint HTTP | no existe; es una librería |

El client está construido contra dos interfaces inyectadas en `App.tsx`. Conectarlo es
implementar una de ellas sobre HTTP, sin tocar componentes.

**Solo el orquestador consume un LLM hoy** (`orquestador/node.py`). Cálculo usa fórmulas
cerradas, escritura genera PySpice de forma determinista y curador decide por reglas.

## Decisiones tomadas

1. **Asignación por agente, persistida desde ahora**, aunque solo el orquestador la lea.
   La pantalla de Settings ya ofrece configurar los cuatro agentes, y la tesina los trata
   como módulos intercambiables. Guardar la asignación ahora evita migrar datos y rehacer
   la pantalla cuando los demás agentes empiecen a usar LLM.
2. **Pull por agente**: agents pide al server la configuración del agente que le toca. Es
   el delta más chico sobre lo que existe (endpoint interno, service token y cache de 60s
   se conservan) y cada agente recibe solo la llave que va a usar. La alternativa —que el
   server empuje las configs al invocar el grafo— es más limpia a largo plazo pero
   inverificable hoy, porque el server todavía no invoca el grafo; queda como siguiente
   iteración.
3. **"Funciona" se define con dos evidencias**: un botón "Probar conexión" que da señal al
   usuario, y una prueba `live_llm` que confirma que el orquestador recibe la
   configuración del usuario correcto.
4. **La base de datos es de desarrollo**: schema limpio, sin migración de datos.

## Modelo de datos

`llm_config` se parte en dos tablas. La credencial deja de cargar el modelo y deja de
tener `isActive`.

```
llm_connection
  id, userId → user (cascade)
  label, provider, apiKeyEncrypted, keyHint, baseUrl
  lastTestedAt, lastTestStatus   -- 'ok' | 'failed' | null
  createdAt, updatedAt
  índices: (userId), unique(userId, label)

agent_llm_assignment
  id, userId → user (cascade)
  agentId          -- 'orchestrator' | 'calculation' | 'writer' | 'curator'
  connectionId → llm_connection (onDelete: SET NULL, nullable)
  model            -- text, '' cuando no hay
  createdAt, updatedAt
  índices: unique(userId, agentId), (connectionId)
```

- **`onDelete: SET NULL`** en `connectionId` porque es lo que la UI ya promete: al borrar
  una conexión el diálogo avisa que las asignaciones se quitarán y luego marca los agentes
  afectados. El schema hace cumplir lo que la pantalla dice.
- **Las asignaciones no se pre-siembran.** `GET /assignments` devuelve siempre los cuatro
  agentes: los almacenados, y los ausentes como `{connectionId: null, model: ''}`. Así no
  hay que crear filas al registrar un usuario ni migrar al agregar un quinto agente.
- **`label` no vive en la base de datos.** Es copy de la interfaz y vive en el client. El
  server habla de `agentId`.
- **`lastTestedAt` / `lastTestStatus`** existen para que el indicador de estado signifique
  algo después de recargar. Sin ellos el indicador diría "sin probar" en cada carga.

## API del server

```
GET    /api/llm/connections              lista, nunca incluye la key
POST   /api/llm/connections
PATCH  /api/llm/connections/:id
DELETE /api/llm/connections/:id
POST   /api/llm/connections/:id/test

GET    /api/llm/assignments              los cuatro agentes
PUT    /api/llm/assignments/:agentId     upsert {connectionId, model}

GET    /api/internal/llm/agent/:agentId?userId=…    service token
```

Desaparecen `POST /api/llm/:id/activate` y `GET /api/internal/llm/active`: la asignación
por agente sustituye al concepto de "una configuración activa".

En `PUT /api/llm/assignments/:agentId`, `connectionId` acepta `null` —así se desasigna un
agente— y `model` acepta `''`. Un `agentId` fuera de la lista de cuatro responde 400.

El endpoint interno conserva la forma de respuesta actual, que es la que valida el modelo
Pydantic de agents: `{provider, model, api_key, base_url}`. Responde 404 cuando el agente
no tiene asignación, cuando su `connectionId` es `null`, o cuando la conexión asignada no
tiene API key; agents trata los tres casos por el mismo camino de error.

`getActiveLlmResolved` se convierte en `getAgentLlmResolved(userId, agentId)` y sigue
siendo la única función que descifra una llave.

### Prueba de conexión

No hace una completion: **lista los modelos** del provider.

| Provider | Petición |
|---|---|
| OpenAI | `GET https://api.openai.com/v1/models`, `Authorization: Bearer` |
| Anthropic | `GET https://api.anthropic.com/v1/models`, `x-api-key` + `anthropic-version` |
| Google | `GET https://generativelanguage.googleapis.com/v1beta/models?key=…` |
| openai_compatible | `GET {baseUrl}/models`, `Authorization: Bearer` |

Valida la llave y el endpoint, no gasta tokens, y no necesita un nombre de modelo —que ya
no vive en la conexión—. Responde `200 {ok: true}` o `200 {ok: false, error}`: es un
diagnóstico, no un fallo de la petición, y el client lo pinta como estado en lugar de
tratarlo como excepción.

## Client

Nace `HttpSettingsService`, que implementa `SettingsService` y sustituye a
`mockSettingsService` en `App.tsx`. El mock se conserva: es lo que usan los tests de
componentes, y conectar el backend no debe volverlos dependientes de la red.

Cambios de tipos, forzados por lo anterior:

- `LlmConnection` gana `lastTestStatus` y `lastTestedAt`.
- `SettingsService` gana `testConnection(id): Promise<{ok: boolean; error?: string}>`.
- `AgentAssignment.label` deja de venir del servicio; `HttpSettingsService` la resuelve
  con un mapa estático `agentId → label`.

En `ModelSettingsScreen`, el indicador "Conectado" —hoy hardcodeado, se pinta siempre
aunque la llave sea inválida— pasa a tres estados reales (**sin probar / conectado /
falló**) más un botón "Probar" por fila. Es el único cambio visual de la iteración.

`ConnectionInput` declara `apiKey` y `baseUrl` como `string` no opcionales, así que el
formulario envía `''` cuando están vacíos, y el server los valida con `z.url()` y
`.min(1)`, que fallan con cadena vacía. `HttpSettingsService` omite los campos vacíos en
lugar de enviarlos.

`getProfile()` se resuelve desde la sesión de better-auth (`name`, `email`, `image` →
`avatarUrl`) y `updateProfile()` usa `updateUser`. Es lo mínimo para que el shell de
Settings deje de depender del mock; la pantalla de perfil completa no es de esta rebanada.

## Agents

`fetch_active_llm()` se convierte en `fetch_agent_llm(agent_id, user_id)`, contra
`/api/internal/llm/agent/{agent_id}?userId={user_id}`.

Esto corrige dos defectos existentes:

1. Hoy nunca se envía `userId` y el server responde 400: el puente está roto.
2. `_CACHE` usa `cache_key="default"` para todas las llamadas. Con dos usuarios, el
   primero deja su configuración cacheada durante 60 segundos **con su API key en claro**,
   y el segundo la recibe. Es una fuga entre cuentas. La clave de cache pasa a ser
   `(agent_id, user_id)`.

El `user_id` llega por el `configurable` del `RunnableConfig` de LangGraph, no por
`CircuitState`: es identidad de la corrida, no un dato del circuito. El nodo pasa a
`orquestador_node(state, config)`.

## Manejo de errores

El camino de fallo ya existe y se reutiliza: sin asignación, sin conexión asignada, sin
`user_id`, o server inalcanzable → `LlmSettingsError` → el orquestador devuelve
`_rejected("llm_settings_unavailable: …")` y el grafo termina en `END` con veredicto, sin
lanzar excepción hacia afuera. El cambio necesario es que el mensaje distinga cuál de esas
condiciones ocurrió; hoy todas se ven igual.

En el client, los fallos de red al listar ya los cubre el estado `loadError` de
`ModelSettingsScreen`, con su botón de reintento.

## Pruebas

- **Server:** servicios (upsert de asignación, resolución por agente, `SET NULL` al borrar
  una conexión), rutas, y el endpoint de prueba con `globalThis.fetch` stubeado. Los tests
  que tocan la base de datos van detrás de `RUN_DB_TESTS=1`, como el resto del proyecto.
- **Client:** `HttpSettingsService` contra `fetch` stubeado, incluido el caso de campos
  vacíos omitidos. Los tests de componentes siguen usando el mock.
- **Agents:** `httpx.MockTransport` verificando que la URL lleva `agentId` y `userId`, y un
  test explícito de que dos usuarios distintos no comparten entrada de cache —sin él, ese
  defecto reaparece—. Más la prueba `live_llm` de punta a punta.

## Criterio de terminado

1. Un usuario inicia sesión, crea una conexión con su API key y la ve listada sin que la
   llave aparezca en ninguna respuesta.
2. Pulsa "Probar" y el indicador refleja el resultado real del provider, y sigue
   reflejándolo tras recargar.
3. Asigna esa conexión y un modelo al orquestador.
4. La prueba `live_llm` de agents resuelve esa configuración para ese usuario y extrae un
   `circuit_spec` de una descripción en lenguaje natural.
5. La suite completa pasa en las tres apps.

## Nota de operación

Claude escribe los archivos `*.model.ts`; el usuario ejecuta `db:generate`, `db:migrate` o
`db:push`. El plan de implementación debe marcar de forma explícita el punto en que se
requiere esa ejecución antes de continuar.

## Siguiente iteración

No se construye ahora; queda registrada para dar continuidad.

1. **Migrar al modelo de empuje**: el server resuelve las configuraciones y las inyecta al
   invocar el grafo; agents deja de llamar de vuelta y queda sin estado, como plantea la
   tesina para el subsistema de agentes.
2. Entrypoint HTTP en agents, que hoy es solo una librería.
3. Módulo de proyectos y conversaciones en el server, más `HttpWorkspaceService` en el
   client, para reemplazar el `WorkspaceService` mockeado.
4. Especializar cálculo y curador con LLM. Hasta entonces sus asignaciones se guardan pero
   nadie las lee.
