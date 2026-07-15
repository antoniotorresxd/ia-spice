import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function renderScreen(workspaceService = service()) {
  render(<MemoryRouter initialEntries={['/projects/project-filters']}><Routes><Route path="/projects/:projectId" element={<ProjectScreen service={workspaceService} />} /></Routes></MemoryRouter>)
  return workspaceService
}

it('renders semantic tabs and links files to their source conversations', async () => {
  const user = userEvent.setup()
  renderScreen()
  expect(await screen.findByRole('tab', { name: 'Conversaciones 1' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', { name: 'Archivos 1' }))
  expect(screen.getByRole('tabpanel', { name: 'Archivos' })).toHaveTextContent('report.pdf')
  expect(screen.getByRole('link', { name: 'report.pdf' })).toHaveAttribute('href', '/conversations/conversation-rc')
})

it('validates drag data, assigns a conversation, and supports undo', async () => {
  const user = userEvent.setup()
  const workspaceService = renderScreen()
  const target = await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' })
  fireEvent.drop(target, { dataTransfer: { getData: () => '{bad json' } })
  expect(workspaceService.assignConversation).not.toHaveBeenCalled()
  fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  await waitFor(() => expect(workspaceService.assignConversation).toHaveBeenCalledWith('conversation-draft', 'project-filters'))
  expect(screen.getByRole('status')).toHaveTextContent('Conversación movida a Filtros analógicos')
  await user.click(screen.getByRole('button', { name: 'Deshacer' }))
  expect(workspaceService.restoreConversationProject).toHaveBeenCalledWith('conversation-draft', null)
})

it('announces assignment failures without showing success', async () => {
  const workspaceService = service({ assignConversation: vi.fn().mockRejectedValue(new Error('Sin conexión')) })
  renderScreen(workspaceService)
  fireEvent.drop(await screen.findByRole('region', { name: 'Asignar a Filtros analógicos' }), { dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(screen.queryByText('Conversación movida a Filtros analógicos')).not.toBeInTheDocument()
})

