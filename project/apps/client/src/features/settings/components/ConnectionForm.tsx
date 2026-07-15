import { useRef, useState, type FormEvent, type RefObject } from 'react'

import { validateConnection, type ConnectionErrors } from '../model/settings-validation'
import type { ConnectionInput, LlmConnection, LlmProvider } from '../model/settings-types'

type ConnectionFormProps = {
  connection?: LlmConnection | null
  onCancel: () => void
  onSave: (input: ConnectionInput) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  nameInputRef?: RefObject<HTMLInputElement | null>
}

const providerLabels: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openai_compatible: 'OpenAI compatible',
}

export function ConnectionForm({ connection, nameInputRef, onCancel, onDirtyChange, onSave }: ConnectionFormProps) {
  const [label, setLabel] = useState(connection?.label ?? '')
  const [provider, setProvider] = useState<LlmProvider>(connection?.provider ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '')
  const [errors, setErrors] = useState<ConnectionErrors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const initial = useRef({ label: connection?.label ?? '', provider: connection?.provider ?? 'openai', apiKey: '', baseUrl: connection?.baseUrl ?? '' })

  function reportDirty(next: Partial<ConnectionInput>) {
    const current = { label, provider, apiKey, baseUrl, ...next }
    onDirtyChange?.(Object.entries(initial.current).some(([key, value]) => current[key as keyof ConnectionInput] !== value))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = { label: label.trim(), provider, apiKey, baseUrl: baseUrl.trim() }
    const validationErrors = validateConnection(input, Boolean(connection?.hasKey))
    setErrors(validationErrors)
    setSaveError('')
    if (Object.keys(validationErrors).length) return

    setSaving(true)
    try {
      await onSave(input)
      setApiKey('')
    } catch {
      setSaveError('No pudimos guardar la conexión. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        <span>Nombre</span>
        <input aria-invalid={Boolean(errors.label)} onChange={(event) => { setLabel(event.target.value); reportDirty({ label: event.target.value }) }} ref={nameInputRef} value={label} />
      </label>
      {errors.label ? <p>{errors.label}</p> : null}
      <label>
        <span>Provider</span>
        <select onChange={(event) => { const value = event.target.value as LlmProvider; setProvider(value); reportDirty({ provider: value }) }} value={provider}>
          {Object.entries(providerLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      <label>
        <span>API key</span>
        <input autoComplete="off" onChange={(event) => { setApiKey(event.target.value); reportDirty({ apiKey: event.target.value }) }} type="password" value={apiKey} />
      </label>
      {connection?.hasKey ? <p>Déjala vacía para conservar la actual.</p> : null}
      {errors.apiKey ? <p>{errors.apiKey}</p> : null}
      {provider === 'openai_compatible' ? (
        <>
          <label>
            <span>URL base</span>
            <input onChange={(event) => { setBaseUrl(event.target.value); reportDirty({ baseUrl: event.target.value }) }} type="url" value={baseUrl} />
          </label>
          {errors.baseUrl ? <p>{errors.baseUrl}</p> : null}
        </>
      ) : null}
      {saveError ? <p role="alert">{saveError}</p> : null}
      <div>
        <button onClick={onCancel} type="button">Cancelar</button>
        <button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar conexión'}</button>
      </div>
    </form>
  )
}
