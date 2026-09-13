import { motion } from 'framer-motion'
import React, { useEffect, useRef } from 'react'
import styles from './AnimatedGradientBackground.module.css'

interface AnimatedGradientBackgroundProps {
  /** Initial size percentage of the radial gradient */
  startingGap?: number
  /** Enables breathing animation effect */
  breathing?: boolean
  /** Colors to use in radial gradient */
  gradientColors?: string[]
  /** Percentage stops for each color */
  gradientStops?: number[]
  /** Animation speed */
  animationSpeed?: number
  /** Range in percentage for breathing expansion */
  breathingRange?: number
  containerStyle?: React.CSSProperties
  containerClassName?: string
  topOffset?: number
}

/**
 * AnimatedGradientBackground
 * Inspired by hammamikhairi/animated-gradient-background from 21st.dev
 * Produces an elegant, continuous breathing radial gradient background.
 */
export const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 120,
  breathing = true,
  gradientColors = [
    'rgba(12, 16, 21, 0.95)',
    'rgba(17, 35, 40, 0.75)',
    'rgba(15, 42, 40, 0.65)',
    'rgba(33, 24, 18, 0.55)',
    'rgba(20, 27, 34, 0.85)',
    'rgba(12, 16, 21, 0.98)',
  ],
  gradientStops = [20, 45, 60, 75, 90, 100],
  animationSpeed = 0.015,
  breathingRange = 6,
  containerStyle = {},
  topOffset = 0,
  containerClassName = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let animationFrame: number
    let width = startingGap
    let directionWidth = 1

    const animateGradient = () => {
      if (width >= startingGap + breathingRange) directionWidth = -1
      if (width <= startingGap - breathingRange) directionWidth = 1

      if (!breathing) directionWidth = 0
      width += directionWidth * animationSpeed

      const stops = gradientStops
        .map((stop, index) => `${gradientColors[index] ?? gradientColors[0]} ${stop}%`)
        .join(', ')

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at 50% 50%, ${stops})`

      if (containerRef.current) {
        containerRef.current.style.background = gradient
      }

      animationFrame = requestAnimationFrame(animateGradient)
    }

    animationFrame = requestAnimationFrame(animateGradient)
    return () => cancelAnimationFrame(animationFrame)
  }, [startingGap, breathing, gradientColors, gradientStops, animationSpeed, breathingRange, topOffset])

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={`${styles.container} ${containerClassName}`}
      initial={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    >
      <div
        className={styles.gradientLayer}
        ref={containerRef}
        style={containerStyle}
      />
    </motion.div>
  )
}
