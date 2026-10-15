import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

from agents.config import get_config


def netlist_sin_lineas(netlist: str) -> str | None:
    """Un netlist con los saltos de línea convertidos en espacios: ngspice
    toma esa única línea como título y ve un circuito vacío. Devuelve el
    motivo para rechazarlo, o None si tiene forma de netlist."""
    lineas = [l.strip() for l in netlist.splitlines() if l.strip()]
    if len(lineas) < 3 or not any(l.lower().startswith(".control") for l in lineas):
        return (
            "el netlist llegó en una sola línea: cada elemento y cada directiva "
            "(.control, .endc, .end) van en su propia línea"
        )
    return None


def find_unresolved_placeholders(netlist: str) -> list[str]:
    """Identificadores de plantilla sin una definición .param en el netlist."""
    names = re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", netlist)
    defined = {
        name.lower()
        for name in re.findall(
            r"^[ \t]*\.param[ \t]+([A-Za-z_][A-Za-z0-9_]*)\b",
            netlist,
            flags=re.IGNORECASE | re.MULTILINE,
        )
    }
    return list(dict.fromkeys(name for name in names if name.lower() not in defined))


class Requirement(BaseModel):
    measure: str = Field(
        min_length=1,
        description=(
            "Qué se mide. Para un bloque suelto (sin `connections`), cualquier "
            "nombre libre sirve (ej. 'v_out', 'fc', 'gain'): es el mismo nombre "
            "que la plantilla del catálogo calcula. Para un bloque dentro de una "
            "composición (cuando `connections` conecta este bloque con otro), "
            "usa exactamente uno de: max, min, peak_to_peak, dc, current, "
            "fc_-3db (frecuencia de corte a -3 dB), gain_at_freq (ganancia a una "
            "frecuencia — agrega `frequency_hz`), ripple."
        ),
    )
    node: str = Field(
        default="",
        description=(
            "Dónde se mide, solo relevante en una composición. Vacío = la "
            "salida propia de este bloque (el caso normal). Poné algo distinto "
            "solo si el requisito se mide en un nodo de OTRO bloque del "
            "circuito compuesto."
        ),
    )
    comparator: Literal["approx", "le", "ge"] = "approx"
    value: float
    tolerance: float | None = None
    frequency_hz: float | None = Field(
        default=None,
        description="Solo para measure='gain_at_freq': a qué frecuencia medir la ganancia.",
    )


class GenericParams(BaseModel):
    """Un circuito fuera del catálogo curado.

    El LLM entrega el netlist ya hecho y su lista de requisitos. Eso no lo vuelve confiable: ngspice
    sigue siendo el árbitro, igual que con los tipos curados. La diferencia con
    los trabajos que generan netlists con un LLM no es que aquí se genere
    mejor, es que aquí no se cree lo generado.
    """

    description: str = Field(min_length=1)
    requirements: list[Requirement] = Field(min_length=1)
    netlist: str = Field(
        min_length=1,
        description=(
            "Netlist SPICE completo. Elige resistencias de la serie comercial (E24 salvo que "
            "el enunciado pida otra, ver `serie_resistencias`): p. ej. para ganancias 6, 8 y 4 "
            "con un Rf común, Rf = 120k con 20k, 15k y 30k, no 600k (no existe en E24)."
        ),
    )

    @model_validator(mode="after")
    def _el_netlist_mide_algo(self):
        # Sin esto el shell corre ngspice y no encuentra nada que leer, y el
        # bloque falla con un error de parseo que no dice cuál fue el problema.
        if "output.txt" not in self.netlist:
            raise ValueError(
                "el netlist debe escribir su medición en output.txt "
                "(wrdata output.txt ..., o echo $&var > output.txt)"
            )
        if ".control" not in self.netlist:
            raise ValueError("el netlist debe traer un bloque .control que ejecute el análisis")
        sin_lineas = netlist_sin_lineas(self.netlist)
        if sin_lineas:
            raise ValueError(sin_lineas)
        unresolved = find_unresolved_placeholders(self.netlist)
        if unresolved:
            raise ValueError(
                f"placeholders sin resolver: {', '.join(unresolved)}; deben sustituirse "
                "por el valor numérico calculado o definirse mediante .param antes de "
                "usarse en el netlist final, no dejarse literales como en el "
                "spiceTemplate de referencia del catálogo de circuitos"
            )
        return self


class CatalogParams(BaseModel):
    """Un circuito derivado del catálogo de topologías disponibles.

    El LLM del orquestador identifica la topología (`circuit_id`) y extrae los
    parámetros técnicos según su parametersSchema, además de la meta.
    """

    circuit_id: str = Field(min_length=1)
    params: dict[str, float] = Field(default_factory=dict)
    requirements: list[Requirement] = Field(min_length=1)
    description: str = Field(default="")


class CatalogBlock(BaseModel):
    id: str
    type: Literal["catalog"] = "catalog"
    params: CatalogParams


class GenericBlock(BaseModel):
    id: str
    type: Literal["generic"]
    params: GenericParams


Block = Annotated[
    CatalogBlock
    | GenericBlock,
    Field(discriminator="type"),
]


class CircuitSpec(BaseModel):
    """Interfaz de entrada del pipeline; el futuro LLM del orquestador
    deberá producir exactamente este schema."""

    blocks: list[Block] = Field(min_length=1)
    connections: list[tuple[str, str]] = Field(
        default_factory=list,
        description=(
            "Cómo se cablean los bloques cuando el circuito son varias etapas "
            "en cascada (ej. un filtro seguido de un amplificador). Vacío si "
            "hay un solo bloque, o si los bloques son independientes entre sí. "
            "Cada par es (origen, destino), en el sentido de la señal: la "
            "salida del primer bloque alimenta la entrada del segundo. Basta "
            "con el id del bloque en cada lado (ej. ['hp', 'amp']); hoy solo "
            "se soporta esa forma de cadena (salida -> entrada)."
        ),
    )
    # Los valores por omisión salen de config/curador.yaml, no del código: el
    # RNF-04.2 de la tesina exige poder ajustar el máximo de iteraciones y la
    # tolerancia durante la evaluación experimental sin recompilar. Se leen con
    # default_factory (por instancia, no al importar) para que un experimento
    # que apunte CURADOR_CONFIG_PATH a otro archivo surta efecto.
    max_iterations: int = Field(
        default_factory=lambda: get_config()["curador"]["max_iterations"],
        ge=1,
        le=10,
        description="Número máximo de iteraciones para el curador (entre 1 y 10). Omitir si no se especificó.",
    )
    tolerance: float = Field(
        default_factory=lambda: get_config()["curador"]["tolerance"],
        gt=0,
        description=(
            "Cuánto puede desviarse la medición del objetivo (ej. 0.05 para 5%). Omitir si no "
            "se especificó. NO es la tolerancia de las piezas: «resistencias al 5%» va en "
            "`serie_resistencias`."
        ),
    )
    serie_resistencias: Literal["E6", "E12", "E24", "E48", "E96"] | None = Field(
        default=None,
        description=(
            "Serie comercial de resistencias que exige el enunciado, según la tolerancia de las "
            "piezas que pide: 20% → E6, 10% → E12, 5% → E24, 2% → E48, 1% → E96 "
            "(«using standard 5% resistances» → E24). Omitir si no lo dice: se usa E24. "
            "Elige los valores del netlist en esa serie."
        ),
    )

    @field_validator("max_iterations")
    @classmethod
    def _max_iterations_dentro_del_limite(cls, v: int, info: ValidationInfo) -> int:
        if v < 3 and any(getattr(b, "type", None) == "generic" for b in info.data.get("blocks", [])):
            v = 3
        # ge=1 en el Field de arriba no pone techo. Sin este límite, una
        # extracción del LLM (o un circuit_spec estructurado) que pida un
        # número grande deja correr el lazo del curador sin freno real: con
        # temperature=0, una reparación que no logra avanzar se repite
        # idéntica hasta agotar lo que se le haya dado, no los 5 del default.
        limite = get_config()["curador"]["max_iterations_cap"]
        if v > limite:
            raise ValueError(f"max_iterations ({v}) supera el límite configurado ({limite})")
        return v

    @model_validator(mode="after")
    def _unique_block_ids(self):
        ids = [b.id for b in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("block ids must be unique")
        return self


class ChatOutcome(BaseModel):
    """El mensaje no era un pedido de diseño."""

    mode: Literal["chat"]
    reply: str = Field(min_length=1)


class ClarifyOutcome(BaseModel):
    """Hay intención de diseño pero falta información para completar un bloque."""

    mode: Literal["clarify"]
    question: str = Field(min_length=1)
    partial_spec: dict = Field(default_factory=dict)


class Asignacion(BaseModel):
    """Un símbolo del netlist y el valor que toma en un escenario o pregunta."""

    simbolo: str = Field(description="El nombre usado entre llaves en el netlist, p. ej. 'RL' para {RL}.")
    valor: str = Field(description="Con sufijo SPICE ('40', '30k', '0.15'), 'inf' para un abierto o '0' para un corto.")


class Medicion(BaseModel):
    """Lo que se midió o se exige en un escenario."""

    expresion: str = Field(
        description=(
            "V(nodo), V(a,b), I(elemento) o aritmética con ellos: 'V(o)/V(i)'. Para "
            "requisitos de frecuencia: 'f0(V(o)/V(i))', 'Q(V(o)/V(i))', 'db(V(o)/V(i), 100)'."
        )
    )
    valor: str = Field(description="El valor medido o exigido, con sufijo SPICE: '125m', '230m', '5'.")


class Escenario(BaseModel):
    """El mismo circuito con valores propios (otra carga, el pot en un extremo)
    y lo que se midió o se exige en él."""

    nombre: str | None = None
    valores: list[Asignacion] = Field(default_factory=list)
    mediciones: list[Medicion] = Field(default_factory=list)


class Pregunta(BaseModel):
    """Algo que el problema pide calcular, en las condiciones que indique."""

    nombre: str | None = None
    tipo: Literal["valor", "transferencia"] = Field(
        default="valor",
        description=(
            "'transferencia' para pedir la función de transferencia H(s) de `calcular` "
            "(su forma, polos, ceros, H0, f0, Q y su Bode); 'valor' para un número."
        ),
    )
    valores: list[Asignacion] = Field(default_factory=list)
    calcular: str = Field(
        description=(
            "Expresión a calcular: 'I(RL)', 'V(o)', 'V(o)/V(i)'. Admite parámetros de "
            "una transferencia: 'f0(V(o)/V(i))', 'Q(V(o)/V(i))', 'H0(V(o)/V(i))', "
            "'db(V(o)/V(i), 1k)', 'fase(V(o)/V(i), 1k)'."
        )
    )


class AnalysisOutcome(BaseModel):
    """El usuario da un circuito YA ARMADO y pregunta por sus tensiones,
    corrientes, su resistencia/impedancia equivalente o su equivalente de
    Thévenin/Norton ("resuelve por mallas", "encuentra la corriente en R3",
    "reduce la red entre a y b"), o pide deducir componentes a partir de
    mediciones ("find Ri, Aoc and Ro"). No se diseña nada: solo se transcribe
    la red a netlist y el sistema la resuelve."""

    mode: Literal["analysis"]
    netlist: str = Field(
        min_length=1,
        description=(
            "La red transcrita a SPICE, un elemento por línea: R, L, C, fuentes "
            "independientes V/I, fuentes controladas (`E n+ n- nc+ nc- ganancia`, "
            "`G n+ n- nc+ nc- gm` —la corriente circula de n+ a n- por dentro—, "
            "`F n+ n- Vcontrol ganancia`, `H n+ n- Vcontrol r`) y op-amps "
            "`X1 in+ in- out OPAMP` (ideal) o `X1 in+ in- out OPAMP a=1e4 rd=1meg ro=75`. "
            "Formato `<nombre> <nodo+> <nodo-> <valor>`, con sufijos SPICE (1k, 4.7u, "
            "10meg). El nodo de referencia es 0. Para una fuente de corriente, la "
            "corriente sale por el nodo- (circula de nodo+ a nodo- por dentro). Un "
            "valor que no se conoce o que cambia entre escenarios va como símbolo "
            "entre llaves: `RI i 0 {Ri}`, `RL o 0 {RL}`. NUNCA pongas un número "
            "inventado a una incógnita. Sin .control ni análisis: el sistema los agrega."
        ),
    )
    incognitas: list[str] | None = Field(
        default=None,
        description=(
            "Los símbolos del netlist que el problema pide encontrar a partir de "
            "mediciones o requisitos: ['Ri', 'Ag', 'Ro']."
        ),
    )
    escenarios: list[Escenario] | None = Field(
        default=None,
        description=(
            "Cada situación con sus datos: los valores de los símbolos que no son "
            "incógnitas y lo medido o exigido. Ej.: RL=40 con V(i)=125m e I(RL)=230m; "
            "RL=60 con I(RL)=220m."
        ),
    )
    preguntas: list[Pregunta] | None = Field(
        default=None,
        description=(
            "Lo que el problema pide calcular, cada una con sus valores: la corriente "
            "de cortocircuito es I(RL) con RL=0 y vS=100m."
        ),
    )
    metodo: Literal["nodos", "mallas", "reduccion", "thevenin", "completo"] = Field(
        default="completo",
        description=(
            "El método que pidió el usuario; 'completo' si no pidió uno o pidió varios."
        ),
    )
    terminales: list[str] | None = Field(
        default=None,
        description=(
            "Los dos nodos entre los que se mira la red, para reducción (resistencia "
            "equivalente) o Thévenin/Norton. Ej. ['a', '0']. El sistema conecta entre "
            "ellos su propia fuente de prueba de 1 V: no la agregues al netlist."
        ),
    )
    frecuencia_hz: float | None = Field(
        default=None,
        description="Frecuencia para análisis fasorial en AC; omitir en DC.",
    )


class DesignOutcome(BaseModel):
    """Hay suficiente información: la especificación completa de siempre."""

    mode: Literal["design"]
    spec: CircuitSpec


class OrchestratorResult(BaseModel):
    """Envoltorio de nivel superior para el structured output del LLM.

    El discriminador vive en un campo (outcome.mode), no en la raíz: varios
    proveedores no aceptan una unión suelta como schema de nivel superior
    para tool calling, pero sí un objeto con un campo discriminado adentro.
    """

    pensamiento_ingenieril: str = Field(
        default="",
        description=(
            "Analiza el problema con conceptos de ingeniería electrónica (Sedra/Boylestad): "
            "identifica si se resuelve con una topología del catálogo, si se compone en cascada "
            "por etapas (ej. pasa-banda = pasa-altos + pasa-bajos), si requiere clarificación, "
            "o si es un circuito ya dado que hay que analizar (mallas, nodos, reducción, Thévenin)."
        ),
    )
    outcome: Annotated[
        ChatOutcome | ClarifyOutcome | DesignOutcome | AnalysisOutcome,
        Field(discriminator="mode"),
    ]
