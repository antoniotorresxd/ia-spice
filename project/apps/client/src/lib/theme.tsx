import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = Exclude<Theme, 'system'>

const storageKey = 'spice-theme'
const mediaQuery = '(prefers-color-scheme: dark)'
const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
} | null>(null)

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  } catch {
    // Storage may be disabled; the theme still works for this session.
  }
  return 'system'
}

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(mediaQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSystemDark() {
  return window.matchMedia(mediaQuery).matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(readTheme)
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, getSystemDark, () => true)
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', resolvedTheme === 'light')
  }, [resolvedTheme])

  function setTheme(nextTheme: Theme) {
    updateTheme(nextTheme)
    try {
      localStorage.setItem(storageKey, nextTheme)
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Co-located with its provider to keep the theme API in one module.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
