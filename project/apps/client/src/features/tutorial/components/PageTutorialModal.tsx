import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TutorialConfig, TutorialStep } from '../model/tutorial-content'
import styles from './PageTutorialModal.module.css'

type PageTutorialModalProps = {
  isOpen: boolean
  config: TutorialConfig
  onClose: () => void
  onDismiss: (dontShowAgain: boolean) => void
  dontShowAgain: boolean
  onToggleDontShowAgain: (value: boolean) => void
}

function StepGraphic({ type, accent }: { type?: TutorialStep['graphicType']; accent?: 'mint' | 'copper' }) {
  const isCopper = accent === 'copper'
  const primaryColor = isCopper ? '#c8793d' : '#45d6c4'
  const secondaryColor = isCopper ? 'rgba(200, 121, 61, 0.25)' : 'rgba(69, 214, 196, 0.25)'

  if (type === 'pipeline') {
    return (
      <svg className={styles.graphicSvg} viewBox="0 0 480 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="90" r="26" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="80" y="94" textAnchor="middle" fill={primaryColor} fontSize="11" fontFamily="monospace" fontWeight="bold">ORQ</text>
        <line x1="106" y1="90" x2="164" y2="90" stroke={primaryColor} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="190" cy="90" r="26" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="190" y="94" textAnchor="middle" fill={primaryColor} fontSize="11" fontFamily="monospace" fontWeight="bold">CALC</text>
        <line x1="216" y1="90" x2="274" y2="90" stroke={primaryColor} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="300" cy="90" r="26" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="300" y="94" textAnchor="middle" fill={primaryColor} fontSize="11" fontFamily="monospace" fontWeight="bold">SPICE</text>
        <line x1="326" y1="90" x2="384" y2="90" stroke={primaryColor} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="410" cy="90" r="26" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="410" y="94" textAnchor="middle" fill={primaryColor} fontSize="11" fontFamily="monospace" fontWeight="bold">CUR</text>
      </svg>
    )
  }

  if (type === 'circuit') {
    return (
      <svg className={styles.graphicSvg} viewBox="0 0 480 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="140" cy="90" r="18" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="140" y="94" textAnchor="middle" fill={primaryColor} fontSize="12" fontFamily="monospace">Vin</text>
        <line x1="158" y1="90" x2="210" y2="90" stroke={primaryColor} strokeWidth="1.5" />
        <rect x="210" y="80" width="50" height="20" rx="3" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="235" y="94" textAnchor="middle" fill={primaryColor} fontSize="10" fontFamily="monospace">R1</text>
        <line x1="260" y1="90" x2="330" y2="90" stroke={primaryColor} strokeWidth="1.5" />
        <line x1="330" y1="90" x2="330" y2="120" stroke={primaryColor} strokeWidth="1.5" />
        <line x1="320" y1="120" x2="340" y2="120" stroke={primaryColor} strokeWidth="2" />
        <line x1="320" y1="126" x2="340" y2="126" stroke={primaryColor} strokeWidth="2" />
        <line x1="330" y1="126" x2="330" y2="145" stroke={primaryColor} strokeWidth="1.5" />
        <line x1="322" y1="145" x2="338" y2="145" stroke={primaryColor} strokeWidth="1.5" />
        <line x1="325" y1="149" x2="335" y2="149" stroke={primaryColor} strokeWidth="1.5" />
        <line x1="328" y1="153" x2="332" y2="153" stroke={primaryColor} strokeWidth="1.5" />
        <circle cx="370" cy="90" r="14" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
        <text x="370" y="94" textAnchor="middle" fill={primaryColor} fontSize="10" fontFamily="monospace">Vout</text>
        <line x1="330" y1="90" x2="356" y2="90" stroke={primaryColor} strokeWidth="1.5" />
      </svg>
    )
  }

  if (type === 'spice') {
    return (
      <svg className={styles.graphicSvg} viewBox="0 0 480 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="60" y1="140" x2="420" y2="140" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
        <line x1="60" y1="40" x2="60" y2="140" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
        <line x1="60" y1="70" x2="420" y2="70" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="60" y1="105" x2="420" y2="105" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M 60 55 Q 220 55 250 85 T 410 135" fill="none" stroke={primaryColor} strokeWidth="2.5" />
        <circle cx="250" cy="85" r="4.5" fill={primaryColor} />
        <text x="260" y="80" fill={primaryColor} fontSize="11" fontFamily="monospace" fontWeight="bold">fc = 1 kHz (-3 dB)</text>
      </svg>
    )
  }

  return (
    <svg className={styles.graphicSvg} viewBox="0 0 480 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="80" y="45" width="320" height="90" rx="12" fill={secondaryColor} stroke={primaryColor} strokeWidth="1.5" />
      <circle cx="120" cy="90" r="16" fill={primaryColor} fillOpacity="0.3" stroke={primaryColor} strokeWidth="1.5" />
      <line x1="150" y1="75" x2="280" y2="75" stroke={primaryColor} strokeWidth="3" strokeLinecap="round" />
      <line x1="150" y1="95" x2="360" y2="95" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="2" strokeLinecap="round" />
      <line x1="150" y1="108" x2="310" y2="108" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function PageTutorialModal({
  isOpen,
  config,
  onClose,
  onDismiss,
  dontShowAgain,
  onToggleDontShowAgain,
}: PageTutorialModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)

  const steps = config.steps
  const currentStep = steps[currentStepIndex] ?? steps[0]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  // Reiniciar paso al abrir
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen && !prevIsOpen) {
    setPrevIsOpen(true)
    setCurrentStepIndex(0)
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false)
  }

  // Accesibilidad: Teclado Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowRight' && !isLastStep) {
        event.preventDefault()
        setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1))
      } else if (event.key === 'ArrowLeft' && !isFirstStep) {
        event.preventDefault()
        setCurrentStepIndex((prev) => Math.max(prev - 1, 0))
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isFirstStep, isLastStep, onClose, steps.length])

  if (!isOpen) return null

  const handleNext = () => {
    if (isLastStep) {
      onDismiss(dontShowAgain)
    } else {
      setCurrentStepIndex((prev) => prev + 1)
    }
  }

  const handlePrevious = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0))
  }

  const handleSkip = () => {
    onDismiss(dontShowAgain)
  }

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="presentation">
      <div
        aria-describedby="tutorial-step-description"
        aria-labelledby="tutorial-step-title"
        aria-modal="true"
        className={styles.modal}
        ref={modalRef}
        role="dialog"
      >
        <button
          aria-label="Cerrar guía"
          className={styles.closeButton}
          onClick={onClose}
          type="button"
        >
          <X size={15} />
        </button>

        <div className={styles.headerGraphic} data-accent={currentStep.accentColor ?? 'mint'}>
          <StepGraphic accent={currentStep.accentColor} type={currentStep.graphicType} />
        </div>

        <div className={styles.body}>
          <div className={styles.badgeRow}>
            <span className={styles.badge} data-accent={currentStep.accentColor ?? 'mint'}>
              {currentStep.badge}
            </span>
            <span className={styles.pageContext}>{config.pageTitle}</span>
          </div>

          <h2 className={styles.title} id="tutorial-step-title">
            {currentStep.title}
          </h2>

          <p className={styles.description} id="tutorial-step-description">
            {currentStep.description}
          </p>

          {currentStep.tips && currentStep.tips.length > 0 && (
            <div className={styles.tipsList}>
              {currentStep.tips.map((tip, idx) => (
                <div className={styles.tipItem} key={idx}>
                  <span aria-hidden="true" className={styles.tipDot} />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {/* Dots de progreso animados (inspirado en 21st.dev) */}
          <div className={styles.dotsRow}>
            {steps.map((step, idx) => {
              const isActive = idx === currentStepIndex
              const dotColor = currentStep.accentColor === 'copper' ? '#c8793d' : '#45d6c4'
              return (
                <button
                  aria-label={`Ir al paso ${idx + 1}: ${step.title}`}
                  className={styles.dotButton}
                  key={step.id}
                  onClick={() => setCurrentStepIndex(idx)}
                  type="button"
                >
                  <motion.div
                    animate={{
                      width: isActive ? 22 : 8,
                      opacity: isActive ? 1 : 0.35,
                      backgroundColor: isActive ? dotColor : 'rgba(255, 255, 255, 0.4)',
                    }}
                    className={styles.dotPill}
                    initial={false}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <label className={styles.checkboxLabel}>
              <input
                checked={dontShowAgain}
                className={styles.checkboxInput}
                onChange={(e) => onToggleDontShowAgain(e.target.checked)}
                type="checkbox"
              />
              <span>No volver a mostrar en esta sección</span>
            </label>
          </div>

          <div className={styles.footerRight}>
            {!isFirstStep && (
              <button
                className={styles.buttonGhost}
                onClick={handlePrevious}
                type="button"
              >
                <ArrowLeft size={14} />
                <span>Anterior</span>
              </button>
            )}

            {!isLastStep ? (
              <>
                <button
                  className={styles.buttonGhost}
                  onClick={handleSkip}
                  type="button"
                >
                  Omitir
                </button>
                <button
                  className={styles.buttonPrimary}
                  onClick={handleNext}
                  type="button"
                >
                  <span>Siguiente</span>
                  <ArrowRight className={styles.nextArrow} size={14} />
                </button>
              </>
            ) : (
              <button
                className={styles.buttonPrimary}
                onClick={handleNext}
                type="button"
              >
                <Check size={14} />
                <span>¡Entendido!</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
