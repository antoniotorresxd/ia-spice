import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import { AssistantPanel } from './AssistantPanel'

afterEach(cleanup)

it('moves through minimized, compact, and expanded states', async () => {
  const user = userEvent.setup()
  render(<AssistantPanel />)

  expect(
    screen.getByRole('dialog', {
      name: 'Asistente del Ecosistema Multiagente',
    }),
  ).toHaveAttribute('data-mode', 'compact')

  await user.click(screen.getByRole('button', { name: 'Minimizar asistente' }))
  const opener = screen.getByRole('button', { name: 'Abrir asistente' })
  expect(opener).toBeVisible()
  expect(opener).toHaveTextContent('EM')
  expect(opener).not.toHaveTextContent('Abrir asistente')

  await user.hover(opener)
  expect(screen.getByRole('tooltip')).toHaveTextContent('Abrir asistente')

  await user.tab()
  expect(screen.getByRole('tooltip')).toHaveTextContent('Abrir asistente')

  await user.click(opener)
  expect(
    screen.getByRole('dialog', {
      name: 'Asistente del Ecosistema Multiagente',
    }),
  ).toHaveAttribute('data-mode', 'compact')
  await user.click(screen.getByRole('button', { name: 'Expandir asistente' }))

  expect(
    screen.getByRole('dialog', {
      name: 'Asistente del Ecosistema Multiagente',
    }),
  ).toHaveAttribute('data-mode', 'expanded')
})

it('returns focus to the opener after minimizing', async () => {
  const user = userEvent.setup()
  render(<AssistantPanel />)

  await user.click(screen.getByRole('button', { name: 'Minimizar asistente' }))
  const opener = screen.getByRole('button', { name: 'Abrir asistente' })
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: 'Cerrar asistente' }))

  expect(opener).toHaveFocus()
})
