import { useState, type ChangeEvent, type FormEvent } from 'react'

import {
  EMPTY_AUTH_FORM,
  type AuthFormValues,
  type AuthMode,
  type AuthService,
  type FieldErrors,
  type SocialProvider,
} from '../model/auth-types'
import { validateAuthInput } from '../model/auth-validation'
import styles from './AuthForm.module.css'
import { SocialAuthButtons } from './SocialAuthButtons'

type AuthFormProps = {
  service: AuthService
}

type FieldName = keyof AuthFormValues

export function AuthForm({ service }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [values, setValues] = useState<AuthFormValues>({ ...EMPTY_AUTH_FORM })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)

  const updateField = (field: FieldName) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  const switchMode = (nextMode: AuthMode) => {
    if (pending || nextMode === mode) return

    setMode(nextMode)
    setValues({ ...EMPTY_AUTH_FORM })
    setErrors({})
    setFormError(null)
    setPending(false)
    setPasswordVisible(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    setFormError(null)
    const nextErrors = validateAuthInput(mode, values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      const result =
        mode === 'sign-in'
          ? await service.signInWithEmail({
              email: values.email,
              password: values.password,
            })
          : await service.signUpWithEmail({
              name: values.name,
              email: values.email,
              password: values.password,
            })

      if (!result.ok) setFormError(result.message)
    } finally {
      setPending(false)
    }
  }

  const submitProvider = async (provider: SocialProvider) => {
    if (pending) return

    setFormError(null)
    setPending(true)
    try {
      const result = await service.signInWithProvider(provider)
      if (!result.ok) setFormError(result.message)
    } finally {
      setPending(false)
    }
  }

  const describedBy = (field: FieldName) => (errors[field] ? `${field}-error` : undefined)

  return (
    <section aria-labelledby="auth-title" className={styles.root}>
      <h2 className={styles.title} id="auth-title">
        {mode === 'sign-in' ? 'Inicia sesión' : 'Crea tu cuenta'}
      </h2>
      <p className={styles.subtitle}>
        {mode === 'sign-in'
          ? 'Continúa diseñando con tu equipo de agentes.'
          : 'Crea tu espacio para diseñar y validar circuitos.'}
      </p>

      <SocialAuthButtons disabled={pending} onProvider={submitProvider} />

      <div className={styles.divider}>o continúa con tu correo</div>

      <form className={styles.form} noValidate onSubmit={submit}>
        {mode === 'sign-up' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Nombre
            </label>
            <input
              className={styles.input}
              id="name"
              name="name"
              autoComplete="name"
              value={values.name}
              onChange={updateField('name')}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy('name')}
            />
            {errors.name && (
              <p className={styles.fieldError} id="name-error">
                {errors.name}
              </p>
            )}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Correo electrónico
          </label>
          <input
            className={styles.input}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={updateField('email')}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy('email')}
          />
          {errors.email && (
            <p className={styles.fieldError} id="email-error">
              {errors.email}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Contraseña
          </label>
          <div className={styles.passwordControl}>
            <input
              className={styles.input}
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={values.password}
              onChange={updateField('password')}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('password')}
            />
            <button
              className={styles.passwordToggle}
              type="button"
              aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {errors.password && (
            <p className={styles.fieldError} id="password-error">
              {errors.password}
            </p>
          )}
        </div>

        {mode === 'sign-up' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirmar contraseña
            </label>
            <input
              className={styles.input}
              id="confirmPassword"
              name="confirmPassword"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={updateField('confirmPassword')}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={describedBy('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className={styles.fieldError} id="confirmPassword-error">
                {errors.confirmPassword}
              </p>
            )}
          </div>
        )}

        <button className={styles.submit} type="submit" disabled={pending}>
          {mode === 'sign-in' ? 'Iniciar sesión' : 'Crear cuenta'}
        </button>
      </form>

      {formError && (
        <p className={styles.status} role="status" aria-live="polite">
          {formError}
        </p>
      )}

      <div className={styles.modeSwitch}>
        <span>{mode === 'sign-in' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}</span>
        {mode === 'sign-in' ? (
          <button
            className={styles.modeButton}
            type="button"
            disabled={pending}
            onClick={() => switchMode('sign-up')}
          >
            Crear una cuenta
          </button>
        ) : (
          <button
            className={styles.modeButton}
            type="button"
            disabled={pending}
            onClick={() => switchMode('sign-in')}
          >
            Ya tengo una cuenta
          </button>
        )}
      </div>
    </section>
  )
}
