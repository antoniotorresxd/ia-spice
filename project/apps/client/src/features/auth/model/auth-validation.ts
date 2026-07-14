import type { AuthFormValues, AuthMode, FieldErrors } from './auth-types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAuthInput(mode: AuthMode, values: AuthFormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (mode === 'sign-up' && !values.name.trim()) {
    errors.name = 'Ingresa tu nombre.'
  }

  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Ingresa un correo válido.'
  }

  if (values.password.length < 8) {
    errors.password = 'Usa al menos 8 caracteres.'
  }

  if (mode === 'sign-up' && values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.'
  }

  return errors
}
