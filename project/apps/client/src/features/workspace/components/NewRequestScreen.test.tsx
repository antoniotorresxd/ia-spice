import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

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
