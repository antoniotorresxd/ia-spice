import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { parseNetlist } from '../model/netlist-diagram'
import { CircuitDesignDoc } from './CircuitDesignDoc'

afterEach(cleanup)

const NETLIST_SAMPLE = `* Amplificador de Instrumentacion
Vp vp 0 DC 1.005
Vn vn 0 DC 0.995
R1 a1 n1 10k
RG n1 n2 20k
R2 a2 n2 10k
.measure op gain PARAM '(v(vout))/(v(vp)-v(vn))'
.end`

describe('CircuitDesignDoc', () => {
  it('renders a unified document with walkthrough, overview, measurements, and components table', () => {
    const netlist = parseNetlist(NETLIST_SAMPLE)
    const documentation = {
      summary: 'Amplificador de instrumentación de 3 opamps con ganancia diferencial de 2.',
      tags: ['amplificador-instrumentacion', 'tres-opamps'],
      components: {
        RG: 'Resistencia de ganancia entre nodos n1 y n2',
        R1: 'Resistencia de realimentación para etapa 1',
      },
      measurementExplanation: 'Mide la ganancia dividiendo v(vout) entre la diferencia de entradas.',
      designWalkthrough: '## 1. Requisito\nGanancia $A_v = 2.0$.\n\n$$A_v = 1 + \\frac{2R}{R_G}$$',
    }

    const { container } = render(
      <CircuitDesignDoc
        netlist={netlist}
        documentation={documentation}
        fileName="inst_amp1.cir"
      />,
    )

    // Header unificado
    expect(screen.getByRole('heading', { name: 'Memoria de diseño' })).toBeVisible()
    expect(screen.getByText('inst_amp1.cir')).toBeVisible()
    expect(screen.getByText('Memoria Técnica de Diseño')).toBeVisible()

    // Tags
    const tagsList = within(screen.getByRole('list', { name: /etiquetas del circuito/i }))
    expect(tagsList.getAllByRole('listitem').map((el) => el.textContent)).toEqual([
      'amplificador-instrumentacion',
      'tres-opamps',
    ])

    // Visión general
    expect(screen.getByText(/amplificador de instrumentación de 3 opamps/i)).toBeVisible()

    // Proceso de diseño
    expect(screen.getByRole('heading', { name: '1. Requisito' })).toBeVisible()
    expect(container.querySelector('.katex-display')).not.toBeNull()

    // Parámetros de medición
    expect(screen.getByText(/mide la ganancia dividiendo v\(vout\)/i)).toBeVisible()

    // Tabla de componentes
    expect(screen.getByRole('columnheader', { name: 'Función' })).toBeVisible()
    expect(screen.getByText('Resistencia de ganancia entre nodos n1 y n2')).toBeVisible()
  })

  it('renders technical documentation without walkthrough heading when walkthrough is not available', () => {
    const netlist = parseNetlist(NETLIST_SAMPLE)
    const documentation = {
      summary: 'Divisor de tensión básico.',
      tags: [],
      components: {},
      measurementExplanation: null,
      designWalkthrough: null,
    }

    render(
      <CircuitDesignDoc
        netlist={netlist}
        documentation={documentation}
        fileName="simple.cir"
      />,
    )

    // No debe haber heading de "Memoria de diseño"
    expect(screen.queryByRole('heading', { name: 'Memoria de diseño' })).not.toBeInTheDocument()

    // Muestra la documentación técnica
    expect(screen.getByText('Documentación Técnica')).toBeVisible()
    expect(screen.getByText('simple.cir')).toBeVisible()
    expect(screen.getByText('Divisor de tensión básico.')).toBeVisible()
  })
})
