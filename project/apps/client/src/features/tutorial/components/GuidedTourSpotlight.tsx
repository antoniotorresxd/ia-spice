import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { TutorialConfig, TutorialStep } from '../model/tutorial-content'
import styles from './GuidedTourSpotlight.module.css'

interface GuidedTourSpotlightProps {
  isOpen: boolean
  config: TutorialConfig
  onClose: () => void
  onDismiss: (dontShowAgain: boolean) => void
  dontShowAgain: boolean
  onToggleDontShowAgain: (value: boolean) => void
}

interface TargetRect {
  x: number
  y: number
  width: number
  height: number
}

function StepGraphic({ type, accent }: { type?: TutorialStep['graphicType']; accent?: 'mint' | 'copper' }) {
  const isCopper = accent === 'copper'
  const primaryColor = isCopper ? '#c8793d' : '#45d6c4'
  const secondaryColor = isCopper ? 'rgba(200, 121, 61, 0.25)' : 'rgba(69, 214, 196, 0.25)'

  if (type === 'pipeline') {
    return (
      <svg className={styles.graphicSvg} fill="none" viewBox="0 0 380 90" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="45" fill={secondaryColor} r="20" stroke={primaryColor} strokeWidth="1.5" />
        <text fontFamily="monospace" fontSize="9" fontWeight="bold" fill={primaryColor} textAnchor="middle" x="50" y="48">ORQ</text>
        <line stroke={primaryColor} strokeDasharray="3 3" strokeWidth="1.5" x1="70" x2="120" y1="45" y2="45" />
        <circle cx="140" cy="45" fill={secondaryColor} r="20" stroke={primaryColor} strokeWidth="1.5" />
        <text fontFamily="monospace" fontSize="9" fontWeight="bold" fill={primaryColor} textAnchor="middle" x="140" y="48">CALC</text>
        <line stroke={primaryColor} strokeDasharray="3 3" strokeWidth="1.5" x1="160" x2="210" y1="45" y2="45" />
        <circle cx="230" cy="45" fill={secondaryColor} r="20" stroke={primaryColor} strokeWidth="1.5" />
        <text fontFamily="monospace" fontSize="9" fontWeight="bold" fill={primaryColor} textAnchor="middle" x="230" y="48">SPICE</text>
        <line stroke={primaryColor} strokeDasharray="3 3" strokeWidth="1.5" x1="250" x2="300" y1="45" y2="45" />
        <circle cx="320" cy="45" fill={secondaryColor} r="20" stroke={primaryColor} strokeWidth="1.5" />
        <text fontFamily="monospace" fontSize="9" fontWeight="bold" fill={primaryColor} textAnchor="middle" x="320" y="48">CUR</text>
      </svg>
    )
  }

  if (type === 'prompt') {
    return (
      <svg className={styles.graphicSvg} fill="none" viewBox="0 0 380 90" xmlns="http://www.w3.org/2000/svg">
        <rect fill={secondaryColor} height="50" rx="8" stroke={primaryColor} strokeWidth="1.5" width="280" x="50" y="20" />
        <line stroke={primaryColor} strokeLinecap="round" strokeWidth="2.5" x1="75" x2="160" y1="36" y2="36" />
        <line stroke="rgba(255, 255, 255, 0.3)" strokeLinecap="round" strokeWidth="2" x1="75" x2="270" y1="48" y2="48" />
        <circle cx="300" cy="45" fill={primaryColor} r="10" />
        <path d="M297 45L303 45M300 42L300 48" stroke="#0c1015" strokeLinecap="round" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <svg className={styles.graphicSvg} fill="none" viewBox="0 0 380 90" xmlns="http://www.w3.org/2000/svg">
      <rect fill={secondaryColor} height="48" rx="8" stroke={primaryColor} strokeWidth="1.5" width="260" x="60" y="21" />
      <circle cx="85" cy="45" fill={primaryColor} fillOpacity="0.4" r="11" stroke={primaryColor} strokeWidth="1.5" />
      <line stroke={primaryColor} strokeLinecap="round" strokeWidth="2.5" x1="110" x2="190" y1="38" y2="38" />
      <line stroke="rgba(255, 255, 255, 0.25)" strokeLinecap="round" strokeWidth="1.5" x1="110" x2="270" y1="52" y2="52" />
    </svg>
  )
}

export const GuidedTourSpotlight: React.FC<GuidedTourSpotlightProps> = ({
  isOpen,
  config,
  onClose,
  onDismiss,
  dontShowAgain,
  onToggleDontShowAgain,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)

  // Reset al abrir
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen && !prevIsOpen) {
    setPrevIsOpen(true)
    setCurrentStepIndex(0)
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false)
  }

  const steps = config.steps
  const currentStep = steps[currentStepIndex] ?? steps[0]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  const targetSelector = currentStep?.targetSelector

  // Medir y rastrear posición del elemento en pantalla
  const updateTargetRect = useCallback(() => {
    if (!isOpen || !targetSelector) {
      setTargetRect(null)
      return
    }

    const el = document.querySelector(targetSelector)
    if (el) {
      const rect = el.getBoundingClientRect()
      // Si el elemento no es visible (display none o dimensiones 0)
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
        return
      }
    }
    setTargetRect(null)
  }, [isOpen, targetSelector])

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateTargetRect()
    })
    const handleScrollOrResize = () => updateTargetRect()
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [updateTargetRect])

  // Accesibilidad: Teclado
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFirstStep, isLastStep, isOpen, onClose, steps.length])

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

  // Calcular posición del Tooltip
  const CARD_WIDTH = 380
  const CARD_HEIGHT = 380
  const PADDING = 14

  let cardStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 10000,
  }

  if (targetRect) {
    const placement = currentStep.placement ?? 'right'
    let top = targetRect.y
    let left = targetRect.x

    if (placement === 'right') {
      left = targetRect.x + targetRect.width + PADDING
      top = Math.max(16, targetRect.y - 20)
    } else if (placement === 'left') {
      left = targetRect.x - CARD_WIDTH - PADDING
      top = Math.max(16, targetRect.y - 20)
    } else if (placement === 'bottom') {
      left = Math.max(16, targetRect.x)
      top = targetRect.y + targetRect.height + PADDING
    } else if (placement === 'top') {
      left = Math.max(16, targetRect.x)
      top = targetRect.y - CARD_HEIGHT - PADDING
    }

    // Asegurar que no se salga de la pantalla
    left = Math.max(16, Math.min(left, window.innerWidth - CARD_WIDTH - 20))
    top = Math.max(16, Math.min(top, window.innerHeight - CARD_HEIGHT - 20))

    cardStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      transform: 'none',
      zIndex: 10000,
    }
  }

  return (
    <div className={styles.tourContainer}>
      {/* Máscara SVG con recorte dinámico (Spotlight) */}
      <svg className={styles.svgMaskOverlay} height="100%" width="100%">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect fill="white" height="100%" width="100%" x="0" y="0" />
            {targetRect && (
              <rect
                fill="black"
                height={targetRect.height + 12}
                rx="8"
                width={targetRect.width + 12}
                x={targetRect.x - 6}
                y={targetRect.y - 6}
              />
            )}
          </mask>
        </defs>
        <rect
          fill="rgba(6, 10, 15, 0.78)"
          height="100%"
          mask="url(#tour-spotlight-mask)"
          onClick={onClose}
          width="100%"
          x="0"
          y="0"
        />
      </svg>

      {/* Caja luminosa rodeando el elemento objetivo */}
      {targetRect && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={styles.spotlightHalo}
          initial={{ opacity: 0, scale: 0.98 }}
          key={currentStep.id}
          style={{
            top: targetRect.y - 6,
            left: targetRect.x - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      )}

      {/* Tarjeta flotante con instrucciones del paso */}
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        aria-describedby="tour-step-desc"
        aria-labelledby="tour-step-title"
        aria-modal="true"
        className={styles.tourCard}
        initial={{ opacity: 0, scale: 0.96 }}
        key={currentStep.id}
        role="dialog"
        style={cardStyle}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <button
          aria-label="Cerrar tour"
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
            <span className={styles.stepCounter}>
              {currentStepIndex + 1} de {steps.length}
            </span>
          </div>

          <h2 className={styles.title} id="tour-step-title">
            {currentStep.title}
          </h2>

          <p className={styles.description} id="tour-step-desc">
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

          {/* Dots de progreso animados estilo 21st.dev */}
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
                      width: isActive ? 22 : 7,
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
          <label className={styles.checkboxLabel}>
            <input
              checked={dontShowAgain}
              className={styles.checkboxInput}
              onChange={(e) => onToggleDontShowAgain(e.target.checked)}
              type="checkbox"
            />
            <span>No volver a mostrar</span>
          </label>

          <div className={styles.footerActions}>
            {!isFirstStep && (
              <button
                className={styles.buttonGhost}
                onClick={handlePrevious}
                type="button"
              >
                <ArrowLeft size={13} />
                <span>Atrás</span>
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
                  <ArrowRight size={13} />
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
      </motion.div>
    </div>
  )
}
