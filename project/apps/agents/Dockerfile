# Contenedor del subsistema de agentes.
#
# Este contenedor es el que sostiene el control de seguridad que la tesina
# describe: el agente de escritura genera código PySpice y el de shell lo
# ejecuta con ngspice. Ejecutar artefactos derivados de la salida de un modelo
# es una superficie que conviene contener, y el aislamiento por contenedor es
# la contención que el diseño reclama (RIMP-10).

FROM python:3.12-slim AS base

# ngspice es una dependencia de sistema, no de Python: el nodo `shell` lo
# invoca como subproceso. Sin el binario el pipeline arranca pero no puede
# validar nada, así que va en la imagen y no en un paso aparte.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ngspice \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

WORKDIR /app

# Las dependencias primero y el código después: mientras el lock no cambie,
# reconstruir tras editar un agente no vuelve a resolver el entorno.
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev

# Datos que el sistema lee en caliente. `config` lleva los pesos y umbrales del
# curador, que la tesina exige poder ajustar sin recompilar; montarlo como
# volumen permite experimentar sin reconstruir la imagen.
COPY config ./config
COPY evaluacion ./evaluacion

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# No corre como root: si algo escapara del subproceso de ngspice, encontraría
# una cuenta sin privilegios.
RUN useradd --create-home --uid 10001 agentes \
    && chown -R agentes:agentes /app
USER agentes

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"

CMD ["uvicorn", "agents.api:app", "--host", "0.0.0.0", "--port", "8000"]
