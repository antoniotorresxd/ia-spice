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

it('shows completed-stage progress and updates it with execution data', () => {
  const { rerender } = render(<ActivityTimeline execution={activeDraftExecutionFixture} />)
  const progress = screen.getByRole('progressbar', { name: 'Etapas completadas' })
  expect(progress).toHaveAttribute('value', '3')
  expect(progress).toHaveAttribute('max', '5')
  expect(screen.getByText('3 de 5 etapas completadas')).toBeVisible()
  const stages = within(screen.getByRole('list', { name: 'Actividad de ejecución' })).getAllByRole('listitem')
  expect(within(stages[0]).getByText('Completada')).toBeVisible()
  expect(within(stages[3]).getByText('En curso')).toBeVisible()

  rerender(<ActivityTimeline execution={failedExecutionFixture} />)
  expect(screen.getByText('Fallida', { selector: 'span' })).toBeVisible()
  expect(progress).toHaveAttribute('value', '2')
})
