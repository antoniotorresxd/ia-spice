# Agents Escritura→Shell Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal LangGraph `StateGraph` in `project/apps/agents` with two real nodes — `escritura` and `shell` — chained in sequence (`escritura → shell → END`), that generates a PySpice netlist for a fixed voltage-divider circuit, runs it through real `ngspice` in batch mode, and returns the simulated output voltage in shared state.

**Architecture:** `escritura` builds a `PySpice.Spice.Netlist.Circuit`, serializes it to a `.cir` file with an appended `.control`/`wrdata`/`.end` block. `shell` runs `ngspice -b <file>` as a subprocess and parses the resulting `wrdata` output file for the requested node voltage. Both are plain Python functions wrapped as LangGraph nodes operating on a shared `CircuitState` TypedDict, wired into a `StateGraph` compiled with `MemorySaver`. No LLM, no RL, no DB — see `docs/superpowers/specs/2026-07-08-agents-escritura-shell-slice-design.md` for the full design and out-of-scope items.

**Tech Stack:** Python 3.12, `uv` (project already created at `project/apps/agents`), `langgraph`, `pyspice`, `pytest`, `ngspice` (system binary, confirmed installed: ngspice-42).

## Global Constraints

- Project root for all work: `project/apps/agents` (already initialized with `uv init`; `pyproject.toml` already has `langchain`, `langgraph`, `pyspice` as dependencies and `pytest` as a dev dependency — do not re-add them).
- Run all commands from `project/apps/agents` using `uv run ...` (do not invoke `python`/`pytest` directly — use `uv run pytest`, `uv run python`, etc. so the project's venv is used).
- No mocks for ngspice: `test_shell.py` and `test_graph.py` must invoke the real `ngspice` binary.
- Shell agent executes ngspice via `subprocess`, not PySpice's `NgSpiceShared` API (see design doc rationale).
- On simulation failure, the `shell` node must write to `sim_error` in state instead of raising — the graph must always reach `END`.
- Test circuit for this slice: resistive voltage divider, `v_out = v_in * r2 / (r1 + r2)`.

---

## File Structure

```
project/apps/agents/
  src/
    agents/
      __init__.py
      state.py               # CircuitState TypedDict
      graph.py                # builds + compiles the StateGraph
      escritura/
        __init__.py
        netlist.py            # build_voltage_divider_netlist()
        node.py                # escritura_node()
      shell/
        __init__.py
        ngspice_runner.py     # run_ngspice(), parse_wrdata_scalar()
        node.py                # shell_node()
  tests/
    __init__.py
    test_netlist.py
    test_ngspice_runner.py
    test_graph.py
```

---

### Task 1: Project package scaffolding and `CircuitState`

**Files:**
- Create: `project/apps/agents/src/agents/__init__.py` (empty)
- Create: `project/apps/agents/src/agents/state.py`
- Create: `project/apps/agents/tests/__init__.py` (empty)
- Modify: `project/apps/agents/pyproject.toml` (add `[tool.pytest.ini_options]` and package config so `src/` is importable)

**Interfaces:**
- Produces: `agents.state.CircuitState` (TypedDict) — used by every later task.

- [ ] **Step 1: Configure the package layout in `pyproject.toml`**

Read the current file first, then apply this exact change — add a build-system/package section so `agents` is importable as a package rooted at `src/`, and a pytest config section:

```toml
[project]
name = "agents"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "langchain>=1.3.12",
    "langgraph>=1.2.8",
    "pyspice>=1.5",
]

[dependency-groups]
dev = [
    "pytest>=9.1.1",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/agents"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: Create empty package init files**

Create `project/apps/agents/src/agents/__init__.py` with empty content.
Create `project/apps/agents/tests/__init__.py` with empty content.

- [ ] **Step 3: Write `state.py`**

```python
# project/apps/agents/src/agents/state.py
from typing import TypedDict


class CircuitState(TypedDict):
    circuit_spec: dict

    netlist_path: str | None
    netlist_text: str | None

    raw_output_path: str | None
    metrics: dict | None
    sim_error: str | None
```

- [ ] **Step 4: Verify the package installs and imports**

Run: `cd project/apps/agents && uv sync`
Expected: completes with no errors, installing `agents` itself in editable mode.

Run: `cd project/apps/agents && uv run python -c "from agents.state import CircuitState; print(CircuitState)"`
Expected: prints the TypedDict, no import errors.

- [ ] **Step 5: Commit**

```bash
cd project/apps/agents
git add pyproject.toml uv.lock src/agents/__init__.py src/agents/state.py tests/__init__.py
git commit -m "feat(agents): scaffold package layout and CircuitState"
```

---

### Task 2: Escritura — netlist generation

**Files:**
- Create: `project/apps/agents/src/agents/escritura/__init__.py` (empty)
- Create: `project/apps/agents/src/agents/escritura/netlist.py`
- Test: `project/apps/agents/tests/test_netlist.py`

**Interfaces:**
- Consumes: nothing from other tasks (only stdlib + pyspice).
- Produces: `agents.escritura.netlist.build_voltage_divider_netlist(v_in: float, r1: float, r2: float) -> str` — returns full `.cir` text including the `.control`/`wrdata`/`.end` block, requesting `v(vout)`. Used by Task 3 (`node.py`) and indirectly by Task 4 tests.

- [ ] **Step 1: Write the failing test**

```python
# project/apps/agents/tests/test_netlist.py
from agents.escritura.netlist import build_voltage_divider_netlist


def test_build_voltage_divider_netlist_contains_component_values():
    netlist = build_voltage_divider_netlist(v_in=5.0, r1=1000, r2=2000)

    assert "5.0" in netlist
    assert "1000" in netlist
    assert "2000" in netlist


def test_build_voltage_divider_netlist_requests_vout_control_block():
    netlist = build_voltage_divider_netlist(v_in=5.0, r1=1000, r2=2000)

    assert ".control" in netlist
    assert "wrdata" in netlist
    assert "v(vout)" in netlist
    assert ".endc" in netlist
    assert netlist.strip().endswith(".end")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd project/apps/agents && uv run pytest tests/test_netlist.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.escritura'`

- [ ] **Step 3: Write minimal implementation**

```python
# project/apps/agents/src/agents/escritura/netlist.py
from PySpice.Spice.Netlist import Circuit


def build_voltage_divider_netlist(v_in: float, r1: float, r2: float) -> str:
    """Build a resistive voltage-divider netlist ready for ngspice batch mode.

    Appends a .control block that runs an operating-point analysis and
    writes v(vout) via wrdata, so the caller only needs to run
    `ngspice -b` on the returned text and read the wrdata output file.
    """
    circuit = Circuit("Voltage Divider")
    circuit.V("input", "vin", circuit.gnd, v_in)
    circuit.R(1, "vin", "vout", r1)
    circuit.R(2, "vout", circuit.gnd, r2)

    control_block = (
        ".control\n"
        "op\n"
        "wrdata output.txt v(vout)\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block
```

Also create `project/apps/agents/src/agents/escritura/__init__.py` (empty).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd project/apps/agents && uv run pytest tests/test_netlist.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd project/apps/agents
git add src/agents/escritura/__init__.py src/agents/escritura/netlist.py tests/test_netlist.py
git commit -m "feat(agents): generate voltage-divider netlist via PySpice"
```

---

### Task 3: Escritura — LangGraph node (writes netlist to disk)

**Files:**
- Create: `project/apps/agents/src/agents/escritura/node.py`
- Test: `project/apps/agents/tests/test_netlist.py` (add a test to the existing file)

**Interfaces:**
- Consumes: `agents.escritura.netlist.build_voltage_divider_netlist` (Task 2), `agents.state.CircuitState` (Task 1).
- Produces: `agents.escritura.node.escritura_node(state: CircuitState) -> CircuitState` — reads `state["circuit_spec"]` (`{"v_in": float, "r1": float, "r2": float}`), writes `netlist_text` and `netlist_path` (a path under a temp dir) into the returned partial state dict. Used by Task 5 (`graph.py`) and Task 6 (`test_graph.py`).

- [ ] **Step 1: Write the failing test**

Append to `project/apps/agents/tests/test_netlist.py`:

```python
import os
import tempfile

from agents.escritura.node import escritura_node


def test_escritura_node_writes_netlist_file_and_state():
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = escritura_node(state)

    assert result["netlist_text"] is not None
    assert "wrdata" in result["netlist_text"]
    assert os.path.exists(result["netlist_path"])
    with open(result["netlist_path"]) as f:
        assert f.read() == result["netlist_text"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd project/apps/agents && uv run pytest tests/test_netlist.py::test_escritura_node_writes_netlist_file_and_state -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.escritura.node'`

- [ ] **Step 3: Write minimal implementation**

```python
# project/apps/agents/src/agents/escritura/node.py
import os
import tempfile

from agents.escritura.netlist import build_voltage_divider_netlist
from agents.state import CircuitState


def escritura_node(state: CircuitState) -> dict:
    spec = state["circuit_spec"]
    netlist_text = build_voltage_divider_netlist(
        v_in=spec["v_in"], r1=spec["r1"], r2=spec["r2"]
    )

    work_dir = tempfile.mkdtemp(prefix="agents-escritura-")
    netlist_path = os.path.join(work_dir, "circuit.cir")
    with open(netlist_path, "w") as f:
        f.write(netlist_text)

    return {"netlist_text": netlist_text, "netlist_path": netlist_path}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd project/apps/agents && uv run pytest tests/test_netlist.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd project/apps/agents
git add src/agents/escritura/node.py tests/test_netlist.py
git commit -m "feat(agents): add escritura LangGraph node writing netlist to disk"
```

---

### Task 4: Shell — ngspice subprocess runner and wrdata parser

**Files:**
- Create: `project/apps/agents/src/agents/shell/__init__.py` (empty)
- Create: `project/apps/agents/src/agents/shell/ngspice_runner.py`
- Test: `project/apps/agents/tests/test_ngspice_runner.py`

**Interfaces:**
- Consumes: nothing from other tasks (only stdlib; takes a netlist file path as input).
- Produces:
  - `agents.shell.ngspice_runner.run_ngspice(netlist_path: str) -> tuple[str | None, str | None]` — runs `ngspice -b <netlist_path>` in the netlist's directory, returns `(raw_output_path, error_message)`. Exactly one of the two is `None`. `raw_output_path` is the absolute path to `output.txt` (the file the netlist's `wrdata` line writes, per Task 2's `netlist.py`).
  - `agents.shell.ngspice_runner.parse_wrdata_scalar(path: str) -> float` — reads a single-row wrdata file and returns the last whitespace-separated field as `float`. Raises `ValueError` if the file is empty or malformed.
  - Both used by Task 5 (`node.py`).

- [ ] **Step 1: Write the failing tests**

```python
# project/apps/agents/tests/test_ngspice_runner.py
import os
import tempfile

import pytest

from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

VOLTAGE_DIVIDER_NETLIST = """.title Voltage Divider
Vinput vin 0 5.0
R1 vin vout 1000
R2 vout 0 2000
.control
op
wrdata output.txt v(vout)
.endc
.end
"""

BROKEN_NETLIST = """.title Broken
Rbad a b notanumber
.control
op
.endc
.end
"""


def _write_netlist(tmp_path, text, filename="circuit.cir"):
    path = os.path.join(tmp_path, filename)
    with open(path, "w") as f:
        f.write(text)
    return path


def test_run_ngspice_produces_output_file_for_valid_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    raw_output_path, error = run_ngspice(netlist_path)

    assert error is None
    assert raw_output_path is not None
    assert os.path.exists(raw_output_path)


def test_run_ngspice_returns_error_for_broken_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, BROKEN_NETLIST)

    raw_output_path, error = run_ngspice(netlist_path)

    assert raw_output_path is None
    assert error is not None


def test_parse_wrdata_scalar_reads_last_column():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)
    raw_output_path, error = run_ngspice(netlist_path)
    assert error is None

    value = parse_wrdata_scalar(raw_output_path)

    assert value == pytest.approx(5.0 * 2000 / (1000 + 2000), rel=1e-6)


def test_parse_wrdata_scalar_raises_on_empty_file():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    empty_path = os.path.join(tmp_dir, "empty.txt")
    with open(empty_path, "w"):
        pass

    with pytest.raises(ValueError):
        parse_wrdata_scalar(empty_path)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project/apps/agents && uv run pytest tests/test_ngspice_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.shell'`

- [ ] **Step 3: Write minimal implementation**

```python
# project/apps/agents/src/agents/shell/ngspice_runner.py
import os
import subprocess


def run_ngspice(netlist_path: str) -> tuple[str | None, str | None]:
    """Run ngspice in batch mode on netlist_path.

    Returns (raw_output_path, error_message); exactly one is None.
    raw_output_path points at output.txt, written by the netlist's own
    `wrdata` line into the same directory as netlist_path.
    """
    work_dir = os.path.dirname(netlist_path)
    output_path = os.path.join(work_dir, "output.txt")

    result = subprocess.run(
        ["ngspice", "-b", netlist_path],
        cwd=work_dir,
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        return None, result.stderr.strip() or "ngspice exited with non-zero status"

    if not os.path.exists(output_path):
        return None, "ngspice exited successfully but produced no output file"

    return output_path, None


def parse_wrdata_scalar(path: str) -> float:
    """Parse a single-row ngspice wrdata file and return its last column."""
    with open(path) as f:
        line = f.readline()

    parts = line.split()
    if not parts:
        raise ValueError(f"wrdata file {path} is empty or malformed")

    return float(parts[-1])
```

Also create `project/apps/agents/src/agents/shell/__init__.py` (empty).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project/apps/agents && uv run pytest tests/test_ngspice_runner.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd project/apps/agents
git add src/agents/shell/__init__.py src/agents/shell/ngspice_runner.py tests/test_ngspice_runner.py
git commit -m "feat(agents): run ngspice via subprocess and parse wrdata output"
```

---

### Task 5: Shell — LangGraph node (metrics/sim_error into state)

**Files:**
- Create: `project/apps/agents/src/agents/shell/node.py`
- Test: `project/apps/agents/tests/test_ngspice_runner.py` (add tests to the existing file)

**Interfaces:**
- Consumes: `agents.shell.ngspice_runner.run_ngspice`, `agents.shell.ngspice_runner.parse_wrdata_scalar` (Task 4), `agents.state.CircuitState` (Task 1).
- Produces: `agents.shell.node.shell_node(state: CircuitState) -> dict` — reads `state["netlist_path"]`, writes `raw_output_path` and either `metrics` (`{"v_out": float}`) or `sim_error` (`str`) into the returned partial state dict. Used by Task 6 (`graph.py`).

- [ ] **Step 1: Write the failing tests**

Append to `project/apps/agents/tests/test_ngspice_runner.py`:

```python
from agents.shell.node import shell_node


def test_shell_node_sets_metrics_for_valid_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": netlist_path,
        "netlist_text": VOLTAGE_DIVIDER_NETLIST,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = shell_node(state)

    assert result["sim_error"] is None
    assert result["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)
    assert os.path.exists(result["raw_output_path"])


def test_shell_node_sets_sim_error_for_broken_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    netlist_path = _write_netlist(tmp_dir, BROKEN_NETLIST)
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": netlist_path,
        "netlist_text": BROKEN_NETLIST,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = shell_node(state)

    assert result["metrics"] is None
    assert result["sim_error"] is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project/apps/agents && uv run pytest tests/test_ngspice_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.shell.node'`

- [ ] **Step 3: Write minimal implementation**

```python
# project/apps/agents/src/agents/shell/node.py
from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    raw_output_path, error = run_ngspice(state["netlist_path"])

    if error is not None:
        return {"raw_output_path": None, "metrics": None, "sim_error": error}

    v_out = parse_wrdata_scalar(raw_output_path)
    return {
        "raw_output_path": raw_output_path,
        "metrics": {"v_out": v_out},
        "sim_error": None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project/apps/agents && uv run pytest tests/test_ngspice_runner.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
cd project/apps/agents
git add src/agents/shell/node.py tests/test_ngspice_runner.py
git commit -m "feat(agents): add shell LangGraph node producing metrics or sim_error"
```

---

### Task 6: Wire the StateGraph end-to-end

**Files:**
- Create: `project/apps/agents/src/agents/graph.py`
- Test: `project/apps/agents/tests/test_graph.py`

**Interfaces:**
- Consumes: `agents.escritura.node.escritura_node` (Task 3), `agents.shell.node.shell_node` (Task 5), `agents.state.CircuitState` (Task 1).
- Produces: `agents.graph.build_graph()` returning a compiled LangGraph graph (compiled with `MemorySaver`), invoked with `.invoke(initial_state, config)`. This is the top-level entry point for this slice; no later task consumes it within this plan.

- [ ] **Step 1: Write the failing test**

```python
# project/apps/agents/tests/test_graph.py
import pytest

from agents.graph import build_graph


def test_graph_runs_escritura_then_shell_for_voltage_divider():
    graph = build_graph()
    initial_state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }
    config = {"configurable": {"thread_id": "test-voltage-divider"}}

    final_state = graph.invoke(initial_state, config)

    assert final_state["sim_error"] is None
    assert final_state["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)
    assert final_state["netlist_path"] is not None
    assert final_state["raw_output_path"] is not None


def test_graph_checkpoints_state_by_thread_id():
    graph = build_graph()
    initial_state = {
        "circuit_spec": {"v_in": 9.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }
    config = {"configurable": {"thread_id": "test-checkpoint"}}

    graph.invoke(initial_state, config)
    snapshot = graph.get_state(config)

    assert snapshot.values["metrics"]["v_out"] == pytest.approx(6.0, rel=1e-5)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd project/apps/agents && uv run pytest tests/test_graph.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.graph'`

- [ ] **Step 3: Write minimal implementation**

```python
# project/apps/agents/src/agents/graph.py
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.escritura.node import escritura_node
from agents.shell.node import shell_node
from agents.state import CircuitState


def build_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("escritura", escritura_node)
    builder.add_node("shell", shell_node)

    builder.set_entry_point("escritura")
    builder.add_edge("escritura", "shell")
    builder.add_edge("shell", END)

    return builder.compile(checkpointer=MemorySaver())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd project/apps/agents && uv run pytest tests/test_graph.py -v`
Expected: 2 passed

- [ ] **Step 5: Run the full test suite**

Run: `cd project/apps/agents && uv run pytest -v`
Expected: all tests across `test_netlist.py`, `test_ngspice_runner.py`, and `test_graph.py` pass (15 tests total).

- [ ] **Step 6: Commit**

```bash
cd project/apps/agents
git add src/agents/graph.py tests/test_graph.py
git commit -m "feat(agents): wire escritura->shell StateGraph with MemorySaver checkpointer"
```

---

## Self-Review Notes

- **Spec coverage:** Alcance (escritura→shell only, hardcoded spec, MemorySaver) → Tasks 1–6. Estado compartido (`CircuitState`) → Task 1. Escritura responsibilities (build + write netlist, no simulation) → Tasks 2–3. Shell responsibilities (subprocess to ngspice, no PySpice sim API, sim_error on failure without raising) → Tasks 4–5, verified by `test_shell_node_sets_sim_error_for_broken_netlist`. Layout de módulos → matches File Structure section exactly. Pruebas (escritura test without invoking ngspice, shell test against real ngspice with analytical check, end-to-end graph test) → Tasks 2, 4, 6 respectively.
- **Placeholder scan:** none found; all steps contain complete, verified code (netlist generation and ngspice batch/wrdata parsing were prototyped live against the installed ngspice-42 binary before writing this plan).
- **Type consistency:** `CircuitState` fields (`circuit_spec`, `netlist_path`, `netlist_text`, `raw_output_path`, `metrics`, `sim_error`) are used identically across Tasks 1, 3, 5, 6. `run_ngspice` and `parse_wrdata_scalar` signatures in Task 4 match their usage in Task 5's `shell_node`. `escritura_node`/`shell_node` signatures in Tasks 3/5 match their usage in Task 6's `build_graph`.
