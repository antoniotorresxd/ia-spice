"""Carga del banco de circuitos de prueba.

El banco es datos, no código: vive en YAML para que añadir un caso no exija
tocar Python y para que el conjunto sea auditable de un vistazo.
"""

from pathlib import Path

import yaml

# src/agents/evaluacion/banco.py -> parents[3] es apps/agents
BANCO_POR_DEFECTO = Path(__file__).resolve().parents[3] / "evaluacion" / "banco.yaml"

_CLAVES = ("id", "descripcion", "spec", "referencia")
_CLAVES_REFERENCIA = ("metrica", "objetivo", "componentes")


class CasoInvalido(ValueError):
    """Un caso mal formado. Se falla ruidosamente al cargar: un banco a medias
    produciría métricas silenciosamente incompletas."""


def validar_caso(caso: dict) -> dict:
    for clave in _CLAVES:
        if clave not in caso:
            raise CasoInvalido(f"caso sin '{clave}': {caso.get('id', caso)}")

    referencia = caso["referencia"]
    for clave in _CLAVES_REFERENCIA:
        if clave not in referencia:
            raise CasoInvalido(f"referencia de '{caso['id']}' sin '{clave}'")

    if not caso["spec"].get("blocks"):
        raise CasoInvalido(f"caso '{caso['id']}' sin bloques")

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
