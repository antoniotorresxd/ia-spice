"""Comparación contra el benchmark público de AnalogCoder (tareas 16-22).

    # 0. Comprobar el calificador con los diseños de referencia de los autores
    uv run python -m agents.evaluacion.analogcoder referencias

    # 1. Escribir los prompts exactos (para pegarlos en una interfaz web)
    uv run python -m agents.evaluacion.analogcoder prompts --salida prompts/

    # 2a. LLM solo por API (como el paper), 5 corridas por tarea
    GOOGLE_API_KEY=... uv run python -m agents.evaluacion.analogcoder solo \\
        --proveedor google --modelo <id-exacto-del-modelo> --corridas 5

    # 2b. LLM solo con respuestas pegadas a mano desde una interfaz web:
    #     carpeta con archivos <tarea>_<corrida>.txt, p. ej. 18_1.txt ... 18_5.txt
    uv run python -m agents.evaluacion.analogcoder respuestas \\
        --carpeta respuestas/chatgpt/ --etiqueta "ChatGPT (interfaz web)"

    # 3. El sistema completo desde el enunciado, 5 corridas por tarea
    uv run --env-file .env python -m agents.evaluacion.analogcoder sistema \\
        --usuario <user_id> --corridas 5
    #    (o forzando un modelo: --proveedor google --modelo ... con su API key en el entorno)

    # Con OpenRouter (una sola key para Google, OpenAI y Anthropic):
    OPENROUTER_API_KEY=... uv run python -m agents.evaluacion.analogcoder solo \\
        --proveedor openrouter --modelo google/<modelo>

Calificación: al código PySpice del circuito se le agrega el script de
verificación original de su tipo, como hace `gpt_run.py` de AnalogCoder, y se
ejecuta; pasa si termina con código 0. Los verificadores no se modifican. El
netlist del sistema se convierte a PySpice sin renombrar nodos ni
componentes: respetar los nombres del enunciado es parte de la tarea.
`compat/sitecustomize.py` solo adapta PySpice 1.5 a ngspice >= 41.

Cada corrida se clasifica en escalones, como los errores de ejecución y de
simulación que distingue AnalogCoder:
    error_api    la llamada al modelo falló (id de modelo, key, cuota): no cuenta como intento
    sin_codigo   la respuesta no trae código / el sistema no entregó netlist
    no_ejecuta   el código o el netlist no construyen un circuito
    no_simula    ngspice no resuelve el punto de operación
    interfaz     simula, pero faltan los nodos o componentes que pide el enunciado
    no_funciona  el verificador lo rechaza
    pasa         el verificador lo acepta
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from math import comb
from pathlib import Path

import yaml

DIR = Path(__file__).resolve().parents[3] / "evaluacion" / "analogcoder"
RESULTADOS = DIR.parent / "resultados"
COMPLEJAS = {"Oscillator", "Integrator", "Differentiator", "Adder", "Subtractor", "Schmitt"}

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
def _valor_dc(e):
    try:
        return float(str(e.dc_value).lower().replace('dc', '').replace('v', '').split()[0])
    except (AttributeError, ValueError, IndexError):
        return 0.0  # fuente de pulso u otra forma sin valor DC explícito
_sesgo = _valor_dc(_elegida) if _elegida is not None else 0.0
"""

# En las topologías inversoras (sumador, integrador, diferenciador) la
# referencia del op-amp es el voltaje de su tierra virtual: el nodo de suma
# que une un elemento conectado a la entrada con uno conectado a la salida.
# Se mide en el punto de operación del circuito tal como lo entregó el
# modelo; así un op-amp referido a tierra da 0 V aunque la fuente de entrada
# tenga otro valor DC. Si no se encuentra o no simula, queda la regla anterior.
PRELUDIO_TIERRA_VIRTUAL = """
try:
    _pins = [(e, _nodos(e)) for e in circuit.elements]
    _ent_n = {n for _, ns in _pins for n in ns if n.startswith('vin')}
    _a_ent = {n for _, ns in _pins if _ent_n & set(ns) for n in ns}
    _a_sal = {n for _, ns in _pins if 'vout' in ns for n in ns}
    _suma = sorted(n for n in (_a_ent & _a_sal) if n not in _ent_n and n not in ('vout', '0', 'gnd'))
    if _suma:
        _op = circuit.simulator().operating_point()
        _sesgo = float(_op[_suma[0]][0])
except Exception:
    pass
"""
TIERRA_VIRTUAL = {"Adder", "Integrator", "Differentiator"}

# Nodos y prefijos de componentes que cada verificador busca por nombre.
INTERFAZ = {
    "Oscillator": {"nodos": ["vout"], "componentes": []},
    "Integrator": {"nodos": ["vin", "vout"], "componentes": [("r1", "rr1"), ("cf", "ccf", "c1")]},
    "Differentiator": {"nodos": ["vin", "vout"], "componentes": [("rf", "rrf"), ("c1", "cc1")]},
    "Adder": {"nodos": ["vin1", "vin2", "vout"], "componentes": []},
    "Subtractor": {"nodos": ["vin1", "vin2", "vout"], "componentes": []},
    "Schmitt": {"nodos": ["vin", "vout"], "componentes": []},
}


# --------------------------------------------------------------------- tareas y prompts

def cargar_tareas(ids: list[int] | None = None) -> list[dict]:
    tareas = yaml.safe_load((DIR / "tareas.yaml").read_text(encoding="utf-8"))["tareas"]
    return [t for t in tareas if ids is None or t["tarea_original"] in ids]


# Las indicaciones de la plantilla de AnalogCoder que no son de MOSFET ni
# de formato PySpice. El LLM solo las recibe en su prompt; sin ellas el
# sistema diseñaba a ±15 V con la entrada no inversora a tierra, y los
# verificadores (Schmitt cruzando Vdd/2, osciladores polarizados a 2.5 V)
# suponen alimentación única de 5 V.
INDICACIONES_COMUNES = (
    "Make sure the input and output node names appear in the circuit.",
    "Assume the Vdd = 5.0 V.",
)


def enunciado(tarea: dict) -> str:
    """El enunciado tal como lo ve el LLM en AnalogCoder: la sección Question
    de su plantilla, más las indicaciones de la plantilla que aplican a
    cualquier circuito, para que el sistema tenga la misma información."""
    return (f"Design {tarea['circuito']}.\n\n"
            f"Input node name: {tarea['entrada_original']}.\n\n"
            f"Output node name: {tarea['salida']}.\n\n"
            + "\n".join(INDICACIONES_COMUNES))


def prompt_solo(tarea: dict) -> str:
    """El prompt completo de AnalogCoder para un LLM sin biblioteca de
    subcircuitos ("w/o tool"), con los mismos reemplazos que `gpt_run.py`."""
    prompt = (DIR / "prompt_template.md").read_text(encoding="utf-8")
    prompt = prompt.replace("[TASK]", tarea["circuito"]).replace("[INPUT]", tarea["entrada_original"]) \
                   .replace("[OUTPUT]", tarea["salida"])
    if tarea["tipo"] in COMPLEJAS:
        prompt = prompt.replace("6. Avoid using subcircuits.", "").replace("7.", "6.").replace("8.", "7.")
    return prompt


def extraer_codigo(respuesta: str) -> str:
    """Igual que `extract_code` de AnalogCoder: primer bloque de código, sin
    líneas vacías, con los imports de PySpice y cortado tras el simulador."""
    m = re.search(r".*?```.*?\n(.*?)```", respuesta or "", re.DOTALL)
    if not m:
        return ""
    codigo = "\n".join(l for l in m.group(1).split("\n") if l.strip())
    if "from PySpice.Spice.Netlist import Circuit" not in codigo:
        codigo = "from PySpice.Spice.Netlist import Circuit\n" + codigo
    if "from PySpice.Unit import *" not in codigo:
        codigo = "from PySpice.Unit import *\n" + codigo
    salida = []
    for linea in codigo.split("\n"):
        salida.append(linea)
        if "circuit.simulator()" in linea:
            break
    return "\n".join(salida) + "\n"


# --------------------------------------------------------------------- adaptador

_ANALISIS = re.compile(r"^\.(tran|ac|dc|op|meas|measure|print|plot|probe|save|four|noise|end)\b", re.I)


def netlist_a_pyspice(netlist: str) -> str:
    """Convierte el netlist final del sistema en código PySpice que los
    verificadores pueden manipular. Quita comentarios, el bloque .control y
    los análisis (el verificador pone los suyos); no renombra nada."""
    lineas, subcircuitos, pasivos, en_control, en_sub = [], [], [], False, False
    for linea in netlist.splitlines():
        s = linea.strip()
        if not s or s.startswith("*"):
            continue
        baja = s.lower()
        if baja.startswith(".control"):
            en_control = True
            continue
        if baja.startswith(".endc"):
            en_control = False
            continue
        if en_control:
            continue
        # PySpice 1.5 descarta los .subckt al parsear: se pasan como texto
        # SPICE crudo; los elementos de nivel superior sí quedan como objetos.
        if baja.startswith(".subckt"):
            en_sub = True
        if en_sub or baja.startswith((".model", ".include", ".lib", ".param")):
            subcircuitos.append(s)
            if baja.startswith(".ends"):
                en_sub = False
            continue
        if _ANALISIS.match(s):
            continue
        # PySpice 1.5 convierte todo C y L parseado en BehavioralCapacitor /
        # BehavioralInductor, sin atributo `capacitance`/`inductance`: los
        # verificadores que fijan C1 o Cf no tendrían efecto. Se construyen
        # aparte con circuit.C / circuit.L, que sí crean el elemento normal.
        partes = s.split()
        if partes[0][0].upper() in "CL" and len(partes) >= 4 and "=" not in partes[3]:
            pasivos.append((partes[0][0].upper(), partes[0][1:], partes[1], partes[2], partes[3]))
            continue
        lineas.append(s)
    texto = ".title circuito\n" + "\n".join(lineas) + "\n.end\n"
    crudo = "\n".join(subcircuitos)
    construir = "".join(f"circuit.{tipo}({nombre!r}, {n1!r}, {n2!r}, {valor!r})\n"
                        for tipo, nombre, n1, n2, valor in pasivos)
    return ("from PySpice.Spice.Netlist import Circuit\n"
            "from PySpice.Unit import *\n"
            "from PySpice.Spice.Parser import SpiceParser\n"
            f"_netlist = {texto!r}\n"
            "circuit = SpiceParser(source=_netlist).build_circuit()\n"
            + construir +
            f"circuit.raw_spice += {crudo!r}\n"
            "simulator = circuit.simulator()\n")


# --------------------------------------------------------------------- calificación

def _ejecutar(script: str, timeout: int) -> subprocess.CompletedProcess | None:
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "caso.py"
        ruta.write_text(script.replace("[FIGURE_PATH]", str(Path(tmp) / "figura")), encoding="utf-8")
        try:
            return subprocess.run(
                [sys.executable, "-u", str(ruta)], cwd=DIR / "referencia", capture_output=True, text=True,
                timeout=timeout,
                env={**os.environ, "MPLBACKEND": "Agg",
                     "PYTHONPATH": f"{DIR / 'compat'}{os.pathsep}{DIR / 'referencia'}"})
        except subprocess.TimeoutExpired:
            return None


VERIFICADORES = ("original", "adaptado")


def ruta_verificador(tarea: dict, verificador: str = "original") -> Path:
    """`original`: el script de AnalogCoder sin cambios. `adaptado`: la copia
    en verificacion_adaptada/, con cambios solo de interfaz (ADAPTACIONES.md)."""
    if verificador not in VERIFICADORES:
        raise ValueError(f"verificador desconocido: {verificador}")
    ruta = DIR / tarea["verificacion"]
    return ruta if verificador == "original" else DIR / "verificacion_adaptada" / ruta.name


def armar_script(codigo: str, tarea: dict, verificador: str = "original") -> str:
    verificador = ruta_verificador(tarea, verificador).read_text(encoding="utf-8")
    preludio = ""
    if tarea["tipo"] != "Oscillator":
        verificador = verificador.replace("[BIAS_VOLTAGE]", "_sesgo")
        preludio = PRELUDIO_SESGO + (PRELUDIO_TIERRA_VIRTUAL if tarea["tipo"] in TIERRA_VIRTUAL else "")
    cuerpo = codigo.rstrip()
    if "simulator = circuit.simulator()" not in cuerpo:
        cuerpo += "\nsimulator = circuit.simulator()"
    script = cuerpo + "\n" + preludio + "\n" + verificador
    return script if "import math" in script else "import math\n" + script


def _falta_interfaz(codigo: str, tarea: dict, timeout: int) -> str | None:
    req = INTERFAZ[tarea["tipo"]]
    sonda = codigo.rstrip() + (
        "\nimport json\n"
        "_n = sorted({str(p.node).lower() for e in circuit.elements for p in e.pins})\n"
        "_e = sorted(e.name.lower() for e in circuit.elements)\n"
        "print('INTERFAZ' + json.dumps({'nodos': _n, 'elementos': _e}))\n")
    r = _ejecutar(sonda, timeout)
    if r is None or r.returncode != 0 or "INTERFAZ" not in r.stdout:
        return None
    info = json.loads(r.stdout.split("INTERFAZ", 1)[1].splitlines()[0])
    faltan = [n for n in req["nodos"] if n not in info["nodos"]]
    faltan += ["/".join(p).upper() for p in req["componentes"] if not any(e.startswith(p) for e in info["elementos"])]
    return ", ".join(faltan) or None


def calificar(codigo: str, tarea: dict, *, timeout: int = 120, verificador: str = "original") -> dict:
    """Califica un circuito en PySpice con el verificador original o el adaptado."""
    if not codigo.strip():
        return {"escalon": "sin_codigo", "paso": False, "detalle": ""}
    construye = _ejecutar(codigo.rstrip() + "\n", timeout)
    if construye is None or construye.returncode != 0:
        return {"escalon": "no_ejecuta", "paso": False,
                "detalle": "timeout" if construye is None else construye.stderr[-600:]}
    if tarea["tipo"] != "Oscillator":
        op = _ejecutar(codigo.rstrip() + "\n_ = circuit.simulator().operating_point()\n", timeout)
        if op is None or op.returncode != 0:
            return {"escalon": "no_simula", "paso": False,
                    "detalle": "timeout" if op is None else op.stderr[-600:]}
    r = _ejecutar(armar_script(codigo, tarea, verificador), timeout)
    if r is not None and r.returncode == 0:
        return {"escalon": "pasa", "paso": True, "detalle": ""}
    faltan = _falta_interfaz(codigo, tarea, timeout)
    detalle = "timeout" if r is None else (r.stdout[-600:] + r.stderr[-600:]).strip()
    if faltan:
        return {"escalon": "interfaz", "paso": False, "detalle": f"faltan: {faltan}. {detalle[-300:]}"}
    return {"escalon": "no_funciona", "paso": False, "detalle": detalle}


# Escalones que se deciden antes del verificador: no cambian con él.
_PREVIOS = ("sin_codigo", "no_ejecuta", "no_simula")


def calificar_ambos(codigo: str, tarea: dict, *, timeout: int = 120) -> dict:
    """Resultado con el verificador original y, aparte, con el adaptado."""
    r = calificar(codigo, tarea, timeout=timeout)
    ra = r if r["escalon"] in _PREVIOS else calificar(codigo, tarea, timeout=timeout, verificador="adaptado")
    return {**r, "escalon_adaptado": ra["escalon"], "paso_adaptado": ra["paso"]}


# --------------------------------------------------------------------- generadores

OPENROUTER_URL = "https://openrouter.ai/api/v1"


def _config_llm(proveedor: str, modelo: str):
    """Configuración del modelo para la evaluación. `openrouter` usa la API
    compatible con OpenAI de OpenRouter (una key para los tres proveedores);
    el modelo va con su prefijo, p. ej. google/..., openai/..., anthropic/..."""
    from agents.llm.settings_client import AgentLlmConfig

    variable = {"google": "GOOGLE_API_KEY", "openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY",
                "openrouter": "OPENROUTER_API_KEY"}[proveedor]
    clave = os.environ.get(variable)
    if not clave:
        raise SystemExit(f"falta {variable} en el entorno")
    if proveedor == "openrouter":
        return AgentLlmConfig(provider="openai_compatible", model=modelo, api_key=clave, base_url=OPENROUTER_URL)
    return AgentLlmConfig(provider=proveedor, model=modelo, api_key=clave, base_url=None)


MAX_TOKENS = 16384


def _acotar(llm, timeout: int = 240, reintentos: int = 2, max_tokens: int = MAX_TOKENS):
    """Tiempo límite por llamada, pocos reintentos y un máximo de tokens de
    salida fijo. Sin máximo, el cliente pide el del modelo (hasta 65 536) y
    OpenRouter aparta saldo para todo eso en cada llamada; además, fijarlo
    hace el experimento reproducible. Se reporta como parámetro."""
    for nombre, valor in (("timeout", timeout), ("request_timeout", timeout), ("max_retries", reintentos),
                          ("max_tokens", max_tokens), ("max_output_tokens", max_tokens)):
        if hasattr(llm, nombre):
            try:
                setattr(llm, nombre, valor)
            except Exception:  # noqa: BLE001 - algunos clientes no permiten cambiarlo
                pass
    # langchain-openai lo manda como max_completion_tokens; para APIs
    # compatibles (OpenRouter) se manda también max_tokens.
    if hasattr(llm, "extra_body"):
        try:
            llm.extra_body = {**(llm.extra_body or {}), "max_tokens": max_tokens}
        except Exception:  # noqa: BLE001
            pass
    return llm


def _texto(respuesta) -> str:
    contenido = getattr(respuesta, "content", respuesta)
    if isinstance(contenido, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in contenido)
    return str(contenido)


def generar_solo(tarea: dict, llm) -> tuple[str, str]:
    from langchain_core.messages import HumanMessage

    respuesta = _texto(llm.invoke([HumanMessage(content=prompt_solo(tarea))]))
    return respuesta, extraer_codigo(respuesta)


def _forzar_modelo(cfg) -> None:
    """Hace que todos los agentes usen `cfg` en vez de la asignación del
    server. Solo en este proceso de evaluación."""
    import importlib

    for modulo in ("agents.orquestador.node", "agents.escritura.node",
                   "agents.curador.reparacion", "agents.documentador.node"):
        try:
            m = importlib.import_module(modulo)
        except ModuleNotFoundError:
            continue
        if hasattr(m, "fetch_agent_llm"):
            m.fetch_agent_llm = lambda *a, **k: cfg
        if hasattr(m, "build_chat_model"):
            original = m.build_chat_model
            m.build_chat_model = lambda config, _o=original: _acotar(_o(config))


# Respuesta fija cuando el sistema pide un dato que el enunciado de
# AnalogCoder no trae (frecuencia, umbrales...). Es la misma para todas las
# tareas y modelos, y equivale a lo que el LLM solo hace por su cuenta: el
# prompt de AnalogCoder no da valores y el modelo elige los suyos.
RESPUESTA_ACLARACION = "Elige tú valores típicos para lo que no se especifica y diseña el circuito."


def _turno_aclaracion(enunciado_tarea: str, pregunta: str) -> str:
    """El texto del segundo turno armado como `composeRequestText` del server."""
    return (f"Usuario: {enunciado_tarea}\n\nAsistente: {pregunta}\n\n"
            f"Nueva instrucción: {RESPUESTA_ACLARACION}")


def generar_sistema(tarea: dict, graph, usuario: str, corrida: int) -> tuple[str, str]:
    texto_pedido = enunciado(tarea)
    final: dict = {}
    for turno in range(2):  # a lo más una aclaración
        estado = {
            "circuit_spec": {}, "request_text": texto_pedido, "normalized_spec": None,
            "pending_blocks": None, "component_values": {}, "commercial_values": {}, "bom": {},
            "precision": {}, "netlists": {}, "sim_results": {}, "iteration": 0, "history": [],
            "verdict": None, "documentation": {}, "outcome": None,
        }
        final = graph.invoke(estado, config={"configurable": {
            "thread_id": f"analogcoder-{tarea['tarea_original']}-{corrida}-{turno}-{time.time_ns()}",
            "user_id": usuario}})
        outcome = final.get("outcome") or {}
        if turno == 0 and isinstance(outcome, dict) and outcome.get("mode") == "clarify" \
                and not final.get("netlists"):
            texto_pedido = _turno_aclaracion(enunciado(tarea), outcome.get("question", ""))
            continue
        break
    netlists = final.get("netlists") or {}
    if not netlists:
        motivo = (final.get("verdict") or {}).get("reason") or str(final.get("outcome") or "")
        return f"sin netlist: {motivo}", ""
    texto = next(iter(netlists.values()))
    texto = texto.get("text", "") if isinstance(texto, dict) else str(texto)
    return texto, netlist_a_pyspice(texto)


# --------------------------------------------------------------------- reporte

def pass_at_k(n: int, c: int, k: int) -> float:
    """Estimador insesgado de Chen et al. (2021), el que usa AnalogCoder."""
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)


def _verdadero(v) -> bool:
    return v is True or str(v).strip().lower() == "true"


def resumir(filas: list[dict], etiqueta: str) -> str:
    """Tabla por tarea. Pass@1/Pass@5 con el verificador original; si las filas
    traen el adaptado, se agregan sus columnas (ADAPTACIONES.md)."""
    publicados = yaml.safe_load((DIR / "resultados_publicados.yaml").read_text(encoding="utf-8"))["tareas"]
    adaptado = any(f.get("escalon_adaptado") for f in filas)
    extra_enc = " Pasan adapt. | Pass@1 adapt. |" if adaptado else ""
    extra_sep = "---|---|" if adaptado else ""
    lineas = [f"## {etiqueta}", "",
              "| Tarea | Tipo | Pasan | Pass@1 | Pass@5 | Escalones |" + extra_enc
              + " AnalogCoder P@1 | GPT-4o solo P@1 |",
              "|---|---|---|---|---|---|" + extra_sep + "---|---|"]
    resueltas, p1s, resueltas_a, p1s_a = 0, [], 0, []
    for t in cargar_tareas():
        de = [f for f in filas if f["tarea"] == t["tarea_original"] and f["escalon"] != "error_api"]
        if not de:
            continue
        n, c = len(de), sum(_verdadero(f["paso"]) for f in de)
        p1, p5 = pass_at_k(n, c, 1), pass_at_k(n, c, min(5, n))
        p1s.append(p1)
        resueltas += c > 0
        conteo: dict[str, int] = {}
        for f in de:
            conteo[f["escalon"]] = conteo.get(f["escalon"], 0) + 1
        celdas_a = ""
        if adaptado:
            ca = sum(_verdadero(f.get("paso_adaptado")) for f in de)
            p1a = pass_at_k(n, ca, 1)
            p1s_a.append(p1a)
            resueltas_a += ca > 0
            celdas_a = f" {ca}/{n} | {p1a * 100:.1f} |"
        pub = publicados[t["tarea_original"]]
        lineas.append(f"| {t['tarea_original']} | {t['tipo']} | {c}/{n} | {p1 * 100:.1f} | {p5 * 100:.1f} | "
                      + ", ".join(f"{k} {v}" for k, v in conteo.items()) + " |" + celdas_a
                      + f" {pub['analogcoder']['pass1']} | {pub['gpt4o']['pass1']} |")
    if p1s:
        lineas += ["", f"Verificador original: tareas resueltas al menos una vez {resueltas}/{len(p1s)} · "
                       f"Pass@1 medio {sum(p1s) / len(p1s) * 100:.1f} %"]
    if p1s_a:
        lineas += [f"Verificador adaptado: tareas resueltas al menos una vez {resueltas_a}/{len(p1s_a)} · "
                   f"Pass@1 medio {sum(p1s_a) / len(p1s_a) * 100:.1f} %"]
    return "\n".join(lineas)





CAMPOS = ["condicion", "tarea", "tipo", "corrida", "escalon", "paso",
          "escalon_adaptado", "paso_adaptado", "segundos", "detalle"]


def guardar(filas: list[dict], etiqueta: str, salida: Path | None) -> Path:
    carpeta = salida or RESULTADOS / f"analogcoder-{datetime.now():%Y%m%d-%H%M%S}"
    (carpeta / "respuestas").mkdir(parents=True, exist_ok=True)
    for f in filas:
        base = carpeta / "respuestas" / f"{f['tarea']}_{f['corrida']}"
        base.with_suffix(".txt").write_text(f.pop("respuesta", ""), encoding="utf-8")
        base.with_suffix(".py").write_text(f.pop("codigo", ""), encoding="utf-8")
    with (carpeta / "filas.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=CAMPOS)
        w.writeheader()
        for f in filas:
            w.writerow({k: f.get(k) for k in w.fieldnames})
    resumen = resumir(filas, etiqueta)
    (carpeta / "resumen.md").write_text(resumen + "\n", encoding="utf-8")
    print("\n" + resumen + f"\n\nResultados en {carpeta}")
    return carpeta


def _correr(tareas, corridas, etiqueta, generar) -> list[dict]:
    filas = []
    for t in tareas:
        for k in range(1, corridas + 1):
            inicio = time.perf_counter()
            try:
                print(f"tarea {t['tarea_original']} corrida {k}: generando...", flush=True)
                respuesta, codigo = generar(t, k)
                print(f"tarea {t['tarea_original']} corrida {k}: calificando "
                      f"({time.perf_counter() - inicio:.0f} s en generar)...", flush=True)
                r = calificar_ambos(codigo, t)
            except Exception as exc:
                # Un error de la API (modelo inexistente, key inválida, cuota)
                # no es un fallo del modelo: se registra aparte y, si ocurre en
                # las dos primeras corridas, se detiene todo para no gastar
                # el experimento completo en errores.
                respuesta, codigo = f"error al generar: {type(exc).__name__}: {exc}", ""
                r = {"escalon": "error_api", "paso": False, "detalle": respuesta[:600],
                     "escalon_adaptado": "error_api", "paso_adaptado": False}
                print(f"tarea {t['tarea_original']} corrida {k}: error_api -> {respuesta[:300]}", flush=True)
                filas.append({"condicion": etiqueta, "tarea": t["tarea_original"], "tipo": t["tipo"], "corrida": k,
                              "segundos": round(time.perf_counter() - inicio, 1), "respuesta": respuesta,
                              "codigo": codigo, **r})
                if len(filas) <= 2 and all(f["escalon"] == "error_api" for f in filas):
                    if len(filas) == 2:
                        raise SystemExit("La API falló en las dos primeras corridas; revisa el id del modelo "
                                         "(--modelo) y la API key. Último error:\n" + respuesta)
                continue
            filas.append({"condicion": etiqueta, "tarea": t["tarea_original"], "tipo": t["tipo"], "corrida": k,
                          "segundos": round(time.perf_counter() - inicio, 1), "respuesta": respuesta,
                          "codigo": codigo, **r})
            print(f"tarea {t['tarea_original']} corrida {k}: {r['escalon']} "
                  f"(adaptado: {r['escalon_adaptado']}, {time.perf_counter() - inicio:.0f} s)", flush=True)
    return filas


def recalificar(carpeta: Path, tareas: list[dict]) -> Path:
    """Vuelve a calificar una corrida guardada con los dos verificadores, a
    partir de su código guardado (respuestas/<tarea>_<corrida>.py). No llama a
    ningún modelo. Escribe filas_verificadores.csv y resumen_verificadores.md."""
    with (carpeta / "filas.csv").open(encoding="utf-8") as h:
        previas = list(csv.DictReader(h))
    if not previas:
        raise SystemExit(f"{carpeta}/filas.csv está vacío")
    ids = {t["tarea_original"] for t in tareas}
    por_id = {t["tarea_original"]: t for t in tareas}
    filas = []
    for f in previas:
        tarea_id = int(f["tarea"])
        if tarea_id not in ids:
            continue
        if f["escalon"] == "error_api":
            filas.append({**f, "tarea": tarea_id, "escalon_adaptado": "error_api", "paso_adaptado": False})
            continue
        archivo = carpeta / "respuestas" / f"{tarea_id}_{f['corrida']}.py"
        codigo = archivo.read_text(encoding="utf-8") if archivo.exists() else ""
        r = calificar_ambos(codigo, por_id[tarea_id])
        filas.append({**f, "tarea": tarea_id, **r})
        print(f"tarea {tarea_id} corrida {f['corrida']}: {r['escalon']} (adaptado: {r['escalon_adaptado']})",
              flush=True)
    with (carpeta / "filas_verificadores.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.DictWriter(h, fieldnames=CAMPOS)
        w.writeheader()
        for f in filas:
            w.writerow({k: f.get(k) for k in CAMPOS})
    resumen = resumir(filas, previas[0]["condicion"])
    (carpeta / "resumen_verificadores.md").write_text(resumen + "\n", encoding="utf-8")
    print("\n" + resumen + f"\n\nEn {carpeta}/resumen_verificadores.md")
    return carpeta


def _verificar_ngspice() -> None:
    """Los verificadores de AnalogCoder simulan con PySpice, que carga la
    biblioteca compartida de ngspice. Sin ella todas las corridas saldrían
    `no_ejecuta` (y en modo solo/sistema se gastarían créditos en balde)."""
    import ctypes

    try:
        ctypes.CDLL("libngspice.so")
    except OSError:
        raise SystemExit(
            "No se encontró libngspice.so (la usa PySpice para calificar).\n"
            "En Debian/Ubuntu: sudo apt install -y libngspice0-dev\n"
            "Comprueba con: uv run python -m agents.evaluacion.analogcoder referencias"
        ) from None


def main() -> None:
    ap = argparse.ArgumentParser(prog="agents.evaluacion.analogcoder")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("referencias", help="los diseños de referencia deben pasar")
    p = sub.add_parser("prompts", help="escribe los prompts exactos en archivos")
    p.add_argument("--salida", default="prompts_analogcoder")
    rc = sub.add_parser("recalificar", help="califica de nuevo corridas guardadas con los dos verificadores")
    rc.add_argument("carpetas", nargs="+", help="carpetas resultados/analogcoder-<fecha>")
    rc.add_argument("--tareas", default=None)
    for nombre in ("solo", "sistema", "respuestas"):
        s = sub.add_parser(nombre)
        s.add_argument("--tareas", default=None, help="p. ej. 16,18,20")
        s.add_argument("--salida", default=None)
        s.add_argument("--etiqueta", default=None)
        if nombre != "respuestas":
            s.add_argument("--corridas", type=int, default=5)
            s.add_argument("--proveedor", choices=["google", "openai", "anthropic", "openrouter"], default=None)
            s.add_argument("--modelo", default=None)
        if nombre == "sistema":
            s.add_argument("--usuario", default="evaluacion")
        if nombre == "respuestas":
            s.add_argument("--carpeta", required=True)
    a = ap.parse_args()
    ids = [int(x) for x in a.tareas.split(",")] if getattr(a, "tareas", None) else None
    tareas = cargar_tareas(ids)
    salida = Path(a.salida) if a.cmd in ("solo", "sistema", "respuestas") and a.salida else None
    if a.cmd != "prompts":
        _verificar_ngspice()

    if a.cmd == "referencias":
        for t in tareas:
            r = calificar_ambos((DIR / t["referencia"]).read_text(encoding="utf-8"), t)
            print(f"{t['id']:<16} {t['tipo']:<15} original: {r['escalon']:<12} adaptado: {r['escalon_adaptado']}")
    elif a.cmd == "prompts":
        destino = Path(a.salida)
        destino.mkdir(parents=True, exist_ok=True)
        for t in tareas:
            (destino / f"{t['tarea_original']}_prompt_llm_solo.md").write_text(prompt_solo(t), encoding="utf-8")
            (destino / f"{t['tarea_original']}_enunciado_sistema.txt").write_text(enunciado(t), encoding="utf-8")
        print(f"Prompts en {destino}: <tarea>_prompt_llm_solo.md para las interfaces, "
              "<tarea>_enunciado_sistema.txt para tu software.")
    elif a.cmd == "solo":
        if not (a.proveedor and a.modelo):
            raise SystemExit("solo requiere --proveedor y --modelo")
        from agents.llm.factory import build_chat_model

        llm = _acotar(build_chat_model(_config_llm(a.proveedor, a.modelo)))
        etiqueta = a.etiqueta or f"{a.modelo} solo (API, un intento)"
        guardar(_correr(tareas, a.corridas, etiqueta, lambda t, k: generar_solo(t, llm)), etiqueta, salida)
    elif a.cmd == "sistema":
        from agents.graph import build_graph

        if a.proveedor and a.modelo:
            _forzar_modelo(_config_llm(a.proveedor, a.modelo))
        graph = build_graph()
        etiqueta = a.etiqueta or f"Sistema + {a.modelo or 'modelo asignado en el server'}"
        guardar(_correr(tareas, a.corridas, etiqueta, lambda t, k: generar_sistema(t, graph, a.usuario, k)),
                etiqueta, salida)
    elif a.cmd == "recalificar":
        for carpeta in a.carpetas:
            recalificar(Path(carpeta), tareas)
    elif a.cmd == "respuestas":
        carpeta = Path(a.carpeta)
        filas = []
        for t in tareas:
            for archivo in sorted(carpeta.glob(f"{t['tarea_original']}_*.txt")):
                respuesta = archivo.read_text(encoding="utf-8")
                codigo = extraer_codigo(respuesta)
                r = calificar_ambos(codigo, t)
                filas.append({"condicion": a.etiqueta or carpeta.name, "tarea": t["tarea_original"],
                              "tipo": t["tipo"], "corrida": archivo.stem.split("_", 1)[1], "segundos": None,
                              "respuesta": respuesta, "codigo": codigo, **r})
                print(f"tarea {t['tarea_original']} {archivo.name}: {r['escalon']}", flush=True)
        if not filas:
            raise SystemExit(f"no hay archivos <tarea>_<corrida>.txt en {carpeta}")
        guardar(filas, a.etiqueta or carpeta.name, salida)


if __name__ == "__main__":
    main()
