import type { ConnectionInput } from './settings-types'

export type ConnectionErrors = Partial<Record<keyof ConnectionInput, string>>

const hostedProviders = new Set(['openai', 'anthropic', 'google'])

export function validateConnection(
  input: ConnectionInput,
  hasExistingKey = false,
): ConnectionErrors {
  const errors: ConnectionErrors = {}

  if (!input.label.trim()) {
    errors.label = 'Ingresa un nombre.'
  }

  if (
    hostedProviders.has(input.provider) &&
    !input.apiKey.trim() &&
    !hasExistingKey
  ) {
    errors.apiKey = 'Ingresa una API key.'
  }

  if (input.provider === 'openai_compatible') {
    const baseUrl = input.baseUrl.trim()
    if (!baseUrl) {
      errors.baseUrl = 'Ingresa la URL del servidor.'
    } else {
      try {
        const url = new URL(baseUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.baseUrl = 'Ingresa una URL http:// o https:// válida.'
        }
      } catch {
        errors.baseUrl = 'Ingresa una URL http:// o https:// válida.'
      }
    }
  }

  return errors
}
