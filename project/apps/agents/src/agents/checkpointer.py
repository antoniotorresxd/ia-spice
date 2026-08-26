"""Persistencia del estado del grafo entre iteraciones.

El lazo del curador es con estado por naturaleza: cada iteración parte del
resultado de la anterior. Con el checkpointer en memoria ese estado vive solo
dentro del proceso, así que una corrida interrumpida se pierde entera y hay que
recomenzarla. La tesina registra la recuperabilidad como RNF-03.2, y cumplirlo
exige que el estado sobreviva al proceso.

La base es la misma Neon que usa el resto del sistema. Neon habla los dos
protocolos: el HTTP que consume la API a través del driver `neon-http`, y el de
Postgres que entiende psycopg. Levantar una segunda base solo para esto sería
una más que mantener sin ganar nada.
"""

import os
from contextlib import contextmanager

from langgraph.checkpoint.memory import MemorySaver

CHECKPOINTER_URL = "CHECKPOINTER_URL"


def checkpointer_url() -> str | None:
    """La cadena de conexión, o None si no hay ninguna configurada."""
    return os.environ.get(CHECKPOINTER_URL) or None


@contextmanager
def open_checkpointer():
    """Abre el checkpointer que corresponda al entorno.

    Con `CHECKPOINTER_URL` definida persiste en Postgres; sin ella cae a
    memoria. La degradación es deliberada: las pruebas y el desarrollo local no
    deberían exigir una base, y el grafo produce el mismo resultado en ambos
    casos. Lo único que se pierde sin base es poder retomar una corrida
    interrumpida, y eso se anuncia en el arranque en lugar de fingirse.
    """
    url = checkpointer_url()
    if url is None:
        yield MemorySaver()
        return

    # Import perezoso: sin base configurada no hace falta psycopg ni pagar su
    # importación.
    from langgraph.checkpoint.postgres import PostgresSaver

    with PostgresSaver.from_conn_string(url) as saver:
        yield saver


def setup() -> None:
    """Crea las tablas que el checkpointer necesita.

    Se ejecuta a mano una sola vez, no en cada arranque: escribe DDL sobre la
    base del usuario y eso no debe ocurrir de forma implícita al levantar un
    servicio.

        uv run --env-file .env python -m agents.checkpointer
    """
    url = checkpointer_url()
    if url is None:
        raise RuntimeError(
            f"{CHECKPOINTER_URL} no está definida; no hay base donde crear las tablas"
        )

    from langgraph.checkpoint.postgres import PostgresSaver

    with PostgresSaver.from_conn_string(url) as saver:
        saver.setup()


if __name__ == "__main__":
    setup()
    print("tablas del checkpointer listas")
