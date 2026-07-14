import type { SocialProvider } from '../model/auth-types'
import styles from './AuthForm.module.css'
import { ProviderIcon } from './ProviderIcon'

type SocialAuthButtonsProps = {
  disabled: boolean
  onProvider: (provider: SocialProvider) => void | Promise<void>
}

const PROVIDERS: { provider: SocialProvider; label: string }[] = [
  { provider: 'google', label: 'Google' },
  { provider: 'microsoft', label: 'Microsoft' },
  { provider: 'github', label: 'GitHub' },
]

export function SocialAuthButtons({ disabled, onProvider }: SocialAuthButtonsProps) {
  return (
    <div className={styles.socialButtons}>
      {PROVIDERS.map(({ provider, label }) => (
        <button
          aria-label={`Continuar con ${label}`}
          className={styles.providerButton}
          key={provider}
          type="button"
          disabled={disabled}
          onClick={() => void onProvider(provider)}
        >
          <ProviderIcon provider={provider} />
          <span className={styles.providerName}>Continuar con {label}</span>
        </button>
      ))}
    </div>
  )
}
