import type { SocialProvider } from '../model/auth-types'
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
    <div>
      {PROVIDERS.map(({ provider, label }) => (
        <button
          key={provider}
          type="button"
          disabled={disabled}
          onClick={() => void onProvider(provider)}
        >
          <ProviderIcon provider={provider} />
          Continuar con {label}
        </button>
      ))}
    </div>
  )
}
