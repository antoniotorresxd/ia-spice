import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildDiagram, parseNetlist } from '../model/netlist-diagram'
import { createMockWorkspaceService } from '../services/mock-workspace-service'
import { VisualizerScreen } from './VisualizerScreen'

afterEach(cleanup)

describe('VisualizerScreen', () => {
  it('renders heading, select, textarea, and default circuit', async () => {
    const service = createMockWorkspaceService()
    vi.spyOn(service, 'getFiles').mockResolvedValue([])

    render(
      <MemoryRouter>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Visualizador y Análisis de Netlist', level: 1 }),
    ).toBeVisible()

    expect(screen.getByLabelText(/seleccionar netlist/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeVisible()

    // La portada es solo el esquemático: el funcionamiento vive en su pestaña
    expect(await screen.findByText('Divisor de voltaje')).toBeVisible()
    expect(screen.queryByText(/dos resistencias en serie reparten el voltaje/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cómo se diseñó/i }))
    expect(await screen.findByText(/dos resistencias en serie reparten el voltaje/i)).toBeVisible()
    // Sin paso a paso del documentador no hay memoria de diseño
    expect(screen.queryByRole('heading', { name: 'Memoria de diseño' })).not.toBeInTheDocument()

    // Sin documentación del agente no hay etiquetas ni columna de función
    expect(screen.queryByRole('list', { name: /etiquetas del circuito/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Función' })).not.toBeInTheDocument()
  })

  it('shows the documentador output for the selected workspace file', async () => {
    const service = createMockWorkspaceService()

    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'file-doc',
        conversationId: 'conv-doc',
        name: 'divisor.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Divisor',
        projectId: null,
      },
    ])

    vi.spyOn(service, 'getConversation').mockResolvedValue({
      id: 'conv-doc',
      projectId: null,
      title: 'Divisor',
      preview: 'Divisor',
      updatedAt: '2026-07-15T12:00:00.000Z',
      executionStatus: 'completed',
      messages: [],
      files: [
        {
          id: 'file-doc',
          name: 'divisor.cir',
          language: 'spice',
          content: '.title Divisor documentado\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 2.2k\n.end',
          status: 'complete',
          summary: 'Reparte 10 V entre R1 y R2 para obtener la salida.',
          tags: ['divisor de voltaje', 'DC'],
          components: { R1: 'Resistencia superior del divisor', R2: 'Resistencia inferior del divisor' },
          measurementExplanation: 'Se mide V(out) en el punto de operación.',
        },
      ],
      execution: {
        id: 'exec-doc',
        status: 'completed',
        summary: 'Completado',
      },
    })

    render(
      <MemoryRouter initialEntries={['/visualizer?conversationId=conv-doc&fileId=file-doc']}>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: /cómo se diseñó/i }))
    expect(await screen.findByText('Reparte 10 V entre R1 y R2 para obtener la salida.')).toBeVisible()
    expect(screen.queryByText(/dos resistencias en serie reparten el voltaje/i)).not.toBeInTheDocument()

    const tags = within(screen.getByRole('list', { name: /etiquetas del circuito/i }))
    expect(tags.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'divisor de voltaje',
      'DC',
    ])

    expect(screen.getByText('Se mide V(out) en el punto de operación.')).toBeVisible()

    expect(screen.getByRole('columnheader', { name: 'Función' })).toBeVisible()
    expect(within(screen.getByRole('row', { name: /^R1/ })).getByText('Resistencia superior del divisor')).toBeVisible()
    expect(within(screen.getByRole('row', { name: /^R2/ })).getByText('Resistencia inferior del divisor')).toBeVisible()
    // V1 no tiene rol documentado
    expect(within(screen.getByRole('row', { name: /^V1/ })).getByText('—')).toBeVisible()

    // Sin paso a paso del documentador no hay memoria, pero sí el funcionamiento
    expect(screen.queryByRole('heading', { name: 'Memoria de diseño' })).not.toBeInTheDocument()
  })

  it('muestra el paso a paso del documentador en su pestaña', async () => {
    const service = createMockWorkspaceService()
    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'file-doc',
        conversationId: 'conv-doc',
        name: 'divisor.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Divisor',
        projectId: null,
      },
    ])
    vi.spyOn(service, 'getConversation').mockResolvedValue({
      id: 'conv-doc',
      projectId: null,
      title: 'Divisor',
      preview: 'Divisor',
      updatedAt: '2026-07-15T12:00:00.000Z',
      executionStatus: 'completed',
      messages: [],
      files: [
        {
          id: 'file-doc',
          name: 'divisor.cir',
          language: 'spice',
          content: '.title Divisor\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 1k\n.end',
          status: 'complete',
          summary: 'Divide 10 V.',
          tags: [],
          components: {},
          measurementExplanation: null,
          designWalkthrough: '## 1. Requisito\nSalida de **5 V**.\n\n$$V_{out} = V_{in}\\frac{R_2}{R_1 + R_2}$$',
        },
      ],
      execution: { id: 'exec-doc', status: 'completed', summary: 'Completado' },
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/visualizer?conversationId=conv-doc&fileId=file-doc']}>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByRole('button', { name: /cómo se diseñó/i }))

    expect(screen.getByRole('heading', { name: '1. Requisito' })).toBeVisible()
    expect(screen.getByText('5 V').tagName).toBe('STRONG')
    expect(container.querySelector('.katex-display')).not.toBeNull()
  })

  it('allows editing SPICE netlist and correctly draws multi-shunt Zener regulator circuit without collisions', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()
    vi.spyOn(service, 'getFiles').mockResolvedValue([])

    render(
      <MemoryRouter>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    const zenerCircuit = `.title Fuente Regulada de 5V (Zener)
Vin in 0 SIN(12 1 120)
Rs in vout 140
Dz 0 vout D1N751
Cout vout 0 100u
Rload vout 0 100
.end`

    // Cambiar a la pestaña de código SPICE
    const codeTab = screen.getByRole('button', { name: /código netlist spice/i })
    await user.click(codeTab)

    expect(screen.getByRole('region', { name: /visor de código netlist spice/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /copiar/i })).toBeVisible()

    // Regresar al esquema gráfico
    const diagramTab = screen.getByRole('button', { name: /diagrama esquemático/i })
    await user.click(diagramTab)

    expect(await screen.findByText('Divisor de voltaje')).toBeVisible()

    // Verify parser and diagram layout for this circuit
    const parsed = parseNetlist(zenerCircuit)
    const diagram = buildDiagram(parsed)

    expect(diagram.usedSymbols.has('zener')).toBe(true)
    expect(diagram.usedSymbols.has('source')).toBe(true)
    expect(diagram.usedSymbols.has('capacitor')).toBe(true)
    expect(diagram.usedSymbols.has('resistor')).toBe(true)

    // Node vout must have a bus spanning across 3 parallel shunt branches with 120px separation
    const voutBus = diagram.nodeBuses.find((b) => b.node === 'vout')
    expect(voutBus).toBeDefined()
    expect(voutBus!.branches.length).toBe(3)
    expect(voutBus!.branches[1] - voutBus!.branches[0]).toBe(120)
    expect(voutBus!.branches[2] - voutBus!.branches[1]).toBe(120)

    // Dz must point up since node 0 is anode (ground)
    const dzSym = diagram.symbols.find((s) => s.type === 'diodeV' && s.name === 'Dz') as {
      type: 'diodeV'
      pointingUp: boolean
      isZener: boolean
      value: string
    }
    expect(dzSym).toBeDefined()
    expect(dzSym.pointingUp).toBe(true)
    expect(dzSym.isZener).toBe(true)
    expect(dzSym.value).toBe('D1N751')
  })

  it('selects file automatically from search params when workspace files exist', async () => {
    const service = createMockWorkspaceService()

    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'file-1',
        conversationId: 'conv-1',
        name: 'custom_filter.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Filtro Conversación',
        projectId: null,
      },
    ])

    vi.spyOn(service, 'getConversation').mockResolvedValue({
      id: 'conv-1',
      projectId: null,
      title: 'Filtro Conversación',
      preview: 'Circuito',
      updatedAt: '2026-07-15T12:00:00.000Z',
      executionStatus: 'completed',
      messages: [],
      files: [
        {
          id: 'file-1',
          name: 'custom_filter.cir',
          language: 'spice',
          content: '.title Custom Filter\nV1 in 0 DC 5\nR1 in out 1000\n.end',
          status: 'complete',
          summary: null,
          tags: null,
          components: null,
          measurementExplanation: null,
        },
      ],
      execution: {
        id: 'exec-1',
        status: 'completed',
        summary: 'Completado',
      },
    })

    render(
      <MemoryRouter initialEntries={['/visualizer?conversationId=conv-1&fileId=file-1']}>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    const select = await screen.findByLabelText(/seleccionar netlist/i)
    expect(select).toHaveValue('file-1')
    expect(await screen.findByText('Custom Filter')).toBeVisible()
  })

  it('switches circuit when selecting a different workspace file from select dropdown', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()

    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'f1',
        conversationId: 'c1',
        name: 'circuit1.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Circuito 1',
        projectId: null,
      },
      {
        id: 'f2',
        conversationId: 'c2',
        name: 'circuit2.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Circuito 2',
        projectId: null,
      },
    ])

    vi.spyOn(service, 'getConversation').mockImplementation(async (id: string) => {
      if (id === 'c1') {
        return {
          id: 'c1',
          projectId: null,
          title: 'Circuito 1',
          preview: 'C1',
          updatedAt: '2026-07-15T12:00:00.000Z',
          executionStatus: 'completed',
          messages: [],
          files: [
            {
              id: 'f1',
              name: 'circuit1.cir',
              language: 'spice',
              content: '.title Circuito Uno\nV1 in 0 DC 5\nR1 in 0 100\n.end',
              status: 'complete',
              summary: null,
              tags: null,
              components: null,
              measurementExplanation: null,
            },
          ],
          execution: {
            id: 'exec-1',
            status: 'completed',
            summary: 'Completado',
          },
        }
      }
      return {
        id: 'c2',
        projectId: null,
        title: 'Circuito 2',
        preview: 'C2',
        updatedAt: '2026-07-15T12:00:00.000Z',
        executionStatus: 'completed',
        messages: [],
        files: [
          {
            id: 'f2',
            name: 'circuit2.cir',
            language: 'spice',
            content: '.title Circuito Dos\nV1 in 0 DC 12\nC1 in 0 10u\n.end',
            status: 'complete',
            summary: null,
            tags: null,
            components: null,
            measurementExplanation: null,
          },
        ],
        execution: {
          id: 'exec-2',
          status: 'completed',
          summary: 'Completado',
        },
      }
    })

    render(
      <MemoryRouter>
        <VisualizerScreen service={service} />
      </MemoryRouter>,
    )

    const select = await screen.findByLabelText(/seleccionar netlist/i)
    await user.selectOptions(select, 'f2')

    expect(await screen.findByText('Circuito Dos')).toBeVisible()
  })
})
