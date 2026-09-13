// Motor dinámico de parseo, análisis topológico y layout de netlists SPICE.
// Diseñado para interpretar cualquier netlist SPICE (R, C, L, V, I, D, X)
// y generar un esquema geométrico limpio con soporte anti-colisión.

export type ElementKind = 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'X' | 'Q'

export type NetlistElement = {
  kind: ElementKind
  name: string
  nodes: string[]
  /** Resto de la línea tras el nombre y los nodos: valor, directivas o subcircuito. */
  extra: string
}

export type Measurement = { name: string; condition: string }

export type ParsedNetlist = {
  title: string
  elements: NetlistElement[]
  measurements: Measurement[]
}

export const GROUND = '0'

export class NetlistParseError extends Error {}

/** Parsea sufijos estándar de ingeniería de SPICE a número de punto flotante. */
export function parseSpiceValue(raw: string): number {
  if (!raw) return NaN
  const clean = raw.trim().replace(/[ΩvVaAhHfFsS]/g, '')
  // Manejar notación científica directa o prefijos SPICE
  const match = clean.match(/^([+-]?[\d.]+)(?:[eE]([+-]?\d+)|([a-zA-Z]+))?/)
  if (!match) return parseFloat(raw)
  let val = parseFloat(match[1])
  if (match[2]) {
    val = val * Math.pow(10, parseInt(match[2], 10))
  } else if (match[3]) {
    const s = match[3].toLowerCase()
    if (s.startsWith('meg')) val *= 1e6
    else if (s.startsWith('m')) val *= 1e-3
    else if (s.startsWith('k')) val *= 1e3
    else if (s.startsWith('u')) val *= 1e-6
    else if (s.startsWith('n')) val *= 1e-9
    else if (s.startsWith('p')) val *= 1e-12
    else if (s.startsWith('f')) val *= 1e-15
    else if (s.startsWith('g')) val *= 1e9
    else if (s.startsWith('t')) val *= 1e12
  }
  return val
}

export function parseNetlist(text: string): ParsedNetlist {
  const rawLines = text.split('\n').map((l) => l.trim())
  let title = 'Circuito'
  const elements: NetlistElement[] = []
  const measurements: Measurement[] = []
  let inBlock = false

  for (const line of rawLines) {
    if (!line || line.startsWith('*') || line.startsWith(';')) continue

    const lower = line.toLowerCase()
    const measMatch = line.match(/^meas\s+(\w+)\s+(\S+)\s+(.+)$/i)
    if (measMatch) {
      const mode = measMatch[1].toUpperCase()
      const varName = measMatch[2]
      const expr = measMatch[3]
      const condition = expr.toUpperCase().startsWith('WHEN')
        ? expr.slice(4).trim()
        : `${mode}: ${expr}`
      measurements.push({ name: varName, condition })
    }

    if (lower.startsWith('.title')) {
      title = line.slice(6).trim() || title
      continue
    }
    if (lower.startsWith('.control') || lower.startsWith('.subckt')) {
      inBlock = true
      continue
    }
    if (lower.startsWith('.endc') || lower.startsWith('.ends')) {
      inBlock = false
      continue
    }
    if (inBlock || line.startsWith('.')) continue

    const tokens = line.split(/\s+/)
    const name = tokens[0]
    const kind = name[0]?.toUpperCase() ?? ''
    if (!'RCVDXLIQ'.includes(kind)) continue

    if (kind === 'X') {
      const subckt = tokens[tokens.length - 1]
      const nodes = tokens.slice(1, tokens.length - 1).map(normalizeNode)
      if (nodes.length < 2) continue
      elements.push({ kind: kind as ElementKind, name, nodes, extra: subckt })
    } else if (kind === 'Q') {
      // Q<nombre> <colector> <base> <emisor> [<substrato>] <modelo>
      if (tokens.length < 5) continue
      const nodes = [normalizeNode(tokens[1]), normalizeNode(tokens[2]), normalizeNode(tokens[3])]
      const extra = tokens.slice(4).join(' ')
      elements.push({ kind: kind as ElementKind, name, nodes, extra })
    } else {
      if (tokens.length < 3) continue
      const nodes = [normalizeNode(tokens[1]), normalizeNode(tokens[2])]
      const extra = tokens.slice(3).join(' ')
      elements.push({ kind: kind as ElementKind, name, nodes, extra })
    }
  }

  if (elements.length === 0) {
    throw new NetlistParseError('No se encontró ningún componente (R/C/L/V/I/D/X) en el texto.')
  }
  return { title, elements, measurements }
}

function normalizeNode(node: string): string {
  const lower = node.toLowerCase().trim()
  if (lower === 'gnd' || lower === 'ground') return GROUND
  return lower
}

export function computeDepths(elements: NetlistElement[]): Record<string, number> {
  const adj: Record<string, string[]> = {}
  const addEdge = (a: string, b: string) => {
    ;(adj[a] ??= []).push(b)
    ;(adj[b] ??= []).push(a)
  }

  for (const e of elements) {
    // X (subcircuito/opamp) y Q (BJT) traen 3+ nodos: se encadenan de a
    // pares consecutivos (p. ej. Q: colector-base, base-emisor) para que
    // el grafo de conectividad los atraviese como un solo nodo intermedio.
    if (e.kind === 'X' || e.kind === 'Q') {
      for (let i = 0; i < e.nodes.length - 1; i++) {
        const [a, b] = [e.nodes[i], e.nodes[i + 1]]
        if (a !== GROUND && b !== GROUND) addEdge(a, b)
      }
    } else if (e.nodes[0] !== GROUND && e.nodes[1] !== GROUND) {
      addEdge(e.nodes[0], e.nodes[1])
    }
  }

  // Priorizar fuentes de señal (AC, SIN, PULSE, o nodos con 'in'/'input'/'vin')
  const signalSource = elements.find((e) => {
    if (e.kind !== 'V' && e.kind !== 'I') return false
    const upperExtra = e.extra.toUpperCase()
    const upperName = e.name.toUpperCase()
    const isAcOrSin = upperExtra.includes('SIN') || upperExtra.includes('AC') || upperExtra.includes('PULSE')
    const hasInNode = e.nodes.some((n) => /^(in|vin|inp|input|sig|signal)/i.test(n))
    return isAcOrSin || hasInNode || upperName.startsWith('VIN') || upperName.startsWith('VSIG')
  })

  // Si no hay fuente de señal explícita, evitar empezar en rieles de alimentación DC (Vcc, Vdd, Vee, Vss) si hay otra fuente
  const anySource =
    signalSource ??
    elements.find((e) => {
      if (e.kind !== 'V' && e.kind !== 'I') return false
      const upperName = e.name.toUpperCase()
      const isDcRail = /^(VCC|VDD|VEE|VSS|VBAT|V\+|V-)/i.test(upperName)
      return !isDcRail
    }) ??
    elements.find((e) => e.kind === 'V' || e.kind === 'I')

  let start = anySource?.nodes.find((n) => n !== GROUND) ?? null
  if (!start) start = Object.keys(adj)[0] ?? null

  const depth: Record<string, number> = {}
  if (start) {
    depth[start] = 0
    const queue = [start]
    while (queue.length) {
      const n = queue.shift() as string
      for (const m of adj[n] ?? []) {
        if (!(m in depth)) {
          depth[m] = depth[n] + 1
          queue.push(m)
        }
      }
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const e of elements) {
      const known = e.nodes.filter((n) => n !== GROUND && n in depth)
      const unknown = e.nodes.filter((n) => n !== GROUND && !(n in depth))
      if (known.length && unknown.length) {
        const base = Math.max(...known.map((n) => depth[n]))
        for (const n of unknown) {
          depth[n] = base
          changed = true
        }
      }
    }
  }
  for (const e of elements) {
    for (const n of e.nodes) {
      if (n !== GROUND && !(n in depth)) depth[n] = 0
    }
  }

  return depth
}

function trimNum(n: number): string {
  if (Math.abs(n) < 0.01) return (Math.round(n * 1000) / 1000).toString()
  return (Math.round(n * 100) / 100).toString()
}

export function fmtOhms(raw: string): string {
  const n = parseSpiceValue(raw)
  if (!isFinite(n)) return raw
  if (n >= 1e6) return `${trimNum(n / 1e6)} MΩ`
  if (n >= 1e3) return `${trimNum(n / 1e3)} kΩ`
  if (n < 1e-3) return `${trimNum(n * 1e6)} µΩ`
  if (n < 1) return `${trimNum(n * 1e3)} mΩ`
  return `${trimNum(n)} Ω`
}

export function fmtFarads(raw: string): string {
  const n = parseSpiceValue(raw)
  if (!isFinite(n)) return raw
  if (n < 1e-9) return `${trimNum(n * 1e12)} pF`
  if (n < 1e-6) return `${trimNum(n * 1e9)} nF`
  if (n < 1e-3) return `${trimNum(n * 1e6)} µF`
  if (n < 1) return `${trimNum(n * 1e3)} mF`
  return `${trimNum(n)} F`
}

export function fmtHenries(raw: string): string {
  const n = parseSpiceValue(raw)
  if (!isFinite(n)) return raw
  if (n < 1e-6) return `${trimNum(n * 1e9)} nH`
  if (n < 1e-3) return `${trimNum(n * 1e6)} µH`
  if (n < 1) return `${trimNum(n * 1e3)} mH`
  return `${trimNum(n)} H`
}

export function fmtSource(extra: string): string {
  const upper = extra.toUpperCase()
  if (upper.includes('SIN')) {
    const m = extra.match(/SIN\s*\(\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i)
    if (m) {
      const fNum = parseFloat(m[3])
      const fStr = fmtFrequency(fNum) || `${m[3]} Hz`
      return `SIN(${m[1]}V ${m[2]}V ${fStr})`
    }
    return extra
  }
  if (upper.includes('AC')) {
    const m = extra.match(/AC\s+([\d.eE+-]+)/i)
    return `${m ? m[1] : '1'} V (AC, señal de prueba)`
  }
  const dc = extra.match(/DC\s+([\d.eE+-]+)/i)
  if (dc) return `${dc[1]} V (DC)`
  const n = parseSpiceValue(extra)
  return isFinite(n) ? `${n} V` : extra
}

export function fmtFrequency(hz: number): string {
  if (!isFinite(hz) || hz <= 0) return ''
  if (hz >= 1e6) return `${trimNum(hz / 1e6)} MHz`
  if (hz >= 1e3) return `${trimNum(hz / 1e3)} kHz`
  return `${trimNum(hz)} Hz`
}

export function describeCircuit(parsed: ParsedNetlist): string {
  const hasX = parsed.elements.some((e) => e.kind === 'X')
  const rElements = parsed.elements.filter((e) => e.kind === 'R')
  const cElements = parsed.elements.filter((e) => e.kind === 'C')
  const lElements = parsed.elements.filter((e) => e.kind === 'L')
  const dElements = parsed.elements.filter((e) => e.kind === 'D')
  const qElements = parsed.elements.filter((e) => e.kind === 'Q')

  // Fuente regulada con Zener
  const isZener = dElements.some(
    (d) =>
      d.name.toLowerCase().startsWith('dz') ||
      d.extra.toLowerCase().includes('zener') ||
      /1n47|1n75|bzx/i.test(d.extra),
  )
  if (isZener && rElements.length >= 1) {
    return 'Es una fuente regulada con diodo Zener: la resistencia limitadora en serie absorbe el exceso de voltaje y el diodo Zener mantiene estable el voltaje de salida (Vout) mediante su tensión de ruptura inversa. Los capacitores o cargas en paralelo suavizan el rizado y reciben la tensión regulada.'
  }

  // Amplificador Op-Amp
  if (hasX) {
    if (rElements.length >= 2) {
      const rf = parseSpiceValue(rElements[0].extra)
      const rg = parseSpiceValue(rElements[1].extra)
      if (isFinite(rf) && isFinite(rg) && rg > 0) {
        const gain = 1 + rf / rg
        return `Es un amplificador no inversor con amplificador operacional: la ganancia teórica es Av = 1 + (Rf / Rg) = ${trimNum(gain)} (la señal de entrada se amplifica ${trimNum(gain)} veces sin invertir la fase).`
      }
    }
    return 'Es un amplificador no inversor con amplificador operacional: la entrada sube de nivel según la relación entre las dos resistencias de realimentación (Rf y Rg), sin invertir la señal.'
  }

  // Filtro Pasabajos / Pasaaltas RC
  if (rElements.length === 1 && cElements.length === 1 && lElements.length === 0) {
    const rVal = parseSpiceValue(rElements[0].extra)
    const cVal = parseSpiceValue(cElements[0].extra)
    const fc = 1 / (2 * Math.PI * rVal * cVal)

    // Detectar si es pasabajos (C a tierra) o pasaaltas (C en serie)
    const cTouchesGround = cElements[0].nodes.includes(GROUND)
    if (cTouchesGround) {
      const fcText = isFinite(fc) ? ` con frecuencia de corte fc ≈ ${fmtFrequency(fc)}` : ''
      return `Es un filtro pasabajos RC${fcText}: deja pasar las frecuencias bajas casi sin atenuar y va cortando las altas. El capacitor "absorbe" más corriente cuanto más rápido cambia la señal, así que a alta frecuencia la salida cae.`
    } else {
      const fcText = isFinite(fc) ? ` con frecuencia de corte fc ≈ ${fmtFrequency(fc)}` : ''
      return `Es un filtro pasaaltas RC${fcText}: bloquea la componente continua (DC) y las frecuencias bajas, permitiendo el paso de las frecuencias altas a partir de la frecuencia de corte.`
    }
  }

  // Filtro RLC
  if (rElements.length >= 1 && cElements.length >= 1 && lElements.length >= 1) {
    const lVal = parseSpiceValue(lElements[0].extra)
    const cVal = parseSpiceValue(cElements[0].extra)
    const f0 = 1 / (2 * Math.PI * Math.sqrt(lVal * cVal))
    const f0Text = isFinite(f0) ? ` con frecuencia de resonancia f0 ≈ ${fmtFrequency(f0)}` : ''
    return `Es un circuito RLC resonante${f0Text}: combina reactancia inductiva y capacitiva, produciendo un pico de resonancia o selectividad de frecuencia.`
  }

  // Divisor de voltaje
  if (rElements.length === 2 && cElements.length === 0 && dElements.length === 0 && lElements.length === 0) {
    const r1 = parseSpiceValue(rElements[0].extra)
    const r2 = parseSpiceValue(rElements[1].extra)
    if (isFinite(r1) && isFinite(r2) && r1 + r2 > 0) {
      const ratio = r2 / (r1 + r2)
      return `Es un divisor de voltaje: dos resistencias en serie reparten el voltaje de entrada con una relación de división de ${trimNum(ratio * 100)}% (Vout = Vin × R2 / (R1 + R2)).`
    }
    return 'Es un divisor de voltaje: dos resistencias en serie reparten el voltaje de entrada. El voltaje de salida depende solo de la proporción entre las dos resistencias, no de sus valores absolutos.'
  }

  // LED con resistencia
  if (dElements.length === 1 && rElements.length >= 1 && !isZener) {
    return 'Es un LED con resistencia limitadora: la resistencia fija cuánta corriente puede pasar por el LED para que no se queme — el LED en sí no limita la corriente por su cuenta.'
  }

  // Rectificador de onda completa (puente de diodos Graetz)
  if (dElements.length >= 4 && (cElements.length >= 1 || rElements.length >= 1)) {
    return 'Es un rectificador de onda completa en puente de diodos (puente de Graetz) con filtro: los 4 diodos alternan conducción en cada semiciclo para convertir la corriente alterna (AC) en corriente continua pulsante (DC), y el capacitor de filtro suaviza el rizado entregando tensión continua a la carga.'
  }

  // Circuito genérico dinámico
  const parts: string[] = []
  if (rElements.length) parts.push(`${rElements.length} resistencia(s)`)
  if (cElements.length) parts.push(`${cElements.length} capacitor(es)`)
  if (lElements.length) parts.push(`${lElements.length} inductor(es)`)
  if (dElements.length) parts.push(`${dElements.length} diodo(s)`)
  if (qElements.length) parts.push(`${qElements.length} transistor(es) BJT`)
  const sources = parsed.elements.filter((e) => e.kind === 'V' || e.kind === 'I')
  if (sources.length) parts.push(`${sources.length} fuente(s)`)

  return `Circuito dinámico con ${parsed.elements.length} componentes (${parts.join(', ')}) conectados a través de ${new Set(parsed.elements.flatMap((e) => e.nodes)).size} nodos.`
}

export function measurementText(measurements: Measurement[]): string {
  if (!measurements.length) {
    return 'Se mide en el punto de operación (continua): un solo instante, sin barrer frecuencias.'
  }
  if (measurements.length === 1 && measurements[0].name === 'fc') {
    return `El sistema mide fc automáticamente: la frecuencia donde la salida cae -3 dB (la mitad de la potencia) respecto a la entrada — la condición es ${measurements[0].condition}.`
  }
  return measurements
    .map((m) => {
      if (m.name === 'fc') {
        return `fc (caída a -3 dB: ${m.condition})`
      }
      return `${m.name} (${m.condition})`
    })
    .join(' · ')
}

export function componentValue(e: NetlistElement): string {
  switch (e.kind) {
    case 'R':
      return fmtOhms(e.extra)
    case 'C':
      return fmtFarads(e.extra)
    case 'L':
      return fmtHenries(e.extra)
    case 'V':
    case 'I':
      return fmtSource(e.extra)
    case 'D':
      return e.extra.toUpperCase().includes('LED') ? 'Diodo LED' : e.extra || 'Diodo'
    case 'X':
      return `subcircuito "${e.extra}"`
    default:
      return e.extra
  }
}

export const VCC_Y = 60
export const COL_ROUTE_Y = 120
export const RAIL_Y = 200
export const EMI_Y = 275
export const GROUND_Y = 390
export const BRANCH_SPACING = 120
export const SERIES_SPACING = 155
export const MARGIN_X = 70

export type LayoutSymbol =
  | { type: 'resistorH'; x1: number; x2: number; y: number; name: string; value: string }
  | { type: 'resistorV'; x: number; y1: number; y2: number; name: string; value: string }
  | { type: 'capacitorH'; x1: number; x2: number; y: number; name: string; value: string }
  | { type: 'capacitorV'; x: number; y1: number; y2: number; name: string; value: string }
  | { type: 'inductorH'; x1: number; x2: number; y: number; name: string; value: string }
  | { type: 'inductorV'; x: number; y1: number; y2: number; name: string; value: string }
  | { type: 'diodeH'; x1: number; x2: number; y: number; name: string; value: string; isLed: boolean; pointingRight: boolean }
  | {
      type: 'diodeV'
      x: number
      y1: number
      y2: number
      name: string
      value: string
      isLed: boolean
      isZener: boolean
      pointingUp: boolean
    }
  | { type: 'sourceV'; x: number; y1: number; y2: number; name: string; value: string; isAc: boolean }
  | { type: 'sourceH'; x1: number; x2: number; y: number; name: string; value: string; isAc: boolean }
  | { type: 'opamp'; cx: number; inTopX: number; inBotX: number; outX: number }
  | { type: 'bjt'; cx: number; collectorX: number; baseX: number; emitterX: number; name: string; value: string }
  | { type: 'wireH'; x1: number; x2: number; y: number; name: string; value: string }
  | { type: 'wireV'; x: number; y1: number; y2: number }
  | { type: 'wireHopH'; x1: number; x2: number; y: number; hopX: number }

export type NodeBus = {
  node: string
  xStart: number
  xEnd: number
  branches: number[]
  y?: number
}

export type TopRailSpan = {
  xStart: number
  xEnd: number
  label: string
  drops: number[]
}

export type Diagram = {
  symbols: LayoutSymbol[]
  nodeXs: Record<string, number>
  nodeBuses: NodeBus[]
  groundDrops: number[]
  topRailSpan: TopRailSpan | null
  usedSymbols: Set<
    'resistor' | 'capacitor' | 'inductor' | 'source' | 'led' | 'diode' | 'zener' | 'opamp' | 'bjt' | 'ground'
  >
  width: number
  height: number
}

function findSupplyRails(elements: NetlistElement[]): {
  rails: Set<string>
  railSources: Record<string, NetlistElement>
} {
  const rails = new Set<string>()
  const railSources: Record<string, NetlistElement> = {}
  for (const e of elements) {
    if (e.kind === 'V') {
      const [pos, neg] = e.nodes
      if (neg === GROUND) {
        const upperName = e.name.toUpperCase()
        const upperPos = pos.toUpperCase()
        const isDcNamed =
          /^(VCC|VDD|VEE|VSS|VBAT|VPOS|V\+)/i.test(upperName) ||
          /^(VCC|VDD|VEE|VSS|VBAT|VPOS|V\+)/i.test(upperPos)
        const hasOtherSignal = elements.some(
          (other) =>
            other !== e &&
            (other.kind === 'V' || other.kind === 'I') &&
            (other.extra.toUpperCase().includes('AC') ||
              other.extra.toUpperCase().includes('SIN') ||
              other.extra.toUpperCase().includes('PULSE') ||
              /^(in|vin)/i.test(other.nodes[0])),
        )
        if (isDcNamed || hasOtherSignal) {
          rails.add(pos)
          railSources[pos] = e
        }
      }
    }
  }
  return { rails, railSources }
}

export type DiodeBridge = {
  d1: NetlistElement
  d4: NetlistElement
  d3: NetlistElement
  d2: NetlistElement
  dcPos: string
  dcNeg: string
  ac1: string
  ac2: string
}

export function findDiodeBridge(elements: NetlistElement[]): DiodeBridge | null {
  const diodes = elements.filter((e) => e.kind === 'D' && e.nodes.length >= 2)
  if (diodes.length < 4) return null

  const cathodeCount: Record<string, NetlistElement[]> = {}
  const anodeCount: Record<string, NetlistElement[]> = {}

  for (const d of diodes) {
    const [anode, cathode] = d.nodes
    ;(cathodeCount[cathode] ??= []).push(d)
    ;(anodeCount[anode] ??= []).push(d)
  }

  const posCandidates = Object.keys(cathodeCount).filter((n) => cathodeCount[n].length === 2)
  const negCandidates = Object.keys(anodeCount).filter((n) => anodeCount[n].length === 2)

  for (const dcPos of posCandidates) {
    for (const dcNeg of negCandidates) {
      if (dcPos === dcNeg) continue
      const topDiodes = cathodeCount[dcPos]
      const botDiodes = anodeCount[dcNeg]

      const topAnodes = topDiodes.map((d) => (d.nodes[0] === dcPos ? d.nodes[1] : d.nodes[0]))
      const botCathodes = botDiodes.map((d) => (d.nodes[1] === dcNeg ? d.nodes[0] : d.nodes[1]))

      const topSet = new Set(topAnodes)
      const botSet = new Set(botCathodes)

      if (topSet.size === 2 && botSet.size === 2 && topAnodes.every((n) => botSet.has(n))) {
        const [ac1, ac2] = topAnodes
        const d1 = topDiodes.find((d) => d.nodes.includes(ac1))
        const d3 = topDiodes.find((d) => d.nodes.includes(ac2))
        const d4 = botDiodes.find((d) => d.nodes.includes(ac1))
        const d2 = botDiodes.find((d) => d.nodes.includes(ac2))

        if (d1 && d4 && d3 && d2) {
          return { d1, d4, d3, d2, dcPos, dcNeg, ac1, ac2 }
        }
      }
    }
  }
  return null
}

export function buildDiodeBridgeDiagram(parsed: ParsedNetlist, bridge: DiodeBridge): Diagram {
  let ac1 = bridge.ac1
  let ac2 = bridge.ac2
  let d1 = bridge.d1
  let d4 = bridge.d4
  let d3 = bridge.d3
  let d2 = bridge.d2
  const { dcPos, dcNeg } = bridge

  const bridgeDiodes = new Set([d1, d4, d3, d2])

  const acSources = parsed.elements.filter(
    (e) =>
      (e.kind === 'V' || e.kind === 'I') &&
      ((e.nodes.includes(ac1) && e.nodes.includes(ac2)) ||
        (e.nodes.includes(ac1) && e.nodes.includes(GROUND)) ||
        (e.nodes.includes(ac2) && e.nodes.includes(GROUND))),
  )

  // Asegurar que la rama 1 corresponda al primer nodo (positivo) de la fuente Vac
  if (acSources.length > 0) {
    const src = acSources[0]
    if (src.nodes[0] === ac2) {
      ac1 = bridge.ac2
      ac2 = bridge.ac1
      d1 = bridge.d3
      d4 = bridge.d2
      d3 = bridge.d1
      d2 = bridge.d4
    }
  }

  const dcParallel = parsed.elements.filter(
    (e) =>
      !bridgeDiodes.has(e) &&
      !acSources.includes(e) &&
      ((e.nodes.includes(dcPos) && e.nodes.includes(dcNeg)) ||
        (dcNeg === GROUND && e.nodes.includes(dcPos) && e.nodes.includes(GROUND))),
  )

  const groundElements = parsed.elements.filter(
    (e) =>
      !bridgeDiodes.has(e) &&
      !dcParallel.includes(e) &&
      !acSources.includes(e) &&
      e.nodes.includes(dcNeg) &&
      e.nodes.includes(GROUND),
  )

  const handled = new Set([...bridgeDiodes, ...acSources, ...dcParallel, ...groundElements])
  const remaining = parsed.elements.filter((e) => !handled.has(e))

  const Y_TOP = 60
  const Y_MID_TOP = 108
  const Y_AC1 = 145
  const Y_AC2 = 205
  const Y_MID_BOT = 242
  const Y_BOT = 285

  const hasSource = acSources.length > 0
  const X_SRC = hasSource ? MARGIN_X + 15 : MARGIN_X
  const X_LEG1 = hasSource ? X_SRC + 135 : MARGIN_X + 70
  const X_LEG2 = X_LEG1 + 120

  const symbols: LayoutSymbol[] = []
  const usedSymbols: Diagram['usedSymbols'] = new Set(['diode'])
  const groundDrops: number[] = []

  if (hasSource) {
    const src = acSources[0]
    symbols.push({
      type: 'sourceV',
      x: X_SRC,
      y1: Y_AC1,
      y2: Y_AC2,
      name: src.name,
      value: fmtSource(src.extra),
      isAc: true,
    })
    usedSymbols.add('source')

    // Conexión horizontal limpia de la terminal superior de Vac hacia rama 1 (in_pos)
    symbols.push({ type: 'wireH', x1: X_SRC, x2: X_LEG1, y: Y_AC1, name: '', value: '' })

    // Conexión de terminal inferior de Vac hacia rama 2 (in_neg) con puente de cruce sobre la rama 1 (sin conexión física)
    symbols.push({ type: 'wireHopH', x1: X_SRC, x2: X_LEG2, y: Y_AC2, hopX: X_LEG1 })
  }

  // RAMA 1: D1 superior (in_pos -> vdc) y D4 inferior (gnd_rect -> in_pos)
  // En disposición vertical de puente rectificador, los 4 diodos apuntan hacia arriba hacia el bus vdc:
  // D1: ánodo en in_pos (abajo), cátodo en vdc (arriba) -> pointingUp: true
  // D4: ánodo en gnd_rect (abajo), cátodo en in_pos (arriba) -> pointingUp: true
  symbols.push({
    type: 'diodeV',
    x: X_LEG1,
    y1: Y_TOP,
    y2: Y_MID_TOP,
    name: d1.name,
    value: d1.extra || 'Diodo',
    isLed: false,
    isZener: false,
    pointingUp: true,
  })

  // Cable vertical en Rama 1 (nodo in_pos):
  // Segmento superior que llega hasta justo antes del salto del cable AC2
  symbols.push({ type: 'wireV', x: X_LEG1, y1: Y_MID_TOP, y2: Y_AC2 - 11 })
  // Segmento inferior que continúa después del salto hacia D4 (dejando brecha libre bajo el arco del puente de cruce)
  symbols.push({ type: 'wireV', x: X_LEG1, y1: Y_AC2 + 11, y2: Y_MID_BOT })

  symbols.push({
    type: 'diodeV',
    x: X_LEG1,
    y1: Y_MID_BOT,
    y2: Y_BOT,
    name: d4.name,
    value: d4.extra || 'Diodo',
    isLed: false,
    isZener: false,
    pointingUp: true,
  })

  // RAMA 2: D3 superior (in_neg -> vdc) y D2 inferior (gnd_rect -> in_neg)
  // Ambos diodos apuntan hacia arriba:
  // D3: ánodo en in_neg (abajo), cátodo en vdc (arriba) -> pointingUp: true
  // D2: ánodo en gnd_rect (abajo), cátodo en in_neg (arriba) -> pointingUp: true
  symbols.push({
    type: 'diodeV',
    x: X_LEG2,
    y1: Y_TOP,
    y2: Y_MID_TOP,
    name: d3.name,
    value: d3.extra || 'Diodo',
    isLed: false,
    isZener: false,
    pointingUp: true,
  })

  // Cable vertical en Rama 2 (nodo in_neg)
  symbols.push({ type: 'wireV', x: X_LEG2, y1: Y_MID_TOP, y2: Y_MID_BOT })

  symbols.push({
    type: 'diodeV',
    x: X_LEG2,
    y1: Y_MID_BOT,
    y2: Y_BOT,
    name: d2.name,
    value: d2.extra || 'Diodo',
    isLed: false,
    isZener: false,
    pointingUp: true,
  })

  let curX = X_LEG2
  const dcXs: number[] = []
  const allParallel = [...dcParallel, ...remaining]

  for (const e of allParallel) {
    curX += 115
    dcXs.push(curX)

    if (e.kind === 'C') {
      symbols.push({
        type: 'capacitorV',
        x: curX,
        y1: Y_TOP,
        y2: Y_BOT,
        name: e.name,
        value: fmtFarads(e.extra),
      })
      usedSymbols.add('capacitor')
    } else if (e.kind === 'R') {
      symbols.push({
        type: 'resistorV',
        x: curX,
        y1: Y_TOP,
        y2: Y_BOT,
        name: e.name,
        value: fmtOhms(e.extra),
      })
      usedSymbols.add('resistor')
    } else if (e.kind === 'L') {
      symbols.push({
        type: 'inductorV',
        x: curX,
        y1: Y_TOP,
        y2: Y_BOT,
        name: e.name,
        value: fmtHenries(e.extra),
      })
      usedSymbols.add('inductor')
    } else if (e.kind === 'D') {
      symbols.push({
        type: 'diodeV',
        x: curX,
        y1: Y_TOP,
        y2: Y_BOT,
        name: e.name,
        value: e.extra || 'Diodo',
        isLed: false,
        isZener: false,
        pointingUp: true,
      })
      usedSymbols.add('diode')
    }
  }

  const X_END_RAIL = curX > X_LEG2 ? curX + 25 : X_LEG2 + 50

  const gndX = dcXs[0] ?? X_LEG2
  if (groundElements.length > 0) {
    const gndElem = groundElements[0]
    if (gndElem.kind === 'R') {
      symbols.push({
        type: 'resistorV',
        x: gndX,
        y1: Y_BOT,
        y2: GROUND_Y,
        name: gndElem.name,
        value: fmtOhms(gndElem.extra),
      })
      usedSymbols.add('resistor')
    }
    groundDrops.push(gndX)
    usedSymbols.add('ground')
  } else if (dcNeg === GROUND) {
    groundDrops.push(X_LEG1, ...(dcXs.length ? [dcXs[dcXs.length - 1]] : [X_LEG2]))
    usedSymbols.add('ground')
  }

  const topBranches = [X_LEG1, X_LEG2, ...dcXs]
  const botBranches = [X_LEG1, X_LEG2, ...dcXs]

  const nodeBuses: NodeBus[] = [
    { node: ac1, xStart: X_LEG1, xEnd: X_LEG1, branches: [X_LEG1], y: Y_AC1 },
    { node: ac2, xStart: X_LEG2, xEnd: X_LEG2, branches: [X_LEG2], y: Y_AC2 },
    { node: dcPos, xStart: X_LEG1, xEnd: X_END_RAIL, branches: topBranches, y: Y_TOP },
    { node: dcNeg, xStart: X_LEG1, xEnd: X_END_RAIL, branches: botBranches, y: Y_BOT },
  ]

  const nodeXs: Record<string, number> = {
    [ac1]: X_LEG1,
    [ac2]: X_LEG2,
    [dcPos]: X_END_RAIL,
    [dcNeg]: X_END_RAIL,
  }

  return {
    symbols,
    nodeXs,
    nodeBuses,
    groundDrops,
    topRailSpan: null,
    usedSymbols,
    width: X_END_RAIL + 80,
    height: (groundDrops.length > 0 ? GROUND_Y : Y_BOT) + 50,
  }
}

export function buildDiagram(parsed: ParsedNetlist): Diagram {
  const bridge = findDiodeBridge(parsed.elements)
  if (bridge) {
    return buildDiodeBridgeDiagram(parsed, bridge)
  }

  const depth = computeDepths(parsed.elements)
  const { rails: supplyRails, railSources } = findSupplyRails(parsed.elements)

  // Separar componentes:
  // 1. Shunts a tierra (nodo -> 0)
  // 2. Shunts al raíl superior VCC (VCC -> nodo)
  // 3. Componentes serie (nodoA -> nodoB)
  const nodeShunts: Record<string, NetlistElement[]> = {}
  const topShunts: Record<string, NetlistElement[]> = {}
  const seriesElements: NetlistElement[] = []
  const opampElements: NetlistElement[] = []
  const bjtElements: NetlistElement[] = []

  for (const e of parsed.elements) {
    if (e.kind === 'X') {
      opampElements.push(e)
      continue
    }
    if (e.kind === 'Q') {
      bjtElements.push(e)
      continue
    }
    const [a, b] = e.nodes

    // La propia fuente Vcc a tierra define el raíl
    if (supplyRails.has(a) && b === GROUND) {
      continue
    }

    // Drop desde el raíl superior de alimentación VCC
    if (supplyRails.has(a) && b !== GROUND && !supplyRails.has(b)) {
      ;(topShunts[b] ??= []).push(e)
      continue
    }
    if (supplyRails.has(b) && a !== GROUND && !supplyRails.has(a)) {
      ;(topShunts[a] ??= []).push(e)
      continue
    }

    // Shunts a tierra
    if (a === GROUND || b === GROUND) {
      const node = a === GROUND ? b : a
      ;(nodeShunts[node] ??= []).push(e)
    } else {
      seriesElements.push(e)
    }
  }

  // Ordenar nodos por profundidad topológica; si coinciden, emitter va antes que collector
  const sortedNodes = Object.keys(depth)
    .filter((n) => !supplyRails.has(n))
    .sort((a, b) => {
      if (depth[a] !== depth[b]) return depth[a] - depth[b]
      const aIsEmi = /^(emi|e)/i.test(a)
      const bIsEmi = /^(emi|e)/i.test(b)
      if (aIsEmi && !bIsEmi) return -1
      if (!aIsEmi && bIsEmi) return 1
      return a.localeCompare(b)
    })

  // Asignar coordenadas X a cada nodo garantizando espacio para todas sus ramas en paralelo
  const nodeStartX: Record<string, number> = {}
  const nodeEndX: Record<string, number> = {}
  const nodeBranches: Record<string, number[]> = {}

  let curX = MARGIN_X
  let lastDepth = -1

  for (const n of sortedNodes) {
    const d = depth[n]
    // Dos nodos DISTINTOS nunca deben compartir coordenada X, aunque caigan
    // a la misma profundidad topológica (ramas en paralelo, o subgrafos
    // desconectados que el fallback de computeDepths ancla todos en 0): sin
    // este avance, el segundo nodo hereda el curX del primero y sus símbolos
    // quedan dibujados exactamente encima uno del otro.
    if (lastDepth !== -1) {
      curX += d !== lastDepth ? SERIES_SPACING : BRANCH_SPACING
    }

    const shunts = nodeShunts[n] ?? []
    const branches: number[] = []

    nodeStartX[n] = curX
    if (shunts.length > 0) {
      for (let i = 0; i < shunts.length; i++) {
        branches.push(curX + i * BRANCH_SPACING)
      }
      nodeEndX[n] = curX + (shunts.length - 1) * BRANCH_SPACING
      curX = nodeEndX[n]
    } else {
      nodeEndX[n] = curX
    }

    nodeBranches[n] = branches
    lastDepth = d
  }

  const symbols: LayoutSymbol[] = []
  const usedSymbols: Diagram['usedSymbols'] = new Set()
  const groundDrops: number[] = []

  const emitterNodes = new Set<string>()
  for (const e of parsed.elements) {
    if (e.kind === 'Q' && e.nodes[2]) {
      emitterNodes.add(e.nodes[2])
    }
  }

  // 1. Ubicar shunts y fuentes verticales
  for (const n of sortedNodes) {
    const shunts = nodeShunts[n] ?? []
    const branches = nodeBranches[n] ?? []
    const isEmi = emitterNodes.has(n)
    const shuntY1 = isEmi ? EMI_Y : RAIL_Y

    shunts.forEach((e, idx) => {
      const x = branches[idx] ?? nodeStartX[n]
      groundDrops.push(x)

      if (e.kind === 'R') {
        symbols.push({ type: 'resistorV', x, y1: shuntY1, y2: GROUND_Y, name: e.name, value: fmtOhms(e.extra) })
        usedSymbols.add('resistor')
      } else if (e.kind === 'C') {
        symbols.push({ type: 'capacitorV', x, y1: shuntY1, y2: GROUND_Y, name: e.name, value: fmtFarads(e.extra) })
        usedSymbols.add('capacitor')
      } else if (e.kind === 'L') {
        symbols.push({ type: 'inductorV', x, y1: shuntY1, y2: GROUND_Y, name: e.name, value: fmtHenries(e.extra) })
        usedSymbols.add('inductor')
      } else if (e.kind === 'D') {
        const isLed = e.extra.toUpperCase().includes('LED') || e.name.toUpperCase().startsWith('DLED')
        const isZener =
          e.name.toUpperCase().startsWith('DZ') ||
          e.extra.toUpperCase().includes('ZENER') ||
          /1n47|1n75|bzx/i.test(e.extra)
        // En SPICE: D<name> <anode> <cathode>. Si nodo 0 es ánodo, la corriente va hacia arriba (hacia el raíl)
        const pointingUp = e.nodes[0] === GROUND
        const valStr = isLed ? 'LED' : isZener ? e.extra || 'Zener' : e.extra || 'Diodo'

        symbols.push({
          type: 'diodeV',
          x,
          y1: RAIL_Y,
          y2: GROUND_Y,
          name: e.name,
          value: valStr,
          isLed,
          isZener,
          pointingUp,
        })
        usedSymbols.add(isLed ? 'led' : isZener ? 'zener' : 'diode')
      } else if (e.kind === 'V' || e.kind === 'I') {
        const upper = e.extra.toUpperCase()
        const isAc =
          upper.includes('AC') ||
          upper.includes('SIN') ||
          upper.includes('SINE') ||
          upper.includes('PULSE')

        symbols.push({
          type: 'sourceV',
          x,
          y1: RAIL_Y,
          y2: GROUND_Y,
          name: e.name,
          value: fmtSource(e.extra),
          isAc,
        })
        usedSymbols.add('source')
      }
    })
  }

  // 2. Ubicar componentes serie horizontales con prevención de colisiones en pistas Y
  const placedHorizontal: { x1: number; x2: number; y: number }[] = []

  for (const e of seriesElements) {
    const [a, b] = e.nodes
    const xa = (nodeStartX[a] ?? MARGIN_X) < (nodeStartX[b] ?? MARGIN_X) ? (nodeEndX[a] ?? MARGIN_X) : (nodeStartX[a] ?? MARGIN_X)
    const xb = (nodeStartX[b] ?? MARGIN_X) < (nodeStartX[a] ?? MARGIN_X) ? (nodeEndX[b] ?? MARGIN_X) : (nodeStartX[b] ?? MARGIN_X)

    const x1 = Math.min(xa, xb)
    const x2 = Math.max(xa, xb)

    // Encontrar una pista Y libre si dos elementos horizontales se cruzan
    let targetY = RAIL_Y
    const yTracks = [
      RAIL_Y,
      RAIL_Y - 46,
      RAIL_Y + 46,
      RAIL_Y - 92,
      RAIL_Y + 92,
      RAIL_Y - 138,
      RAIL_Y + 138,
    ]
    let foundTrack = false
    for (const track of yTracks) {
      const collides = placedHorizontal.some(
        (p) => p.y === track && !(x2 <= p.x1 + 10 || x1 >= p.x2 - 10),
      )
      if (!collides) {
        targetY = track
        foundTrack = true
        break
      }
    }
    if (!foundTrack) {
      targetY = RAIL_Y - (placedHorizontal.length + 1) * 35
    }
    placedHorizontal.push({ x1, x2, y: targetY })

    if (e.kind === 'R') {
      symbols.push({ type: 'resistorH', x1, x2, y: targetY, name: e.name, value: fmtOhms(e.extra) })
      usedSymbols.add('resistor')
    } else if (e.kind === 'C') {
      symbols.push({ type: 'capacitorH', x1, x2, y: targetY, name: e.name, value: fmtFarads(e.extra) })
      usedSymbols.add('capacitor')
    } else if (e.kind === 'L') {
      symbols.push({ type: 'inductorH', x1, x2, y: targetY, name: e.name, value: fmtHenries(e.extra) })
      usedSymbols.add('inductor')
    } else if (e.kind === 'D') {
      const isLed = e.extra.toUpperCase().includes('LED') || e.name.toUpperCase().startsWith('DLED')
      const pointingRight = (nodeStartX[a] ?? 0) <= (nodeStartX[b] ?? 0)
      symbols.push({
        type: 'diodeH',
        x1,
        x2,
        y: targetY,
        name: e.name,
        value: e.extra || 'Diodo',
        isLed,
        pointingRight,
      })
      usedSymbols.add(isLed ? 'led' : 'diode')
    } else if (e.kind === 'V' || e.kind === 'I') {
      const upper = e.extra.toUpperCase()
      const isAc =
        upper.includes('AC') ||
        upper.includes('SIN') ||
        upper.includes('SINE') ||
        upper.includes('PULSE')
      symbols.push({
        type: 'sourceH',
        x1,
        x2,
        y: targetY,
        name: e.name,
        value: fmtSource(e.extra),
        isAc,
      })
      usedSymbols.add('source')
    } else {
      symbols.push({ type: 'wireH', x1, x2, y: targetY, name: e.name, value: e.extra })
    }
  }

  // 3. Ubicar operacionales (X)
  for (const e of opampElements) {
    const [inp, inn, out] = e.nodes
    const inTop = nodeStartX[inp] ?? MARGIN_X
    const inBot = nodeStartX[inn] ?? MARGIN_X
    const outNode = nodeStartX[out] ?? curX + SERIES_SPACING
    const cx = (inTop + outNode) / 2
    symbols.push({ type: 'opamp', cx, inTopX: inTop, inBotX: inBot, outX: outNode })
    usedSymbols.add('opamp')
  }

  // 4. Ubicar transistores BJT (Q)
  for (const e of bjtElements) {
    const [col, base, emi] = e.nodes
    const bx = nodeStartX[base] ?? MARGIN_X
    const ex = nodeStartX[emi] ?? MARGIN_X
    const bEnd = nodeEndX[base] ?? bx
    const cx = Math.max(bEnd + 120, (bx + ex) / 2)
    symbols.push({
      type: 'bjt',
      cx,
      collectorX: nodeStartX[col] ?? MARGIN_X,
      baseX: bx,
      emitterX: ex,
      name: e.name,
      value: e.extra || 'BJT',
    })
    usedSymbols.add('bjt')
  }

  if (groundDrops.length) usedSymbols.add('ground')

  // Ubicar shunts verticales desde el raíl superior VCC (R1, Rc, etc.)
  const topRailDrops: number[] = []
  for (const n of sortedNodes) {
    const shunts = topShunts[n] ?? []
    for (const e of shunts) {
      const x = nodeStartX[n] ?? MARGIN_X
      topRailDrops.push(x)

      if (e.kind === 'R') {
        symbols.push({
          type: 'resistorV',
          x,
          y1: VCC_Y,
          y2: RAIL_Y,
          name: e.name,
          value: fmtOhms(e.extra),
        })
        usedSymbols.add('resistor')
      } else if (e.kind === 'C') {
        symbols.push({
          type: 'capacitorV',
          x,
          y1: VCC_Y,
          y2: RAIL_Y,
          name: e.name,
          value: fmtFarads(e.extra),
        })
        usedSymbols.add('capacitor')
      } else if (e.kind === 'L') {
        symbols.push({
          type: 'inductorV',
          x,
          y1: VCC_Y,
          y2: RAIL_Y,
          name: e.name,
          value: fmtHenries(e.extra),
        })
        usedSymbols.add('inductor')
      }
    }
  }

  let topRailSpan: TopRailSpan | null = null
  if (topRailDrops.length > 0) {
    const minTopX = Math.min(...topRailDrops)
    const maxTopX = Math.max(...topRailDrops)
    const railName = Array.from(supplyRails)[0] ?? 'VCC'
    const railSrc = railSources[railName]
    const railVolt = railSrc ? fmtSource(railSrc.extra) : ''
    const label = railVolt ? `${railName.toUpperCase()} (+${railVolt})` : railName.toUpperCase()

    topRailSpan = {
      xStart: minTopX,
      xEnd: maxTopX,
      label,
      drops: topRailDrops,
    }
  }

  // Construir descripción de buses de nodos para renderizado limpio de rieles
  const nodeBuses: NodeBus[] = sortedNodes.map((n) => ({
    node: n,
    xStart: nodeStartX[n] ?? MARGIN_X,
    xEnd: nodeEndX[n] ?? MARGIN_X,
    branches: nodeBranches[n] ?? [],
    y: emitterNodes.has(n) ? EMI_Y : RAIL_Y,
  }))

  const allXs = [
    ...Object.values(nodeStartX),
    ...Object.values(nodeEndX),
    ...groundDrops,
    ...topRailDrops,
    ...symbols.map((s) =>
      'x' in s
        ? s.x
        : 'x2' in s
          ? s.x2
          : 'outX' in s
            ? s.outX
            : 'collectorX' in s
              ? Math.max(s.collectorX, s.baseX, s.emitterX, s.cx) + 50
              : MARGIN_X,
    ),
  ]

  const width = Math.max(...allXs, MARGIN_X) + 120

  return {
    symbols,
    nodeXs: nodeStartX,
    nodeBuses,
    groundDrops,
    topRailSpan,
    usedSymbols,
    width,
    height: GROUND_Y + 50,
  }
}
