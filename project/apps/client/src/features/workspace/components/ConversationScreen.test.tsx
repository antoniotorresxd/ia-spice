import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceConversationDetail } from '../model/workspace-types'
import { createMockWorkspaceService } from '../services/mock-workspace-service'
import type { WorkspaceService } from '../services/workspace-service'
import { ConversationScreen } from './ConversationScreen'

afterEach(cleanup)

function renderScreen(service: WorkspaceService, id = 'conversation-rc') {
  return render(
    <MemoryRouter initialEntries={[`/conversations/${id}`]}>
      <Routes><Route path="/conversations/:conversationId" element={<ConversationScreen service={service} />} /></Routes>
    </MemoryRouter>,
  )
}

describe('ConversationScreen', () => {
  it('renders the breadcrumb, metrics, messages, timeline, and generated files', async () => {
    const service = createMockWorkspaceService()
    const original = await service.getConversation('conversation-rc')
    const detail: WorkspaceConversationDetail = {
      ...original,
      title: 'Filtro RC de 1 kHz',
      files: [{ id: 'report', name: 'report.pdf', language: 'pdf', content: '', status: 'complete' }],
    }
    vi.spyOn(service, 'getConversation').mockResolvedValue(detail)
    renderScreen(service)

    expect(await screen.findByRole('heading', { name: 'Filtro RC de 1 kHz', level: 1 })).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Ruta de conversación' })).toHaveTextContent('Filtros analógicos')
    expect(screen.getByText('Interpretación')).toBeVisible()
    expect(screen.getByText('Preparé una propuesta para filtro rc pasa bajas.')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Archivos generados' })).toHaveTextContent('report.pdf')
    expect(screen.queryByLabelText('Lista de conversaciones')).not.toBeInTheDocument()
  })

  it('shows a safe missing state', async () => {
    renderScreen(createMockWorkspaceService(), 'missing')
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esta conversación')
  })

  it.each([
    ['active', 'En curso'],
    ['completed', 'Completada'],
    ['failed', 'Fallida'],
  ] as const)('renders %s execution status', async (status, label) => {
    const service = createMockWorkspaceService()
    const detail = await service.getConversation('conversation-rc')
    vi.spyOn(service, 'getConversation').mockResolvedValue({ ...detail, executionStatus: status, execution: { ...detail.execution, status } })
    renderScreen(service)
    expect(await screen.findByText(label)).toBeVisible()
  })

  it('validates empty continuation text', async () => {
    const user = userEvent.setup()
    renderScreen(createMockWorkspaceService())
    await screen.findByRole('heading', { name: 'Filtro RC pasa bajas', level: 1 })
    await user.click(screen.getByRole('button', { name: 'Continuar conversación' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe una indicación')
  })

  it('disables submission while continuation is pending and updates on success', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()
    let resolve!: (value: WorkspaceConversationDetail) => void
    const pending = new Promise<WorkspaceConversationDetail>((done) => { resolve = done })
    vi.spyOn(service, 'continueConversation').mockReturnValue(pending)
    renderScreen(service)
    const input = await screen.findByLabelText('Nueva indicación')
    await user.type(input, 'Ajusta la frecuencia de corte')
    await user.click(screen.getByRole('button', { name: 'Continuar conversación' }))
    expect(screen.getByRole('button', { name: 'Continuando…' })).toBeDisabled()
    const current = await service.getConversation('conversation-rc')
    resolve({ ...current, messages: [...current.messages, { id: 'new', role: 'user', content: 'Ajusta la frecuencia de corte', createdAt: current.updatedAt }] })
    expect(await screen.findByText('Ajusta la frecuencia de corte')).toBeVisible()
    expect(input).toHaveValue('')
  })

  it('retains continuation text when submission fails', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()
    vi.spyOn(service, 'continueConversation').mockRejectedValue(new Error('Sin conexión'))
    renderScreen(service)
    const input = await screen.findByLabelText('Nueva indicación')
    await user.type(input, 'Conserva este texto')
    await user.click(screen.getByRole('button', { name: 'Continuar conversación' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión'))
    expect(input).toHaveValue('Conserva este texto')
  })
})
