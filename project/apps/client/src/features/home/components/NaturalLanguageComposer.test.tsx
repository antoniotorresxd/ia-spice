import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { NaturalLanguageComposer } from './NaturalLanguageComposer'

afterEach(cleanup)

it('submits trimmed natural language', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<NaturalLanguageComposer onSubmit={onSubmit} />)

  await user.type(
    screen.getByLabelText('Describe qué quieres diseñar'),
    '  Filtro RC  ',
  )
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(onSubmit).toHaveBeenCalledWith('Filtro RC')
  expect(screen.getByLabelText('Describe qué quieres diseñar')).toHaveValue('')
})

it('rejects whitespace without calling the service', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<NaturalLanguageComposer onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText('Describe qué quieres diseñar'), '   ')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Escribe una solicitud antes de continuar.',
  )
})

it('shows a safe error and preserves text when submission fails', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockRejectedValue(new Error('raw provider failure'))
  render(<NaturalLanguageComposer onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText('Describe qué quieres diseñar'), 'Filtro')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No pudimos iniciar la solicitud. Inténtalo de nuevo.',
  )
  expect(screen.queryByText('raw provider failure')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Describe qué quieres diseñar')).toHaveValue(
    'Filtro',
  )
})

