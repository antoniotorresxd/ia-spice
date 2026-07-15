import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import {
  activeDraftExecutionFixture,
  failedExecutionFixture,
} from '../model/home-fixtures'
import { ActivityTimeline } from './ActivityTimeline'

afterEach(cleanup)

it('renders the five execution stages as an ordered list', () => {
  render(<ActivityTimeline execution={activeDraftExecutionFixture} />)

  const timeline = screen.getByRole('list', {
    name: 'Actividad de ejecución',
  })
  expect(within(timeline).getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByText('Interpretación')).toBeVisible()
  expect(screen.getByText('Resultado')).toBeVisible()
})

it('expands metrics from the selected stage', async () => {
  const user = userEvent.setup()
  render(<ActivityTimeline execution={activeDraftExecutionFixture} />)

  await user.click(
    screen.getByRole('button', { name: /ver detalles de cálculo/i }),
  )

  expect(screen.getByText('R: 1.6 kΩ')).toBeVisible()
  expect(screen.getByText('C: 100 nF')).toBeVisible()
})

it('keeps a failed stage and partial files visible', () => {
  render(<ActivityTimeline execution={failedExecutionFixture} />)

  expect(screen.getByText('La simulación no convergió.')).toBeVisible()
  expect(screen.getByText('partial-output.csv · parcial')).toBeVisible()
})
