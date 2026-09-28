import { ThemeProvider } from '@/lib/theme'
import { cleanup, render as renderComponent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { createMockHomeService } from '../services/mock-home-service'
import { HomeScreen } from './HomeScreen'

afterEach(cleanup)

function render(component: ReactNode) {
  return renderComponent(<ThemeProvider><MemoryRouter>{component}</MemoryRouter></ThemeProvider>)
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
    await screen.findByRole('heading', { name: /buen(os|as) (días|tardes|noches), ada/i }),
  ).toBeVisible()
  expect(screen.getByText('Datos de demostración')).toBeVisible()
  expect(
    screen.getByRole('navigation', { name: 'Navegación principal' }),
  ).toBeVisible()
})

it('renders the telemetry dashboard and links to /new for designing', async () => {
  render(
    <HomeScreen
      service={createMockHomeService()}
      userName="Ada"
      onSignOut={vi.fn()}
    />,
  )
  await screen.findByText('Datos de demostración')

  expect(screen.getByText('Resumen operativo')).toBeVisible()
  expect(screen.getByText('Tokens utilizados')).toBeVisible()
  const newLinks = screen.getAllByRole('link', { name: /nueva solicitud/i })
  expect(newLinks.length).toBeGreaterThan(0)
  expect(newLinks[0]).toHaveAttribute('href', '/new')
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

it('links to new design request and projects from the hero actions', async () => {
  render(<HomeScreen service={createMockHomeService()} userName="Ada" onSignOut={vi.fn()} />)
  await screen.findByText('Datos de demostración')

  const newLinks = screen.getAllByRole('link', { name: /nueva solicitud/i })
  expect(newLinks.some((l) => l.getAttribute('href') === '/new')).toBe(true)
  const projectLinks = screen.getAllByRole('link', { name: /proyectos/i })
  expect(projectLinks.some((l) => l.getAttribute('href') === '/projects')).toBe(true)
})

it('opens the search stub, contains keyboard focus and closes on Escape or backdrop click', async () => {
  const user = userEvent.setup()
  render(<HomeScreen service={createMockHomeService()} userName="Ada" onSignOut={vi.fn()} />)
  await screen.findByText('Datos de demostración')
  const trigger = screen.getByRole('button', { name: 'Buscar' })
  await user.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Buscar' })).toBeVisible()
  const input = screen.getByRole('searchbox')
  expect(input).toHaveFocus()
  await user.type(input, 'Filtro')
  expect(screen.getByText('Búsqueda próximamente')).toBeVisible()
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Cerrar buscador' })).toHaveFocus()
  await user.tab()
  expect(input).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Buscar' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }))
  expect(screen.queryByRole('dialog', { name: 'Buscar' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
