import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { HomeSidebar } from './HomeSidebar'

afterEach(cleanup)

function Location() {
  return <output aria-label="Ruta actual">{useLocation().pathname}</output>
}

function renderSidebar(onSignOut = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <HomeSidebar
        conversations={[]}
        isOpen
        onClose={onClose}
        onSignOut={onSignOut}
        userName="Antonio"
      />
      <Location />
    </MemoryRouter>,
  )

  return { onSignOut, onClose }
}

it('does not retain the profile menu after mobile navigation closes and reopens', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const { rerender } = render(
    <MemoryRouter>
      <HomeSidebar conversations={[]} isOpen onClose={onClose} onSignOut={vi.fn()} userName="Antonio" />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: 'Perfil de Antonio' }))
  await user.click(screen.getByRole('button', { name: 'Cerrar navegación' }))
  expect(onClose).toHaveBeenCalledOnce()

  rerender(
    <MemoryRouter>
      <HomeSidebar conversations={[]} isOpen={false} onClose={onClose} onSignOut={vi.fn()} userName="Antonio" />
    </MemoryRouter>,
  )
  rerender(
    <MemoryRouter>
      <HomeSidebar conversations={[]} isOpen onClose={onClose} onSignOut={vi.fn()} userName="Antonio" />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('opens an accessible profile menu', async () => {
  const user = userEvent.setup()
  renderSidebar()

  const trigger = screen.getByRole('button', { name: 'Perfil de Antonio' })
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await user.click(trigger)

  expect(screen.getByRole('menu', { name: 'Menú de perfil' })).toBeVisible()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

it.each([
  ['Perfil', '/settings/profile'],
  ['Modelos y providers', '/settings/models'],
] as const)('navigates with %s and closes the menu', async (label, path) => {
  const user = userEvent.setup()
  renderSidebar()

  await user.click(screen.getByRole('button', { name: 'Perfil de Antonio' }))
  await user.click(screen.getByRole('menuitem', { name: label }))

  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(path)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('closes on Escape and restores focus to the trigger', async () => {
  const user = userEvent.setup()
  renderSidebar()
  const trigger = screen.getByRole('button', { name: 'Perfil de Antonio' })

  await user.click(trigger)
  await user.keyboard('{Escape}')

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('closes on an outside pointer interaction and restores focus', async () => {
  const user = userEvent.setup()
  renderSidebar()
  const trigger = screen.getByRole('button', { name: 'Perfil de Antonio' })

  await user.click(trigger)
  fireEvent.pointerDown(screen.getByLabelText('Ruta actual'))

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('closes before delegating sign out', async () => {
  const user = userEvent.setup()
  const onSignOut = vi.fn().mockResolvedValue(undefined)
  renderSidebar(onSignOut)

  await user.click(screen.getByRole('button', { name: 'Perfil de Antonio' }))
  await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(onSignOut).toHaveBeenCalledOnce()
})
