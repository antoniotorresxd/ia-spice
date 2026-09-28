import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

type HomeHeroProps = {
  userName: string
  onNewRequest: () => void
}

export function HomeHero({ userName, onNewRequest }: HomeHeroProps) {
  const greeting = getGreeting()

  return (
    <header className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[var(--card)] via-[var(--card)]/80 to-[var(--card)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xs sm:flex-row sm:items-center">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/60 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--color-mint)] uppercase">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#4ade80] animate-pulse" />
            Telemetría activa
          </span>
          <span className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 text-[0.65rem] text-[var(--muted-foreground)]">
            SPICE v1.0
          </span>
        </div>
        <h1 className="m-0 text-xl font-bold tracking-tight text-[var(--foreground)] sm:text-2xl">
          {greeting}, {userName}
        </h1>
        <p className="m-0 text-xs text-[var(--muted-foreground)] sm:text-sm">
          Centro de control, telemetría y observabilidad del pipeline de agentes y simulación SPICE.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
        <Link
          className={cn(
            buttonVariants(),
            'h-9 px-3.5 text-xs font-semibold shadow-xs motion-reduce:transition-none max-[420px]:w-full',
          )}
          to="/new"
          onClick={onNewRequest}
        >
          <Plus aria-hidden="true" size={14} />
          Nueva solicitud
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-9 border-border bg-card/80 px-3.5 text-xs font-medium text-foreground shadow-none hover:border-[var(--color-border-hover)] hover:bg-accent motion-reduce:transition-none max-[420px]:w-full',
          )}
          to="/projects"
        >
          Ver proyectos
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
    </header>
  )
}

