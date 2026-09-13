import { HelpCircle } from 'lucide-react'
import styles from './TutorialTriggerButton.module.css'

type TutorialTriggerButtonProps = {
  onClick: () => void
  title?: string
  ariaLabel?: string
  className?: string
}

export function TutorialTriggerButton({
  onClick,
  title = 'Guía de esta sección',
  ariaLabel = 'Abrir guía de esta sección',
  className,
}: TutorialTriggerButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`${styles.triggerButton} ${className ?? ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      <HelpCircle size={15} />
    </button>
  )
}
