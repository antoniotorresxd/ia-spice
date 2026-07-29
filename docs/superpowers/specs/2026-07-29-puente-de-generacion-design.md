# El puente de generación

Fecha: 2026-07-29
Estado: aprobado, listo para plan de implementación

## Objetivo

Que un usuario autenticado escriba una solicitud en lenguaje natural en la interfaz web y
vea el netlist resultante, persistido y recuperable tras recargar. Es la segunda rebanada
vertical: la primera conectó las credenciales, esta conecta la generación.

Fuera de alcance, y es deliberado:

- **El curador se queda como está.** Sigue decidiendo por reglas deterministas. La política
  de RL de la tesina se retoma más adelante, junto con el RAG y la especialización con LLM
  de cálculo, escritura y curador. Lo único que hace esta iteración por él es guardar la
  traza que ya emite, para que ese trabajo futuro tenga con qué entrenar.
- **Migrar al modelo de empuje** para la configuración de LLM. Se mantiene el *pull* que ya
  funciona y está probado de punta a punta.
- **Las pantallas de Archivos y Ejecuciones**, que siguen en "Próximamente".
- **Streaming del avance nodo por nodo.** El estado de la ejecución es un enum, no un
  reporte de progreso.

## Vocabulario

La tesina llama "subsistema cliente" al Hono + la app web, y "subsistema servidor" al
ecosistema de agentes. En el repo los directorios usan la convención opuesta
(`apps/server` es el Hono, `apps/agents` es el pipeline Python). Este documento usa los
nombres del repo: **server** = Hono, **client** = app web, **agents** = pipeline Python.

## Estado del que se parte

| Pieza | Estado |
|---|---|
| server: `auth`, `llm` | funcionales, conectados al client |
| server: proyectos y conversaciones | no existen |
| client: `settings` | conectado al server real |
| client: `workspace` | UI completa contra `WorkspaceService` mockeado |
| agents: grafo LangGraph | funcional end-to-end con ngspice |
| agents: entrypoint HTTP | no existe; es una librería |
| agents: `fetch_agent_llm` (pull de LLM) | funcional, verificado con `live_llm` |

El client está construido contra interfaces inyectadas en `App.tsx`. Conectar el workspace
es implementar `WorkspaceService` sobre HTTP; los componentes no se tocan salvo para
añadir el sondeo.

## Decisiones tomadas

1. **Ejecución asíncrona con sondeo.** El server crea la ejecución en `active`, responde de
   inmediato y corre el grafo en segundo plano. El client resondea. Una corrida está
   dominada por la latencia del LLM —con un modelo local, decenas de segundos— y encima
   itera hasta cinco veces con `ngspice`. Una petición síncrona se cae por timeout y deja
   la interfaz congelada sin señal. Los tipos del client ya declaraban
   `WorkspaceExecutionStatus = 'active' | 'completed' | 'failed'`, así que la UI estaba
   diseñada esperando esto.

2. **El sondeo no añade métodos a la interfaz.** Sondear es volver a llamar a
   `getConversation(id)`. Los ocho métodos de `WorkspaceService` se quedan como están.

3. **Se implementa la interfaz completa**, no solo el camino de generación. Proyectos y
   asignación son una tabla y un `UPDATE`; lo caro es el puente. Un servicio mitad real y
   mitad mockeado obliga a decidir qué hace cuando le piden un proyecto que no está en la
   base, y es un dolor para depurar.

4. **`assignConversation` y `restoreConversationProject` son una sola ruta.** Ambas mueven
   una conversación a un proyecto o a ninguno; la segunda es el deshacer del arrastre. La
   diferencia es intención del client, no comportamiento del server.

5. **Se mantiene el *pull* de la configuración de LLM.** agents sigue preguntando al server
   por cada agente con `AGENTS_SERVICE_TOKEN`. El empuje se descartó para esta iteración:
   quitar el pull rompería el `live_llm` y todo uso de agents como librería suelta, que es
   como corren hoy las pruebas.

6. **agents se expone con FastAPI mínimo, no con LangGraph Platform.** Dos razones. La de
   licencia: el framework (`langgraph`, `langchain-core`) es MIT, pero el servidor que
   levanta `langgraph dev` es el paquete `langgraph-api`, bajo Elastic License 2.0, que
   exige clave comercial (`LANGGRAPH_CLOUD_LICENSE_KEY`) para uso en producción. La de
   arquitectura, que pesa igual: lo que LangGraph Platform aporta son threads, checkpoints
   persistentes y streaming, y la persistencia vive en el Postgres del server. Serían dos
   fuentes de verdad para lo mismo. Se añade un `langgraph.json` para poder abrir LangGraph
   Studio en local como herramienta de depuración, que es el valor que sí se aprovecha.

7. **El server compone el contexto de los seguimientos.** Un mensaje como "ahora con 3.3V"
   no significa nada aislado. El server arma el `request_text` juntando la solicitud
   original, el `normalized_spec` de la última corrida y la instrucción nueva. agents no
   cambia: sigue recibiendo un solo texto.

8. **Segundo plano con promesa suelta más barrido de huérfanas.** Sin cola ni worker: es
   infraestructura para un problema que todavía no existe. El riesgo real —el server corre
   con `bun run --hot` y se reinicia en cada guardado— se cubre marcando `failed` toda
   ejecución `active` con más de diez minutos.

9. **Se guarda el `history` del curador** en una columna jsonb de `execution`. agents ya lo
   devuelve: una fila por iteración con valores de componentes, resultados de simulación,
   evaluación por bloque, error relativo peor y la decisión tomada. Hoy ese rastro muere
   con el `MemorySaver`. Guardarlo no toca la política ni añade UI, y es exactamente el
   dataset que la política de RL necesitará.

## Arquitectura

```
client ──HTTP/cookie──▶ server ──HTTP/token──▶ agents (FastAPI)
                          │                       │
                          │                       └──token──▶ server  (pull de LLM, ya existe)
                          ▼
                       Postgres  ← única fuente de verdad
```

El server es el dueño del estado. agents queda sin persistencia propia: recibe un texto y
un `user_id`, corre el grafo, devuelve un resultado y se olvida. El `MemorySaver` sigue
sirviendo al bucle del curador dentro de una corrida, pero nada depende de él entre
corridas.

## Flujo de datos

**Solicitud nueva:**

1. El client hace `POST /api/workspace/conversations` con el texto.
2. El server, en una transacción, crea la conversación, el mensaje del usuario y una
   ejecución en `active`. Responde con el detalle de la conversación.
3. Sin esperarla, dispara la llamada a `POST /runs` de agents.
4. agents resuelve su LLM por el pull, corre `orquestador → cálculo → síntesis → curador` y
   devuelve veredicto, `normalized_spec`, netlists, `sim_results`, `component_values` e
   `history`.
5. El server escribe el mensaje del asistente, los netlists como artefactos y cierra la
   ejecución en `completed` o `failed`.
6. El client resondea `getConversation(id)` cada 2 s mientras vea `active`.

**Seguimiento:** igual, salvo que el paso 1 es `POST /api/workspace/conversations/:id/messages`
y el `request_text` que viaja a agents lo compone el server a partir del historial.

## Componentes

### Server: módulo `workspace`

`src/modules/workspace/`, siguiendo el patrón de módulos del repo.

**`workspace.model.ts`** — cinco tablas. `drizzle.config.ts` las recoge por el nombre del
archivo, sin registrar nada a mano.

| Tabla | Columnas relevantes | Borrado |
|---|---|---|
| `project` | `userId`, `name`, `description`, timestamps | cascade desde `user` |
| `conversation` | `userId`, `projectId`, `title`, timestamps | `userId` cascade; `projectId` **SET NULL** |
| `message` | `conversationId`, `role` (`user`\|`assistant`), `content`, `createdAt` | cascade |
| `execution` | `conversationId`, `status` (`active`\|`completed`\|`failed`), `summary`, `requestText`, `verdict` jsonb, `normalizedSpec` jsonb, `history` jsonb, `startedAt`, `finishedAt` | cascade |
| `artifact` | `executionId`, `blockId`, `name`, `language`, `content`, `status` (`complete`\|`partial`) | cascade |

`SET NULL` en `conversation.projectId` porque borrar un proyecto no debe borrar las
conversaciones que contenía. Índices en cada clave foránea por la que se filtra:
`conversation.userId`, `conversation.projectId`, `message.conversationId`,
`execution.conversationId`, `artifact.executionId`.

**Nada derivado se almacena.** Guardarlo sería invitar a que se desincronice. Las vistas
que consume el client se calculan al leer, y cada campo derivado tiene una sola definición:

| Campo del client | Cómo se deriva |
|---|---|
| `conversation.preview` | contenido del último mensaje, truncado |
| `conversation.title` | primer mensaje del usuario, truncado, fijado al crearse |
| `conversation.executionStatus` | `status` de la ejecución más reciente |
| `conversationDetail.execution` | la ejecución más reciente (el tipo del client es una, no una lista) |
| `conversationDetail.files` | artefactos de la ejecución más reciente que haya terminado; mientras la actual esté `active`, se siguen viendo los de la anterior en lugar de una lista vacía |
| `project.conversationIds` | conversaciones con ese `projectId`, por `updatedAt` |
| `project.fileCount` | conteo de artefactos por el join `project → conversation → execution → artifact` |

**`workspace.schemas.ts`** — validación Zod de los cuerpos y las vistas públicas que
consume el client, con la misma forma que los tipos de `workspace-types.ts`.

**`workspace.context.ts`** — una función pura:

```ts
composeRequestText(
  messages: { role: 'user' | 'assistant'; content: string }[],
  lastSpec: unknown | null,
  newText: string,
): string
```

Arma el texto del seguimiento con la solicitud original, el `normalized_spec` previo
serializado y la instrucción nueva. Pura y aislada para poder probarla sin base ni red.

**`workspace.runner.ts`** — el puente hacia agents:

- `fetch` inyectable, igual que `llm.providers.ts`, para probar sin red.
- Mapeo `verdict.status` → estado: `accepted` es `completed`, `rejected` es `failed`. Un
  circuito rechazado no es un error técnico, pero para la interfaz es un resultado fallido:
  no obtuviste un circuito. El motivo va en `summary`.
- Escritura del resultado: mensaje del asistente, artefactos, cierre de la ejecución.
- `sweepStaleExecutions()`: un `UPDATE` que marca `failed` toda ejecución `active` con
  `startedAt` de más de diez minutos. Idempotente, sin cron, invocado al leer.

**`workspace.services.ts`** — acceso a datos y composición de las vistas derivadas.

**`workspace.index.ts`** — el router, en **una sola expresión encadenada**; si se parte en
sentencias sueltas las rutas funcionan pero no entran en `AppType`. Todas bajo
`requireAuth`.

```
GET   /api/workspace/snapshot
GET   /api/workspace/projects/:id
POST  /api/workspace/projects
GET   /api/workspace/conversations/:id
POST  /api/workspace/conversations              → submitRequest
POST  /api/workspace/conversations/:id/messages → continueConversation
PATCH /api/workspace/conversations/:id/project  → assign y restore
```

Se encadena en `src/app.ts` junto a `authRouter` y `llmRouter`.

**`src/lib/env.ts`** — dos variables nuevas: `AGENTS_BASE_URL` y `AGENTS_API_TOKEN`. Ese
token es **distinto** de `AGENTS_SERVICE_TOKEN`: van en direcciones opuestas, y si se
filtra uno el otro sigue valiendo. Se documentan en `.env.example` en el mismo commit.

**Aislamiento por usuario:** toda consulta filtra por `userId`. Pedir una conversación o un
proyecto de otra cuenta responde 404, no 403 — no confirma que exista.

### agents: entrypoint HTTP

**`src/agents/api.py`** — dos rutas y nada más:

- `POST /runs`, cuerpo `{user_id, request_text?, circuit_spec?}`. Valida el bearer contra
  `AGENTS_API_TOKEN` con `secrets.compare_digest`, invoca `build_graph()` con
  `configurable.user_id` y un `thread_id` (el `MemorySaver` lo exige), y devuelve veredicto,
  `normalized_spec`, netlists, `sim_results`, `component_values`, `history` e `iteration`.
- `GET /health`.

El grafo es síncrono, así que la ruta se declara con `def` y FastAPI la ejecuta en su
threadpool. Se añaden `fastapi` y `uvicorn` a `pyproject.toml` y el comando
`uv run uvicorn agents.api:app --port 8000`.

Además un `langgraph.json` para abrir LangGraph Studio en local. Es herramienta de
desarrollo: no participa en el camino que usa el server.

El grafo, sus nodos y el curador **no se modifican**.

### Client: feature `workspace`

- **`services/http-workspace-service.ts`** — `createHttpWorkspaceService({fetchImpl})`,
  mismo patrón que `http-settings-service.ts`: `fetch` con rutas en texto y
  `credentials: 'include'`. No se usa el cliente RPC, por consistencia con el servicio real
  que ya existe.
- **Sondeo** — un hook que reconsulta `getConversation(id)` cada 2 s mientras
  `executionStatus === 'active'`, y se detiene al completar, fallar o desmontar.
- **`App.tsx`** — se inyecta el servicio real en lugar de `createMockWorkspaceService()`.
- **Paridad del mock** — hoy el mock devuelve `active` para siempre
  (`mock-workspace-service.ts:108`), lo que con sondeo gira sin fin. El mock pasa a simular
  que la ejecución termina, y hay que revisar que ningún test existente dependa de que se
  quede en `active`.

Los componentes no cambian más allá de consumir el sondeo.

## Manejo de errores

Ningún camino de fallo llega al usuario como un 500 ni como un texto crudo del proveedor.
Todos acaban en una ejecución `failed` con un `summary` legible:

| Condición | Qué ve el usuario |
|---|---|
| agents caído o responde ≠ 2xx | "No pudimos ejecutar el diseño. Inténtalo de nuevo." |
| LLM sin configurar | El grafo ya devuelve `rejected` con `llm_settings_unavailable`; el summary remite a **Configuración → Modelos y providers** |
| Spec inválido o circuito rechazado | El `reason` del veredicto, con el error relativo del mejor intento |
| Reinicio del server a media corrida | El barrido la marca `failed` a los diez minutos |
| Conversación o proyecto de otro usuario | 404 |

En el client, los fallos de red al leer se cubren con el mismo patrón de `loadError` con
reintento que ya usa `ModelSettingsScreen`.

## Pruebas

- **Server:** `composeRequestText` y el mapeo de veredicto como funciones puras, sin base ni
  red. El runner con `fetch` stubeado, cubriendo el camino aceptado, el rechazado y el de
  agents inalcanzable. El barrido de huérfanas. Las rutas. Los tests que tocan la base van
  detrás de `RUN_DB_TESTS=1` con un `TEST_USER_ID` real, como el resto del proyecto; un
  test saltado no prueba nada.
- **agents:** `TestClient` de FastAPI, sin levantar servidor. Token ausente o inválido
  rechazado; camino de `circuit_spec` estructurado, que no necesita LLM y ejercita el
  `ngspice` real; cuerpo mal formado.
- **Client:** el servicio contra `fetch` stubeado, incluidos los códigos de error. El hook
  de sondeo con temporizadores falsos: que reconsulte mientras esté `active`, que pare al
  completar y que no deje temporizadores tras desmontar. Los tests de componentes siguen
  con el mock.

## Criterio de terminado

1. Escribes "un divisor de 12V a 5V" en Nueva solicitud y la conversación aparece al
   instante, en `active`, sin esperar al grafo.
2. A los segundos, sin recargar, aparecen el netlist y el veredicto con sus métricas.
3. Recargas la página y todo sigue ahí.
4. Creas un proyecto, arrastras la conversación dentro, recargas y sigue asignada.
5. Escribes "ahora a 3.3V" en la misma conversación y la corrida nueva respeta el contexto.
6. Con el LLM sin configurar, la ejecución falla con un mensaje que te dice dónde
   configurarlo.
7. La suite completa pasa en las tres apps.

## Nota de operación

Claude escribe `workspace.model.ts`; el usuario ejecuta `db:generate` y `db:migrate`. El
plan de implementación debe marcar de forma explícita el punto en que se requiere esa
ejecución antes de continuar.

El plan se parte en dos fases con un corte natural: **fase A**, persistencia y CRUD —todo
real menos generar—; **fase B**, el puente de generación. Al terminar la fase A ya hay
software que funciona y se puede probar.

## Siguiente iteración

No se construye ahora; queda registrada para dar continuidad.

1. **El curador y la política de RL**, que hoy sigue siendo un conjunto de reglas
   deterministas. Esta iteración le deja el `history` persistido como dataset.
2. **RAG y especialización con LLM** de cálculo, escritura y curador. Hasta entonces sus
   asignaciones se guardan pero nadie las lee.
3. **Migrar al modelo de empuje**: el server resuelve las configuraciones y las inyecta al
   invocar el grafo; agents deja de llamar de vuelta y queda sin estado, como plantea la
   tesina.
4. **Streaming del avance nodo por nodo**, para mostrar el ecosistema multiagente en marcha
   en lugar de un solo estado `active`.
5. **Las pantallas de Archivos y Ejecuciones**, hoy en "Próximamente", que ya tendrían datos
   reales que mostrar.
