import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { BomItem } from '../model/workspace-types'
import { formatValue } from '../model/bom-format'
import { BomTable } from './BomTable'

const items: BomItem[] = [
  {
    nombre: 'R2',
    tipo: 'resistencia',
    cantidad: 1,
    unidad: 'ohm',
    serie: 'E24',
    ideal: 7142.86,
    valor: 7142.857,
    realizacion: 'paralelo',
    partes: [7500, 150000],
    error_pct: -0.0,
  },
  {
    nombre: 'Rf',
    tipo: 'resistencia',
    cantidad: 2,
    unidad: 'ohm',
    serie: 'E24',
    ideal: 34400,
    valor: 33000,
    realizacion: 'simple',
    partes: [33000],
    error_pct: -4.07,
  },
  {
    nombre: 'Q1',
    tipo: 'transistor',
    cantidad: 1,
    pieza: '2N3904',
    referencias: ['Q1'],
    nota: 'BJT NPN de propósito general',
    modelo_real: true,
  },
]

afterEach(cleanup)

describe('formatValue', () => {
  it('usa notación de ingeniería', () => {
    expect(formatValue(33000, 'ohm')).toBe('33 kΩ')
    expect(formatValue(4.7e-6, 'F')).toBe('4.7 µF')
    expect(formatValue(150e-9, 'F')).toBe('150 nF')
    expect(formatValue(0.022, 'H')).toBe('22 mH')
  })

  it('no usa mili para ohmios', () => {
    expect(formatValue(0.5, 'ohm')).toBe('0.5 Ω')
  })
})

describe('BomTable', () => {
  it('muestra el valor teórico, el comercial y cómo se arma', () => {
    render(<BomTable items={items} />)

    const pasivos = screen.getByRole('table', { name: 'Componentes pasivos' })
    const r2 = within(pasivos).getByText('R2').closest('tr')!
    expect(r2).toHaveTextContent('7.14 kΩ')
    expect(r2).toHaveTextContent('7.5 kΩ ∥ 150 kΩ')
    expect(r2).toHaveTextContent('paralelo')

    const rf = within(pasivos).getByText('Rf').closest('tr')!
    expect(rf).toHaveTextContent('34.4 kΩ')
    expect(rf).toHaveTextContent('33 kΩ')
    expect(rf).toHaveTextContent('-4.07 %')
    expect(within(rf).getAllByRole('cell')[1]).toHaveTextContent('2')
  })

  it('lista los semiconductores con su número de parte', () => {
    render(<BomTable items={items} />)

    const semis = screen.getByRole('table', { name: 'Semiconductores' })
    expect(semis).toHaveTextContent('2N3904')
    expect(semis).toHaveTextContent('modelo real')
  })

  it('omite la tabla que no tiene filas', () => {
    render(<BomTable items={items.slice(0, 1)} />)

    expect(screen.queryByRole('table', { name: 'Semiconductores' })).toBeNull()
  })
})
