import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { createMockWorkspaceService } from '../services/mock-workspace-service'
import { ConversationsScreen } from './ConversationsScreen'

afterEach(cleanup)

describe('ConversationsScreen', () => {
  it('filters conversations by normalized text, project, and execution state', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ConversationsScreen service={createMockWorkspaceService()} /></MemoryRouter>)

    expect(await screen.findByRole('row', { name: /Filtro RC pasa bajas/ })).toHaveTextContent('Filtros analógicos')

    await user.type(screen.getByLabelText('Buscar conversaciones'), 'polarizacion')
    expect(screen.getByRole('row', { name: /Polarización de transistor BJT/ })).toBeVisible()
    expect(screen.queryByRole('row', { name: /Filtro RC pasa bajas/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar conversaciones'))
    await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
    expect(screen.getByRole('row', { name: /Divisor de voltaje/ })).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Proyecto'), 'all')
    await user.selectOptions(screen.getByLabelText('Estado'), 'failed')
    expect(screen.getByRole('row', { name: /Polarización de transistor BJT/ })).toBeVisible()
  })
})

it('removes individual filter chips and clears all filter controls', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><ConversationsScreen service={createMockWorkspaceService()} /></MemoryRouter>)
  await screen.findByRole('row', { name: /Filtro RC pasa bajas/ })

  await user.type(screen.getByLabelText('Buscar conversaciones'), 'divisor')
  await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
  await user.selectOptions(screen.getByLabelText('Estado'), 'completed')
  expect(screen.getByText('3 filtros activos')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Quitar filtro Proyecto: Sin proyecto' }))
  expect(screen.getByLabelText('Proyecto')).toHaveValue('all')
  expect(screen.getByLabelText('Estado')).toHaveValue('completed')
  expect(screen.getByLabelText('Buscar conversaciones')).toHaveValue('divisor')
  expect(screen.getByText('2 filtros activos')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Quitar filtro Estado: Completada' }))
  expect(screen.getByLabelText('Estado')).toHaveValue('all')
  await user.click(screen.getByRole('button', { name: 'Quitar filtro Búsqueda: divisor' }))
  expect(screen.getByLabelText('Buscar conversaciones')).toHaveValue('')
  expect(screen.getByText('0 filtros activos')).toBeVisible()

  await user.type(screen.getByLabelText('Buscar conversaciones'), 'polarizacion')
  await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
  await user.selectOptions(screen.getByLabelText('Estado'), 'failed')
  await user.click(screen.getByRole('button', { name: 'Limpiar todo' }))
  expect(screen.getByLabelText('Proyecto')).toHaveValue('all')
  expect(screen.getByLabelText('Estado')).toHaveValue('all')
  expect(screen.getByLabelText('Buscar conversaciones')).toHaveValue('')
  expect(screen.getByText('0 filtros activos')).toBeVisible()
  expect(screen.getByRole('row', { name: /Filtro RC pasa bajas/ })).toBeVisible()
  expect(screen.getByRole('row', { name: /Polarización de transistor BJT/ })).toBeVisible()
})
