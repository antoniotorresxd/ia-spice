import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import type { UserProfile } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { SettingsShell } from './SettingsShell'
import styles from './SettingsShell.module.css'

type ProfileSettingsScreenProps = {
  service: SettingsService
  onSignOut?: () => Promise<void>
}

export function ProfileSettingsScreen({
  service,
  onSignOut = async () => {},
}: ProfileSettingsScreenProps) {
  const [saved, setSaved] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let current = true
    service
      .getProfile()
      .then((profile) => {
        if (!current) return
        setSaved(profile)
        setName(profile.name)
        setAvatarUrl(profile.avatarUrl)
      })
      .catch(() => {
        if (current) setError('No pudimos cargar tu perfil. Inténtalo de nuevo.')
      })
    return () => {
      current = false
    }
  }, [service])

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setAvatarUrl(previewUrl)
    setMessage('')
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    setMessage('')
    if (!trimmedName) {
      setError('Ingresa tu nombre.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      const updated = await service.updateProfile({
        name: trimmedName,
        avatarUrl,
      })
      setSaved(updated)
      setName(updated.name)
      setAvatarUrl(updated.avatarUrl)
      setMessage('Tus cambios se guardaron.')
    } catch {
      setError('No pudimos guardar tus cambios. Inténtalo de nuevo.')
    } finally {
      setIsSaving(false)
    }
  }

  function discard() {
    if (!saved) return
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setName(saved.name)
    setAvatarUrl(saved.avatarUrl)
    setError('')
    setMessage('Cambios descartados.')
  }

  if (!saved) {
    return error ? <p role="alert">{error}</p> : <p aria-busy="true">Cargando perfil…</p>
  }

  return (
    <SettingsShell
      onSignOut={onSignOut}
      userEmail={saved.email}
      userName={saved.name}
    >
      <header className={styles.pageHeader}>
        <p>Cuenta personal</p>
        <h1>Tu perfil</h1>
        <span>Actualiza cómo apareces en el ecosistema.</span>
      </header>
      <form className={styles.form} onSubmit={save}>
        <section className={styles.avatarSection}>
          <div>
            <h2>Imagen de perfil</h2>
            <p>Usa una imagen clara para identificar tu cuenta.</p>
          </div>
          <div className={styles.avatarControl}>
            {avatarUrl ? (
              <img alt="Vista previa del avatar" src={avatarUrl} />
            ) : (
              <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
            )}
            <label>
              Cambiar avatar
              <input accept="image/*" onChange={selectAvatar} type="file" />
            </label>
          </div>
        </section>
        <section className={styles.fields}>
          <label>
            <span>Nombre</span>
            <input onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label>
            <span>Correo electrónico</span>
            <input disabled type="email" value={saved.email} />
          </label>
        </section>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {message ? <p className={styles.status} role="status">{message}</p> : null}
        <div className={styles.actions}>
          <button onClick={discard} type="button">Descartar</button>
          <button disabled={isSaving} type="submit">
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </SettingsShell>
  )
}
