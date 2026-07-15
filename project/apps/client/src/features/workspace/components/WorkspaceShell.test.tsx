import { cleanup, render, screen } from '@testing-library/react'
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
