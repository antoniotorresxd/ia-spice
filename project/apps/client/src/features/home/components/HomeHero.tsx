import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  HeroStaticRadialGradientRoot,
  HeroStaticRadialGradientContainer,
  HeroStaticRadialGradientContent,
  HeroStaticRadialGradientHeading,
  HeroStaticRadialGradientDescription,
  HeroStaticRadialGradientActions,
  HeroStaticRadialGradientVisual,
  HeroStaticRadialGradientMobileVisual,
} from '@/components/ui/hero-static-radial-gradient'
import { cn } from '@/lib/utils'

type HomeHeroProps = {
  userName: string
  onNewRequest: () => void
}

export function HomeHero({ userName, onNewRequest }: HomeHeroProps) {
  return (
    <HeroStaticRadialGradientRoot
      className="mb-8"
      title={`Buenos días, ${userName}`}
      description="Revisa tu actividad o inicia una nueva solicitud desde lenguaje natural."
    >
      <HeroStaticRadialGradientContainer>
        <HeroStaticRadialGradientContent>
          <p className="m-0 flex items-center gap-2 text-[0.65rem] font-semibold tracking-[0.18em] text-[var(--color-mint)] uppercase">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            Workspace personal
          </p>
          <HeroStaticRadialGradientHeading />
          <HeroStaticRadialGradientDescription />
          <HeroStaticRadialGradientActions>
            <Button
              className="h-11 px-5 text-sm motion-reduce:transition-none max-[420px]:w-full"
              onClick={onNewRequest}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Nueva solicitud
            </Button>
            <Link
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-11 border-border bg-card/80 px-5 text-sm text-foreground shadow-none hover:border-[var(--color-border-hover)] hover:bg-accent motion-reduce:transition-none max-[420px]:w-full',
              )}
              to="/projects"
            >
              Ver proyectos
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </HeroStaticRadialGradientActions>
        </HeroStaticRadialGradientContent>
        <HeroStaticRadialGradientVisual />
      </HeroStaticRadialGradientContainer>
      <HeroStaticRadialGradientMobileVisual />
    </HeroStaticRadialGradientRoot>
  )
}
