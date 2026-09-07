import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertCircle, Camera, Check, Mail, ShieldCheck, Sparkles, User } from 'lucide-react'

import type { UserProfile } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { SettingsShell } from './SettingsShell'
import styles from './ProfileSettingsScreen.module.css'

type ProfileSettingsScreenProps = {
  service: SettingsService
  onSignOut?: () => Promise<void>
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
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
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const selectedAvatarRef = useRef<File | null>(null)

  useEffect(() => {
    let current = true
    service
      .getProfile()
      .then((profile) => {
        if (!current) return
        setSaved(profile)
        setName(profile.name)
        setAvatarUrl(profile.avatarUrl)
        setLoadError(false)
      })
      .catch(() => {
        if (current) setLoadError(true)
      })
    return () => {
      current = false
    }
  }, [retryKey, service])

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
    selectedAvatarRef.current = file
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
      const durableAvatarInput = selectedAvatarRef.current
        ? await readFileAsDataUrl(selectedAvatarRef.current)
        : saved?.avatarUrl ?? null
      const updated = await service.updateProfile({
        name: trimmedName,
        avatarUrl: durableAvatarInput,
      })
      const durableAvatarUrl = updated.avatarUrl?.startsWith('blob:')
        ? saved?.avatarUrl ?? null
        : updated.avatarUrl
      const durableProfile = { ...updated, avatarUrl: durableAvatarUrl }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      selectedAvatarRef.current = null
      setSaved(durableProfile)
      setName(updated.name)
      setAvatarUrl(durableAvatarUrl)
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
    selectedAvatarRef.current = null
    setName(saved.name)
    setAvatarUrl(saved.avatarUrl)
    setError('')
    setMessage('Cambios descartados.')
  }

  return (
    <SettingsShell
      onSignOut={onSignOut}
      userEmail={saved?.email ?? ''}
      userName={saved?.name ?? 'Cuenta'}
    >
      {!saved ? (
        <section className={styles.loadState}>
          {loadError ? (
            <>
              <p role="alert">No pudimos cargar tu perfil. Inténtalo de nuevo.</p>
              <button className={styles.retryBtn} onClick={() => setRetryKey((value) => value + 1)} type="button">
                Reintentar
              </button>
            </>
          ) : (
            <p aria-busy="true">Cargando perfil…</p>
          )}
        </section>
      ) : (
        <div className={styles.container}>
          <header className={styles.pageHeader}>
            <p className={styles.eyebrow}>Cuenta personal</p>
            <div className={styles.titleRow}>
              <h1>Tu perfil</h1>
              <strong className={styles.demoBadge}>
                <Sparkles size={12} />
                Datos de demostración
              </strong>
            </div>
            <span className={styles.subtitle}>Actualiza cómo apareces en el ecosistema.</span>
          </header>

          {/* Hero Profile Card */}
          <div className={styles.heroCard}>
            <div className={styles.heroBanner} />
            <div className={styles.heroContent}>
              <div className={styles.heroIdentity}>
                <div className={styles.avatarWrapper}>
                  {avatarUrl ? (
                    <img alt="Vista previa del avatar" className={styles.avatarImg} src={avatarUrl} />
                  ) : (
                    <span aria-hidden="true" className={styles.avatarFallback}>
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className={styles.heroDetails}>
                  <h2 className={styles.heroName}>{name || 'Sin nombre'}</h2>
                  <div className={styles.heroEmailRow}>
                    <span>{saved.email}</span>
                    <span className={styles.verifiedBadge}>
                      <ShieldCheck size={13} />
                      Verificado
                    </span>
                  </div>
                </div>
              </div>
              <label className={styles.heroUploadBtn}>
                <Camera size={14} />
                <span>Cambiar avatar</span>
                <input
                  accept="image/*"
                  className={styles.fileInputHidden}
                  disabled={isSaving}
                  onChange={selectAvatar}
                  type="file"
                />
              </label>
            </div>
          </div>

          <form onSubmit={save}>
            <div className={styles.settingsCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconBadge}>
                  <User size={18} />
                </div>
                <div className={styles.cardHeaderTitle}>
                  <h2>Información personal</h2>
                  <p>Tu nombre público visible en solicitudes y ejecuciones.</p>
                </div>
              </div>

              <div className={styles.fieldsGrid}>
                <div className={styles.inputGroup}>
                  <label htmlFor="profile-name">Nombre</label>
                  <div className={styles.inputWrapper}>
                    <User className={styles.inputIcon} size={16} />
                    <input
                      className={styles.inputControl}
                      disabled={isSaving}
                      id="profile-name"
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Tu nombre completo"
                      value={name}
                    />
                  </div>
                  <p className={styles.fieldHint}>Visible para tus colaboradores en el ecosistema multiagente.</p>
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="profile-email">Correo electrónico</label>
                  <div className={styles.inputWrapper}>
                    <Mail className={styles.inputIcon} size={16} />
                    <input
                      className={styles.inputControl}
                      disabled
                      id="profile-email"
                      type="email"
                      value={saved.email}
                    />
                  </div>
                  <p className={styles.fieldHint}>El correo está vinculado a tu cuenta y no puede modificarse.</p>
                </div>
              </div>
            </div>

            {error ? (
              <div className={styles.alertError} role="alert" style={{ marginTop: '1rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {message ? (
              <div className={styles.alertSuccess} role="status" style={{ marginTop: '1rem' }}>
                <Check size={16} />
                <span>{message}</span>
              </div>
            ) : null}

            <div className={styles.actionsBar} style={{ marginTop: '1.25rem' }}>
              <button
                className={styles.discardBtn}
                disabled={isSaving}
                onClick={discard}
                type="button"
              >
                Descartar
              </button>
              <button
                className={styles.saveBtn}
                disabled={isSaving}
                type="submit"
              >
                <Check size={15} />
                <span>{isSaving ? 'Guardando…' : 'Guardar cambios'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </SettingsShell>
  )
}
