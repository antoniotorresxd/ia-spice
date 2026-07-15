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

export function UsageSummary({ usage, onPeriodChange }: UsageSummaryProps) {
  const tokens = usage.tokens
    ? `${numberFormatter.format(usage.tokens.used)} / ${numberFormatter.format(usage.tokens.limit)}`
    : 'Datos no disponibles'
  const cost =
    usage.estimatedCostUsd === null
      ? 'Datos no disponibles'
      : `${currencyFormatter.format(usage.estimatedCostUsd)} estimados`

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

      <dl className="home-metrics">
        <div className="home-metric home-metric-primary">
          <dt>Tokens utilizados</dt>
          <dd>{tokens}</dd>
        </div>
        <div className="home-metric">
          <dt>Costo</dt>
          <dd>{cost}</dd>
        </div>
        <div className="home-metric">
          <dt>Ejecuciones</dt>
          <dd>
            {usage.executions} · {Math.round(usage.successRate * 100)}% exitosas
          </dd>
        </div>
        <div className="home-metric">
          <dt>Procesamiento</dt>
          <dd>{usage.processingMinutes} min</dd>
        </div>
        <div className="home-metric">
          <dt>Archivos</dt>
          <dd>{usage.generatedFiles}</dd>
        </div>
      </dl>
    </section>
  )
}

