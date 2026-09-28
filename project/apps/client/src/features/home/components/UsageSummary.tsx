import { animate, useMotionValue, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { Activity, Clock, DollarSign, FileText, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { UsageMetrics, UsagePeriod } from '../model/home-types'
import { UsageTrendChart } from './UsageTrendChart'
import { DailyActivityChart } from './DailyActivityChart'
import { AgentBreakdownChart } from './AgentBreakdownChart'
import { ModelDistributionChart } from './ModelDistributionChart'
import { PipelineHealthCard } from './PipelineHealthCard'
import { SimulationPerformanceCard } from './SimulationPerformanceCard'

type UsageSummaryProps = {
  usage: UsageMetrics
  onPeriodChange: (period: UsagePeriod) => void
}

const numberFormatter = new Intl.NumberFormat('en-US')
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

// The first render exposes the final value; the counter starts on the first frame.
function CountUp({ target, format }: { target: number; format: (value: number) => string }) {
  const reducedMotion = useReducedMotion()
  const value = useMotionValue(0)
  const [current, setCurrent] = useState(target)

  useEffect(() => {
    if (reducedMotion) {
      value.set(target)
      return
    }
    const controls = animate(value, target, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: setCurrent,
    })
    return () => controls.stop()
  }, [target, reducedMotion, value])

  return format(reducedMotion ? target : current)
}

export function UsageSummary({ usage, onPeriodChange }: UsageSummaryProps) {
  const hasTelemetryCharts = Boolean(
    (usage.timeSeries && usage.timeSeries.length > 0) ||
      (usage.agentBreakdown && usage.agentBreakdown.length > 0) ||
      (usage.modelDistribution && usage.modelDistribution.length > 0),
  )

  const kpis = [
    {
      name: 'Tokens utilizados',
      value: usage.tokens ? (
        <CountUp
          target={usage.tokens.used}
          format={(value) => numberFormatter.format(Math.round(value))}
        />
      ) : (
        'Datos no disponibles'
      ),
      description: 'Tokens consumidos en el periodo',
      badge: 'Langfuse',
      Icon: Zap,
      accent: 'text-amber-400 bg-amber-400/10 border border-amber-400/20',
      topGlow: 'bg-gradient-to-r from-amber-500/0 via-amber-400 to-amber-500/0',
    },
    {
      name: 'Costo',
      value:
        usage.estimatedCostUsd === null ? (
          'Datos no disponibles'
        ) : (
          <CountUp
            target={usage.estimatedCostUsd}
            format={(value) => `${currencyFormatter.format(value)} estimados`}
          />
        ),
      description: 'Estimación en USD',
      badge: 'USD',
      Icon: DollarSign,
      accent: 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20',
      topGlow: 'bg-gradient-to-r from-emerald-500/0 via-emerald-400 to-emerald-500/0',
    },
    {
      name: 'Ejecuciones',
      value: (
        <CountUp
          target={usage.executions}
          format={(value) =>
            `${numberFormatter.format(Math.round(value))} · ${Math.round(usage.successRate * 100)}% exitosas`
          }
        />
      ),
      description: 'Actividad del periodo',
      badge: `${Math.round(usage.successRate * 100)}% éxito`,
      Icon: Activity,
      accent: 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20',
      topGlow: 'bg-gradient-to-r from-cyan-500/0 via-cyan-400 to-cyan-500/0',
    },
    {
      name: 'Procesamiento',
      value: (
        <CountUp
          target={usage.processingMinutes}
          format={(value) =>
            `${numberFormatter.format(value === usage.processingMinutes ? value : Math.round(value))} min`
          }
        />
      ),
      description: 'Tiempo de procesamiento',
      badge: 'C-Native',
      Icon: Clock,
      accent: 'text-violet-400 bg-violet-400/10 border border-violet-400/20',
      topGlow: 'bg-gradient-to-r from-violet-500/0 via-violet-400 to-violet-500/0',
    },
    {
      name: 'Archivos',
      value: (
        <CountUp
          target={usage.generatedFiles}
          format={(value) => numberFormatter.format(Math.round(value))}
        />
      ),
      description: 'Archivos generados',
      badge: 'Netlists',
      Icon: FileText,
      accent: 'text-sky-400 bg-sky-400/10 border border-sky-400/20',
      topGlow: 'bg-gradient-to-r from-sky-500/0 via-sky-400 to-sky-500/0',
    },
  ]

  return (
    <section aria-labelledby="usage-title" className="home-usage">
      <header className="home-section-header">
        <div>
          <p className="home-kicker">Consumo</p>
          <h2 id="usage-title">Resumen operativo</h2>
        </div>
        <label className="home-period-field">
          <span>Periodo de consumo</span>
          <select
            onChange={(event) =>
              onPeriodChange(event.target.value as UsagePeriod)
            }
            value={usage.period}
          >
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
          </select>
        </label>
      </header>

      {/* 5-Column Responsive KPI Cards */}
      <dl className="mt-4 mb-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map(({ name, value, description, badge, Icon, accent, topGlow }) => (
          <div
            key={name}
            className="group relative isolate flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 p-4.5 shadow-[var(--shadow-sm)] backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-mint)]/40 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)]"
          >
            <div
              aria-hidden="true"
              className={cn(
                'absolute top-0 left-0 right-0 h-[2px] opacity-70 transition-opacity group-hover:opacity-100',
                topGlow,
              )}
            />
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">
                {name}
              </dt>
              <span className={cn('inline-flex items-center justify-center rounded-lg p-2', accent)}>
                <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
              </span>
            </div>
            <dd className="m-0 mt-3">
              <span className="block text-2xl font-bold tracking-tight text-[var(--foreground)] tabular-nums font-mono [overflow-wrap:anywhere]">
                {value}
              </span>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                <span className="text-[0.72rem] leading-tight">{description}</span>
                {badge && (
                  <span className="rounded-md border border-[var(--border)] bg-[var(--muted)]/60 px-1.5 py-0.5 text-[0.65rem] font-medium text-[var(--muted-foreground)] shrink-0">
                    {badge}
                  </span>
                )}
              </div>
            </dd>
          </div>
        ))}
      </dl>

      {hasTelemetryCharts && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-[var(--color-violet)] animate-pulse" />
            <h3 className="m-0 text-xs font-semibold tracking-wider text-[var(--foreground)] uppercase">
              Telemetría & Observabilidad
            </h3>
            <span className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 text-[0.68rem] text-[var(--muted-foreground)]">
              Langfuse Cloud Activo
            </span>
          </div>

          {/* Fila 1: Tendencia y Actividad Diaria (7 cols) + Pipeline de Agentes (5 cols) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="flex flex-col gap-5 lg:col-span-7">
              {usage.timeSeries && <UsageTrendChart data={usage.timeSeries} />}
              {usage.timeSeries && <DailyActivityChart data={usage.timeSeries} />}
            </div>
            <div className="lg:col-span-5">
              {usage.agentBreakdown && <AgentBreakdownChart data={usage.agentBreakdown} />}
            </div>
          </div>

          {/* Fila 2: Distribución de Modelos (50%) + Eficiencia de Simulación (50%) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {usage.modelDistribution && <ModelDistributionChart data={usage.modelDistribution} />}
            <SimulationPerformanceCard />
          </div>

          {/* Fila 3: Estado de Infraestructura & Motores */}
          <PipelineHealthCard />
        </div>
      )}
    </section>
  )
}

