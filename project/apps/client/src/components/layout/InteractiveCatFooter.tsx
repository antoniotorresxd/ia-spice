import { motion, useMotionValue, useSpring } from 'framer-motion'
import { Sparkles, Terminal } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useMascotSettings, type MascotId } from '@/lib/mascot-preferences'
import { AnimatedGradientBackground } from '../ui/AnimatedGradientBackground'
import { BotSvg, CatSvg, DogSvg, SparkySvg } from './MascotRenderers'
import styles from './InteractiveCatFooter.module.css'

interface InteractiveCatFooterProps {
  onOpenTour?: () => void
}

interface LottiePlayer {
  loadAnimation: (params: {
    container: Element
    renderer: 'svg'
    loop: boolean
    autoplay: boolean
    animationData?: unknown
  }) => { destroy: () => void }
}

declare global {
  interface Window {
    bodymovin?: LottiePlayer
    lottie?: LottiePlayer
  }
}

function loadLottieLibrary(): Promise<LottiePlayer | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.lottie) return Promise.resolve(window.lottie)
  if (window.bodymovin) return Promise.resolve(window.bodymovin)

  return new Promise((resolve) => {
    const existingScript = document.querySelector('script[data-lottie-player]')
    if (existingScript) {
      const handleLoad = () => resolve(window.lottie ?? window.bodymovin ?? null)
      existingScript.addEventListener('load', handleLoad)
      return
    }

    const script = document.createElement('script')
    script.src = '/lottie-player.js'
    script.setAttribute('data-lottie-player', 'true')
    script.async = true
    script.onload = () => resolve(window.lottie ?? window.bodymovin ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

function MascotGraphic({
  mascotId,
  hasLottieLoaded,
  catContainerRef,
}: {
  mascotId: MascotId
  hasLottieLoaded: boolean
  catContainerRef: React.RefObject<HTMLDivElement | null>
}) {
  if (mascotId === 'cat') {
    return (
      <>
        <div
          className={styles.lottieHolder}
          ref={catContainerRef}
          style={{ display: hasLottieLoaded ? 'flex' : 'none' }}
        />
        {!hasLottieLoaded && <CatSvg />}
      </>
    )
  }

  if (mascotId === 'dog') return <DogSvg />
  if (mascotId === 'bot') return <BotSvg />
  return <SparkySvg />
}

export const InteractiveCatFooter: React.FC<InteractiveCatFooterProps> = ({ onOpenTour }) => {
  const { settings } = useMascotSettings()
  const footerRef = useRef<HTMLElement | null>(null)
  const catContainerRef = useRef<HTMLDivElement | null>(null)
  const [hasLottieLoaded, setHasLottieLoaded] = useState(false)

  const [purrMessage, setPurrMessage] = useState<string | null>(null)
  const [facingRight, setFacingRight] = useState(true)

  // Motion value para traslación horizontal suave
  const mouseX = useMotionValue(320)
  const smoothX = useSpring(mouseX, { stiffness: 90, damping: 22, mass: 0.8 })

  // Cargar Lottie de forma asíncrona solo si la mascota activa es el gato
  useEffect(() => {
    if (settings.mascotId !== 'cat' || !settings.enabled) return

    let isMounted = true
    let animInstance: { destroy: () => void } | null = null

    Promise.all([
      loadLottieLibrary(),
      fetch('/cat-animation.json').then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([lottie, animationData]) => {
        if (!isMounted || !catContainerRef.current || !lottie || !animationData) return

        animInstance = lottie.loadAnimation({
          container: catContainerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData,
        })
        setHasLottieLoaded(true)
      })
      .catch(() => {
        // Fallback activo de SVG
      })

    return () => {
      isMounted = false
      if (animInstance) {
        animInstance.destroy()
      }
    }
  }, [settings.enabled, settings.mascotId])

  // Seguir la dirección horizontal del cursor a lo largo del footer
  useEffect(() => {
    if (!settings.enabled) return
    let lastX = 320

    const handlePointerMove = (e: PointerEvent) => {
      if (!footerRef.current) return
      const rect = footerRef.current.getBoundingClientRect()
      const minX = 230
      const maxX = Math.max(minX + 40, rect.width - 250)
      const clampedX = Math.min(Math.max(e.clientX - rect.left - 48, minX), maxX)

      if (clampedX > lastX + 1.5) {
        setFacingRight(true)
      } else if (clampedX < lastX - 1.5) {
        setFacingRight(false)
      }

      lastX = clampedX
      mouseX.set(clampedX)
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [mouseX, settings.enabled])

  const handleMascotClick = () => {
    const dialogues: Record<MascotId, string[]> = {
      cat: [
        '¡Miau! SPICE engine listo ⚡',
        'Simulación convergida al 100% 🐾',
        'Purr... ngspice 3f5 activo ✨',
        '¡Listo para simular circuitos! 🔌',
      ],
      dog: [
        '¡Guau! 0 errores en la netlist 🐶',
        'Rastreo de convergencia nominal 🦴',
        '¡Circuito verificado y protegido! 🛡️',
        '¡Guau guau! Simulación completada ⚡',
      ],
      bot: [
        'Beep boop! Agente analítico listo 🤖',
        'Nodos y voltajes dentro de tolerancia ✨',
        'Análisis en frecuencia ejecutado 📊',
        'Sintetizando parámetros E24... ⚙️',
      ],
      sparky: [
        '¡Zzzap! 5V regulados en Vout ⚡',
        '¡Energía al 100% en todos los nodos! ⚡',
        'Potencial eléctrico estable 🔌',
        '¡Chispazo de simulación exitoso! ✨',
      ],
    }

    const currentDialogues = dialogues[settings.mascotId] ?? dialogues.cat
    const randomMsg = currentDialogues[Math.floor(Math.random() * currentDialogues.length)] ?? currentDialogues[0]
    setPurrMessage(randomMsg)

    setTimeout(() => {
      setPurrMessage(null)
    }, 2400)
  }

  return (
    <footer className={styles.footer} ref={footerRef}>
      <AnimatedGradientBackground
        animationSpeed={0.012}
        breathing={true}
        breathingRange={5}
        gradientColors={[
          'rgba(12, 16, 21, 0.96)',
          'rgba(17, 35, 40, 0.65)',
          'rgba(20, 27, 34, 0.85)',
          'rgba(12, 16, 21, 0.98)',
        ]}
        gradientStops={[30, 60, 85, 100]}
        startingGap={100}
      />

      <div className={styles.inner}>
        {/* Lado izquierdo: Estado y atajos */}
        <div className={styles.leftSection}>
          <span className={styles.statusBadge}>
            <span aria-hidden="true" className={styles.statusDot} />
            <span className={styles.statusText}>SPICE activo</span>
          </span>
          <span aria-hidden="true" className={styles.divider}>•</span>
          <span className={styles.versionTag}>Spice v1.0</span>
          <span aria-hidden="true" className={styles.divider}>•</span>
          <div className={styles.shortcutHint}>
            <Terminal size={12} />
            <span>Atajos: ⌘K / Esc</span>
          </div>
        </div>

        {/* Mascota interactiva que se mueve a nivel de footer */}
        {settings.enabled && (
          <motion.div
            aria-label="Mascota interactiva del sistema SPICE"
            className={styles.catWrapper}
            onClick={handleMascotClick}
            role="button"
            style={{ x: smoothX }}
            tabIndex={0}
            title="Haz clic para interactuar con la mascota SPICE"
          >
            {purrMessage && (
              <motion.div
                animate={{ opacity: 1, y: -4 }}
                className={styles.speechBubble}
                exit={{ opacity: 0, y: 0 }}
                initial={{ opacity: 0, y: 4 }}
              >
                <span>{purrMessage}</span>
              </motion.div>
            )}
            <div
              className={styles.catAvatar}
              style={{ transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)' }}
            >
              <MascotGraphic
                catContainerRef={catContainerRef}
                hasLottieLoaded={hasLottieLoaded}
                mascotId={settings.mascotId}
              />
            </div>
          </motion.div>
        )}

        {/* Lado derecho: Enlace a guía interactiva */}
        <div className={styles.rightSection}>
          {onOpenTour && (
            <button
              className={styles.tourButton}
              onClick={onOpenTour}
              type="button"
            >
              <Sparkles size={12} />
              <span>Tour interactivo</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  )
}
