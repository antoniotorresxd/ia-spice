# AGENTS.md

Guidance for coding agents working in this repository.

> **`CLAUDE.md` in this same directory is the single source of truth** for architecture,
> module patterns and gotchas. Read it. This file used to duplicate that content and the
> two silently drifted apart until they contradicted each other on something as basic as
> whether `project/` is a workspace — so it now carries only orientation plus the pointer.

## Repository layout

- `project/` — the software. **`project/` is a Bun workspace** (`workspaces: ["apps/*"]`)
  covering `apps/server` (Hono API) and `apps/client` (Vite/React): one `project/bun.lock`,
  one shared `project/node_modules`, installed with a single `bun install` from `project/`.
  `apps/agents` is outside the workspace — a separate Python 3.12 / LangGraph project
  managed with `uv`.
- `tesina/` — a LaTeX thesis (Spanish-language academic document). Unrelated to the app
  code; only touch it when asked about the thesis.

Design docs live in `docs/superpowers/specs/` and implementation plans in
`docs/superpowers/plans/`, both at the repo root (not under `project/`).

## Commands

From the workspace root (`project/`):

```
bun install
bun run dev                 # server + client together, via concurrently
bun run dev:server
bun run dev:client
bun run typecheck:server
bun run build:server-types  # regenerate the RPC types the client imports
bun run build:client
bun run test:client
bun run lint:client
```

`bun run dev` prefixes each line with `[0]`/`[1]` — that is `concurrently`, not an error.

Per app:

```
# project/apps/server
bun run dev            # bun run --hot src/index.ts
bun test               # add RUN_DB_TESTS=1 TEST_USER_ID=<real-id> for the DB tests
bun run typecheck
bun run build:types
bun run db:generate    # after editing any *.model.ts
bun run db:migrate | db:push | db:studio | db:drop

# project/apps/client
bun run dev | build | test | lint | preview

# project/apps/agents
uv sync
uv run pytest
uv run --env-file .env pytest    # uv does not load .env on its own
uv run uvicorn agents.api:app --port 8000   # HTTP entrypoint (POST /runs, GET /health)
```

`ngspice` must be on `PATH` — it is a system dependency (`sudo apt install ngspice`), not
installed by `uv`, and the tests execute the real binary end to end with no mocks.

## Conventions that are easy to violate

- **Never run database commands.** The maintainer runs `db:generate`, `db:migrate` and
  `db:push` himself. Write the `*.model.ts` schema, then stop and say which command is due.
- **Do not use git worktrees.** Work directly on the current branch.
- After changing server routes, regenerate the client's types (`bun run build:server-types`)
  or the client keeps typechecking against the old API.
- Hono only carries a route into `AppType` if its router is built as a **single chained
  expression**; separate `router.get(...)` statements work at runtime but stay invisible to
  the client's types.
- The `neon-http` driver does not support interactive transactions; multi-insert operations
  (e.g. creating a `workspace` conversation) run as sequential inserts, not inside a
  transaction.

Everything else — pipeline architecture, the `llm` module's invariants, LLM-provider
gotchas — is in `CLAUDE.md`.
