import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import type { WorkspaceService } from '../services/workspace-service'
import { ProjectScreen } from './ProjectScreen'

afterEach(cleanup)

const project = {
  id: 'project-filters', name: 'Filtros analógicos', description: 'Diseño de filtros',
  conversationIds: ['conversation-rc'], fileCount: 1, updatedAt: '2026-07-14T12:00:00.000Z',
  conversations: [{ id: 'conversation-rc', projectId: 'project-filters', title: 'Filtro RC', preview: 'RC', updatedAt: '2026-07-14T12:00:00.000Z', executionStatus: 'completed' as const }],
}

function service(overrides: Partial<WorkspaceService> = {}): WorkspaceService {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    getConversation: vi.fn().mockResolvedValue({ ...project.conversations[0], messages: [], execution: { id: 'run', status: 'completed', summary: 'Lista' }, files: [{ id: 'file-report', name: 'report.pdf', language: 'pdf', content: '', status: 'complete' }] }),
    getSnapshot: vi.fn().mockResolvedValue({ projects: [project], conversations: [], unassignedConversationIds: [] }),
    createProject: vi.fn(), submitRequest: vi.fn(), continueConversation: vi.fn(),
    assignConversation: vi.fn().mockResolvedValue({}),
    restoreConversationProject: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as WorkspaceService
}

function renderScreen(workspaceService = service(), refreshSnapshot = vi.fn().mockResolvedValue(undefined)) {
  render(<MemoryRouter initialEntries={['/projects/project-filters']}><Routes><Route element={<Outlet context={{ refreshSnapshot }} />}><Route path="/projects/:projectId" element={<ProjectScreen service={workspaceService} />} /></Route></Routes></MemoryRouter>)
  return workspaceService
}

function renderNavigable(workspaceService: WorkspaceService) {
  render(<MemoryRouter initialEntries={['/projects/project-filters']}><Routes><Route element={<Outlet context={{ refreshSnapshot: vi.fn() }} />}><Route path="/projects/:projectId" element={<><ProjectScreen service={workspaceService} /><Link to="/projects/project-b">Ir a B</Link></>} /></Route></Routes></MemoryRouter>)
}

it('renders semantic tabs and links files to their source conversations', async () => {
  const user = userEvent.setup()
  renderScreen()
  expect(await screen.findByRole('tab', { name: 'Conversaciones 1' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Conversaciones 1' })).toHaveAttribute('tabindex', '0')
  expect(screen.getByRole('tab', { name: 'Archivos 1' })).toHaveAttribute('tabindex', '-1')
  await user.click(screen.getByRole('tab', { name: 'Archivos 1' }))
  expect(screen.getByRole('tabpanel', { name: 'Archivos 1' })).toHaveTextContent('report.pdf')
  expect(screen.getByRole('link', { name: 'report.pdf' })).toHaveAttribute('href', '/conversations/conversation-rc')
})

it('loads file details lazily, tolerates partial failures, and supports arrow tab navigation', async () => {
  const user = userEvent.setup()
  const second = { ...project.conversations[0], id: 'conversation-failed', title: 'Fallida' }
  const workspaceService = service({
    getProject: vi.fn().mockResolvedValue({ ...project, conversationIds: ['conversation-rc', second.id], conversations: [project.conversations[0], second], fileCount: 1 }),
    getConversation: vi.fn().mockImplementation((id) => id === second.id ? Promise.reject(new Error('Detalle no disponible')) : service().getConversation(id)),
  })
  renderScreen(workspaceService)
  const conversationsTab = await screen.findByRole('tab', { name: 'Conversaciones 2' })
  expect(workspaceService.getConversation).not.toHaveBeenCalled()
  conversationsTab.focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Archivos 1' })).toHaveFocus()
  expect(await screen.findByRole('link', { name: 'report.pdf' })).toBeVisible()
  expect(screen.getByText(/algunos archivos no se pudieron cargar/i)).toBeVisible()
  expect(workspaceService.getConversation).toHaveBeenCalledTimes(2)
  await user.keyboard('{ArrowLeft}')
  expect(screen.getByRole('tab', { name: 'Conversaciones 2' })).toHaveFocus()
})

it('validates drag data, assigns a conversation, and supports undo', async () => {
  const user = userEvent.setup()
  const workspaceService = renderScreen()
  const target = await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' })
  fireEvent.drop(target, { dataTransfer: { getData: () => '{bad json' } })
  fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'draft', previousProjectId: null, extra: true }) } })
  expect(workspaceService.assignConversation).not.toHaveBeenCalled()
  fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  await waitFor(() => expect(workspaceService.assignConversation).toHaveBeenCalledWith('conversation-draft', 'project-filters'))
  expect(screen.getByRole('status')).toHaveTextContent('Conversación movida a Filtros analógicos')
  await user.click(screen.getByRole('button', { name: 'Deshacer' }))
  expect(workspaceService.restoreConversationProject).toHaveBeenCalledWith('conversation-draft', null)
})

it('keeps successful assignment undoable when project refresh fails and allows retry', async () => {
  const user = userEvent.setup()
  const workspaceService = service({ getProject: vi.fn().mockResolvedValueOnce(project).mockRejectedValueOnce(new Error('Refresh failed')).mockResolvedValue(project) })
  renderScreen(workspaceService)
  fireEvent.drop(await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' }), { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  expect(await screen.findByRole('status')).toHaveTextContent('Conversación movida')
  expect(screen.getByRole('button', { name: 'Deshacer' })).toBeVisible()
  expect(screen.getByText(/no pudimos actualizar/i)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Reintentar actualización' }))
  await waitFor(() => expect(workspaceService.getProject).toHaveBeenCalledTimes(3))
})

it('reports refresh separately after a successful undo', async () => {
  const user = userEvent.setup()
  const workspaceService = service({ getProject: vi.fn().mockResolvedValueOnce(project).mockResolvedValueOnce(project).mockRejectedValueOnce(new Error('Refresh failed')) })
  renderScreen(workspaceService)
  fireEvent.drop(await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' }), { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
  expect(workspaceService.restoreConversationProject).toHaveBeenCalledWith('conversation-draft', null)
  expect(await screen.findByText(/no pudimos actualizar/i)).toBeVisible()
  expect(screen.queryByText(/no pudimos deshacer/i)).not.toBeInTheDocument()
})

it('announces assignment failures without showing success', async () => {
  const workspaceService = service({ assignConversation: vi.fn().mockRejectedValue(new Error('Sin conexión')) })
  renderScreen(workspaceService)
  fireEvent.drop(await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' }), { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(screen.queryByText('Conversación movida a Filtros analógicos')).not.toBeInTheDocument()
})

it('isolates file cache and selected tab when navigating between project params', async () => {
  const user = userEvent.setup()
  const projectB = { ...project, id: 'project-b', name: 'Proyecto B', conversationIds: [], conversations: [], fileCount: 0 }
  const workspaceService = service({ getProject: vi.fn().mockImplementation((id) => Promise.resolve(id === 'project-b' ? projectB : project)) })
  renderNavigable(workspaceService)
  await user.click(await screen.findByRole('tab', { name: 'Archivos 1' }))
  expect(await screen.findByRole('link', { name: 'report.pdf' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Ir a B' }))
  expect(await screen.findByRole('heading', { name: 'Proyecto B' })).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Conversaciones 0' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.queryByText('report.pdf')).not.toBeInTheDocument()
  expect(workspaceService.getConversation).toHaveBeenCalledTimes(1)
})

it('recovers from a failed project load when navigating to a valid project', async () => {
  const user = userEvent.setup()
  const projectB = { ...project, id: 'project-b', name: 'Proyecto B' }
  const workspaceService = service({ getProject: vi.fn().mockImplementation((id) => id === 'project-b' ? Promise.resolve(projectB) : Promise.reject(new Error('A failed'))) })
  renderNavigable(workspaceService)
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar')
  await user.click(screen.getByRole('link', { name: 'Ir a B' }))
  expect(await screen.findByRole('heading', { name: 'Proyecto B' })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('ignores a stale project response after navigating to another project', async () => {
  const user = userEvent.setup()
  let resolveA!: (value: typeof project) => void
  const pendingA = new Promise<typeof project>((resolve) => { resolveA = resolve })
  const projectB = { ...project, id: 'project-b', name: 'Proyecto B' }
  const workspaceService = service({ getProject: vi.fn().mockImplementation((id) => id === 'project-b' ? Promise.resolve(projectB) : pendingA) })
  renderNavigable(workspaceService)
  await user.click(screen.getByRole('link', { name: 'Ir a B' }))
  expect(await screen.findByRole('heading', { name: 'Proyecto B' })).toBeVisible()
  resolveA(project)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Proyecto B' })).toBeVisible())
  expect(screen.queryByRole('heading', { name: 'Filtros analógicos' })).not.toBeInTheDocument()
})
