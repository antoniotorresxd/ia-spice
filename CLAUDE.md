# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo has two unrelated parts:

- `project/` — the actual software. **`project/` is a Bun workspace** (`workspaces: ["apps/*"]`) covering `apps/server` (Hono API) and `apps/client` (Vite/React): one `project/bun.lock`, one shared `project/node_modules`, installed with a single `bun install` from `project/`. `apps/agents` is outside the workspace — a separate Python/LangGraph project managed with `uv`.
- `tesina/` — a LaTeX thesis (Spanish-language academic document, "cronograma", "edo-art", "main"). Unrelated to the app code; only touch it when asked about the thesis.

Design docs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`, both at the repo root (not under `project/`).

## Commands

### Workspace root (`project/`)

```
bun install                 # installs for server + client at once
bun run dev                 # server + client together, via concurrently
bun run dev:server
bun run dev:client
bun run typecheck:server
bun run build:server-types
bun run build:client
bun run test:client
bun run lint:client
```

`bun run dev` prefixes each line with `[0]`/`[1]` — that is `concurrently`, not an error. Python commands always run from `project/apps/agents`.

### Server (`project/apps/server`)
Uses **Bun** as the runtime and package manager.

```
bun install
bun run dev          # bun run --hot src/index.ts
bun run db:generate   # drizzle-kit generate — after editing any *.model.ts
bun run db:migrate    # drizzle-kit migrate
bun run db:push       # drizzle-kit push (schema push without migration files)
bun run db:studio     # drizzle-kit studio
bun run db:drop       # drizzle-kit drop
bun test              # run the test suite
```

`bun test` runs the suite. The DB-integration tests are gated: they need **both** `RUN_DB_TESTS=1` and a `TEST_USER_ID` that actually exists in the `user` table, or they silently skip — and a skipped test proves nothing:

```
RUN_DB_TESTS=1 TEST_USER_ID=<real-user-id> bun test
```

No lint script is defined for the server.

### Client (`project/apps/client`)
Vite/React/TypeScript app, part of the `project/` Bun workspace.

```
bun run dev       # vite
bun run build     # prebuild (server build:types) then tsc -b && vite build
bun run lint      # eslint .
bun run preview   # vite preview
```

`bun run test` runs `vitest run`; `bun run test:watch` runs vitest in watch mode.

Feature folders live under `src/features/` (`auth`, `home`, `settings`, `workspace`), each with a `components/ model/ services/` shape. Every feature is built against a **service interface** injected from `App.tsx`, with both a mock and (where wired) a real HTTP implementation — that seam is what lets component tests run without network. `settings` and `workspace` are wired to the real server (`http-settings-service.ts`, `HttpWorkspaceService` with 2s polling); `home` still runs on a mock.

The client talks to the server through the Vite dev proxy (`/api` → `http://localhost:3001`) and a typed Hono RPC client in `src/lib/rpc.ts`, which imports `AppType` from the server.

**Gotcha:** those server types are generated, not live. After changing server routes run `bun run --cwd ../server build:types` (or `bun run build:server-types` from `project/`), or the client keeps typechecking against the old API. Relatedly, Hono only carries a route into `AppType` if the router is built as a **single chained expression** (see `auth.index.ts` and `llm.index.ts`); routes added as separate `router.get(...)` statements work at runtime but stay invisible to the client's types.

### Agents (`project/apps/agents`)
A separate **Python 3.12** project managed with **uv**, outside the Bun workspace. It is wired to the server for LLM configuration (see below), and also has an HTTP entrypoint (`src/agents/api.py`, FastAPI) with `POST /runs` and `GET /health`, authenticated with `AGENTS_API_TOKEN` via bearer token. Start it with `uv run uvicorn agents.api:app --port 8000`.

`langgraph.json` also exists at the project root, but it is only development tooling — config for LangGraph Studio, used to inspect the graph locally. The server does not use it. The server deliberately does **not** use the official LangGraph Platform server (`langgraph dev` / `langgraph-api`): that package is Elastic License 2.0 and requires a commercial key in production, and it would duplicate the persistence that already lives in the server's Postgres. A minimal FastAPI entrypoint was used instead.

```
uv sync
uv run pytest
uv run pytest tests/test_graph.py::test_graph_runs_escritura_then_shell_for_voltage_divider -v   # single test
uv run uvicorn agents.api:app --port 8000   # HTTP entrypoint consumed by the server
```

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`) — the `shell` node shells out to it directly. Tests exercise the real `ngspice` binary end-to-end; there are no mocks of ngspice execution anywhere in this project.

**Pipeline.** A LangGraph `StateGraph` (`src/agents/graph.py`, `build_graph()`) over a shared `CircuitState` TypedDict with merge reducers (`src/agents/state.py`):

```
orquestador → calculo → sintesis (escritura → shell) → curador ⟲
```

- `orquestador` (`src/agents/orquestador/`) — accepts either `request_text` (natural language, resolved by an LLM) or a structured `circuit_spec` dict, validated against the Pydantic schema in `orquestador/schema.py`. Both paths normalize into sub-blocks with goals.
- `calculo` (`src/agents/calculo/`) — Master-Worker subgraph, one worker per sub-block via the Send API, closed-form component formulas.
- `sintesis` — subgraph `escritura → shell`: PySpice netlist per sub-block, then the real `ngspice` binary as a subprocess, metrics keyed per block.
- `curador` (`src/agents/curador/`) — rule-based accept/adjust/reject policy. Closes the loop back to `sintesis` on adjust, bounded by `max_iterations` (default 5). **The RL policy from the thesis is not implemented yet**; today it is deterministic rules only.

Invalid specs and exhausted iterations end at `END` with a populated `verdict` rather than raising — the graph always terminates. Supported circuit types: `voltage_divider`, `rc_lowpass`, `led_resistor`. Compiled with a `MemorySaver` checkpointer (no DB persistence yet).

**LLM resolution.** Only the `orquestador` consumes an LLM today; `calculo`, `escritura` and `curador` are deterministic. The LLM is never configured inside agents: `src/agents/llm/settings_client.py` fetches it from the server per agent via `GET /api/internal/llm/agent/:agentId?userId=`, cached 60s in memory keyed by `(agent_id, user_id)`. Requires `SERVER_BASE_URL` and `AGENTS_SERVICE_TOKEN`; without them the `request_text` path is unavailable but the structured `circuit_spec` path keeps working.

The run's `user_id` travels in `config.configurable.user_id` (the LangGraph `RunnableConfig`), not in `CircuitState` — it is identity of the run, not circuit data. **Gotcha:** LangGraph only injects that config when the node's second parameter is annotated `RunnableConfig`; typing it `dict` silently yields `None`.

`uv` does not load `.env` on its own — pass it: `uv run --env-file .env pytest`.

**Gotcha (`openai_compatible` providers).** For LM Studio / Ollama / vLLM the `baseUrl` must include the `/v1` suffix (e.g. `http://localhost:1234/v1`). Without it the OpenAI SDK posts to the server root, gets a 200 with no `choices`, and fails with a misleading `TypeError: 'NoneType' object is not iterable`. Separately, `with_structured_output` needs real tool-calling support: base models without it (e.g. Gemma) return empty tool calls and fail the same way.

See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the slice-by-slice design history.

## Server architecture

Built on **Hono** (`@hono/zod-openapi`'s `OpenAPIHono`) with **better-auth** for authentication and **Drizzle ORM** over Neon serverless Postgres.

- `src/index.ts` — entrypoint; `Bun.serve({ port: env.PORT, fetch: app.fetch })`.
- `src/app.ts` — builds the app via `createApp()`, calls `configureOpenAPI(app)`, chains the module routers (currently `authRouter`, `llmRouter` and `workspaceRouter`) and exports `AppType`, the type the client's RPC client consumes.
- `src/lib/create-app.ts` — exports `createRouter()` (bare `OpenAPIHono` factory, `strict: false`) used by every module to build its own sub-router, and `createApp()` which chains global middleware in order: `requestLogger` → CORS (`env.CORS_ALLOWED_ORIGINS`, `credentials: true`) → `sessionMiddleware`, plus JSON `notFound`/`onError` handlers.
- `src/lib/configure-open-api.ts` — registers `/doc` (OpenAPI 3.0 spec) and `/reference` (Scalar UI), pulling in both the app's own `/doc` and better-auth's `/api/auth/open-api/generate-schema`.
- `src/lib/env.ts` — Zod-validated env schema; process exits on invalid env. Key vars: `PORT`, `DATA_BASE_URL`, `DATA_BASE_URL_POOL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `CORS_ALLOWED_ORIGINS` (comma-separated, split into an array), `LLM_SECRETS_KEY`, `AGENTS_SERVICE_TOKEN`, `AGENTS_BASE_URL`, `AGENTS_API_TOKEN`. `AGENTS_API_TOKEN` is the opposite direction from `AGENTS_SERVICE_TOKEN`: `AGENTS_SERVICE_TOKEN` authenticates agents→server calls (agents calling `GET /api/internal/llm/agent/:agentId`), while `AGENTS_API_TOKEN` authenticates server→agents calls (the server calling agents' `POST /runs`). Two distinct secrets on purpose.
- `src/lib/types.ts` — `AppBindings` types Hono's `Variables` as `user`/`session` (inferred from `auth.$Infer.Session`); `AppOpenAPI` / `AppRouteHandler<R>` are the generic types every OpenAPI route handler should use.
- `src/middleware/session.ts` — `sessionMiddleware` calls `auth.api.getSession()` and populates `user`/`session` context vars (or nulls) on every request; `requireAuth` is a separate guard middleware that 401s if no user is present. Mount `requireAuth` per-route/router, not globally.
- `src/middleware/request-logger.ts` — logs method/path/status/timing.

### Module pattern

Feature code lives under `src/modules/<name>/`, built from a consistent 3-file core:

- `<name>.model.ts` — Drizzle pg table definitions. `drizzle.config.ts` globs schema from `./src/**/*.model.ts`, so a new module's tables are picked up automatically just by naming the file this way — nothing to register manually.
- `<name>.services.ts` — business logic / data access (e.g. `auth.services.ts` configures `betterAuth()` with `drizzleAdapter`, cookie settings, and plugins).
- `<name>.index.ts` — exports the module's Hono router (e.g. `authRouter`), built with `createRouter()` from `lib/create-app.ts`. Chain it in `src/app.ts`.

Modules add files past those three when a responsibility deserves isolation — `llm` also has `llm.schemas.ts` (Zod validation + the public view), `llm.crypto.ts` (encrypt/decrypt) and `llm.providers.ts` (the only code that talks to external LLM providers, with an injectable `fetch` so it can be tested without network).

`src/db/schema.ts` is just an aggregator that re-exports each module's `*.model.ts` — it is not where you define tables.

**Existing modules:** `auth`, `llm` and `workspace`.

The `workspace` module holds five tables: `project`, `conversation`, `message`, `execution` and `artifact`. Artifacts hang off the conversation, not the execution, and are replaced wholesale on each new run rather than accumulated. Nothing derived is stored — preview, title and fileCount are all computed at read time. The `neon-http` driver does not support interactive transactions, so creating a conversation is three sequential `INSERT`s rather than one transaction, and `toConversationDetail` synthesizes a failed execution when one is missing (to keep the read-side consistent despite the lack of atomicity). There is a sweep (`sweepStaleExecutions`) that closes `active` executions older than ten minutes, because the server runs with `--hot` and restarts on every save, which can otherwise strand an execution mid-flight.

The `llm` module holds two tables: `llm_connection` (label, provider, encrypted API key, baseUrl, last-test result) and `agent_llm_assignment` (`agentId` → connection + model, one row per agent per user, `connectionId` nullable with `ON DELETE SET NULL`). Assignments are materialized lazily — `GET /api/llm/assignments` always returns all four agents, filling absent rows as `{connectionId: null, model: ''}`. There is no "active configuration" concept anymore.

Routes: `/api/llm/connections` (CRUD + `POST /:id/test`) and `/api/llm/assignments` under session auth, plus `GET /api/internal/llm/agent/:agentId?userId=` under service-token auth (`AGENTS_SERVICE_TOKEN`, compared with `timingSafeEqual`) consumed by agents.

Two invariants worth preserving: API keys are **never** returned by any route (`toPublicConnection` strips them, exposing only `hasKey`/`keyHint`), and decryption is confined to `llm.services.ts` — `getAgentLlmResolved` (what does this agent use?) and `getConnectionCredentials` (does this credential work?). Nothing else calls `decryptApiKey`. Connection tests validate a credential by **listing models** at the provider, which costs no tokens and needs no model name.

### Auth specifics

better-auth is mounted at `/api/auth/*` via a catch-all in `auth.index.ts` that forwards `c.req.raw` to `auth.handler`. Email+password auth is enabled with `autoSignIn`; cookies use `sameSite: lax` and `secure` in production. Plugins in use: `openAPI()` and `dash()` (from `@better-auth/infra`).

DB tables (`auth.model.ts`) follow the standard better-auth shape: `user`, `session`, `account`, `verification`, with FK cascades and indexes on `userId`/`identifier`.
