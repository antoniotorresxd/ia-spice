import type { ModelUsageMetric } from '../model/home-types'

type ModelDistributionChartProps = {
  data: ModelUsageMetric[]
}

const colorPalette = [
  { bar: 'bg-[#c8793d]', text: 'text-[#c8793d]', dot: 'bg-[#c8793d]' },
  { bar: 'bg-[#45d6c4]', text: 'text-[#45d6c4]', dot: 'bg-[#45d6c4]' },
  { bar: 'bg-[#4d8dff]', text: 'text-[#4d8dff]', dot: 'bg-[#4d8dff]' },
  { bar: 'bg-[#a78bfa]', text: 'text-[#a78bfa]', dot: 'bg-[#a78bfa]' },
]

export function ModelDistributionChart({ data }: ModelDistributionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)]/50 text-sm text-[var(--muted-foreground)]">
        Sin datos de modelos disponibles.
      </div>
    )
  }

  const totalTokens = data.reduce((acc, curr) => acc + curr.tokens, 0)

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] pb-3">
        <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--foreground)]">
          Distribución de Modelos LLM
        </h3>
        <p className="m-0 text-xs text-[var(--muted-foreground)]">
          Proporción de tokens ({totalTokens.toLocaleString()} acumulados) y llamadas por modelo
        </p>
      </div>

      {/* Stacked multi-segment bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        {data.map((model, idx) => {
          const color = colorPalette[idx % colorPalette.length]
          return (
            <div
              key={model.modelName}
              className={`h-full ${color.bar} transition-all duration-500`}
              style={{ width: `${model.percentage}%` }}
              title={`${model.label}: ${model.percentage.toFixed(1)}%`}
            />
          )
        })}
      </div>

      {/* Grid of model cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((model, idx) => {
          const color = colorPalette[idx % colorPalette.length]
          return (
            <div
              key={model.modelName}
              className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`size-2 shrink-0 rounded-full ${color.dot}`} />
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]" title={model.label}>
                    {model.label}
                  </span>
                </div>
                <span className={`text-xs font-bold font-mono ${color.text}`}>
                  {model.percentage.toFixed(1)}%
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)]/50 pt-2 text-[0.72rem] text-[var(--muted-foreground)]">
                <span>
                  Tokens:{' '}
                  <strong className="text-[var(--foreground)] font-mono">
                    {model.tokens.toLocaleString()}
                  </strong>
                </span>
                <span>
                  Llamadas:{' '}
                  <strong className="text-[var(--foreground)] font-mono">
                    {model.callCount}
                  </strong>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
