# Video de demostración (~30 s)

Graba la aplicación desplegada haciendo el flujo completo —pedido en lenguaje
natural, generación por los agentes y visualizador— y lo edita a un MP4 de
unos 30 segundos con los títulos del guion.

## Requisitos del entorno

- Acceso de red a `client-production-4128.up.railway.app` y al dominio de la
  API en Railway (el de `VITE_API_URL`), o a `up.railway.app` completo.
- Una cuenta de prueba con sus modelos asignados, en las variables de entorno
  `SPICE_DEMO_EMAIL` y `SPICE_DEMO_PASSWORD` (nunca en el repositorio).
- Chromium de Playwright (`/opt/pw-browsers`), `ffmpeg` con libx264 y la
  fuente Inter instalada.

## Pasos

```sh
cd tesina/slides/demo
npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.56.1

node grabar_demo.mjs toma1          # graba y guarda toma1/toma.webm + marcas.json
python3 editar_demo.py toma1        # genera toma1/demo_spice.mp4
```

Conviene grabar dos o tres tomas y quedarse con la mejor: la respuesta de la IA
cambia de una corrida a otra. El pedido por defecto es el filtro pasa-altas
activo de 200 Hz; se cambia con `SPICE_PROMPT`.

## Guion

| Tiempo | Qué se ve | Título |
|---|---|---|
| 0–3 s | Nueva solicitud | SPICE · de una idea a un circuito verificado |
| 3–9 s | Se escribe y se envía el pedido | 1 · Lo pide en lenguaje natural |
| 9–17 s | Progreso de la ejecución (acelerado, se indica en pantalla) | 2 · Los agentes lo diseñan y lo simulan |
| 17–20 s | Respuesta y estado validado | 3 · Verificado contra la meta |
| 20–25 s | Diagrama esquemático | 4 · Esquema del circuito |
| 25–28 s | Curva de simulación | Simulación SPICE |
| 28–30 s | Código netlist | Circuito listo en N s (tiempo real de generación) |
