# agents

LangGraph-based agent subsystem of ia-spice: a StateGraph pipeline that validates a structured circuit spec (orquestador), computes component values per sub-block in parallel (calculo, Master-Worker), generates SPICE netlists (escritura), simulates them through the ngspice binary (shell), and iteratively accepts/adjusts/rejects results against the spec's goals (curador, rule-based policy).

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`).

Run with `uv sync && uv run pytest` from this directory.

## LLM configuration

The active LLM used to resolve `request_text` into a `circuit_spec` is never configured directly in agents — it is resolved from the server's catalog via `GET /api/internal/llm/active`. To enable the `request_text` path, set `SERVER_BASE_URL` and `AGENTS_SERVICE_TOKEN` in the environment. Without these two env vars, the natural-language path is unavailable but the structured `circuit_spec` path continues to work unaffected.
