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
