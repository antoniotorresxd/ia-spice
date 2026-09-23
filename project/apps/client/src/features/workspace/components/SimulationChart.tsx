import { Activity, Radio } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import type { SimCurvePoint } from '../model/workspace-types'
import styles from './SimulationChart.module.css'

export type SimulationChartProps = {
  curve?: SimCurvePoint[] | null
  analysisType?: string | null
  xUnit?: string | null
  yUnit?: string | null
  metricName?: string | null
  measuredValue?: number | null
  targetValue?: number | null
  title?: string
  compact?: boolean
}

function formatFrequency(val: number): string {
  if (val >= 1e6) return `${(val / 1e6).toFixed(val % 1e6 === 0 ? 0 : 1)} MHz`
  if (val >= 1e3) return `${(val / 1e3).toFixed(val % 1e3 === 0 ? 0 : 1)} kHz`
  return `${val.toFixed(val % 1 === 0 ? 0 : 1)} Hz`
}

function formatTime(val: number): string {
  if (val < 1e-6) return `${(val * 1e9).toFixed(1)} ns`
  if (val < 1e-3) return `${(val * 1e6).toFixed(1)} µs`
  if (val < 1) return `${(val * 1e3).toFixed(1)} ms`
  return `${val.toFixed(2)} s`
}

function formatX(val: number, isFreq: boolean): string {
  return isFreq ? formatFrequency(val) : formatTime(val)
}

function formatY(val: number, unit?: string | null): string {
  const u = unit ?? ''
  return `${val.toFixed(2)} ${u}`.trim()
}

export function SimulationChart({
  curve,
  analysisType,
  xUnit = 'Hz',
  yUnit = 'dB',
  metricName,
  measuredValue,
  targetValue,
  title = 'Respuesta de Simulación SPICE',
  compact = false,
}: SimulationChartProps) {
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const isAc = analysisType === 'ac' || (!analysisType && xUnit === 'Hz')

  const validPoints = useMemo(() => {
    if (!curve || curve.length === 0) return []
    return curve.filter((p) => !isNaN(p.x) && !isNaN(p.y) && isFinite(p.x) && isFinite(p.y))
  }, [curve])

  const chartGeometry = useMemo(() => {
    if (validPoints.length < 2) return null

    const width = 600
    const height = compact ? 220 : 280
    const padding = {
      top: 25,
      right: 25,
      bottom: compact ? 30 : 35,
      left: 55,
    }

    const plotW = width - padding.left - padding.right
    const plotH = height - padding.top - padding.bottom

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const p of validPoints) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    // Protection against flat range
    if (minY === maxY) {
      minY -= 1
      maxY += 1
    } else {
      const yMargin = (maxY - minY) * 0.08
      minY -= yMargin
      maxY += yMargin
    }

    const isLogX = isAc && minX > 0 && maxX / minX >= 10
    const logMinX = isLogX ? Math.log10(minX) : 0
    const logMaxX = isLogX ? Math.log10(maxX) : 0

    const mapX = (x: number): number => {
      if (isLogX) {
        const val = Math.log10(Math.max(x, minX))
        return padding.left + ((val - logMinX) / (logMaxX - logMinX)) * plotW
      }
      return padding.left + ((x - minX) / (maxX - minX)) * plotW
    }

    const mapY = (y: number): number => {
      return padding.top + plotH - ((y - minY) / (maxY - minY)) * plotH
    }

    // Generate path
    const coords = validPoints.map((p) => ({ x: mapX(p.x), y: mapY(p.y), raw: p }))
    const pathD = coords.reduce((acc, c, idx) => {
      return idx === 0 ? `M ${c.x.toFixed(1)} ${c.y.toFixed(1)}` : `${acc} L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`
    }, '')

    // Area under path
    const baselineY = padding.top + plotH
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${baselineY} L ${coords[0].x.toFixed(1)} ${baselineY} Z`

    // X-axis ticks
    const xTicks: Array<{ val: number; xCoord: number; label: string }> = []
    if (isLogX) {
      const startDecade = Math.ceil(logMinX)
      const endDecade = Math.floor(logMaxX)
      for (let d = startDecade; d <= endDecade; d++) {
        const val = Math.pow(10, d)
        xTicks.push({
          val,
          xCoord: mapX(val),
          label: formatX(val, true),
        })
      }
    } else {
      const count = 5
      for (let i = 0; i <= count; i++) {
        const val = minX + (i / count) * (maxX - minX)
        xTicks.push({
          val,
          xCoord: mapX(val),
          label: formatX(val, false),
        })
      }
    }

    // Y-axis ticks
    const yTicks: Array<{ val: number; yCoord: number; label: string }> = []
    const yCount = compact ? 3 : 5
    for (let i = 0; i <= yCount; i++) {
      const val = minY + (i / yCount) * (maxY - minY)
      yTicks.push({
        val,
        yCoord: mapY(val),
        label: formatY(val, yUnit),
      })
    }

    // Cutoff / reference marker
    let refXCoord: number | null = null
    if (measuredValue && measuredValue >= minX && measuredValue <= maxX) {
      refXCoord = mapX(measuredValue)
    }

    let targetXCoord: number | null = null
    if (targetValue && targetValue >= minX && targetValue <= maxX) {
      targetXCoord = mapX(targetValue)
    }

    return {
      width,
      height,
      padding,
      plotW,
      plotH,
      minX,
      maxX,
      minY,
      maxY,
      coords,
      pathD,
      areaD,
      xTicks,
      yTicks,
      refXCoord,
      targetXCoord,
      isLogX,
    }
  }, [validPoints, isAc, yUnit, compact, measuredValue, targetValue])

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartGeometry || chartGeometry.coords.length === 0 || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * chartGeometry.width

    // Find nearest point
    let nearestIdx = 0
    let minDistance = Infinity
    chartGeometry.coords.forEach((c, idx) => {
      const dist = Math.abs(c.x - svgX)
      if (dist < minDistance) {
        minDistance = dist
        nearestIdx = idx
      }
    })
    setHoverIndex(nearestIdx)
  }

  const handleMouseLeave = () => {
    setHoverIndex(null)
  }

  if (validPoints.length === 0 || !chartGeometry) {
    return (
      <div className={`${styles.chartContainer} ${compact ? styles.chartContainerCompact : ''}`}>
        <div className={styles.emptyState}>
          <Radio size={22} style={{ opacity: 0.5 }} />
          <span>No hay datos vectoriales de simulación SPICE disponibles para este bloque.</span>
        </div>
      </div>
    )
  }

  const activeCoord = hoverIndex !== null ? chartGeometry.coords[hoverIndex] : null

  return (
    <div className={`${styles.chartContainer} ${compact ? styles.chartContainerCompact : ''}`}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitleWrap}>
          <span className={styles.chartTitle}>
            <Activity size={15} style={{ color: '#38bdf8' }} />
            {title}
          </span>
          <span className={`${styles.chartBadge} ${isAc ? '' : styles.chartBadgeTran}`}>
            {isAc ? 'Bode (Magnitud AC)' : 'Transitorio (Onda)'}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
            {validPoints.length} pts ngspice
          </span>
        </div>

        <div className={styles.chartMetricsWrap}>
          {metricName && (
            <div className={styles.metricItem}>
              <span>{metricName}:</span>
              {measuredValue !== null && measuredValue !== undefined && (
                <span className={styles.metricValue}>
                  {isAc ? formatFrequency(measuredValue) : `${measuredValue.toFixed(3)} ${yUnit}`}
                </span>
              )}
              {targetValue !== null && targetValue !== undefined && (
                <span className={styles.metricTarget}>
                  (obj: {isAc ? formatFrequency(targetValue) : `${targetValue.toFixed(3)} ${yUnit}`})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.svgWrap}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
          className={styles.svgElement}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {chartGeometry.xTicks.map((t, idx) => (
            <line
              key={`x-grid-${idx}`}
              x1={t.xCoord}
              y1={chartGeometry.padding.top}
              x2={t.xCoord}
              y2={chartGeometry.padding.top + chartGeometry.plotH}
              className={styles.gridLine}
            />
          ))}

          {chartGeometry.yTicks.map((t, idx) => (
            <line
              key={`y-grid-${idx}`}
              x1={chartGeometry.padding.left}
              y1={t.yCoord}
              x2={chartGeometry.padding.left + chartGeometry.plotW}
              y2={t.yCoord}
              className={styles.gridLine}
            />
          ))}

          {/* Axes */}
          <line
            x1={chartGeometry.padding.left}
            y1={chartGeometry.padding.top + chartGeometry.plotH}
            x2={chartGeometry.padding.left + chartGeometry.plotW}
            y2={chartGeometry.padding.top + chartGeometry.plotH}
            className={styles.axisLine}
          />
          <line
            x1={chartGeometry.padding.left}
            y1={chartGeometry.padding.top}
            x2={chartGeometry.padding.left}
            y2={chartGeometry.padding.top + chartGeometry.plotH}
            className={styles.axisLine}
          />

          {/* Axis Labels */}
          {chartGeometry.xTicks.map((t, idx) => (
            <text
              key={`x-txt-${idx}`}
              x={t.xCoord}
              y={chartGeometry.padding.top + chartGeometry.plotH + 18}
              textAnchor="middle"
              className={styles.axisText}
            >
              {t.label}
            </text>
          ))}

          {chartGeometry.yTicks.map((t, idx) => (
            <text
              key={`y-txt-${idx}`}
              x={chartGeometry.padding.left - 8}
              y={t.yCoord + 3}
              textAnchor="end"
              className={styles.axisText}
            >
              {t.label}
            </text>
          ))}

          {/* Target Cutoff Marker */}
          {chartGeometry.targetXCoord !== null && (
            <g>
              <line
                x1={chartGeometry.targetXCoord}
                y1={chartGeometry.padding.top}
                x2={chartGeometry.targetXCoord}
                y2={chartGeometry.padding.top + chartGeometry.plotH}
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={chartGeometry.targetXCoord + 4}
                y={chartGeometry.padding.top + 12}
                fill="#c084fc"
                fontSize="9"
                fontFamily="monospace"
              >
                Obj: {targetValue ? formatFrequency(targetValue) : ''}
              </text>
            </g>
          )}

          {/* Measured Cutoff Marker */}
          {chartGeometry.refXCoord !== null && (
            <g>
              <line
                x1={chartGeometry.refXCoord}
                y1={chartGeometry.padding.top}
                x2={chartGeometry.refXCoord}
                y2={chartGeometry.padding.top + chartGeometry.plotH}
                className={styles.refLine}
              />
              <text
                x={chartGeometry.refXCoord + 4}
                y={chartGeometry.padding.top + 24}
                className={styles.refText}
              >
                fc: {measuredValue ? formatFrequency(measuredValue) : ''}
              </text>
            </g>
          )}

          {/* Shaded Area */}
          <path d={chartGeometry.areaD} fill={`url(#${gradientId})`} />

          {/* Curve Line */}
          <path d={chartGeometry.pathD} className={styles.curveLine} />

          {/* Hover Crosshairs and Point */}
          {activeCoord && (
            <g>
              <line
                x1={activeCoord.x}
                y1={chartGeometry.padding.top}
                x2={activeCoord.x}
                y2={chartGeometry.padding.top + chartGeometry.plotH}
                className={styles.hoverCrosshair}
              />
              <line
                x1={chartGeometry.padding.left}
                y1={activeCoord.y}
                x2={chartGeometry.padding.left + chartGeometry.plotW}
                y2={activeCoord.y}
                className={styles.hoverCrosshair}
              />
              <circle cx={activeCoord.x} cy={activeCoord.y} r="5" className={styles.hoverPoint} />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Badge */}
        {activeCoord && (
          <div
            className={styles.tooltipBox}
            style={{
              left: `${(activeCoord.x / chartGeometry.width) * 100}%`,
              top: `${(activeCoord.y / chartGeometry.height) * 100}%`,
            }}
          >
            <div className={styles.tooltipRow}>
              <span>X ({xUnit}):</span>
              <strong style={{ color: '#38bdf8' }}>{formatX(activeCoord.raw.x, isAc)}</strong>
            </div>
            <div className={styles.tooltipRow}>
              <span>Y ({yUnit}):</span>
              <strong style={{ color: '#10b981' }}>{formatY(activeCoord.raw.y, yUnit)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
