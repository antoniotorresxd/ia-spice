import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import type { WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { ProjectsScreen } from './ProjectsScreen'

afterEach(cleanup)

const snapshot: WorkspaceSnapshot = {
  projects: [
    {
      id: 'filters',
      name: 'Filtros analógicos',
      description: 'Diseño y validación de filtros pasivos y activos.',
      conversationIds: Array.from({ length: 12 }, (_, index) => `filter-${index}`),
      updatedAt: '2026-07-15T15:00:00.000Z',
    },
    {
      id: 'power',
      name: 'Fuente regulada',
      description: 'Conversores y regulación lineal para prototipos.',
      conversationIds: ['power-1'],
      updatedAt: '2026-07-14T15:00:00.000Z',
    },
    {
      id: 'amplifier',
      name: 'Amplificador BJT',
      description: 'Polarización y ganancia.',
      conversationIds: [],
      updatedAt: '2026-07-13T15:00:00.000Z',
    },
  ],
  conversations: [],
  unassignedConversationIds: [],
}

function serviceWith(overrides: Partial<WorkspaceService> = {}): WorkspaceService {
  return {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    createProject: vi.fn().mockResolvedValue({
      id: 'sensors', name: 'Sensores', description: '', conversationIds: [], updatedAt: '2026-07-15T16:00:00.000Z',
    }),
    getProject: vi.fn(),
    getConversation: vi.fn(),
    submitRequest: vi.fn(),
    continueConversation: vi.fn(),
    assignConversation: vi.fn(),
    restoreConversationProject: vi.fn(),
    ...overrides,
  }
}

function renderScreen(service = serviceWith()) {
  const user = userEvent.setup()
  render(<MemoryRouter><ProjectsScreen service={service} /><div aria-label="Ruta actual"><CurrentPath /></div></MemoryRouter>)
  return { service, user }
}

function CurrentPath() { return useLocation().pathname }

it('renders a searchable, newest-first project directory', async () => {
  const { user } = renderScreen()

  expect(await screen.findByRole('row', { name: /Filtros analógicos/ })).toHaveTextContent('12 conversaciones')
  const rows = screen.getAllByRole('row').slice(1)
  expect(within(rows[0]).getByText('Filtros analógicos')).toBeVisible()
  expect(within(rows[1]).getByText('Fuente regulada')).toBeVisible()

  await user.selectOptions(screen.getByRole('combobox', { name: 'Ordenar proyectos' }), 'name')
  const alphabeticalRows = screen.getAllByRole('row').slice(1)
  expect(within(alphabeticalRows[0]).getByText('Amplificador BJT')).toBeVisible()
  expect(within(alphabeticalRows[1]).getByText('Filtros analógicos')).toBeVisible()

  await user.type(screen.getByRole('searchbox', { name: 'Buscar proyectos' }), 'fuente')
  expect(screen.queryByRole('row', { name: /Filtros analógicos/ })).not.toBeInTheDocument()
  expect(screen.getByRole('row', { name: /Fuente regulada/ })).toBeVisible()
})

it('creates a project and opens its route', async () => {
  const { service, user } = renderScreen()

  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: 'Nuevo proyecto' }))
  await user.type(screen.getByLabelText('Nombre'), 'Sensores')
  await user.click(screen.getByRole('button', { name: 'Crear proyecto' }))

  expect(service.createProject).toHaveBeenCalledWith({ name: 'Sensores', description: '' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/projects/sensors')
})

it('shows empty and filtered-empty states', async () => {
  const emptyService = serviceWith({ getSnapshot: vi.fn().mockResolvedValue({ ...snapshot, projects: [] }) })
  const first = renderScreen(emptyService)
  expect(await screen.findByText('Todavía no hay proyectos.')).toBeVisible()
  cleanup()

  const second = renderScreen()
  await screen.findByRole('table')
  await second.user.type(screen.getByRole('searchbox', { name: 'Buscar proyectos' }), 'inexistente')
  expect(screen.getByText('No hay proyectos que coincidan con tu búsqueda.')).toBeVisible()
  void first
})

it('shows loading and retries a safe load error', async () => {
  let resolve!: (value: WorkspaceSnapshot) => void
  const service = serviceWith({
    getSnapshot: vi.fn()
      .mockReturnValueOnce(new Promise<WorkspaceSnapshot>((done) => { resolve = done }))
      .mockResolvedValueOnce(snapshot),
  })
  const { user } = renderScreen(service)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando proyectos…')
  resolve(snapshot)
  await screen.findByRole('table')
  cleanup()

  const failing = serviceWith({
    getSnapshot: vi.fn().mockRejectedValueOnce(new Error('database credentials')).mockResolvedValueOnce(snapshot),
  })
  const retry = renderScreen(failing)
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los proyectos.')
  expect(screen.queryByText('database credentials')).not.toBeInTheDocument()
  await retry.user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('table')).toBeVisible()
  void user
})

it('validates creation errors without exposing service details', async () => {
  const service = serviceWith({ createProject: vi.fn().mockRejectedValue(new Error('private provider error')) })
  const { user } = renderScreen(service)
  await screen.findByRole('table')
  await user.click(screen.getByRole('button', { name: 'Nuevo proyecto' }))
  await user.click(screen.getByRole('button', { name: 'Crear proyecto' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Escribe un nombre para el proyecto.')
  await user.type(screen.getByLabelText('Nombre'), 'Sensores')
  await user.click(screen.getByRole('button', { name: 'Crear proyecto' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos crear el proyecto. Inténtalo de nuevo.')
  expect(screen.queryByText('private provider error')).not.toBeInTheDocument()
})

it('traps focus, closes on Escape, and restores focus to the trigger', async () => {
  const { user } = renderScreen()
  await screen.findByRole('table')
  const trigger = screen.getByRole('button', { name: 'Nuevo proyecto' })
  await user.click(trigger)
  expect(screen.getByLabelText('Nombre')).toHaveFocus()
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Crear proyecto' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(trigger).toHaveFocus())
})
