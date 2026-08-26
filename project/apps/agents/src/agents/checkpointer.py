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
import re
from contextlib import contextmanager
from urllib.parse import parse_qs, unquote, urlsplit

from langgraph.checkpoint.memory import MemorySaver

CHECKPOINTER_URL = "CHECKPOINTER_URL"

# Un identificador de Postgres sin comillas. Se valida antes de interpolarlo en
# el CREATE SCHEMA: el valor sale de una variable de entorno nuestra, pero
# construir DDL por concatenación sin comprobar nada es una costumbre que
# tarde o temprano se paga.
_IDENTIFICADOR = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


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


def schema_from_url(url: str) -> str | None:
    """El esquema que pide la cadena, si trae `options=-c search_path=...`.

    Aislar las tablas del checkpointer en su propio esquema evita el único
    problema serio de compartir base con la API: LangGraph trae su propio
    sistema de migraciones —diez, versionadas en `checkpoint_migrations`, y
    alguna es un ALTER TABLE— así que si esas tablas vivieran en `public`,
    Drizzle las vería como deriva de su esquema y querría revertirlas. Cada
    sistema manda en el suyo y no se estorban.
    """
    options = parse_qs(urlsplit(url).query).get("options", [""])[0]
    encontrado = re.search(r"search_path\s*=\s*([^\s,]+)", unquote(options))
    return encontrado.group(1) if encontrado else None


def setup() -> None:
    """Crea el esquema y las tablas que el checkpointer necesita.

    Se ejecuta a mano una sola vez, no en cada arranque: escribe DDL sobre la
    base del usuario y eso no debe ocurrir de forma implícita al levantar un
    servicio. Es el equivalente, del lado de agents, a `db:migrate` del lado de
    la API; el guion `db:setup` de la raíz del workspace corre los dos.

        uv run --env-file .env python -m agents.checkpointer
    """
    url = checkpointer_url()
    if url is None:
        raise RuntimeError(
            f"{CHECKPOINTER_URL} no está definida; no hay base donde crear las tablas"
        )

    from langgraph.checkpoint.postgres import PostgresSaver

    esquema = schema_from_url(url)
    if esquema is not None and not _IDENTIFICADOR.match(esquema):
        raise RuntimeError(f"search_path no es un identificador válido: {esquema!r}")

    with PostgresSaver.from_conn_string(url) as saver:
        if esquema is not None:
            # Sin esto, el primer arranque falla con un "schema does not exist"
            # que no dice qué hacer al respecto.
            saver.conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{esquema}"')
        saver.setup()


if __name__ == "__main__":
    setup()
    print("tablas del checkpointer listas")
