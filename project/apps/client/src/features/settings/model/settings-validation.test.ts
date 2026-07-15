import { describe, expect, it } from 'vitest'

import { validateConnection } from './settings-validation'

describe('validateConnection', () => {
  it('requires a label', () => {
    expect(validateConnection({ label: '  ', provider: 'openai', apiKey: 'key', baseUrl: '' })).toEqual({ label: 'Ingresa un nombre.' })
  })

  it('requires a key for hosted providers', () => {
    expect(validateConnection({ label: 'Claude', provider: 'anthropic', apiKey: '', baseUrl: '' })).toEqual({ apiKey: 'Ingresa una API key.' })
  })

  it('allows an empty key when editing a connection that already has one', () => {
    expect(validateConnection({ label: 'Claude', provider: 'anthropic', apiKey: '', baseUrl: '' }, true)).toEqual({})
  })

  it('requires a base URL for OpenAI-compatible connections', () => {
    expect(validateConnection({ label: 'Ollama', provider: 'openai_compatible', apiKey: '', baseUrl: '' })).toEqual({ baseUrl: 'Ingresa la URL del servidor.' })
  })

  it('requires an HTTP(S) base URL for OpenAI-compatible connections', () => {
    expect(validateConnection({ label: 'Ollama', provider: 'openai_compatible', apiKey: '', baseUrl: 'ftp://localhost' })).toEqual({ baseUrl: 'Ingresa una URL http:// o https:// válida.' })
  })
})
