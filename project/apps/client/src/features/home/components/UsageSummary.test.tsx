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
  expect(screen.getByText('184,200 / 500,000')).toBeVisible()
  expect(screen.getByText('$3.84 estimados')).toBeVisible()
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
