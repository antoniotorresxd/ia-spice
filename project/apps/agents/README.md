# agents

LangGraph-based agent subsystem of ia-spice: a StateGraph pipeline that validates a structured circuit spec (orquestador), computes component values per sub-block in parallel (calculo, Master-Worker), generates SPICE netlists (escritura), simulates them through the ngspice binary (shell), and iteratively accepts/adjusts/rejects results against the spec's goals (curador, rule-based policy).

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`).

Run with `uv sync && uv run pytest` from this directory.

## HTTP entrypoint

`src/agents/api.py` (FastAPI) exposes two routes: `POST /runs` and `GET /health`. `POST /runs` accepts `user_id` plus either `request_text` or `circuit_spec`, invokes the graph synchronously, and returns the final state (`verdict`, `normalized_spec`, `netlists`, `sim_results`, `component_values`, `history`, `iteration`). It is authenticated with a bearer token: the `Authorization` header must be `Bearer <AGENTS_API_TOKEN>`; if `AGENTS_API_TOKEN` is not set the route returns 503 rather than serving unauthenticated.

Run it with:

```bash
uv run uvicorn agents.api:app --port 8000
# or, to load .env:
uv run --env-file .env uvicorn agents.api:app --port 8000
```

Note on `langgraph.json`: it exists at the project root but is only for opening LangGraph Studio locally as a development/debugging tool — it plays no part in the path the server uses. This project deliberately does not use the official LangGraph Platform server (`langgraph dev` / `langgraph-api`); that package is Elastic License 2.0 and requires a commercial key in production.

## LLM configuration

The LLM used to resolve `request_text` into a `circuit_spec` is never configured directly in agents — each agent's connection and model are resolved from the server per user via `GET /api/internal/llm/agent/:agentId?userId=`, cached 60s in memory keyed by `(agent_id, user_id)`. Set `SERVER_BASE_URL` and `AGENTS_SERVICE_TOKEN` to enable the `request_text` path; without them the natural-language path is unavailable but the structured `circuit_spec` path keeps working.

Only the `orquestador` consumes an LLM today (`calculo`, `escritura` and `curador` are deterministic), so it is the `orchestrator` assignment that must be configured in the web UI for `request_text` to work.

The run's user identity travels in the LangGraph config, not in the state:

```python
graph.invoke({"request_text": "..."}, config={"configurable": {"user_id": "<user-id>"}})
```

A node only receives that config if its second parameter is annotated `RunnableConfig` — typing it `dict` silently yields `None`.

`uv` does not load `.env` on its own:

```bash
uv run --env-file .env pytest
```

There is an end-to-end test against a real server and a real provider, skipped unless configured:

```bash
SERVER_BASE_URL=http://localhost:3001 \
AGENTS_SERVICE_TOKEN=<token> \
LIVE_LLM_USER_ID=<user-id> \
uv run pytest tests/test_llm_live.py -m live_llm -v
```

### Gotchas with `openai_compatible` providers

For LM Studio / Ollama / vLLM the `baseUrl` must include the `/v1` suffix (e.g. `http://localhost:1234/v1`). Without it the OpenAI SDK posts to the server root, receives a 200 with no `choices`, and fails with a misleading `TypeError: 'NoneType' object is not iterable`.

Extraction also needs genuine tool-calling support, since it goes through `with_structured_output`. Base models without it (Gemma, for instance) return empty `tool_calls` and fail the same way. Small local models may return a well-formed spec that still violates the Pydantic constraints (e.g. `v_in: 0`); that surfaces as a clean `rejected` verdict, not a crash.

## Experimental evaluation (thesis chapter "Pruebas y Resultados")

One command runs the whole experimental design over `evaluacion/banco.yaml` (35 cases stratified by `nivel`, including 3 negative cases that must be rejected), using the conditions in `evaluacion/experimentos.yaml` (tolerance × iteration budget, commercial vs. ideal values, and repetitions of the final configuration):

```bash
uv run python -m agents.evaluacion.experimentos            # full grid, ~1 min
uv run python -m agents.evaluacion.experimentos --solo-final
```

It goes through the structured path (no LLM, deterministic) and writes to `evaluacion/resultados/<timestamp>/`:

- `filas.csv` — one row per condition × repetition × requirement, with failure mode classified by rule
- `resumen.csv` — solve rate, MAPE, iterations and time per condition and level
- `tablas.tex` — the chapter tables, ready for `\input`
- `matriz.xlsx` — the test matrix with results filled in; derived columns and summary tables are Excel formulas so every figure can be audited back to its row. Conditions that need an LLM (baseline, natural language, Franco) are left as sheets to fill by hand.

`python -m agents.evaluacion` (single run, markdown/LaTeX table) still works as before.

### Comparison against the AnalogCoder benchmark (tasks 16–22)

`evaluacion/analogcoder/` holds the board-level subset (op-amps and passives) of the public AnalogCoder benchmark (MIT): original task statements, prompt template, checkers and reference designs, unmodified. Grading appends the original checker to the circuit's PySpice code, as AnalogCoder's `gpt_run.py` does, and reports Pass@1/Pass@5 per task next to the published results (`resultados_publicados.yaml`).

It needs the ngspice **shared library** for PySpice (`sudo apt install libngspice0-dev`), besides the `ngspice` binary.

```bash
uv run python -m agents.evaluacion.analogcoder referencias                 # grader check: all 7 must pass
uv run python -m agents.evaluacion.analogcoder prompts --salida prompts/   # exact prompts, to paste in chat UIs
GOOGLE_API_KEY=... uv run python -m agents.evaluacion.analogcoder solo --proveedor google --modelo <model-id>
uv run python -m agents.evaluacion.analogcoder respuestas --carpeta respuestas/chatgpt --etiqueta "ChatGPT (web)"
uv run --env-file .env python -m agents.evaluacion.analogcoder sistema --usuario <user-id>
```

`respuestas` grades answers pasted by hand from a chat UI, one file per run named `<task>_<run>.txt`. `sistema` runs the full graph from the task statement; it needs the server (LLM assignment) and Langfuse (prompts) from `.env`, or `--proveedor/--modelo` plus that provider's API key to force a model for every agent.
