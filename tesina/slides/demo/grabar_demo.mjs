// Graba la demostración de SPICE: pedido → generación → visualizador.
//
// Inicia sesión fuera de cámara (la grabación empieza ya dentro de la app) y
// anota en marcas.json el segundo exacto de cada momento, para que
// editar_demo.py arme el corte de ~30 s sin adivinar tiempos.
//
// uso:
//   SPICE_DEMO_EMAIL=... SPICE_DEMO_PASSWORD=... node grabar_demo.mjs [carpeta_salida]
//
// Variables opcionales: SPICE_URL, SPICE_PROMPT, CHROMIUM_PATH.
import { mkdir, writeFile, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const URL = (process.env.SPICE_URL ?? 'https://client-production-4128.up.railway.app').replace(/\/$/, '')
const EMAIL = process.env.SPICE_DEMO_EMAIL
const PASSWORD = process.env.SPICE_DEMO_PASSWORD
const PROMPT =
  process.env.SPICE_PROMPT ??
  'Diseñar un filtro pasa-altas activo de primer orden con frecuencia de corte de 200 Hz ' +
    'para una señal senoidal de entrada de 500 mV a 1 kHz.'
const OUT = process.argv[2] ?? 'toma'
const SIZE = { width: 1920, height: 1080 }
const MAX_GENERACION_MS = 8 * 60 * 1000

if (!EMAIL || !PASSWORD) {
  console.error('Faltan SPICE_DEMO_EMAIL / SPICE_DEMO_PASSWORD en el entorno.')
  process.exit(1)
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

// 1) Sesión fuera de cámara
const login = await browser.newContext({ viewport: SIZE })
const lp = await login.newPage()
await lp.goto(URL, { waitUntil: 'networkidle' })
await lp.locator('#email').fill(EMAIL)
await lp.locator('#password').fill(PASSWORD)
await lp.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click()
await lp.waitForURL((u) => !u.toString().includes('error'), { timeout: 30_000 })
await lp.getByText('Preparando tu espacio…').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
await pausa(2000)
const estado = await login.storageState()
await login.close()

// 2) Toma grabada
const ctx = await browser.newContext({
  viewport: SIZE,
  storageState: estado,
  recordVideo: { dir: OUT, size: SIZE },
})
const page = await ctx.newPage()
const t0 = Date.now()
const marcas = {}
const marca = (nombre) => {
  marcas[nombre] = (Date.now() - t0) / 1000
  console.log(`· ${nombre}: ${marcas[nombre].toFixed(1)} s`)
}

await page.goto(`${URL}/new`, { waitUntil: 'networkidle' })
const campo = page.locator('#new-request-prompt')
await campo.waitFor({ timeout: 30_000 })
await pausa(1200)
marca('nueva_solicitud')
await campo.click()
marca('escribe')
await campo.pressSequentially(PROMPT, { delay: 28 })
await pausa(600)
await page.getByRole('button', { name: /Enviar solicitud/ }).click()
marca('envia')

await page.waitForURL(/\/conversations\/[^/]+/, { timeout: 60_000 })
marca('conversacion')

// Espera a que todas las etapas terminen ("5 de 5 etapas completadas") o falle
const inicioGen = Date.now()
let resultado = 'tiempo_agotado'
while (Date.now() - inicioGen < MAX_GENERACION_MS) {
  const progreso = await page.getByText(/\d+ de \d+ etapas completadas/).first().textContent().catch(() => null)
  const m = progreso?.match(/(\d+) de (\d+)/)
  if (m && Number(m[2]) > 0 && m[1] === m[2]) {
    resultado = 'completada'
    break
  }
  if (await page.getByText('Fallida', { exact: true }).first().isVisible().catch(() => false)) {
    resultado = 'fallida'
    break
  }
  await pausa(500)
}
marca('termina')
marcas.resultado = resultado
marcas.segundos_generacion = (Date.now() - inicioGen) / 1000
await pausa(3500)
marca('resultado_visto')

if (resultado === 'completada') {
  // Visualizador: primero el enlace visible; si no, desde la pestaña de archivos
  let enlace = page.getByRole('link', { name: /Visualizador/ }).first()
  if (!(await enlace.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Archivos/ }).first().click().catch(() => {})
    await pausa(800)
    enlace = page.getByRole('link', { name: /Visualizador/ }).first()
  }
  await enlace.click()
  await page.waitForURL(/\/visualizer/, { timeout: 30_000 })
  await page.getByText('Diagrama Esquemático').first().waitFor({ timeout: 30_000 })
  await pausa(1500)
  marca('esquema')
  await pausa(4500)

  await page.getByText('Curva de Simulación SPICE').first().click()
  await pausa(800)
  marca('curva')
  await pausa(3500)

  await page.getByText('Código Netlist SPICE').first().click()
  await pausa(800)
  marca('codigo')
  await pausa(3000)
}
marca('fin')

await ctx.close()
await browser.close()

// Renombra el video y guarda las marcas
const webm = (await readdir(OUT)).find((f) => f.endsWith('.webm'))
if (webm) await rename(join(OUT, webm), join(OUT, 'toma.webm'))
await writeFile(join(OUT, 'marcas.json'), JSON.stringify(marcas, null, 2))
console.log(`Listo: ${join(OUT, 'toma.webm')} (${resultado})`)
