# ia-spice

Diseño y simulación de circuitos asistidos por IA. El repo tiene dos partes sin
relación entre sí:

- `project/apps/` — el software: `server` (API Hono), `client` (Vite/React) y
  `agents` (pipeline LangGraph en Python).
- `tesina/` — la tesina en LaTeX. No hace falta tocarla para correr la app.

`project/` es un **workspace de Bun** que cubre `apps/server` y `apps/client`: un
solo `bun.lock`, un solo `node_modules` y un `bun install` desde `project/` los
instala ambos. `apps/agents` queda fuera del workspace y se maneja con `uv`.

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| [Bun](https://bun.sh) | 1.3+ | runtime y gestor del workspace (`server` + `client`) |
| [uv](https://docs.astral.sh/uv/) | reciente | gestor de `agents` |
| Python | 3.12+ | `agents` |
| `ngspice` | cualquiera | binario del sistema, lo invoca el nodo `shell` |
| Postgres | — | una base [Neon](https://neon.tech); usa una por persona |

`ngspice` no se instala con `uv`, es dependencia del sistema:

```bash
sudo apt install ngspice
```

## Puesta en marcha

Instala una sola vez el workspace, desde `project/`:

```bash
cd project && bun install
```

Los tres pasos van en orden: el cliente y los agents apuntan al server.

### 1. Server → http://localhost:3001

```bash
cd project/apps/server && cp .env.example .env
```

Abre `.env` y rellena los valores. Los cuatro obligatorios son
`DATA_BASE_URL`, `DATA_BASE_URL_POOL`, `BETTER_AUTH_SECRET` y
`LLM_SECRETS_KEY`; el propio archivo explica cómo generar cada uno. Las dos
claves criptográficas salen de:

```bash
openssl rand -hex 32
```

`LLM_SECRETS_KEY` tiene que ser exactamente 64 caracteres hex o el server no
arranca. Después, crea el esquema y levanta:

```bash
cd project/apps/server && bun run db:migrate && bun run dev
```

El login con Google es **opcional**: si dejas `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET` sin definir, ese proveedor no se registra y queda
disponible el login con email+password.

### 2. Client → http://localhost:5173

```bash
cd project/apps/client && cp .env.example .env && bun run dev
```

Vite ya proxea `/api` hacia `http://localhost:3001`, así que en local no hace
falta tocar `VITE_API_URL`.

Atajo: desde `project/`, `bun run dev` levanta server y client a la vez con
`concurrently` (por eso cada línea sale prefijada con `[0]`/`[1]`).

### 3. Agents

```bash
cd project/apps/agents && cp .env.example .env && uv sync
```

En `.env`, `AGENTS_SERVICE_TOKEN` **tiene que ser idéntico** al del `.env` del
server: es el bearer token con el que agents consulta
`GET /api/internal/llm/agent/:agentId?userId=` para resolver qué conexión y qué
modelo le toca a cada agente. El LLM nunca se configura dentro de agents:
se da de alta desde la interfaz web, en **Configuración → Modelos y providers**,
y ahí mismo se asigna al agente **Orquestador** (hoy el único que consume LLM).

`uv` no carga `.env` por su cuenta, hay que pasárselo:

```bash
cd project/apps/agents && uv run --env-file .env pytest
```

Sin esas variables el pipeline sigue funcionando por la vía del `circuit_spec`
estructurado; lo único que se desactiva es la entrada en lenguaje natural
(`request_text`).

## Comandos

### Desde el workspace (`project/`)

```bash
bun run dev                 # server + client a la vez
bun run dev:server
bun run dev:client
bun run typecheck:server
bun run build:server-types  # regenera los tipos RPC que consume el client
bun run build:client
bun run test:client
bun run lint:client
```

### Server (`project/apps/server`)

```bash
bun run dev          # bun run --hot src/index.ts
bun run db:generate  # tras editar cualquier *.model.ts
bun run db:migrate
bun run db:push      # push del schema sin generar migracion
bun run db:studio
bun test
```

Los tests de base de datos están gateados y necesitan **las dos** variables, o se
saltan en silencio (y un test saltado no prueba nada):

```bash
RUN_DB_TESTS=1 TEST_USER_ID=<id-real-de-la-tabla-user> bun test
```

### Client (`project/apps/client`)

```bash
bun run dev
bun run build   # ojo: el prebuild ejecuta build:types del server
bun run lint
bun run test    # vitest run
```

`bun run build` corre antes `bun run --cwd ../server build:types`, así que
necesitas las dependencias del server instaladas aunque solo quieras compilar el
cliente. Si cambias rutas del server y no regeneras esos tipos, el client sigue
compilando contra la API vieja.

### Agents (`project/apps/agents`)

```bash
uv sync
uv run pytest
```

Los tests ejecutan el binario real de `ngspice` de punta a punta; no hay mocks.

## Secretos

Ningún `.env` se sube: los cuatro `.gitignore` los excluyen y solo viajan los
`.env.example`. Si añades una variable nueva, documéntala en el `.env.example`
correspondiente en el mismo commit, o romperás el clon de los demás.
