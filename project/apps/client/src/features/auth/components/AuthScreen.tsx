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
      <div
        aria-hidden="true"
        className={`${styles.aurora} ${styles.auroraMint}`}
      />
      <div
        aria-hidden="true"
        className={`${styles.aurora} ${styles.auroraViolet}`}
      />
      <div
        aria-hidden="true"
        className={`${styles.aurora} ${styles.auroraBlue}`}
      />

      <section aria-label="Acceso a SPICE" className={styles.surface}>
        <aside className={styles.story}>
          <div className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark}>
              S
            </span>
            <span>SPICE</span>
          </div>

          <header className={styles.storyHeader}>
            <p className={styles.eyebrow}>Diseño de circuitos asistido por agentes</p>
            <h1 className={styles.headline}>De una idea a una solución verificable.</h1>
            <p className={styles.lede}>
              Orquesta, calcula y valida cada decisión antes de llevar tu
              circuito al mundo real.
            </p>
          </header>

          <div className={styles.automatonBlock}>
            <p className={styles.automatonLabel}>Ruta de solución</p>
            <SolutionAutomaton />
          </div>

          <footer className={styles.storyFooter}>
            <span>7 estados</span>
            <span>8 transiciones</span>
            <span>Validación iterativa</span>
          </footer>
        </aside>

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
