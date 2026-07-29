# agents

LangGraph-based agent subsystem of ia-spice: a StateGraph pipeline that validates a structured circuit spec (orquestador), computes component values per sub-block in parallel (calculo, Master-Worker), generates SPICE netlists (escritura), simulates them through the ngspice binary (shell), and iteratively accepts/adjusts/rejects results against the spec's goals (curador, rule-based policy).

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`).

Run with `uv sync && uv run pytest` from this directory.

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
