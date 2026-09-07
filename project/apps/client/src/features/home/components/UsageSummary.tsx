import { animate, useMotionValue, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { Activity, Clock, DollarSign, FileText, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { UsageMetrics, UsagePeriod } from '../model/home-types'

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

      <dl className="mt-4 mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            name: 'Tokens utilizados',
            value: usage.tokens ? (
              <CountUp target={usage.tokens.used} format={(value) =>
                `${numberFormatter.format(Math.round(value))} / ${numberFormatter.format(usage.tokens!.limit)}`
              } />
            ) : 'Datos no disponibles',
            description: 'Consumo / límite de tokens',
            Icon: Zap,
            accent: 'text-[var(--color-mint)] bg-[var(--color-mint-dim)]/100',
            primary: true,
          },
          {
            name: 'Costo',
            value: usage.estimatedCostUsd === null ? 'Datos no disponibles' : (
              <CountUp target={usage.estimatedCostUsd} format={(value) =>
                `${currencyFormatter.format(value)} estimados`
              } />
            ),
            description: 'Estimación en USD',
            Icon: DollarSign,
            accent: 'text-[var(--color-mint)] bg-[var(--color-mint-dim)]/80',
          },
          {
            name: 'Ejecuciones',
            value: <CountUp target={usage.executions} format={(value) =>
              `${numberFormatter.format(Math.round(value))} · ${Math.round(usage.successRate * 100)}% exitosas`
            } />,
            description: 'Actividad del periodo',
            Icon: Activity,
            accent: 'text-[var(--color-violet)] bg-[var(--color-violet-dim)]/65',
          },
          {
            name: 'Procesamiento',
            value: <CountUp target={usage.processingMinutes} format={(value) =>
              `${numberFormatter.format(value === usage.processingMinutes ? value : Math.round(value))} min`
            } />,
            description: 'Tiempo de procesamiento',
            Icon: Clock,
            accent: 'text-[var(--color-mint)] bg-[var(--color-mint-dim)]/50',
          },
          {
            name: 'Archivos',
            value: <CountUp target={usage.generatedFiles} format={(value) =>
              numberFormatter.format(Math.round(value))
            } />,
            description: 'Archivos generados',
            Icon: FileText,
            accent: 'text-[var(--color-mint)] bg-[var(--color-mint-dim)]/35',
          },
        ].map(({ name, value, description, Icon, accent, primary }) => (
          <div
            key={name}
            className={cn(
              'group relative isolate flex min-h-44 min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-300 hover:border-[var(--color-mint)]/40 motion-reduce:transition-none',
              primary && 'min-h-56 border-[var(--color-mint-dim)] p-6 sm:col-span-2 xl:col-span-1 xl:row-span-2',
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 -z-10 -translate-x-full bg-[linear-gradient(115deg,transparent_25%,var(--color-mint-dim)_50%,transparent_75%)] opacity-50 transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden motion-reduce:transition-none',
                primary && 'opacity-100',
              )}
            />
            <dt className="flex flex-col items-start gap-4 text-xs font-medium text-[var(--muted-foreground)]">
              <span className={cn('inline-flex rounded-xl p-2.5', accent)}>
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              {name}
            </dt>
            <dd className="m-0 mt-3">
              <span
                className={cn(
                  'block text-lg leading-snug font-semibold tracking-tight text-[var(--foreground)] tabular-nums [overflow-wrap:anywhere]',
                  primary && 'text-2xl sm:text-3xl xl:text-2xl',
                )}
              >
                {value}
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-[var(--muted-foreground)]">
                {description}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
