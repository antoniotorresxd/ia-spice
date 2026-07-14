import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AUTOMATON_EDGES,
  AUTOMATON_STATES,
  AUTOMATON_TIMELINE,
} from './automaton-model'
import { SolutionAutomaton } from './SolutionAutomaton'

const defaultMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: defaultMatchMedia,
  })
})

describe('SolutionAutomaton', () => {
  it('renders every state and the full accepted, rejected, and adjustment topology', () => {
    render(<SolutionAutomaton />)

    for (const label of [
      'Inicio',
      'Orquestador',
      'Cálculo',
      'Síntesis',
      'Curador',
      'Aceptado',
      'Rechazado',
    ]) {
      expect(screen.getByText(label)).toBeVisible()
    }

    expect(AUTOMATON_STATES.map(({ id }) => id)).toEqual([
      'start',
      'orchestrator',
      'calculation',
      'synthesis',
      'curator',
      'accepted',
      'rejected',
    ])
    expect(AUTOMATON_EDGES.map(({ id, from, to }) => ({ id, from, to }))).toEqual([
      { id: 'entry', from: 'start', to: 'orchestrator' },
      { id: 'valid', from: 'orchestrator', to: 'calculation' },
      { id: 'values', from: 'calculation', to: 'synthesis' },
      { id: 'metrics', from: 'synthesis', to: 'curator' },
      { id: 'adjust', from: 'curator', to: 'synthesis' },
      { id: 'accept', from: 'curator', to: 'accepted' },
      { id: 'reject', from: 'curator', to: 'rejected' },
      { id: 'invalid', from: 'orchestrator', to: 'rejected' },
    ])

    for (const { id } of AUTOMATON_STATES) {
      expect(screen.getByTestId(`state-${id}`)).toBeInTheDocument()
    }
    for (const { id } of AUTOMATON_EDGES) {
      expect(screen.getByTestId(`edge-${id}`)).toBeInTheDocument()
    }
    expect(screen.getByText('Ajustar')).toBeVisible()
  })

  it('advances one active state and edge at a time through the demo timeline', () => {
    vi.useFakeTimers()
    render(<SolutionAutomaton stepDurationMs={100} />)

    expect(screen.getByTestId('state-orchestrator')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(screen.getByTestId('edge-entry')).toHaveAttribute('data-active', 'true')

    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByTestId('state-curator')).toHaveAttribute('data-active', 'true')

    act(() => vi.advanceTimersByTime(100))
    expect(screen.getByTestId('edge-adjust')).toHaveAttribute('data-active', 'true')

    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByTestId('state-accepted')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('edge-accept')).toHaveAttribute('data-active', 'false')
    expect(AUTOMATON_TIMELINE).toHaveLength(8)
  })

  it('freezes on a useful initial route when reduced motion is preferred', () => {
    vi.useFakeTimers()
    setReducedMotion(true)
    render(<SolutionAutomaton stepDurationMs={100} />)

    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-reduced-motion: reduce)',
    )
    expect(screen.getByTestId('state-orchestrator')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(screen.getByTestId('edge-entry')).toHaveAttribute('data-active', 'true')

    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByTestId('state-orchestrator')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(screen.getByTestId('edge-entry')).toHaveAttribute('data-active', 'true')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops advancing when reduced motion is enabled after mount', () => {
    vi.useFakeTimers()
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_type, listener) => {
          changeListener = listener as (event: MediaQueryListEvent) => void
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    })
    render(<SolutionAutomaton stepDurationMs={100} />)

    act(() => vi.advanceTimersByTime(100))
    expect(screen.getByTestId('state-calculation')).toHaveAttribute(
      'data-active',
      'true',
    )

    act(() => changeListener?.({ matches: true } as MediaQueryListEvent))
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByTestId('state-calculation')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  it('keeps every transition directional when motion is unavailable', () => {
    setReducedMotion(true)
    render(<SolutionAutomaton />)

    for (const { id } of AUTOMATON_EDGES) {
      const track = screen.getByTestId(`edge-${id}`).querySelector('path')
      expect(track).toHaveAttribute(
        'marker-end',
        expect.stringContaining('arrow-track'),
      )
    }
  })

  it('cleans up its animation interval when unmounted', () => {
    vi.useFakeTimers()
    const { unmount } = render(<SolutionAutomaton stepDurationMs={100} />)

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
