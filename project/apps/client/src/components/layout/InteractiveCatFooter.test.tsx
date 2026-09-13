import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InteractiveCatFooter } from './InteractiveCatFooter'

afterEach(cleanup)

describe('InteractiveCatFooter', () => {
  it('renders status indicators and version info', () => {
    render(<InteractiveCatFooter />)
    expect(screen.getByText('SPICE activo')).toBeInTheDocument()
    expect(screen.getByText('Spice v1.0')).toBeInTheDocument()
    expect(screen.getByText(/Atajos: ⌘K \/ Esc/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mascota.*SPICE/i })).toBeInTheDocument()
  })

  it('triggers onOpenTour callback when clicking tour button', async () => {
    const user = userEvent.setup()
    const onOpenTour = vi.fn()
    render(<InteractiveCatFooter onOpenTour={onOpenTour} />)

    const tourBtn = screen.getByRole('button', { name: /Tour interactivo/i })
    expect(tourBtn).toBeInTheDocument()
    await user.click(tourBtn)
    expect(onOpenTour).toHaveBeenCalledTimes(1)
  })

  it('shows purr reaction on mascot click', async () => {
    const user = userEvent.setup()
    render(<InteractiveCatFooter />)

    const catBtn = screen.getByRole('button', { name: /Mascota.*SPICE/i })
    await user.click(catBtn)

    // A speech bubble appears with dialogue text
    const bubble = screen.getByText(/Miau|Simulación|Purr|Listo/i)
    expect(bubble).toBeInTheDocument()
  })
})
