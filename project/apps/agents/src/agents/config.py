"""Carga de la configuración externa de los agentes.

Los pesos, factores y umbrales viven en un YAML y no en el código para que la
evaluación experimental pueda moverlos sin tocar el repositorio. La ruta se
sobreescribe con CURADOR_CONFIG_PATH, que es como cada experimento usa la suya.
"""

import os
from pathlib import Path

import yaml

# src/agents/config.py -> parents[2] es apps/agents
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "curador.yaml"

_cache: dict | None = None


def load_config(path: str | Path | None = None) -> dict:
    """Lee el YAML de configuración. Sin caché: siempre toca disco."""
    resolved = Path(path) if path is not None else DEFAULT_CONFIG_PATH
    if not resolved.is_file():
        raise FileNotFoundError(f"config file not found: {resolved}")
    with resolved.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def get_config() -> dict:
    """Configuración cacheada en proceso. Es lo que consumen los nodos."""
    global _cache
    if _cache is None:
        _cache = load_config(os.environ.get("CURADOR_CONFIG_PATH"))
    return _cache


def reset_config_cache() -> None:
    """Invalida la caché. Existe para las pruebas y para recargar en caliente."""
    global _cache
    _cache = None
