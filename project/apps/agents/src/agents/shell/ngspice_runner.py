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
