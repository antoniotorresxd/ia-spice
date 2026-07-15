import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { createMockWorkspaceService } from '../services/mock-workspace-service'
import { WorkspaceShell } from './WorkspaceShell'

afterEach(cleanup)

it('keeps workspace navigation around nested route content', async () => {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <Routes>
        <Route
          element={
            <WorkspaceShell
              onSignOut={vi.fn()}
              service={createMockWorkspaceService()}
              userName="Antonio"
            />
          }
        >
          <Route path="projects" element={<h1>Proyectos</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('link', { name: 'Nueva solicitud' })).toHaveAttribute('href', '/new')
  expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('heading', { name: 'Proyectos' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Expandir Filtros analógicos' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

it('keeps assignment successful and undoable when snapshot refresh fails', async () => {
  const user = userEvent.setup()
  const service = createMockWorkspaceService()
  const snapshot = await service.getSnapshot()
  service.getSnapshot = vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('Refresh failed')).mockResolvedValue(snapshot)
  render(<MemoryRouter initialEntries={['/projects']}><Routes><Route element={<WorkspaceShell onSignOut={vi.fn()} service={service} userName="Antonio" />}><Route path="projects" element={<h1>Proyectos</h1>} /></Route></Routes></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: 'Mover a proyecto Divisor de voltaje' }))
  await user.click(screen.getByRole('menuitem', { name: 'Filtros analógicos' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Conversación movida')
  expect(screen.getByRole('button', { name: 'Deshacer' })).toBeVisible()
  expect(screen.getByText(/no pudimos actualizar/i)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Reintentar actualización' }))
  expect(service.getSnapshot).toHaveBeenCalledTimes(3)
})
