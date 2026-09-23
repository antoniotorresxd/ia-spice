import { expect, it } from 'vitest'

import {
  NetlistParseError,
  buildDiagram,
  computeDepths,
  describeCircuit,
  fmtFarads,
  fmtOhms,
  fmtSource,
  measurementText,
  parseNetlist,
} from './netlist-diagram'

const RC_LOWPASS = [
  '.title RC Lowpass',
  'Vinput vin 0 DC 0 AC 1',
  'R1 vin vout 1000.0',
  'C1 vout 0 1.5915494309189535e-07',
  '.control',
  'ac dec 100 1 1e9',
  'meas ac fc WHEN vdb(vout)=-3.0103',
  'echo $&fc > output.txt',
  '.endc',
  '.end',
].join('\n')

const DIVIDER = [
  '.title Voltage Divider',
  'Vinput vin 0 12.0',
  'R1 vin vout 1000.0',
  'R2 vout 0 714.29',
  '.control',
  'op',
  'wrdata output.txt v(vout)',
  '.endc',
  '.end',
].join('\n')

const LED = [
  '.title LED Resistor',
  'Vinput vin 0 5.0',
  'R1 vin vled 150.0',
  'D1 vled 0 LED',
  '.model LED D (IS=1e-20 N=2)',
  '.control',
  'op',
  'wrdata output.txt iled',
  '.endc',
  '.end',
].join('\n')

const AMP = [
  '.title Non-inverting Amplifier',
  'Vinput vin 0 1.0',
  'X1 vin vfb vout opamp',
  'Rf vout vfb 2000.0',
  'Rg vfb 0 1000.0',
  '.subckt opamp inp inn out',
  'Rin inp inn 1e6',
  '.ends',
  '.control',
  'op',
  'wrdata output.txt v(vout)',
  '.endc',
  '.end',
].join('\n')

it('parsea título, componentes y mediciones del netlist RC lowpass', () => {
  const parsed = parseNetlist(RC_LOWPASS)

  expect(parsed.title).toBe('RC Lowpass')
  expect(parsed.elements.map((e) => e.name)).toEqual(['Vinput', 'R1', 'C1'])
  expect(parsed.measurements).toEqual([{ name: 'fc', condition: 'vdb(vout)=-3.0103' }])
})

it('ignora comentarios y líneas vacías', () => {
  const parsed = parseNetlist(`* comentario\n\n${RC_LOWPASS}`)
  expect(parsed.elements).toHaveLength(3)
})

it('un netlist sin componentes reconocibles lanza NetlistParseError', () => {
  expect(() => parseNetlist('.title vacío\n.end')).toThrow(NetlistParseError)
})

it('computeDepths ubica la fuente en 0 y avanza en serie', () => {
  const { elements } = parseNetlist(RC_LOWPASS)
  const depth = computeDepths(elements)

  expect(depth).toEqual({ vin: 0, vout: 1 })
})

it('computeDepths del amplificador encadena inp -> inn -> out', () => {
  const { elements } = parseNetlist(AMP)
  const depth = computeDepths(elements)

  expect(depth.vin).toBe(0)
  expect(depth.vfb).toBe(1)
  expect(depth.vout).toBe(2)
})

it('fmtOhms elige la unidad según la magnitud', () => {
  expect(fmtOhms('1000.0')).toBe('1 kΩ')
  expect(fmtOhms('714.29')).toBe('714.29 Ω')
  expect(fmtOhms('2500000')).toBe('2.5 MΩ')
})

it('fmtFarads elige la unidad según la magnitud', () => {
  expect(fmtFarads('1.5915494309189535e-07')).toBe('159.15 nF')
})

it('fmtSource distingue DC de AC', () => {
  expect(fmtSource('12.0')).toBe('12 V')
  expect(fmtSource('DC 0 AC 1')).toBe('1 V (AC, señal de prueba)')
})

it('describeCircuit reconoce las cuatro topologías del catálogo', () => {
  expect(describeCircuit(parseNetlist(RC_LOWPASS))).toContain('pasabajos RC')
  expect(describeCircuit(parseNetlist(DIVIDER))).toContain('divisor de voltaje')
  expect(describeCircuit(parseNetlist(LED))).toContain('LED')
  expect(describeCircuit(parseNetlist(AMP))).toContain('amplificador no inversor')
})

it('measurementText explica fc o cae al punto de operación', () => {
  expect(measurementText(parseNetlist(RC_LOWPASS).measurements)).toContain('-3 dB')
  expect(measurementText(parseNetlist(DIVIDER).measurements)).toContain('punto de operación')
})

it('buildDiagram coloca los drops a tierra y detecta los símbolos usados', () => {
  const diagram = buildDiagram(parseNetlist(RC_LOWPASS))

  expect(diagram.usedSymbols).toEqual(new Set(['source', 'resistor', 'capacitor', 'ground']))
  expect(diagram.nodeXs).toEqual({ vin: 70, vout: 225 })
  expect(diagram.groundDrops.sort((a, b) => a - b)).toEqual([70, 225])
})

it('buildDiagram del divisor usa dos resistencias, ningún capacitor', () => {
  const diagram = buildDiagram(parseNetlist(DIVIDER))
  expect(diagram.usedSymbols.has('capacitor')).toBe(false)
  expect(diagram.usedSymbols.has('resistor')).toBe(true)
})

it('parsea y construye diagramas con inductores L y componentes RLC', () => {
  const rlcNetlist = [
    '.title RLC Filter',
    'V1 in 0 AC 1',
    'R1 in mid 100',
    'L1 mid out 10m',
    'C1 out 0 100n',
    '.end',
  ].join('\n')

  const parsed = parseNetlist(rlcNetlist)
  expect(parsed.elements.map((e) => e.name)).toEqual(['V1', 'R1', 'L1', 'C1'])
  const diagram = buildDiagram(parsed)
  expect(diagram.usedSymbols.has('inductor')).toBe(true)
  expect(diagram.usedSymbols.has('capacitor')).toBe(true)
  expect(describeCircuit(parsed)).toContain('RLC resonante')
})

it('parsea transistores Q y los encadena colector-base-emisor en computeDepths', () => {
  const bjt = [
    '.title BJT Common Emitter',
    'Vcc vcc 0 DC 12',
    'Vin in 0 SIN(0 10m 1k) AC 1',
    'Cin in base 10u',
    'R1 vcc base 47k',
    'R2 base 0 10k',
    'Rc vcc col 2.2k',
    'Cout col out 10u',
    'Rload out 0 10k',
    'Re1 emi emi2 150',
    'Re2 emi2 0 330',
    'Ce emi2 0 100u',
    'Q1 col base emi 2N2222',
    '.model 2N2222 NPN(Bf=255.9)',
    '.end',
  ].join('\n')

  const parsed = parseNetlist(bjt)
  expect(parsed.elements.map((e) => e.name)).toContain('Q1')
  const q1 = parsed.elements.find((e) => e.name === 'Q1')
  expect(q1?.nodes).toEqual(['col', 'base', 'emi'])

  const depth = computeDepths(parsed.elements)
  // El transistor conecta las dos mitades del circuito (antes eran dos
  // subgrafos desconectados): todos los nodos deben tener profundidad finita
  // y no todos colapsar en 0.
  expect(new Set(Object.values(depth)).size).toBeGreaterThan(1)

  const diagram = buildDiagram(parsed)
  expect(diagram.usedSymbols.has('bjt')).toBe(true)

  // Ningún par de nodos distintos comparte coordenada X: esa colisión era
  // la causa del esquema "encimado" que motivó este arreglo.
  const xs = Object.values(diagram.nodeXs)
  expect(new Set(xs).size).toBe(xs.length)
})

it('aplica anti-colisión cuando múltiples componentes van a tierra desde el mismo nodo', () => {
  const parallelGround = [
    '.title Parallel Load',
    'V1 in 0 DC 5',
    'R1 in out 1k',
    'R2 out 0 2k',
    'C1 out 0 10n',
    '.end',
  ].join('\n')

  const parsed = parseNetlist(parallelGround)
  const diagram = buildDiagram(parsed)
  // R2 y C1 van desde out a 0, deben tener coordenadas x separadas
  const outDrops = diagram.groundDrops.filter((x) => x !== diagram.nodeXs.in)
  expect(outDrops).toHaveLength(2)
  expect(outDrops[0]).not.toBe(outDrops[1])
})

it('reconoce y genera el esquema limpio de puente rectificador de onda completa', () => {
  const bridgeCode = [
    '.title Rectificador en puente',
    'Vac in_pos in_neg SIN(0 16.97 60)',
    'D1 in_pos vdc D1N4007',
    'D2 gnd_rect in_neg D1N4007',
    'D3 in_neg vdc D1N4007',
    'D4 gnd_rect in_pos D1N4007',
    'Rgnd gnd_rect 0 1u',
    'Cfilt vdc gnd_rect 470uF',
    'Rload vdc gnd_rect 100',
    '.end',
  ].join('\n')

  const parsed = parseNetlist(bridgeCode)
  expect(describeCircuit(parsed)).toContain('puente de diodos')

  const diagram = buildDiagram(parsed)
  expect(diagram.usedSymbols.has('diode')).toBe(true)
  expect(diagram.usedSymbols.has('source')).toBe(true)
  expect(diagram.usedSymbols.has('capacitor')).toBe(true)
  expect(diagram.usedSymbols.has('resistor')).toBe(true)

  // Los 4 diodos son verticales para formar las ramas del puente y TODOS apuntan hacia arriba
  const diodes = diagram.symbols.filter((s) => s.type === 'diodeV')
  expect(diodes).toHaveLength(4)
  for (const d of diodes) {
    if (d.type === 'diodeV') {
      expect(d.pointingUp).toBe(true)
    }
  }

  // D1 y D4 comparten la coordenada X de la rama izquierda (in_pos)
  const d1 = diodes.find((d) => 'name' in d && d.name === 'D1')
  const d4 = diodes.find((d) => 'name' in d && d.name === 'D4')
  const d3 = diodes.find((d) => 'name' in d && d.name === 'D3')
  const d2 = diodes.find((d) => 'name' in d && d.name === 'D2')
  expect(d1 && d4 && d3 && d2).toBeTruthy()
  if (d1 && d4 && d3 && d2 && 'x' in d1 && 'x' in d4 && 'x' in d3 && 'x' in d2) {
    expect(d1.x).toBe(d4.x)
    expect(d3.x).toBe(d2.x)
    expect(d1.x).toBeLessThan(d3.x)
  }

  // La conexión de Vac al nodo in_neg tiene puente de cruce sobre la rama 1 (in_pos)
  const hop = diagram.symbols.find((s) => s.type === 'wireHopH')
  expect(hop).toBeDefined()
  if (hop && hop.type === 'wireHopH' && d1 && 'x' in d1) {
    expect(hop.hopX).toBe(d1.x)
  }

  // Cfilt y Rload se ubican como ramas verticales separadas
  const cap = diagram.symbols.find((s) => 'name' in s && s.name === 'Cfilt')
  const load = diagram.symbols.find((s) => 'name' in s && s.name === 'Rload')
  expect(cap?.type).toBe('capacitorV')
  expect(load?.type).toBe('resistorV')
  if (cap && load && 'x' in cap && 'x' in load) {
    expect(cap.x).toBeLessThan(load.x)
  }
})

it('ubica el amplificador operacional y su bucle de retroalimentación de forma limpia sin colisiones', () => {
  const parsed = parseNetlist(AMP)
  const diagram = buildDiagram(parsed)

  expect(diagram.usedSymbols.has('opamp')).toBe(true)
  expect(diagram.usedSymbols.has('resistor')).toBe(true)

  // Nodos vin, vfb y vout tienen coordenadas X estrictamente crecientes
  expect(diagram.nodeXs.vin).toBeLessThan(diagram.nodeXs.vfb)
  expect(diagram.nodeXs.vfb).toBeLessThan(diagram.nodeXs.vout)

  const opamp = diagram.symbols.find((s) => s.type === 'opamp')
  expect(opamp).toBeDefined()
  if (opamp && opamp.type === 'opamp') {
    // El cuerpo del opamp (left) se posiciona a la derecha de vfb (entrada inversora)
    const opLeft = opamp.left ?? opamp.cx - 32
    expect(opLeft).toBeGreaterThan(diagram.nodeXs.vfb)
    // La salida (vout) se posiciona a la derecha del extremo de salida del opamp
    const opRight = opamp.right ?? opamp.cx + 32
    expect(diagram.nodeXs.vout).toBeGreaterThan(opRight)
  }

  // La resistencia de realimentación Rf se enruta por una pista inferior dedicada (fbY > RAIL_Y)
  const rf = diagram.symbols.find((s) => 'name' in s && s.name === 'Rf')
  expect(rf).toBeDefined()
  if (rf && 'y' in rf) {
    expect(rf.y).toBeGreaterThan(200) // Mayor que RAIL_Y (200)
  }

  // La resistencia a tierra Rg se ubica en el nodo vfb y cae a tierra
  const rg = diagram.symbols.find((s) => 'name' in s && s.name === 'Rg')
  expect(rg?.type).toBe('resistorV')
  if (rg && rg.type === 'resistorV') {
    expect(rg.x).toBe(diagram.nodeXs.vfb)
  }
})

it('resuelve correctamente el filtro activo pasaaltas (Active HP) con capacitor en serie y opamp', () => {
  const activeHp = [
    '* Active HP',
    'Vin vin 0 DC 0 AC 1',
    'C1 vin vplus 10n',
    'R1 vplus 0 79.58k',
    'X1 vplus vfb vout opamp',
    'Rg vfb 0 10k',
    'Rf vout vfb 10k',
  ].join('\n')

  const parsed = parseNetlist(activeHp)
  const diagram = buildDiagram(parsed)

  expect(diagram.usedSymbols.has('opamp')).toBe(true)
  expect(diagram.usedSymbols.has('capacitor')).toBe(true)
  expect(diagram.usedSymbols.has('resistor')).toBe(true)

  // Separación clara y no colisionante de todos los nodos
  const xs = Object.values(diagram.nodeXs)
  expect(new Set(xs).size).toBe(xs.length)
  expect(diagram.nodeXs.vin).toBeLessThan(diagram.nodeXs.vplus)
  expect(diagram.nodeXs.vplus).toBeLessThan(diagram.nodeXs.vfb)
  expect(diagram.nodeXs.vfb).toBeLessThan(diagram.nodeXs.vout)

  const opamp = diagram.symbols.find((s) => s.type === 'opamp')
  expect(opamp).toBeDefined()
  if (opamp && opamp.type === 'opamp') {
    const opLeft = opamp.left ?? opamp.cx - 32
    // El opamp se ubica después de vfb, sin colisionar con vfb ni con Rg
    expect(opLeft).toBeGreaterThan(diagram.nodeXs.vfb)
    const opRight = opamp.right ?? opamp.cx + 32
    expect(diagram.nodeXs.vout).toBeGreaterThan(opRight)
  }

  // C1 está en serie entre vin y vplus
  const c1 = diagram.symbols.find((s) => 'name' in s && s.name === 'C1')
  expect(c1?.type).toBe('capacitorH')

  // Rf está en el bucle de realimentación por debajo del opamp
  const rf = diagram.symbols.find((s) => 'name' in s && s.name === 'Rf')
  expect(rf?.type).toBe('resistorH')
  if (rf && 'y' in rf) {
    expect(rf.y).toBeGreaterThan(200)
  }
})

