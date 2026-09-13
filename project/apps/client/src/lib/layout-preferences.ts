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

export function useStoredNumber(key: string, defaultValue: number): [number, (value: number | ((prev: number) => number)) => void] {
  const [state, setState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed = Number(stored)
        if (!Number.isNaN(parsed)) return parsed
      }
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

