"""Calificador del subconjunto del benchmark de AnalogCoder (tareas 16-22).

Reproduce lo que hace su `gpt_run.py` con las tareas complejas: al código
PySpice del circuito se le agrega el script de verificación original de su
tipo, con `[BIAS_VOLTAGE]` y `[FIGURE_PATH]` reemplazados igual que ellos, y
se ejecuta (con `compat/sitecustomize.py`, que solo adapta PySpice 1.5 a
ngspice >= 41). La tarea pasa si el proceso termina con código 0. Los scripts de
verificación no se modifican: así el criterio de éxito es el de los autores.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

DIR = Path(__file__).resolve().parents[3] / "evaluacion" / "analogcoder"
# En su flujo con biblioteca, [BIAS_VOLTAGE] es el punto de operación DC de
# las entradas del op-amp ("The DC operating voltage for Vinn/Vinp", de
# lib_info.tsv). Aquí se toma del circuito: la fuente que fija el nodo de
# referencia del op-amp (Vinp, ref, bias, cm); si no hay, la de la entrada
# (su variante sin biblioteca, `circuit.element(vin_name).dc_value`); si
# tampoco, 0 V (op-amp referido a tierra).
PRELUDIO_SESGO = """
def _nodos(e):
    return [str(p.node).lower() for p in e.pins]
_fuentes = [e for e in circuit.elements if e.name.lower().startswith('v')]
_ref = [e for e in _fuentes if any(n == 'vinp' or 'ref' in n or 'bias' in n or n.endswith('cm') for n in _nodos(e))]
_ent = [e for e in _fuentes if any(n.startswith('vin') for n in _nodos(e))]
_elegida = (_ref or _ent or [None])[0]
_sesgo = float(str(_elegida.dc_value).lower().replace('dc', '').replace('v', '').split()[0]) if _elegida is not None else 0.0
"""


def cargar_tareas() -> list[dict]:
    return yaml.safe_load((DIR / "tareas.yaml").read_text(encoding="utf-8"))["tareas"]


def armar_script(codigo: str, tarea: dict, figura: Path) -> str:
    verificador = (DIR / tarea["verificacion"]).read_text(encoding="utf-8")
    verificador = verificador.replace("[FIGURE_PATH]", str(figura))
    preludio = ""
    if tarea["tipo"] != "Oscillator":
        verificador = verificador.replace("[BIAS_VOLTAGE]", "_sesgo")
        preludio = PRELUDIO_SESGO
    cuerpo = codigo.rstrip()
    if "simulator = circuit.simulator()" not in cuerpo:
        cuerpo += "\nsimulator = circuit.simulator()"
    script = cuerpo + "\n" + preludio + "\n" + verificador
    return script if "import math" in script else "import math\n" + script


def calificar(codigo: str, tarea: dict, *, timeout: int = 300) -> dict:
    """Ejecuta el verificador original sobre `codigo` (PySpice). Devuelve si
    pasó y la salida, para el registro de fallas."""
    with tempfile.TemporaryDirectory() as tmp:
        figura = Path(tmp) / "figura"
        script = Path(tmp) / "caso.py"
        script.write_text(armar_script(codigo, tarea, figura), encoding="utf-8")
        try:
            r = subprocess.run([sys.executable, "-u", str(script)], cwd=DIR / "referencia",
                               capture_output=True, text=True, timeout=timeout,
                               env={"MPLBACKEND": "Agg", "PYTHONPATH": f"{DIR / 'compat'}:{DIR / 'referencia'}",
                                    "PATH": "/usr/bin:/bin:/usr/local/bin"})
            return {"paso": r.returncode == 0, "codigo_salida": r.returncode,
                    "salida": (r.stdout[-1500:] + r.stderr[-1500:]).strip()}
        except subprocess.TimeoutExpired:
            return {"paso": False, "codigo_salida": None, "salida": "timeout"}


def main() -> None:
    """Prueba del calificador: los diseños de referencia de los autores deben pasar."""
    for t in cargar_tareas():
        codigo = (DIR / t["referencia"]).read_text(encoding="utf-8")
        r = calificar(codigo, t)
        print(f"{t['id']:<16} {t['tipo']:<15} {'PASA' if r['paso'] else 'FALLA'}"
              + ("" if r["paso"] else f"  ({r['codigo_salida']}) {r['salida'][-200:]!r}"))


if __name__ == "__main__":
    main()
