import os
import subprocess


def run_ngspice(netlist_path: str) -> tuple[str | None, str | None]:
    """Run ngspice in batch mode on netlist_path.

    Returns (raw_output_path, error_message); exactly one is None.
    raw_output_path points at output.txt, written by the netlist's own
    `wrdata` line into the same directory as netlist_path.
    """
    netlist_path = os.path.abspath(netlist_path)
    work_dir = os.path.dirname(netlist_path)
    output_path = os.path.join(work_dir, "output.txt")

    try:
        result = subprocess.run(
            ["ngspice", "-b", netlist_path],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return None, "ngspice timed out after 30s"
    except OSError as exc:
        # El directorio de trabajo no existe, o ngspice no está en el PATH.
        # Esta función promete devolver el error en la tupla, no lanzarlo:
        # una corrida sin ngspice instalado debe terminar como ejecución
        # fallida con un mensaje legible, no como excepción no capturada.
        return None, f"could not run ngspice: {exc}"

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


def parse_measurements(path: str) -> dict[str, dict[str, float]]:
    """Parse a composed design's output.txt into per-block measurements.

    Each requirement's `.control` section echoes one line
    `<block_id> <metric_key> <value>` (see escritura.composition). A block
    with no successful line simply has no entry — the caller decides what a
    missing measurement means, same as today's sim_error handling.
    """
    result: dict[str, dict[str, float]] = {}
    with open(path) as f:
        for line in f:
            parts = line.split()
            if len(parts) < 3:
                continue
            block_id, key, value = parts[0], parts[1], parts[-1]
            try:
                result.setdefault(block_id, {})[key] = float(value)
            except ValueError:
                continue
    if not result:
        raise ValueError(f"output file {path} has no parsable measurements")
    return result
