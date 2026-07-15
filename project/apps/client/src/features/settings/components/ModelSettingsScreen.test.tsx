import { cleanup, render as renderComponent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentAssignment, LlmConnection } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { ModelSettingsScreen } from './ModelSettingsScreen'

const connection: LlmConnection = {
  id: 'openai-1', label: 'OpenAI principal', provider: 'openai', baseUrl: null,
  hasKey: true, keyHint: '7890', createdAt: '2026-07-15', updatedAt: '2026-07-15',
}

function render(component: ReactNode) {
  return renderComponent(<MemoryRouter>{component}</MemoryRouter>)
}

function makeService(overrides: Partial<SettingsService> = {}): SettingsService {
  return {
    getProfile: vi.fn().mockResolvedValue({ name: 'Ada', email: 'ada@example.com', avatarUrl: null }),
    updateProfile: vi.fn(),
    listConnections: vi.fn().mockResolvedValue([]),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn().mockResolvedValue(undefined),
    listAgentAssignments: vi.fn().mockResolvedValue([]),
    updateAgentAssignment: vi.fn(),
    ...overrides,
  }
}

afterEach(cleanup)

describe('ModelSettingsScreen', () => {
  it('shows the route heading and an empty state', async () => {
    render(<ModelSettingsScreen service={makeService()} />)

    expect(await screen.findByRole('heading', { name: 'Modelos y providers' })).toBeVisible()
    expect(screen.getByText('Todavía no tienes conexiones.')).toBeVisible()
  })

  it('shows provider-specific fields and validates them', async () => {
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={makeService()} />)
    await screen.findByRole('heading', { name: 'Modelos y providers' })

    await user.click(screen.getByRole('button', { name: 'Nueva conexión' }))
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
    expect(screen.queryByLabelText('URL base')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Provider'), 'openai_compatible')
    expect(screen.getByLabelText('URL base')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Guardar conexión' }))
    expect(screen.getByText('Ingresa un nombre.')).toBeVisible()
    expect(screen.getByText('Ingresa la URL del servidor.')).toBeVisible()
  })

  it('creates a connection and only displays its masked key hint', async () => {
    const created = { ...connection, id: 'anthropic-1', label: 'Claude', provider: 'anthropic' as const, keyHint: '1234' }
    const service = makeService({
      createConnection: vi.fn().mockResolvedValue(created),
      listConnections: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]),
    })
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={service} />)
    await screen.findByRole('heading', { name: 'Modelos y providers' })

    await user.click(screen.getByRole('button', { name: 'Nueva conexión' }))
    await user.type(screen.getByLabelText('Nombre'), 'Claude')
    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic')
    await user.type(screen.getByLabelText('API key'), 'sk-ant-private-1234')
    await user.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(await screen.findByText('••••1234')).toBeVisible()
    expect(screen.queryByText('sk-ant-private-1234')).not.toBeInTheDocument()
  })

  it('edits without replacing an existing key', async () => {
    const updated = { ...connection, label: 'OpenAI equipo' }
    const service = makeService({
      listConnections: vi.fn().mockResolvedValueOnce([connection]).mockResolvedValueOnce([updated]),
      updateConnection: vi.fn().mockResolvedValue(updated),
    })
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={service} />)
    await screen.findByRole('button', { name: 'Editar OpenAI principal' })

    await user.click(screen.getByRole('button', { name: 'Editar OpenAI principal' }))
    expect(screen.getByText('Déjala vacía para conservar la actual.')).toBeVisible()
    expect(screen.getByLabelText('API key')).toHaveValue('')
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'OpenAI equipo')
    await user.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    await waitFor(() => expect(service.updateConnection).toHaveBeenCalledWith('openai-1', {
      label: 'OpenAI equipo', provider: 'openai', apiKey: '', baseUrl: '',
    }))
  })

  it('keeps service errors safe', async () => {
    const user = userEvent.setup()
    const service = makeService({
      listConnections: vi.fn().mockResolvedValue([connection]),
      updateConnection: vi.fn().mockRejectedValue(new Error('secret backend response')),
    })
    render(<ModelSettingsScreen service={service} />)
    await screen.findByRole('button', { name: 'Editar OpenAI principal' })
    await user.click(screen.getByRole('button', { name: 'Editar OpenAI principal' }))
    await user.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la conexión. Inténtalo de nuevo.')
    expect(screen.queryByText('secret backend response')).not.toBeInTheDocument()
  })

  it('requires confirmation before deleting an assigned connection and reloads both collections', async () => {
    const assignment: AgentAssignment = { agentId: 'orchestrator', label: 'Orquestador', connectionId: connection.id, model: 'gpt-5' }
    const service = makeService({
      listConnections: vi.fn().mockResolvedValue([connection]),
      listAgentAssignments: vi.fn().mockResolvedValue([assignment]),
    })
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={service} />)
    await screen.findByRole('button', { name: 'Editar OpenAI principal' })

    await user.click(screen.getByRole('button', { name: 'Eliminar OpenAI principal' }))
    expect(screen.getByRole('dialog', { name: 'Eliminar conexión' })).toBeVisible()
    expect(service.deleteConnection).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))

    await waitFor(() => expect(service.deleteConnection).toHaveBeenCalledWith(connection.id))
    expect(service.listConnections).toHaveBeenCalledTimes(2)
    expect(service.listAgentAssignments).toHaveBeenCalledTimes(2)
  })

  it('renders exactly the four configurable agents and marks blank assignments safely', async () => {
    const assignments: AgentAssignment[] = [
      { agentId: 'orchestrator', label: 'Orquestador', connectionId: null, model: '' },
      { agentId: 'calculation', label: 'Cálculo', connectionId: null, model: '' },
      { agentId: 'writer', label: 'Escritura', connectionId: null, model: '' },
      { agentId: 'curator', label: 'Curador', connectionId: null, model: '' },
    ]
    render(<ModelSettingsScreen service={makeService({ listAgentAssignments: vi.fn().mockResolvedValue(assignments) })} />)

    const list = await screen.findByRole('list', { name: 'Asignaciones de agentes' })
    expect(within(list).getAllByRole('listitem').map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Orquestador', 'Cálculo', 'Escritura', 'Curador',
    ])
    expect(within(list).queryByText('Shell')).not.toBeInTheDocument()
    expect(within(list).getAllByText('Sin configurar')).toHaveLength(4)
  })

  it('saves independent models for agents that reuse the same connection', async () => {
    const assignments: AgentAssignment[] = [
      { agentId: 'orchestrator', label: 'Orquestador', connectionId: null, model: '' },
      { agentId: 'calculation', label: 'Cálculo', connectionId: null, model: '' },
      { agentId: 'writer', label: 'Escritura', connectionId: null, model: '' },
      { agentId: 'curator', label: 'Curador', connectionId: null, model: '' },
    ]
    const service = makeService({
      listConnections: vi.fn().mockResolvedValue([connection]),
      listAgentAssignments: vi.fn().mockResolvedValue(assignments),
      updateAgentAssignment: vi.fn().mockImplementation((agentId, input) => Promise.resolve({
        ...assignments.find((item) => item.agentId === agentId)!, ...input,
      })),
    })
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={service} />)

    const list = await screen.findByRole('list', { name: 'Asignaciones de agentes' })
    const orchestrator = within(list).getByRole('listitem', { name: /Orquestador/ })
    const curator = within(list).getByRole('listitem', { name: /Curador/ })
    await user.selectOptions(within(orchestrator).getByLabelText('Conexión'), connection.id)
    await user.type(within(orchestrator).getByLabelText('Modelo'), 'gpt-5')
    await user.click(within(orchestrator).getByRole('button', { name: 'Guardar' }))
    await user.selectOptions(within(curator).getByLabelText('Conexión'), connection.id)
    await user.type(within(curator).getByLabelText('Modelo'), 'gpt-5-mini')
    await user.click(within(curator).getByRole('button', { name: 'Guardar' }))

    expect(service.updateAgentAssignment).toHaveBeenNthCalledWith(1, 'orchestrator', {
      connectionId: connection.id, model: 'gpt-5',
    })
    expect(service.updateAgentAssignment).toHaveBeenNthCalledWith(2, 'curator', {
      connectionId: connection.id, model: 'gpt-5-mini',
    })
  })

  it('calls attention to an assignment cleared by deleting its connection', async () => {
    const assigned: AgentAssignment = { agentId: 'orchestrator', label: 'Orquestador', connectionId: connection.id, model: 'gpt-5' }
    const cleared = { ...assigned, connectionId: null, model: '' }
    const service = makeService({
      listConnections: vi.fn().mockResolvedValueOnce([connection]).mockResolvedValueOnce([]),
      listAgentAssignments: vi.fn().mockResolvedValueOnce([assigned]).mockResolvedValueOnce([cleared]),
    })
    const user = userEvent.setup()
    render(<ModelSettingsScreen service={service} />)
    await screen.findByRole('button', { name: 'Editar OpenAI principal' })

    await user.click(screen.getByRole('button', { name: 'Eliminar OpenAI principal' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))

    expect(await screen.findByRole('alert', { name: 'Asignación de Orquestador requiere atención' })).toHaveTextContent('Sin configurar')
  })
})
