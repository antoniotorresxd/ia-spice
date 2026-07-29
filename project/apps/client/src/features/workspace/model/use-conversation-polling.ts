import { useEffect } from 'react'

import type { WorkspaceExecutionStatus } from './workspace-types'

export const POLL_INTERVAL_MS = 2000

// Sondear es volver a leer la conversación: el WorkspaceService no necesita un
// método extra. `refresh` debe tener identidad estable (useCallback) o el
// efecto reinicia el intervalo en cada render y no llega a disparar.
export function useConversationPolling(
  executionStatus: WorkspaceExecutionStatus | null,
  refresh: () => Promise<void>,
  intervalMs: number = POLL_INTERVAL_MS,
): void {
  const isRunning = executionStatus === 'active'

  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, isRunning, refresh])
}
