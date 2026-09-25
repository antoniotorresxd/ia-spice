import os
import re
import subprocess


def inject_curve_export(netlist_text: str) -> tuple[str, str, str, str]:
    """Inyecta un comando wrdata curve.txt en el bloque .control antes de .endc
    para capturar el vector completo de simulación (Bode o transitorio).
    """
    lower = netlist_text.lower()

    if re.search(r"\bac\s+(dec|oct|lin)\b", lower):
        analysis_type = "ac"
        x_unit = "Hz"
        y_unit = "dB"
        out_node = "vout" if "vout" in lower else "out"
        curve_cmd = f"wrdata curve.txt vdb({out_node})"
    elif re.search(r"\btran\s+", lower):
        analysis_type = "tran"
        x_unit = "s"
        y_unit = "V"
        out_node = "vout" if "vout" in lower else "out"
        curve_cmd = f"wrdata curve.txt v({out_node})"
    else:
        analysis_type = "op"
        x_unit = "nodo"
        y_unit = "V"
        out_node = "vout" if "vout" in lower else "out"
        curve_cmd = f"wrdata curve.txt v({out_node})"

    if "curve.txt" in lower:
        return netlist_text, analysis_type, x_unit, y_unit

    match = re.search(r"^[ \t]*\.endc\b", netlist_text, flags=re.IGNORECASE | re.MULTILINE)
    if match:
        idx = match.start()
        modified = netlist_text[:idx] + f"{curve_cmd}\n" + netlist_text[idx:]
        return modified, analysis_type, x_unit, y_unit

    return netlist_text, analysis_type, x_unit, y_unit


def parse_wrdata_curve(path: str, max_points: int = 100) -> list[dict[str, float]]:
    """Lee el archivo curve.txt generado por wrdata y devuelve los puntos (x, y)
    muestreados uniformemente para su visualización gráfica."""
    if not os.path.exists(path):
        return []
    points = []
    try:
        with open(path) as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        points.append({"x": float(parts[0]), "y": float(parts[-1])})
                    except ValueError:
                        continue
    except OSError:
        return []

    if not points:
        return []
    if len(points) <= max_points:
        return points

    step = (len(points) - 1) / (max_points - 1)
    sampled = [points[int(round(i * step))] for i in range(max_points - 1)]
    sampled.append(points[-1])
    return sampled


def run_ngspice(netlist_path: str) -> tuple[str | None, str | None]:
    """Run ngspice in batch mode on netlist_path.

    Returns (raw_output_path, error_message); exactly one is None.
    raw_output_path points at output.txt, written by the netlist's own
    `wrdata` line into the same directory as netlist_path.
    """
    netlist_path = os.path.abspath(netlist_path)
    work_dir = os.path.dirname(netlist_path)
    output_path = os.path.join(work_dir, "output.txt")

    # Inyectar exportación de curva si el netlist no lo tiene ya
    if os.path.exists(netlist_path):
        try:
            with open(netlist_path, "r", encoding="utf-8") as f:
                orig_text = f.read()
            mod_text, _, _, _ = inject_curve_export(orig_text)
            if mod_text != orig_text:
                with open(netlist_path, "w", encoding="utf-8") as f:
                    f.write(mod_text)
        except Exception:
            pass

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
