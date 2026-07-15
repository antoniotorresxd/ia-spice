import { cleanup, render as renderComponent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { createMockHomeService } from '../services/mock-home-service'
import { HomeScreen } from './HomeScreen'

afterEach(cleanup)

function render(component: ReactNode) {
  return renderComponent(<MemoryRouter>{component}</MemoryRouter>)
}

it('loads the operational overview through the service', async () => {
  render(
    <HomeScreen
      service={createMockHomeService()}
      userName="Ada"
      onSignOut={vi.fn()}
    />,
  )

  expect(
    await screen.findByRole('heading', { name: /buenos días, ada/i }),
  ).toBeVisible()
  expect(screen.getByText('Datos de demostración')).toBeVisible()
  expect(
    screen.getByRole('navigation', { name: 'Navegación principal' }),
  ).toBeVisible()
})

it('switches from overview to an active timeline after prompt submission', async () => {
  const user = userEvent.setup()
  render(
    <HomeScreen
      service={createMockHomeService()}
      userName="Ada"
      onSignOut={vi.fn()}
    />,
  )
  await screen.findByText('Datos de demostración')

  await user.type(
    screen.getByLabelText('Describe qué quieres diseñar'),
    'Filtro RC',
  )
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

  expect(
    await screen.findByRole('list', { name: 'Actividad de ejecución' }),
  ).toBeVisible()
  expect(screen.getAllByText('Sin proyecto').length).toBeGreaterThan(0)
})

it('changes the selected usage period through the service', async () => {
  const service = createMockHomeService()
  const spy = vi.spyOn(service, 'getHomeOverview')
  const user = userEvent.setup()
  render(<HomeScreen service={service} userName="Ada" onSignOut={vi.fn()} />)
  await screen.findByText('Datos de demostración')

  await user.selectOptions(screen.getByLabelText('Periodo de consumo'), '90d')

  expect(spy).toHaveBeenLastCalledWith('90d')
})

it('shows a safe load error and retries the current period', async () => {
  const service = createMockHomeService()
  vi.spyOn(service, 'getHomeOverview')
    .mockRejectedValueOnce(new Error('raw database failure'))
    .mockImplementation(createMockHomeService().getHomeOverview)
  const user = userEvent.setup()
  render(<HomeScreen service={service} userName="Ada" onSignOut={vi.fn()} />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No pudimos cargar tu espacio.',
  )
  expect(screen.queryByText('raw database failure')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Datos de demostración')).toBeVisible()
})
