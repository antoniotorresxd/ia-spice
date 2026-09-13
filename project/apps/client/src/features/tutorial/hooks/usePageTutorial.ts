import { useCallback, useState } from 'react'
import { TUTORIALS_REGISTRY, type TutorialConfig, type TutorialPageKey } from '../model/tutorial-content'

const STORAGE_PREFIX = 'spice_tutorial_'

export function usePageTutorial(pageKey: TutorialPageKey, autoOpen = true) {
  const tutorialConfig: TutorialConfig = TUTORIALS_REGISTRY[pageKey]
  const storageKey = `${STORAGE_PREFIX}${pageKey}_seen`

  const [hasSeen, setHasSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem(storageKey) === 'true'
      return autoOpen && !seen
    } catch {
      return false
    }
  })

  const [dontShowAgain, setDontShowAgain] = useState(true)

  const [prevPageKey, setPrevPageKey] = useState(pageKey)
  if (prevPageKey !== pageKey) {
    setPrevPageKey(pageKey)
    let seen = false
    try {
      seen = localStorage.getItem(storageKey) === 'true'
    } catch {
      // Storage unavailable
    }
    setHasSeen(seen)
    if (autoOpen && !seen) {
      setIsOpen(true)
    }
  }

  const openTutorial = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeTutorial = useCallback(() => {
    setIsOpen(false)
  }, [])

  const markAsSeen = useCallback(() => {
    try {
      localStorage.setItem(storageKey, 'true')
      setHasSeen(true)
    } catch {
      // Storage unavailable
    }
  }, [storageKey])

  const dismiss = useCallback(
    (shouldSavePreference = dontShowAgain) => {
      if (shouldSavePreference) {
        markAsSeen()
      }
      setIsOpen(false)
    },
    [dontShowAgain, markAsSeen],
  )

  const resetTutorialSeen = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      setHasSeen(false)
    } catch {
      // Storage unavailable
    }
  }, [storageKey])

  return {
    isOpen,
    hasSeen,
    dontShowAgain,
    setDontShowAgain,
    openTutorial,
    closeTutorial,
    dismiss,
    markAsSeen,
    resetTutorialSeen,
    tutorialConfig,
  }
}
