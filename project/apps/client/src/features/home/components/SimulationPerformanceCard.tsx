import { Gauge, Sparkles, Timer, Zap } from 'lucide-react'

export function SimulationPerformanceCard() {
  const metrics = [
    {
      label: 'Simulación Física NGSpice',
      value: '28 ms',
      subtext: 'Ejecución C binaria nativa',
      icon: Zap,
      accent: 'text-[#4ade80]',
      progress: 96,
      barColor: 'bg-[#4ade80]',
    },
    {
      label: 'Cálculo de Fórmulas Analíticas',
      value: '220 ms',
      subtext: 'Valores comerciales E24/E96',
      icon: Timer,
      accent: 'text-[#38bdf8]',
      progress: 88,
      barColor: 'bg-[#38bdf8]',
    },
    {
      label: 'Inferencia Orquestador LLM',
      value: '1.42 s',
      subtext: 'Extracción semántica & NLP',
      icon: Sparkles,
      accent: 'text-[#c8793d]',
      progress: 68,
      barColor: 'bg-[#c8793d]',
    },
    {
      label: 'Loop Curador & Reparación RL',
      value: '2.65 s',
      subtext: 'Optimización de recompensas',
      icon: Gauge,
      accent: 'text-[#45d6c4]',
      progress: 54,
      barColor: 'bg-[#45d6c4]',
    },
  ]

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--foreground)]">
            Eficiencia y Tiempos de Respuesta
          </h3>
          <p className="m-0 text-xs text-[var(--muted-foreground)]">
            Comparativa de latencia entre simulación física pura e inferencia cognitiva
          </p>
        </div>
        <span className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 text-[0.68rem] text-[var(--muted-foreground)]">
          94.5% convergencia
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metrics.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg bg-[var(--muted)] ${item.accent}`}>
                    <Icon size={15} />
                  </span>
                  <div>
                    <div className="text-xs font-medium text-[var(--foreground)]">{item.label}</div>
                    <div className="text-[0.68rem] text-[var(--muted-foreground)]">{item.subtext}</div>
                  </div>
                </div>
                <span className={`text-xs font-bold font-mono ${item.accent}`}>
                  {item.value}
                </span>
              </div>

              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                  <div
                    className={`h-full rounded-full ${item.barColor} transition-all duration-500`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
