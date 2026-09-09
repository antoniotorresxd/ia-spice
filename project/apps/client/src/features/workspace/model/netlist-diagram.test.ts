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
