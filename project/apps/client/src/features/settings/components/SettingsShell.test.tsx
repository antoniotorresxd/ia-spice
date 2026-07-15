import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { SettingsShell } from './SettingsShell'

afterEach(cleanup)

function renderShell(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsShell onSignOut={vi.fn()} userEmail="ada@example.com" userName="Ada">
        <h1>Contenido</h1>
      </SettingsShell>
    </MemoryRouter>,
  )
}

it.each([
  ['/settings/profile', 'Perfil'],
  ['/settings/models', 'Modelos y providers'],
] as const)('marks %s as the active settings destination', (path, label) => {
  renderShell(path)

  expect(screen.getByRole('navigation', { name: 'Configuración' })).toBeVisible()
  expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Volver a la aplicación' })).toHaveAttribute('href', '/')
})
