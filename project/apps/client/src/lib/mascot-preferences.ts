import { useCallback, useEffect, useState } from 'react'

export type MascotId = 'cat' | 'dog' | 'bot' | 'sparky'

export interface MascotSettings {
  enabled: boolean
  mascotId: MascotId
}

export const STORAGE_KEY_MASCOT = 'spice_mascot_settings'

export const DEFAULT_MASCOT_SETTINGS: MascotSettings = {
  enabled: true,
  mascotId: 'cat',
}

export interface MascotInfo {
  id: MascotId
  name: string
  tagline: string
  description: string
  emoji: string
  accentColor: string
}

export const MASCOT_CATALOG: MascotInfo[] = [
  {
    id: 'cat',
    name: 'Gato SPICE (Neko)',
    tagline: 'Cibernético & Juguetón',
    description: 'El clásico gato que sigue el cursor por el footer y ronronea al interactuar.',
    emoji: '🐱',
    accentColor: '#45d6c4',
  },
  {
    id: 'dog',
    name: 'Cachorro Robótico (Robo-Pup)',
    tagline: 'Fiel & Vigilante',
    description: 'Sensor cuadrúpedo con radar de simulación que ladra al verificar la netlist.',
    emoji: '🐶',
    accentColor: '#c8793d',
  },
  {
    id: 'bot',
    name: 'Bot Asistente (Circuit-Bot)',
    tagline: 'Analítico & Flotante',
    description: 'Mini dron flotante con visor LED reactivo que monitorea nodos y voltajes.',
    emoji: '🤖',
    accentColor: '#3b82f6',
  },
  {
    id: 'sparky',
    name: 'Sparky el Electrón',
    tagline: 'Energético & Rápido',
    description: 'Chispa viva de potencial eléctrico que oscila y destella en alta frecuencia.',
    emoji: '⚡',
    accentColor: '#eab308',
  },
]

function readStoredSettings(): MascotSettings {
  if (typeof window === 'undefined') return DEFAULT_MASCOT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MASCOT)
    if (!raw) return DEFAULT_MASCOT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<MascotSettings>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      mascotId: (['cat', 'dog', 'bot', 'sparky'] as MascotId[]).includes(parsed.mascotId as MascotId)
        ? (parsed.mascotId as MascotId)
        : 'cat',
    }
  } catch {
    return DEFAULT_MASCOT_SETTINGS
  }
}

export function useMascotSettings() {
  const [settings, setSettings] = useState<MascotSettings>(readStoredSettings)

  useEffect(() => {
    const handleStorage = (e: StorageEvent | CustomEvent) => {
      if ('key' in e && e.key !== STORAGE_KEY_MASCOT) return
      setSettings(readStoredSettings())
    }

    window.addEventListener('storage', handleStorage as EventListener)
    window.addEventListener('spice_mascot_changed', handleStorage as EventListener)
    return () => {
      window.removeEventListener('storage', handleStorage as EventListener)
      window.removeEventListener('spice_mascot_changed', handleStorage as EventListener)
    }
  }, [])

  const updateSettings = useCallback((next: Partial<MascotSettings>) => {
    setSettings((prev) => {
      const updated: MascotSettings = { ...prev, ...next }
      try {
        localStorage.setItem(STORAGE_KEY_MASCOT, JSON.stringify(updated))
        window.dispatchEvent(new CustomEvent('spice_mascot_changed'))
      } catch {
        // Storage unavailable
      }
      return updated
    })
  }, [])

  return {
    settings,
    updateSettings,
    catalog: MASCOT_CATALOG,
  }
}
