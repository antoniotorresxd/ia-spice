import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { POLL_INTERVAL_MS, useConversationPolling } from './use-conversation-polling'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('resondea mientras la ejecución esté activa', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling('active', refresh))

  expect(refresh).not.toHaveBeenCalled()
  vi.advanceTimersByTime(POLL_INTERVAL_MS)
  expect(refresh).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 2)
  expect(refresh).toHaveBeenCalledTimes(3)
})

it('no sondea si la ejecución ya terminó', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling('completed', refresh))

  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})

it('no sondea antes de que la conversación cargue', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling(null, refresh))

  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})

it('para de sondear cuando el estado pasa a completado', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const { rerender } = renderHook(
    ({ status }: { status: 'active' | 'completed' }) =>
      useConversationPolling(status, refresh),
    { initialProps: { status: 'active' as const } },
  )

  vi.advanceTimersByTime(POLL_INTERVAL_MS)
  expect(refresh).toHaveBeenCalledTimes(1)

  rerender({ status: 'completed' })
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 3)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('deja de sondear al desmontar', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const { unmount } = renderHook(() => useConversationPolling('active', refresh))

  unmount()
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})
