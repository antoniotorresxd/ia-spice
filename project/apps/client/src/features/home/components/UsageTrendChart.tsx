import { useState } from 'react'
import type { UsageTimeSeriesPoint } from '../model/home-types'
import { cn } from '@/lib/utils'

type UsageTrendChartProps = {
  data: UsageTimeSeriesPoint[]
}

type MetricMode = 'tokens' | 'executions'

export function UsageTrendChart({ data }: UsageTrendChartProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>('tokens')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)]/50 text-sm text-[var(--muted-foreground)]">
        Sin datos de telemetría disponibles para este periodo.
      </div>
    )
  }

  const values = data.map((d) => (metricMode === 'tokens' ? d.tokens : d.executions))
  const maxValue = Math.max(...values, metricMode === 'tokens' ? 10_000 : 5)
  const minValue = 0

  // SVG Coordinates setup
  const width = 680
  const height = 220
  const padLeft = 55
  const padRight = 25
  const padTop = 20
  const padBottom = 35

  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom

  const points = data.map((d, index) => {
    const x = padLeft + (index / Math.max(1, data.length - 1)) * chartWidth
    const val = metricMode === 'tokens' ? d.tokens : d.executions
    const y = padTop + chartHeight - ((val - minValue) / (maxValue - minValue || 1)) * chartHeight
    return { x, y, data: d, val }
  })

  // Build smooth natural curve
  let pathD = ''
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const dx = curr.x - prev.x
      const cp1x = prev.x + dx * 0.45
      const cp2x = prev.x + dx * 0.55
      const cp1y = prev.y
      const cp2y = curr.y
      pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    }
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + chartHeight} L ${points[0].x} ${padTop + chartHeight} Z`

  // Formatters
  const formatVal = (v: number) => {
    if (metricMode === 'tokens') {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
      return v.toString()
    }
    return Math.round(v).toString()
  }

  const activePoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--foreground)]">
            Evolución de Inferencia & Telemetría
          </h3>
          <p className="m-0 text-xs text-[var(--muted-foreground)]">
            Consumo registrado a través del observador de Langfuse
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMetricMode('tokens')}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              metricMode === 'tokens'
                ? 'bg-[var(--card)] text-[var(--color-mint)] shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            Tokens
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('executions')}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              metricMode === 'executions'
                ? 'bg-[var(--card)] text-[var(--color-violet)] shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            Ejecuciones
          </button>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          role="img"
          aria-label="Gráfica de consumo y telemetría"
        >
          <defs>
            <linearGradient id="trendGradientMint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c8793d" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#c8793d" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="trendGradientViolet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#45d6c4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#45d6c4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = padTop + chartHeight * (1 - ratio)
            const val = minValue + (maxValue - minValue) * ratio
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--color-text-muted)"
                  fontFamily="inherit"
                >
                  {formatVal(val)}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          <path
            d={areaD}
            fill={metricMode === 'tokens' ? 'url(#trendGradientMint)' : 'url(#trendGradientViolet)'}
          />

          {/* Line curve */}
          <path
            d={pathD}
            fill="none"
            stroke={metricMode === 'tokens' ? '#c8793d' : '#45d6c4'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X axis dates */}
          {points.map((pt, idx) => {
            // Show every 2nd or 3rd label if many
            const showLabel =
              data.length <= 8 ||
              idx === 0 ||
              idx === data.length - 1 ||
              idx % Math.ceil(data.length / 5) === 0
            if (!showLabel) return null

            const dateStr = pt.data.date.slice(5) // MM-DD
            return (
              <text
                key={pt.data.date}
                x={pt.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-text-muted)"
                fontFamily="inherit"
              >
                {dateStr}
              </text>
            )
          })}

          {/* Interactive hover points & trigger bars */}
          {points.map((pt, idx) => (
            <g key={idx} onMouseEnter={() => setHoveredIndex(idx)} onMouseLeave={() => setHoveredIndex(null)}>
              {/* Invisible wide hit target */}
              <rect
                x={pt.x - chartWidth / points.length / 2}
                y={padTop}
                width={chartWidth / points.length}
                height={chartHeight}
                fill="transparent"
                style={{ cursor: 'pointer' }}
              />

              {hoveredIndex === idx && (
                <>
                  <line
                    x1={pt.x}
                    y1={padTop}
                    x2={pt.x}
                    y2={padTop + chartHeight}
                    stroke={metricMode === 'tokens' ? '#c8793d' : '#45d6c4'}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    opacity="0.75"
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5"
                    fill={metricMode === 'tokens' ? '#c8793d' : '#45d6c4'}
                    stroke="var(--color-bg)"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
          ))}
        </svg>

        {/* Hover Tooltip overlay */}
        {activePoint && (
          <div
            className="pointer-events-none absolute -top-1 rounded-lg border border-[var(--border)] bg-[var(--popover)] px-3 py-2 text-xs shadow-lg transition-transform duration-75"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="font-semibold text-[var(--foreground)]">{activePoint.data.date}</div>
            <div className="mt-1 flex flex-col gap-0.5 text-[0.7rem] text-[var(--muted-foreground)]">
              <span>
                Tokens:{' '}
                <strong className="text-[var(--color-mint)]">
                  {activePoint.data.tokens.toLocaleString()}
                </strong>
              </span>
              <span>
                Ejecuciones:{' '}
                <strong className="text-[var(--color-violet)]">
                  {activePoint.data.executions}
                </strong>
              </span>
              {activePoint.data.costUsd > 0 && (
                <span>
                  Costo estimado:{' '}
                  <strong className="text-[var(--foreground)]">
                    ${activePoint.data.costUsd.toFixed(2)} USD
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
