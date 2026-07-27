# ia-spice

Diseño y simulación de circuitos asistidos por IA. El repo tiene dos partes sin
relación entre sí:

- `project/apps/` — el software: `server` (API Hono), `client` (Vite/React) y
  `agents` (pipeline LangGraph en Python).
- `tesina/` — la tesina en LaTeX. No hace falta tocarla para correr la app.

No hay workspace raíz: **cada app se instala y se corre por separado**, con su
propio lockfile.

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| [Bun](https://bun.sh) | 1.3+ | runtime y gestor del `server` |
| Node + npm | 20+ | gestor del `client` |
| [uv](https://docs.astral.sh/uv/) | reciente | gestor de `agents` |
| Python | 3.12+ | `agents` |
| `ngspice` | cualquiera | binario del sistema, lo invoca el nodo `shell` |
| Postgres | — | una base [Neon](https://neon.tech); usa una por persona |

En el server usa **`bun`, no `pnpm`**: el `pnpm-lock.yaml` que verás está
obsoleto y sin uso.

`ngspice` no se instala con `uv`, es dependencia del sistema:

```bash
sudo apt install ngspice
```

## Puesta en marcha

Los tres pasos van en orden: el cliente y los agents apuntan al server.

### 1. Server → http://localhost:3001

```bash
cd project/apps/server && cp .env.example .env && bun install
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
cd project/apps/client && cp .env.example .env && npm install && npm run dev
```

Vite ya proxea `/api` hacia `http://localhost:3001`, así que en local no hace
falta tocar `VITE_API_URL`.

### 3. Agents

```bash
cd project/apps/agents && cp .env.example .env && uv sync
```

En `.env`, `AGENTS_SERVICE_TOKEN` **tiene que ser idéntico** al del `.env` del
server: es el bearer token con el que agents consulta
`GET /api/internal/llm/active` para resolver el LLM activo. El LLM nunca se
configura dentro de agents, siempre sale del catálogo del server.

`uv` no carga `.env` por su cuenta, hay que pasárselo:

```bash
cd project/apps/agents && uv run --env-file .env pytest
```

Sin esas variables el pipeline sigue funcionando por la vía del `circuit_spec`
estructurado; lo único que se desactiva es la entrada en lenguaje natural
(`request_text`).

## Comandos por app

### Server (`project/apps/server`)

```bash
bun run dev          # bun run --hot src/index.ts
bun run db:generate  # tras editar cualquier *.model.ts
bun run db:migrate
bun run db:push      # push del schema sin generar migracion
bun run db:studio
bun test             # RUN_DB_TESTS=1 bun test añade los tests de integracion
```

### Client (`project/apps/client`)

```bash
npm run dev
npm run build   # ojo: el prebuild ejecuta build:types del server
npm run lint
npm test        # vitest run
```

`npm run build` corre antes `bun run --cwd ../server build:types`, así que
necesitas Bun y las dependencias del server instaladas aunque solo quieras
compilar el cliente.

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
