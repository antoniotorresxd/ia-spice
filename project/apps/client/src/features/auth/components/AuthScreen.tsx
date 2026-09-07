import { ThemeToggle } from '@/components/ui/theme-toggle'
import { GalaxyBackground } from '@/components/ui/GalaxyBackground'
import { SolutionAutomaton } from '../../../components/automaton/SolutionAutomaton'
import type { AuthService } from '../model/auth-types'
import { AuthForm } from './AuthForm'
import styles from './AuthScreen.module.css'

type AuthScreenProps = {
  service: AuthService
}

export function AuthScreen({ service }: AuthScreenProps) {
  return (
    <main className={styles.page}>
      {/* Interactive 3D/physics galaxy starfield background */}
      <GalaxyBackground />

      <div className={styles.themeToggle}>
        <ThemeToggle />
      </div>

      <section aria-label="Acceso a SPICE" className={styles.surface}>
        {/* Left column: Story & Interactive Agent Circuit */}
        <aside className={styles.story}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark}>
              ⚡
            </span>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>SPICE</span>
              <span className={styles.brandSubtitle}>Ecosistema Multiagente</span>
            </div>
          </div>

          <header className={styles.storyHeader}>
            <div className={styles.storyBadge}>
              <span aria-hidden="true" className={styles.pulseDot} />
              <span>Simulación & Síntesis de Circuitos</span>
            </div>
            <p className={styles.eyebrow}>Diseño de circuitos asistido por agentes</p>
            <h1 className={styles.headline}>
              De una idea a una solución <span className={styles.headlineAccent}>verificable</span>.
            </h1>
            <p className={styles.lede}>
              Orquesta modelos analíticos, sintetiza netlists y valida cada parámetro de tu
              circuito antes de comprometer silicio o PCB.
            </p>
          </header>

          <div className={styles.automatonBlock}>
            <div className={styles.automatonHeader}>
              <p className={styles.automatonLabel}>Ruta de solución autónoma</p>
              <span className={styles.automatonStatusChip}>Loop Activo</span>
            </div>
            <SolutionAutomaton />
          </div>

          <footer className={styles.storyFooter}>
            <span className={styles.footerChip}>
              <span className={styles.chipDot} />
              Simulación ngspice nativa
            </span>
            <span className={styles.footerChip}>
              <span className={styles.chipDot} />
              4 Agentes cooperativos
            </span>
            <span className={styles.footerChip}>
              <span className={styles.chipDot} />
              Validación iterativa
            </span>
          </footer>
        </aside>

        {/* Right column: Elevated Auth Card */}
        <section aria-label="Autenticación" className={styles.formPanel}>
          <div className={styles.formFrame}>
            <AuthForm service={service} />
            <p className={styles.legal}>
              Al continuar, aceptas nuestros{' '}
              <span className={styles.legalLink}>Términos de servicio</span> y{' '}
              <span className={styles.legalLink}>Política de privacidad</span>.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}
