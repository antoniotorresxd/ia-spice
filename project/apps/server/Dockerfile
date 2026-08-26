# Contenedor de la API.
#
# El contexto de construcción es `project/`, no `apps/server/`: cliente y
# servidor comparten un único workspace de Bun con un solo bun.lock, así que
# instalar desde el subdirectorio dejaría el lock fuera de alcance y rompería
# la instalación reproducible.

FROM oven/bun:1-slim

WORKDIR /app

# Los manifiestos primero. Hace falta también el del cliente: `bun install`
# resuelve el workspace entero y sin su package.json el lock no cuadra. A
# cambio, la imagen carga con dependencias que el servidor no usa; es el precio
# de un lock compartido, y se paga una vez en construcción.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
RUN bun install --frozen-lockfile

COPY apps/server ./apps/server

WORKDIR /app/apps/server

# La imagen de Bun ya trae un usuario sin privilegios.
USER bun

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
