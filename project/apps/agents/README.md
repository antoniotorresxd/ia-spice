# agents

LangGraph-based agent subsystem of ia-spice: a StateGraph pipeline that validates a structured circuit spec (orquestador), computes component values per sub-block in parallel (calculo, Master-Worker), generates SPICE netlists (escritura), simulates them through the ngspice binary (shell), and iteratively accepts/adjusts/rejects results against the spec's goals (curador, rule-based policy).

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`).

Run with `uv sync && uv run pytest` from this directory.
