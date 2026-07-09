# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo has two unrelated parts:

- `project/apps/` — the actual software: a `server` (Hono API), a `client` (Vite/React app), and `agents` (a Python/LangGraph agent pipeline). There is no root `package.json`/workspace config — each app is managed independently with its own lockfile.
- `tesina/` — a LaTeX thesis (Spanish-language academic document, "cronograma", "edo-art", "main"). Unrelated to the app code; only touch it when asked about the thesis.

## Commands

All commands are run from within `project/apps/server`, `project/apps/client`, or `project/apps/agents` respectively — there is no root script that runs any of them together.

### Server (`project/apps/server`)
Uses **Bun** as the runtime and package manager (a `pnpm-lock.yaml` also exists but is stale/unused — use `bun`, not `pnpm`, here).

```
bun install
bun run dev          # bun run --hot src/index.ts
bun run db:generate   # drizzle-kit generate — after editing any *.model.ts
bun run db:migrate    # drizzle-kit migrate
bun run db:push       # drizzle-kit push (schema push without migration files)
bun run db:studio     # drizzle-kit studio
bun run db:drop       # drizzle-kit drop
```

No lint/test scripts are defined for the server.

### Client (`project/apps/client`)
Standard Vite/React/TypeScript app (npm-based).

```
npm install
npm run dev       # vite
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # vite preview
```

No test script is defined. The client is currently the unmodified Vite React-TS template (default counter demo in `App.tsx`) and is **not yet wired to the server** — no proxy config in `vite.config.ts`, no `VITE_API_*` env vars, no auth client calls exist yet.

### Agents (`project/apps/agents`)
A separate **Python 3.12** project managed with **uv** — unrelated to the Bun/Hono server or the Vite client, and not wired to either yet.

```
uv sync
uv run pytest
```

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`) — the `shell` node shells out to it directly.

Architecture: a LangGraph `StateGraph` (`src/agents/graph.py`, `build_graph()`) with two nodes over a shared `CircuitState` (`src/agents/state.py`) — `escritura` generates a PySpice-based netlist from a circuit spec, and `shell` runs it through the real `ngspice` binary as a subprocess and parses simulated metrics from its output. The graph is compiled with a `MemorySaver` checkpointer. Code lives under `src/agents/` (`escritura/`, `shell/`, `graph.py`, `state.py`), with tests in `tests/`.

## Server architecture

Built on **Hono** (`@hono/zod-openapi`'s `OpenAPIHono`) with **better-auth** for authentication and **Drizzle ORM** over Neon serverless Postgres.

- `src/index.ts` — entrypoint; `Bun.serve({ port: env.PORT, fetch: app.fetch })`.
- `src/app.ts` — builds the app via `createApp()`, calls `configureOpenAPI(app)`, mounts the routes array (currently `[authRouter]`).
- `src/lib/create-app.ts` — exports `createRouter()` (bare `OpenAPIHono` factory, `strict: false`) used by every module to build its own sub-router, and `createApp()` which chains global middleware in order: `requestLogger` → CORS (`env.CORS_ALLOWED_ORIGINS`, `credentials: true`) → `sessionMiddleware`, plus JSON `notFound`/`onError` handlers.
- `src/lib/configure-open-api.ts` — registers `/doc` (OpenAPI 3.0 spec) and `/reference` (Scalar UI), pulling in both the app's own `/doc` and better-auth's `/api/auth/open-api/generate-schema`.
- `src/lib/env.ts` — Zod-validated env schema; process exits on invalid env. Key vars: `PORT`, `DATA_BASE_URL`, `DATA_BASE_URL_POOL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`, `CORS_ALLOWED_ORIGINS` (comma-separated, split into an array).
- `src/lib/types.ts` — `AppBindings` types Hono's `Variables` as `user`/`session` (inferred from `auth.$Infer.Session`); `AppOpenAPI` / `AppRouteHandler<R>` are the generic types every OpenAPI route handler should use.
- `src/middleware/session.ts` — `sessionMiddleware` calls `auth.api.getSession()` and populates `user`/`session` context vars (or nulls) on every request; `requireAuth` is a separate guard middleware that 401s if no user is present. Mount `requireAuth` per-route/router, not globally.
- `src/middleware/request-logger.ts` — logs method/path/status/timing.

### Module pattern

Feature code lives under `src/modules/<name>/` with a consistent 3-file shape, illustrated by the only existing module, `auth`:

- `<name>.model.ts` — Drizzle pg table definitions. `drizzle.config.ts` globs schema from `./src/**/*.model.ts`, so a new module's tables are picked up automatically just by naming the file this way — nothing to register manually.
- `<name>.services.ts` — business logic / library setup (e.g. `auth.services.ts` configures `betterAuth()` with `drizzleAdapter`, cookie settings, and plugins).
- `<name>.index.ts` — exports the module's Hono router (e.g. `authRouter`), built with `createRouter()` from `lib/create-app.ts`. Add new routers to the array in `src/app.ts`.

`src/db/schema.ts` is just an aggregator that re-exports each module's `*.model.ts` — it is not where you define tables.

### Auth specifics

better-auth is mounted at `/api/auth/*` via a catch-all in `auth.index.ts` that forwards `c.req.raw` to `auth.handler`. Email+password auth is enabled with `autoSignIn`; cookies use `sameSite: lax` and `secure` in production. Plugins in use: `openAPI()` and `dash()` (from `@better-auth/infra`).

DB tables (`auth.model.ts`) follow the standard better-auth shape: `user`, `session`, `account`, `verification`, with FK cascades and indexes on `userId`/`identifier`.
