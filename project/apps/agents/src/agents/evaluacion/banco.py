"""Carga del banco de circuitos de prueba.

El banco es datos, no código: vive en YAML para que añadir un caso no exija
tocar Python y para que el conjunto sea auditable de un vistazo.
"""

from pathlib import Path

import yaml

# src/agents/evaluacion/banco.py -> parents[3] es apps/agents
BANCO_POR_DEFECTO = Path(__file__).resolve().parents[3] / "evaluacion" / "banco.yaml"

_CLAVES = ("id", "descripcion", "spec", "referencia")
# Uno por requisito: `referencia` es una lista (Slice C), no un único dict —
# un caso con varios requisitos o con `connections` trae varias entradas.
_CLAVES_REQUISITO = ("requisito", "metrica", "objetivo", "componentes")

# Estratos del banco. El orden es el de las tablas del capítulo de resultados.
NIVELES = ("basico", "intermedio", "avanzado", "limite", "negativo")
# Lo que el sistema DEBE responder. Los casos negativos piden algo físicamente
# imposible: el acierto ahí es rechazarlos, no "resolverlos".
VEREDICTOS_ESPERADOS = ("accepted", "rejected")


class CasoInvalido(ValueError):
    """Un caso mal formado. Se falla ruidosamente al cargar: un banco a medias
    produciría métricas silenciosamente incompletas."""


def validar_caso(caso: dict) -> dict:
    for clave in _CLAVES:
        if clave not in caso:
            raise CasoInvalido(f"caso sin '{clave}': {caso.get('id', caso)}")

    referencia = caso["referencia"]
    if not referencia:
        raise CasoInvalido(f"caso '{caso['id']}' sin requisitos de referencia")
    for requisito in referencia:
        for clave in _CLAVES_REQUISITO:
            if clave not in requisito:
                raise CasoInvalido(f"un requisito de '{caso['id']}' sin '{clave}': {requisito}")

    if not caso["spec"].get("blocks"):
        raise CasoInvalido(f"caso '{caso['id']}' sin bloques")

    # `nivel` y `esperado` son opcionales para que un banco propio de pocas
    # líneas siga cargando, pero si vienen tienen que ser valores conocidos:
    # una errata ("basic") partiría silenciosamente los resúmenes por nivel.
    caso.setdefault("nivel", "sin_nivel")
    if caso["nivel"] not in (*NIVELES, "sin_nivel"):
        raise CasoInvalido(f"caso '{caso['id']}' con nivel desconocido: {caso['nivel']}")
    caso.setdefault("esperado", "rejected" if caso["nivel"] == "negativo" else "accepted")
    if caso["esperado"] not in VEREDICTOS_ESPERADOS:
        raise CasoInvalido(f"caso '{caso['id']}' con veredicto esperado desconocido: {caso['esperado']}")

    return caso


def cargar_banco(path: str | Path | None = None) -> list[dict]:
    resolved = Path(path) if path is not None else BANCO_POR_DEFECTO
    if not resolved.is_file():
        raise FileNotFoundError(f"banco no encontrado: {resolved}")

    with resolved.open(encoding="utf-8") as handle:
        contenido = yaml.safe_load(handle) or {}

    casos = [validar_caso(caso) for caso in contenido.get("casos", [])]

    ids = [caso["id"] for caso in casos]
    if len(ids) != len(set(ids)):
        raise CasoInvalido("hay ids repetidos en el banco")

    return casos
