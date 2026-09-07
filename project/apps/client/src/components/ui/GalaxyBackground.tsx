import { useEffect, useRef } from 'react'

interface GalaxyBackgroundProps {
  particleCount?: number
  interactionRadius?: number
  particleColor?: string
  accentColor?: string
  className?: string
}

type Star = {
  ox: number
  oy: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
  phase: number
  colorType: 'base' | 'copper' | 'cyan'
}

export function GalaxyBackground({
  particleCount = 260,
  interactionRadius = 180,
  particleColor = '#94a3b8',
  accentColor = '#c8793d',
  className = '',
}: GalaxyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999, active: false })
  const starsRef = useRef<Star[]>([])
  const rafRef = useRef<number>(0)
  const influenceRef = useRef(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onMove = (clientX: number, clientY: number) => {
      const cvs = canvasRef.current
      if (!cvs) return
      const rect = cvs.getBoundingClientRect()
      mouseRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
        active: true,
      }
    }

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const handleMouseLeave = () => {
      mouseRef.current.active = false
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('touchend', handleMouseLeave)

    const cvs = canvasRef.current
    if (!cvs || typeof cvs.getContext !== 'function') return
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = cvs.getContext('2d')
    } catch {
      return
    }
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1

    function seedStars(w: number, h: number): Star[] {
      return Array.from({ length: particleCount }, () => {
        const ox = Math.random() * w
        const oy = Math.random() * h
        const rand = Math.random()
        const colorType: 'base' | 'copper' | 'cyan' =
          rand < 0.6 ? 'base' : rand < 0.85 ? 'copper' : 'cyan'

        return {
          ox,
          oy,
          x: ox,
          y: oy,
          vx: 0,
          vy: 0,
          r: 0.75 + Math.random() * 1.6,
          alpha: 0.15 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
          colorType,
        }
      })
    }

    function resize() {
      if (!cvs || !ctx) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = cvs.offsetWidth
      height = cvs.offsetHeight
      cvs.width = width * dpr
      cvs.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      starsRef.current = seedStars(width, height)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cvs)

    const t0 = performance.now()

    function draw(now: number) {
      if (!ctx) return
      const elapsed = (now - t0) / 1000

      ctx.clearRect(0, 0, width, height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const active = mouseRef.current.active && !prefersReduced

      if (active) {
        influenceRef.current = Math.min(1, influenceRef.current + 0.05)
      } else {
        influenceRef.current = Math.max(0, influenceRef.current - 0.02)
      }

      const inf = influenceRef.current
      const ir2 = interactionRadius * interactionRadius

      const stars = starsRef.current
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]

        // Subtle ambient drifting
        if (!prefersReduced) {
          s.ox += Math.sin(elapsed * 0.3 + s.phase) * 0.12
          s.oy += Math.cos(elapsed * 0.25 + s.phase) * 0.12
          if (s.ox < 0) s.ox = width
          if (s.ox > width) s.ox = 0
          if (s.oy < 0) s.oy = height
          if (s.oy > height) s.oy = 0
        }

        const dx = s.x - mx
        const dy = s.y - my
        const dist2 = dx * dx + dy * dy
        const dist = Math.sqrt(dist2)

        let t = 0
        if (inf > 0.01 && dist2 < ir2) {
          t = Math.pow(1 - dist / interactionRadius, 2) * inf
        }

        if (t > 0.01 && dist > 0.1) {
          s.vx += (dx / dist) * 1.5 * t
          s.vy += (dy / dist) * 1.5 * t
        }

        s.vx += (s.ox - s.x) * 0.035
        s.vy += (s.oy - s.y) * 0.035
        s.vx *= 0.86
        s.vy *= 0.86
        s.x += s.vx
        s.y += s.vy

        // Visual twinkle & stretch
        const twinkle = prefersReduced ? 0.5 : Math.sin(elapsed * 1.5 + s.phase) * 0.4 + 0.6
        const drawAlpha = Math.min(1, s.alpha * twinkle + t * 0.5)

        let fillColor = particleColor
        if (s.colorType === 'copper') fillColor = accentColor
        else if (s.colorType === 'cyan') fillColor = '#45d6c4'

        ctx.save()
        ctx.translate(s.x, s.y)
        ctx.globalAlpha = drawAlpha
        ctx.fillStyle = fillColor

        if (t > 0.35) {
          ctx.shadowBlur = 8 + t * 10
          ctx.shadowColor = fillColor
        }

        const stretch = t * 14
        const radius = s.r + t * 0.8

        ctx.beginPath()
        if (stretch > 1) {
          const angle = Math.atan2(s.vy, s.vx)
          ctx.rotate(angle)
          ctx.ellipse(0, 0, radius + stretch * 0.5, radius, 0, 0, Math.PI * 2)
        } else {
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('touchend', handleMouseLeave)
    }
  }, [particleCount, interactionRadius, particleColor, accentColor])

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="h-full w-full opacity-70" />
      {/* Deep cosmic gradient atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 65% 55% at 50% 30%, rgba(200, 121, 61, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 55% 45% at 85% 75%, rgba(69, 214, 196, 0.07) 0%, transparent 65%),
            radial-gradient(circle at 15% 85%, rgba(77, 141, 255, 0.05) 0%, transparent 50%),
            radial-gradient(ellipse 95% 85% at 50% 50%, transparent 20%, rgba(11, 13, 16, 0.75) 100%)
          `,
        }}
      />
      {/* Subtle fine dot grid matrix for technical precision feel */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.85) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />
    </div>
  )
}
