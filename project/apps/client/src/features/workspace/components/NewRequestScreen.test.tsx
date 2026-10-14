import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockWorkspaceService } from '../services/mock-workspace-service'
import type { WorkspaceService } from '../services/workspace-service'
import { NewRequestScreen } from './NewRequestScreen'

afterEach(cleanup)

function CurrentRoute() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function renderScreen(service: WorkspaceService = createMockWorkspaceService()) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="*" element={<><NewRequestScreen service={service} /><CurrentRoute /></>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

it('keeps the focused route free of dashboard summaries', () => {
  renderScreen()

  expect(screen.getByRole('heading', { name: '¿Qué quieres diseñar?' })).toBeVisible()
  expect(screen.getByText('Describe el circuito, restricciones o resultado que necesitas.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Contexto' })).toBeVisible()
  expect(screen.getByText('Automático')).toBeVisible()
  expect(screen.queryByText('Resumen de actividad')).not.toBeInTheDocument()
})

it('creates an unassigned conversation and navigates', async () => {
  const service = createMockWorkspaceService()
  service.submitRequest = vi.fn().mockResolvedValue({ id: 'conversation-new' })
  const { user } = renderScreen(service)

  await user.type(screen.getByRole('textbox'), 'Diseña un filtro RC')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(service.submitRequest).toHaveBeenCalledWith('Diseña un filtro RC')
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/conversations/conversation-new')
})

it('validates empty requests without calling the service', async () => {
  const service = createMockWorkspaceService()
  service.submitRequest = vi.fn()
  const { user } = renderScreen(service)

  await user.type(screen.getByRole('textbox'), '   ')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(service.submitRequest).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Escribe una solicitud antes de continuar.')
})

it('disables duplicate submission while the request is pending', async () => {
  let resolveRequest!: (value: { id: string }) => void
  const service = createMockWorkspaceService()
  service.submitRequest = vi.fn().mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
  const { user } = renderScreen(service)

  await user.type(screen.getByRole('textbox'), 'Filtro RC')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
  expect(service.submitRequest).toHaveBeenCalledTimes(1)
  resolveRequest({ id: 'conversation-new' })
  await waitFor(() => {
    expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/conversations/conversation-new')
  })
})

it('shows a safe error and retains the request after service rejection', async () => {
  const service = createMockWorkspaceService()
  service.submitRequest = vi.fn().mockRejectedValue(new Error('provider secret'))
  const { user } = renderScreen(service)

  await user.type(screen.getByRole('textbox'), 'Diseña una fuente regulada')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos iniciar la solicitud. Inténtalo de nuevo.')
  expect(screen.getByRole('textbox')).toHaveValue('Diseña una fuente regulada')
  expect(screen.queryByText('provider secret')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/new')
})

it('uses an example prompt without submitting it', async () => {
  const service = createMockWorkspaceService()
  service.submitRequest = vi.fn()
  const { user } = renderScreen(service)

  const examples = screen.getAllByRole('button', { name: /Usar ejemplo:/ })
  expect(examples).toHaveLength(3)
  await user.click(screen.getByRole('button', { name: 'Usar ejemplo: Filtro RC' }))

  expect(screen.getByRole('textbox')).toHaveValue('Diseña un filtro RC pasa bajas de 1 kHz')
  expect(service.submitRequest).not.toHaveBeenCalled()
})

describe('imágenes adjuntas', () => {
  const figura = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'fig-p2-7.png', { type: 'image/png' })

  it('adjunta una imagen con el selector, la muestra y la manda con la solicitud', async () => {
    const service = createMockWorkspaceService()
    service.submitRequest = vi.fn().mockResolvedValue({ id: 'conversation-new' })
    const { user } = renderScreen(service)

    await user.upload(screen.getByLabelText('Adjuntar imagen'), figura())
    expect(await screen.findByRole('img', { name: 'Imagen adjunta 1' })).toBeVisible()

    await user.type(screen.getByRole('textbox'), 'Resuelve la Fig. P2.7')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(service.submitRequest).toHaveBeenCalledWith('Resuelve la Fig. P2.7', [
      { mediaType: 'image/png', data: 'iVBORw0KGgo=' },
    ])
  })

  it('quita una imagen antes de enviar', async () => {
    const service = createMockWorkspaceService()
    service.submitRequest = vi.fn().mockResolvedValue({ id: 'conversation-new' })
    const { user } = renderScreen(service)

    await user.upload(screen.getByLabelText('Adjuntar imagen'), figura())
    await user.click(await screen.findByRole('button', { name: 'Quitar imagen 1' }))
    expect(screen.queryByRole('img', { name: 'Imagen adjunta 1' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'Sin figura')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(service.submitRequest).toHaveBeenCalledWith('Sin figura')
  })

  it('acepta una imagen pegada y otra arrastrada', async () => {
    renderScreen()
    const textbox = screen.getByRole('textbox')

    fireEvent.paste(textbox, { clipboardData: { files: [figura()], items: [], types: ['Files'] } })
    expect(await screen.findByRole('img', { name: 'Imagen adjunta 1' })).toBeVisible()

    fireEvent.drop(textbox.closest('form')!, { dataTransfer: { files: [figura()], types: ['Files'] } })
    expect(await screen.findByRole('img', { name: 'Imagen adjunta 2' })).toBeVisible()
  })

  it('rechaza formatos no admitidos y más de tres imágenes con un aviso', async () => {
    renderScreen()
    const textbox = screen.getByRole('textbox')

    const gif = new File([new Uint8Array([1])], 'anim.gif', { type: 'image/gif' })
    fireEvent.paste(textbox, { clipboardData: { files: [gif], items: [], types: ['Files'] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('anim.gif')

    fireEvent.paste(textbox, {
      clipboardData: { files: [figura(), figura(), figura(), figura()], items: [], types: ['Files'] },
    })
    await waitFor(() => expect(screen.getAllByRole('img', { name: /Imagen adjunta/ })).toHaveLength(3))
    expect(screen.getByRole('alert')).toHaveTextContent('3 imágenes')
  })
})
