import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
      files: [{ id: 'report', name: 'report.pdf', language: 'pdf', content: '', status: 'complete', summary: null, tags: null, components: null, measurementExplanation: null }],
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

  it('fades scrolled history and lets readers return to the latest content', async () => {
    renderScreen(createMockWorkspaceService())
    const history = await screen.findByRole('region', { name: 'Historial de conversación' })
    Object.defineProperties(history, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 400 },
    })
    history.scrollTop = 200
    fireEvent.scroll(history)
    expect(history).toHaveAttribute('data-scrolled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ir al final' }))
    expect(history.scrollTop).toBe(1200)
    expect(screen.queryByRole('button', { name: 'Ir al final' })).not.toBeInTheDocument()
    history.scrollTop = 0
    fireEvent.scroll(history)
    expect(history).toHaveAttribute('data-scrolled', 'false')
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
    expect(await screen.findByText(label, { selector: 'dd' })).toBeVisible()
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

  it('refresca la conversación hasta que la ejecución termina', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const service = createMockWorkspaceService()
    const detail = await service.getConversation('conversation-rc')

    const getConversation = vi
      .spyOn(service, 'getConversation')
      .mockResolvedValueOnce({ ...detail, executionStatus: 'active', execution: { ...detail.execution, status: 'active' } })
      .mockResolvedValue({ ...detail, executionStatus: 'completed', execution: { ...detail.execution, status: 'completed' } })

    renderScreen(service)

    expect(await screen.findByText('En curso', { selector: 'dd' })).toBeVisible()

    await vi.advanceTimersByTimeAsync(2000)
    expect(await screen.findByText('Completada', { selector: 'dd' })).toBeVisible()

    const callsAfterCompletion = getConversation.mock.calls.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(getConversation.mock.calls.length).toBe(callsAfterCompletion)

    vi.useRealTimers()
  })

  it('renders conversational chat without execution timeline when mode is chat', async () => {
    const service = createMockWorkspaceService()
    const detail: WorkspaceConversationDetail = {
      id: 'conversation-chat',
      projectId: null,
      title: 'jelou',
      preview: '¡Hola! ¿En qué puedo ayudarte?',
      updatedAt: '2026-09-13T12:00:00Z',
      executionStatus: 'completed',
      messages: [
        { id: 'm1', role: 'user', content: 'jelou', createdAt: '2026-09-13T12:00:00Z' },
        { id: 'm2', role: 'assistant', content: '¡Hola! ¿En qué puedo ayudarte?', createdAt: '2026-09-13T12:00:01Z' },
      ],
      files: [],
      execution: {
        id: 'exec-chat',
        status: 'completed',
        summary: '¡Hola! ¿En qué puedo ayudarte?',
        mode: 'chat',
      },
    }
    vi.spyOn(service, 'getConversation').mockResolvedValue(detail)
    renderScreen(service, 'conversation-chat')

    expect(await screen.findByRole('heading', { name: 'jelou', level: 1 })).toBeVisible()
    expect(screen.getAllByText('¡Hola! ¿En qué puedo ayudarte?')[0]).toBeVisible()
    expect(screen.queryByText('Progreso de la ejecución')).not.toBeInTheDocument()
    expect(screen.queryByText('Interpretación')).not.toBeInTheDocument()
    expect(screen.getByText('Conversación', { selector: 'span' })).toBeVisible()
  })

  it('renderiza el Markdown y las fórmulas del asistente, pero no los del usuario', async () => {
    const service = createMockWorkspaceService()
    const detail: WorkspaceConversationDetail = {
      id: 'conversation-md',
      projectId: null,
      title: 'reduce la red',
      preview: 'Rama 1',
      updatedAt: '2026-10-14T12:00:00Z',
      executionStatus: 'completed',
      messages: [
        { id: 'm1', role: 'user', content: 'usa **negritas** y $x$', createdAt: '2026-10-14T12:00:00Z' },
        { id: 'm2', role: 'assistant', content: '1. **Rama 1:** $R = 40\\,\\Omega$', createdAt: '2026-10-14T12:00:01Z' },
      ],
      files: [],
      execution: { id: 'exec-md', status: 'completed', summary: 'listo', mode: 'chat' },
    }
    vi.spyOn(service, 'getConversation').mockResolvedValue(detail)
    const { container } = renderScreen(service, 'conversation-md')

    expect(await screen.findByText('Rama 1:', { selector: 'strong' })).toBeVisible()
    expect(container.querySelector('[data-role="assistant"] .katex')).not.toBeNull()
    expect(screen.getByText('usa **negritas** y $x$')).toBeVisible()
  })

  it('permite colapsar y abrir el panel lateral de circuito e inspección', async () => {
    const user = userEvent.setup()
    renderScreen(createMockWorkspaceService())

    expect(await screen.findByRole('complementary', { name: 'Panel de inspección y circuitos' })).toBeVisible()

    const toggleBtn = screen.getByRole('button', { name: 'Ocultar panel lateral' })
    await user.click(toggleBtn)

    expect(screen.queryByRole('complementary', { name: 'Panel de inspección y circuitos' })).not.toBeInTheDocument()

    const openBtn = screen.getByRole('button', { name: 'Mostrar panel lateral' })
    expect(openBtn).toBeVisible()

    await user.click(openBtn)
    expect(await screen.findByRole('complementary', { name: 'Panel de inspección y circuitos' })).toBeVisible()
  })
})

describe('ConversationScreen con imágenes adjuntas', () => {
  const attachment = { mediaType: 'image/png' as const, data: 'iVBORw0KGgo=' }

  it('muestra las imágenes de un mensaje y abre la imagen completa', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()
    const original = await service.getConversation('conversation-rc')
    vi.spyOn(service, 'getConversation').mockResolvedValue({
      ...original,
      messages: [
        { id: 'with-image', role: 'user', content: 'Resuelve la Fig. P2.7', attachments: [attachment], createdAt: original.updatedAt },
        ...original.messages,
      ],
    })
    renderScreen(service)

    const thumbnail = await screen.findByRole('button', { name: 'Ver imagen 1 en tamaño completo' })
    await user.click(thumbnail)
    const dialog = screen.getByRole('dialog', { name: 'Imagen adjunta' })
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')

    await user.click(screen.getByRole('button', { name: 'Cerrar imagen' }))
    expect(screen.queryByRole('dialog', { name: 'Imagen adjunta' })).not.toBeInTheDocument()
  })

  it('continúa la conversación con una imagen adjunta', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()
    const continueConversation = vi.spyOn(service, 'continueConversation')
    renderScreen(service)
    const input = await screen.findByLabelText('Nueva indicación')

    const figura = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'fig.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Adjuntar imagen'), figura)
    expect(await screen.findByRole('img', { name: 'Imagen adjunta 1' })).toBeVisible()

    await user.type(input, 'Ahora la figura 2')
    await user.click(screen.getByRole('button', { name: 'Continuar conversación' }))

    await waitFor(() => expect(continueConversation).toHaveBeenCalledWith('conversation-rc', 'Ahora la figura 2', [attachment]))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Imagen adjunta 1' })).not.toBeInTheDocument())
  })
})
