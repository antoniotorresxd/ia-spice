import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

type Props = {
  ariaLabel: string
  children: ReactNode
  initialFocusRef?: RefObject<HTMLElement | null>
  onDismiss: () => void
}

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function SettingsDialog({ ariaLabel, children, initialFocusRef, onDismiss }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    const initial = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector)
    initial?.focus()
    return () => openerRef.current?.focus()
  }, [initialFocusRef])

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <section aria-label={ariaLabel} onKeyDown={handleKeyDown} ref={dialogRef} role="dialog">{children}</section>
}
