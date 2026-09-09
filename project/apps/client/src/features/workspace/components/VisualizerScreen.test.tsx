import { cleanup, render, screen } from '@testing-library/react'
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
      await screen.findByRole('heading', { name: 'De netlist a diagrama que se entiende', level: 1 }),
    ).toBeVisible()

    expect(screen.getByLabelText(/importar de conversaciones/i)).toBeVisible()
    expect(screen.getByLabelText('Código netlist SPICE')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Dibujar circuito' })).toBeVisible()

    // Default circuit is drawn
    expect(await screen.findByText('Divisor de voltaje')).toBeVisible()
    expect(screen.getByText('¿QUÉ HACE ESTE CIRCUITO?')).toBeVisible()
    expect(screen.getByText(/dos resistencias en serie reparten el voltaje/i)).toBeVisible()
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

    const textarea = screen.getByLabelText('Código netlist SPICE')
    await user.clear(textarea)
    await user.type(textarea, zenerCircuit)

    const drawBtn = screen.getByRole('button', { name: /dibujar circuito/i })
    await user.click(drawBtn)

    expect(await screen.findByText('Fuente Regulada de 5V (Zener)')).toBeVisible()
    expect(screen.getByText(/fuente regulada con diodo zener/i)).toBeVisible()

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
