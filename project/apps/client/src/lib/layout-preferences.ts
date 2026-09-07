import { useEffect, useState } from 'react'

export function useStoredBoolean(key: string, defaultValue = false): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [state, setState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) return stored === 'true'
    } catch {
      // Storage unavailable
    }
    return defaultValue
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, String(state))
    } catch {
      // Storage unavailable
    }
  }, [key, state])

  return [state, setState]
}
