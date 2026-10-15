import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { NetlistDiagram } from './NetlistDiagram'

afterEach(cleanup)

// Red serie-paralelo como la del modo análisis: entre nodos lejanos el
// zigzag se estiraba a todo el ancho de la pista.
const RED_RESISTIVA = [
  '* Analisis de red',
  'VTEST nodo_in 0 DC 1',
  'R1 nodo_in na 100',
  'R2 na nc 50',
  'R3 na nc 200',
  'R4 nc nd 250',
  'R5 na nd 10',
  'R6 nd nb 30',
  'R7 nb nodo_out 120',
  '.op',
  '.end',
].join('\n')

function extent(points: string) {
  const pts = points.trim().split(/\s+/).map((p) => p.split(',').map(Number))
  const xs = pts.map(([x]) => x)
  const ys = pts.map(([, y]) => y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

it('dibuja todas las resistencias con un cuerpo corto y fijo, sin importar la distancia entre nodos', () => {
  const { container } = render(<NetlistDiagram netlistText={RED_RESISTIVA} showExplanation={false} />)

  const zigzags = [...container.querySelectorAll('polyline')].map((p) => extent(p.getAttribute('points') ?? ''))
  expect(zigzags).toHaveLength(7)
  for (const { w, h } of zigzags) {
    // El largo del cuerpo es el de la resistencia vertical (~54 px), venga en
    // la orientación que venga; lo demás del tramo es cable.
    expect(Math.max(w, h)).toBeLessThanOrEqual(54)
  }
})

const FRANCO_GM = [
  '* Franco P1.4 — transconductance amplifier',
  'VS s 0 0.15',
  'RS s i 100k',
  'RI i 0 500k',
  'GM 0 o i 0 2.024',
  'RO o 0 400',
  'RL o 0 40',
].join('\n')

it('dibuja la fuente controlada como un rombo con su dependencia en la etiqueta, la leyenda y la tabla', () => {
  const { container, getByText, getAllByText } = render(<NetlistDiagram netlistText={FRANCO_GM} />)

  // Rombo: un polígono de cuatro vértices (los diodos/opamps son triángulos).
  const diamonds = [...container.querySelectorAll('svg polygon')].filter(
    (p) => (p.getAttribute('points') ?? '').trim().split(/\s+/).length === 4,
  )
  expect(diamonds).toHaveLength(1)
  expect(getByText('Fuente controlada')).toBeTruthy()
  // Una vez en el esquema y otra en la tabla de componentes.
  expect(getAllByText('2.024·V(i)')).toHaveLength(2)
})

it('muestra los parámetros del opamp en su etiqueta', () => {
  const netlist = ['VI i 0 0.1', 'R1 i n 10k', 'R2 n o 100k', 'X1 0 n o OPAMP a=100 rd=1meg ro=100'].join('\n')
  const { container } = render(<NetlistDiagram netlistText={netlist} showExplanation={false} />)
  const texts = [...container.querySelectorAll('svg text')].map((t) => t.textContent)
  // nombre y tipo en un renglón, parámetros en otro (en uno solo la etiqueta
  // se extendía sobre las pistas de entrada)
  expect(texts).toContain('X1 · opamp')
  expect(texts).toContain('a=100 rd=1meg ro=100')
})
