import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { unavailableUsageFixture, usageByPeriod } from '../model/home-fixtures'
import { UsageSummary } from './UsageSummary'

afterEach(cleanup)

it('presents tokens first and cost as an estimate', () => {
  render(<UsageSummary usage={usageByPeriod['30d']} onPeriodChange={vi.fn()} />)

  const metrics = screen.getAllByRole('term')
  expect(metrics[0]).toHaveTextContent('Tokens utilizados')
  expect(screen.getByText('184,200')).toBeVisible()
  expect(screen.getByText('$3.84 estimados')).toBeVisible()
  expect(screen.getByText('31 · 90% exitosas')).toBeVisible()
  expect(screen.getByText('74 min')).toBeVisible()
  expect(screen.getByText('86')).toBeVisible()
})

it('does not invent unavailable usage values', () => {
  render(<UsageSummary usage={unavailableUsageFixture} onPeriodChange={vi.fn()} />)

  expect(screen.getAllByText('Datos no disponibles')).toHaveLength(2)
})

it('reports period changes', async () => {
  const user = userEvent.setup()
  const onPeriodChange = vi.fn()
  render(
    <UsageSummary
      usage={usageByPeriod['30d']}
      onPeriodChange={onPeriodChange}
    />,
  )

  await user.selectOptions(screen.getByLabelText('Periodo de consumo'), '90d')

  expect(onPeriodChange).toHaveBeenCalledWith('90d')
})

it('renders telemetry charts and real-time dashboard widgets', () => {
  render(
    <UsageSummary
      usage={usageByPeriod['30d']}
      onPeriodChange={vi.fn()}
    />,
  )

  expect(screen.getByText(/Telemetría & Observabilidad/i)).toBeVisible()
  expect(screen.getByText('Evolución de Inferencia & Telemetría')).toBeVisible()
  expect(
    screen.getByText('Distribución de Carga en el Pipeline de Agentes'),
  ).toBeVisible()
  expect(screen.getByText('Orquestador (Intención & NLP)')).toBeVisible()
  expect(screen.getByText('Distribución de Modelos LLM')).toBeVisible()
  expect(screen.getByText('Gemini 3.5 Flash Lite')).toBeVisible()
  expect(screen.getByText('Estado del Sistema & Infraestructura')).toBeVisible()
  expect(screen.getByText('Eficiencia y Tiempos de Respuesta')).toBeVisible()
})
