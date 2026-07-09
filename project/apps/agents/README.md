# agents

LangGraph-based agent subsystem of ia-spice: a `StateGraph` pipeline that generates a
SPICE netlist (`escritura` node) and runs it through the `ngspice` binary (`shell` node)
to produce simulated circuit metrics.

Requires the `ngspice` binary on `PATH` (a system dependency, not installed via `uv`).

Run with `uv sync && uv run pytest` from this directory.
