import { Activity, Clock, Cpu, RefreshCw, Zap } from 'lucide-react'
import type { AgentNodeMetric } from '../model/home-types'
import { cn } from '@/lib/utils'

type AgentBreakdownChartProps = {
  data: AgentNodeMetric[]
}

const nodeIcons = {
  orquestador: Cpu,
  calculo: Zap,
  sintesis: Activity,
  curador: RefreshCw,
  documentador: Clock,
}

export function AgentBreakdownChart({ data }: AgentBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)]/50 text-sm text-[var(--muted-foreground)]">
        Sin datos de agentes disponibles.
      </div>
    )
  }

  const maxCalls = Math.max(...data.map((d) => d.callCount), 1)

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] pb-3">
        <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--foreground)]">
          Distribución de Carga en el Pipeline de Agentes
        </h3>
        <p className="m-0 text-xs text-[var(--muted-foreground)]">
          Rendimiento, llamadas y latencia de cada nodo en el grafo LangGraph
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {data.map((node, index) => {
          const Icon = nodeIcons[node.nodeId] || Activity
          const widthPercent = Math.max(8, (node.callCount / maxCalls) * 100)

          return (
            <div
              key={node.nodeId}
              className="group relative flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3 transition-colors hover:border-[var(--color-mint)]/30 hover:bg-[var(--muted)]/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-lg bg-[var(--muted)] text-[0.7rem] font-bold text-[var(--foreground)]">
                    {index + 1}
                  </span>
                  <Icon className="size-4 text-[var(--color-mint)]" />
                  <span className="font-medium text-[var(--foreground)]">{node.label}</span>
                </div>

                <div className="flex items-center gap-3 text-[0.72rem] text-[var(--muted-foreground)]">
                  <span title="Latencia media">
                    Latencia:{' '}
                    <strong className="text-[var(--foreground)] font-mono">
                      {node.avgLatencyMs >= 1000
                        ? `${(node.avgLatencyMs / 1000).toFixed(2)}s`
                        : `${Math.round(node.avgLatencyMs)}ms`}
                    </strong>
                  </span>
                  {node.tokens > 0 && (
                    <span title="Tokens consumidos">
                      Tokens:{' '}
                      <strong className="text-[var(--color-mint)] font-mono">
                        {node.tokens >= 1000 ? `${(node.tokens / 1000).toFixed(0)}k` : node.tokens}
                      </strong>
                    </span>
                  )}
                  <span>
                    Llamadas:{' '}
                    <strong className="text-[var(--color-violet)] font-mono">
                      {node.callCount}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Progress visual bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    node.nodeId === 'curador'
                      ? 'bg-gradient-to-r from-[var(--color-mint)] to-[var(--color-violet)]'
                      : 'bg-[var(--color-mint)]',
                  )}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
