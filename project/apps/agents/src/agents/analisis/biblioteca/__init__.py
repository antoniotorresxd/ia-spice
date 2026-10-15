"""Biblioteca de planteamientos de referencia (ver franco_cap1.yaml).

Los ejemplos que el LLM ve salen de aquí y no de párrafos en el prompt:
agregar un problema resuelto es agregar un dato, y cada uno está probado
contra la respuesta del libro (tests/test_biblioteca.py). Para un pedido
nuevo se recuperan los más parecidos por palabras en común (BM25 sobre el
enunciado y el tema), sin embeddings ni servicios externos.
"""

import json
import math
import re
import unicodedata
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path

import yaml

DIRECTORIO = Path(__file__).resolve().parent

# El banco de evaluación corre cada problema de la biblioteca contra el LLM:
# ese problema no puede aparecer como su propio ejemplo.
EXCLUIR: ContextVar[frozenset[str]] = ContextVar("biblioteca_excluir", default=frozenset())

_VACIAS = {
    "the", "and", "for", "with", "from", "that", "this", "its", "are", "has", "find", "use", "using",
    "una", "uno", "los", "las", "del", "con", "por", "para", "que", "como", "de", "la", "el", "en",
    "kohm", "ohm", "mohm", "v/v",
}


@lru_cache(maxsize=1)
def cargar() -> tuple[dict, ...]:
    entradas: list[dict] = []
    for archivo in sorted(DIRECTORIO.glob("*.yaml")):
        entradas += yaml.safe_load(archivo.read_text(encoding="utf-8")) or []
    ids = [e["id"] for e in entradas]
    repetidos = {i for i in ids if ids.count(i) > 1}
    if repetidos:
        raise ValueError(f"ids repetidos en la biblioteca: {sorted(repetidos)}")
    return tuple(entradas)


def _palabras(texto: str) -> list[str]:
    plano = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
    return [p for p in re.findall(r"[a-z][a-z0-9]+", plano) if len(p) > 2 and p not in _VACIAS]


def recuperar(texto: str, k: int = 2, excluir: frozenset[str] | set[str] = frozenset()) -> list[dict]:
    """Las `k` entradas más parecidas a `texto` (BM25), sin las excluidas.
    Solo las que comparten algo significativo: un pedido de otro tema no
    recibe ejemplos que lo confundan."""
    excluir = set(excluir) | set(EXCLUIR.get())
    entradas = [e for e in cargar() if e["id"] not in excluir]
    if not entradas:
        return []
    documentos = [_palabras(f"{e['enunciado']} {e.get('tema', '')}") for e in entradas]
    promedio = sum(len(d) for d in documentos) / len(documentos)
    consulta = set(_palabras(texto))
    puntajes = []
    for entrada, documento in zip(entradas, documentos):
        puntaje = 0.0
        for palabra in consulta:
            f = documento.count(palabra)
            if not f:
                continue
            n = sum(1 for d in documentos if palabra in d)
            idf = math.log(1 + (len(documentos) - n + 0.5) / (n + 0.5))
            puntaje += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * len(documento) / promedio))
        puntajes.append((puntaje, entrada))
    puntajes.sort(key=lambda p: -p[0])
    umbral = 2.0
    return [e for p, e in puntajes[:k] if p >= umbral]


def como_ejemplo(entrada: dict) -> str:
    """El ejemplo tal como lo ve el LLM: el enunciado y la respuesta que se
    espera de él (el planteamiento en la forma del schema)."""
    return (
        f"Enunciado: {entrada['enunciado']}\n"
        f"Respuesta (outcome): {json.dumps(entrada['planteamiento'], ensure_ascii=False)}"
    )
