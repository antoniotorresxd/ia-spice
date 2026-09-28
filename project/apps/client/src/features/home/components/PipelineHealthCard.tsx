import { Activity, CheckCircle2, Cpu, Database, RefreshCw, Zap } from 'lucide-react'

export function PipelineHealthCard() {
  const services = [
    {
      name: 'Motor NGSpice (C Nativo)',
      status: 'Operativo',
      detail: '28 ms latencia media de simulación',
      icon: Zap,
      statusColor: 'text-[#4ade80]',
      badgeColor: 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/20',
    },
    {
      name: 'Orquestación LangGraph',
      status: 'Activo',
      detail: '5 nodos de grafo en pipeline secuencial',
      icon: Activity,
      statusColor: 'text-[#45d6c4]',
      badgeColor: 'bg-[#45d6c4]/10 text-[#45d6c4] border-[#45d6c4]/20',
    },
    {
      name: 'Observabilidad Langfuse',
      status: 'Conectado',
      detail: 'Trazas, latencia y costos de inferencia',
      icon: Cpu,
      statusColor: 'text-[#c8793d]',
      badgeColor: 'bg-[#c8793d]/10 text-[#c8793d] border-[#c8793d]/20',
    },
    {
      name: 'Curador RL Policy',
      status: 'Convergente',
      detail: '94.5% aceptación en primera pasada',
      icon: RefreshCw,
      statusColor: 'text-[#a78bfa]',
      badgeColor: 'bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/20',
    },
    {
      name: 'Persistencia Neon Postgres',
      status: 'Sincronizado',
      detail: 'Drizzle ORM con drivers HTTP',
      icon: Database,
      statusColor: 'text-[#38bdf8]',
      badgeColor: 'bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/20',
    },
  ]

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--foreground)]">
            Estado del Sistema & Infraestructura
          </h3>
          <p className="m-0 text-xs text-[var(--muted-foreground)]">
            Monitoreo continuo de servicios y motores de simulación
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/60 px-2.5 py-1 text-[0.7rem] font-medium text-[var(--foreground)]">
          <span className="size-2 rounded-full bg-[#4ade80] animate-pulse" />
          Todos los sistemas operativos
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {services.map((svc) => {
          const Icon = svc.icon
          return (
            <div
              key={svc.name}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3 transition-colors hover:border-[var(--color-mint)]/30 hover:bg-[var(--muted)]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--color-mint)]">
                  <Icon size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)]">{svc.name}</div>
                  <div className="text-[0.7rem] text-[var(--muted-foreground)]">{svc.detail}</div>
                </div>
              </div>

              <span
                className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[0.68rem] font-medium ${svc.badgeColor}`}
              >
                <CheckCircle2 size={11} className={svc.statusColor} />
                {svc.status}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
