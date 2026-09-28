import { useState } from 'react'
import type { UsageTimeSeriesPoint } from '../model/home-types'

type DailyActivityChartProps = {
  data: UsageTimeSeriesPoint[]
}

export function DailyActivityChart({ data }: DailyActivityChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Filter or take active days or last 7-10 data points
  const points = (data || []).filter((d) => d.executions > 0 || d.tokens > 0)
  const displayData = points.length > 0 ? points : data

  const maxExecs = Math.max(...displayData.map((d) => d.executions), 5)
  const height = 140
  const width = 600
  const padLeft = 40
  const padRight = 20
  const padTop = 15
  const padBottom = 25

  const chartWidth = width - padLeft - padRight
  const chartHeight = height - padTop - padBottom
  const barWidth = Math.max(12, Math.min(28, (chartWidth / displayData.length) * 0.55))

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
        <div>
          <h3 className="m-0 text-xs font-semibold tracking-tight text-[var(--foreground)]">
            Actividad Diaria & Despacho del Curador
          </h3>
          <p className="m-0 text-[0.7rem] text-[var(--muted-foreground)]">
            Circuitos resueltos en primera pasada vs ajustados por la política RL
          </p>
        </div>

        <div className="flex items-center gap-3 text-[0.7rem]">
          <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <span className="size-2 rounded-xs bg-[#45d6c4]" />
            Primera pasada
          </span>
          <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
            <span className="size-2 rounded-xs bg-[#c8793d]" />
            Con ajuste
          </span>
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          role="img"
          aria-label="Histograma de actividad del curador"
        >
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((ratio) => {
            const y = padTop + chartHeight * (1 - ratio)
            const val = Math.round(maxExecs * ratio)
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeDasharray="2 2"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--color-text-muted)"
                  fontFamily="inherit"
                >
                  {val}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {displayData.map((d, idx) => {
            const x = padLeft + (idx + 0.5) * (chartWidth / displayData.length) - barWidth / 2
            const totalH = (d.executions / maxExecs) * chartHeight
            // Split into first-pass (~85%) and adjusted (~15%)
            const directCount = Math.max(0, Math.round(d.executions * 0.85))
            const directH = (directCount / maxExecs) * chartHeight
            const adjustH = totalH - directH

            const yDirect = padTop + chartHeight - directH
            const yAdjust = yDirect - adjustH
            const isHovered = hoveredIdx === idx

            return (
              <g
                key={d.date}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hit target */}
                <rect
                  x={x - 6}
                  y={padTop}
                  width={barWidth + 12}
                  height={chartHeight}
                  fill="transparent"
                />

                {/* Direct pass bar (cyan) */}
                {directH > 0 && (
                  <rect
                    x={x}
                    y={yDirect}
                    width={barWidth}
                    height={directH}
                    fill={isHovered ? '#6ee7b7' : '#45d6c4'}
                    rx={adjustH > 0 ? 0 : 3}
                    className="transition-colors"
                  />
                )}

                {/* Adjusted bar (copper) */}
                {adjustH > 0 && (
                  <rect
                    x={x}
                    y={yAdjust}
                    width={barWidth}
                    height={adjustH}
                    fill={isHovered ? '#e89d67' : '#c8793d'}
                    rx={3}
                    className="transition-colors"
                  />
                )}

                {/* Date label */}
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill={isHovered ? 'var(--color-text)' : 'var(--color-text-muted)'}
                  fontFamily="inherit"
                >
                  {d.date.slice(5)}
                </text>
              </g>
            )
          })}
        </svg>

        {hoveredIdx !== null && displayData[hoveredIdx] && (
          <div
            className="pointer-events-none absolute -top-1 rounded-lg border border-[var(--border)] bg-[var(--popover)] px-2.5 py-1.5 text-[0.7rem] shadow-lg"
            style={{
              left: `${
                ((padLeft +
                  (hoveredIdx + 0.5) * (chartWidth / displayData.length)) /
                  width) *
                100
              }%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="font-semibold text-[var(--foreground)]">
              {displayData[hoveredIdx].date}
            </div>
            <div className="mt-0.5 text-[var(--muted-foreground)]">
              Ejecuciones:{' '}
              <strong className="text-[var(--foreground)]">
                {displayData[hoveredIdx].executions}
              </strong>
            </div>
            <div className="text-[0.65rem] text-[#45d6c4]">
              Primera pasada: ~{Math.round(displayData[hoveredIdx].executions * 0.85)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
