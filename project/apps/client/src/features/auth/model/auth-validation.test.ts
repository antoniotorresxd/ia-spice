import { describe, expect, it } from 'vitest'

import { EMPTY_AUTH_FORM } from './auth-types'
import { validateAuthInput } from './auth-validation'

describe('validateAuthInput', () => {
  it('reports an invalid email address', () => {
    const errors = validateAuthInput('sign-in', {
      ...EMPTY_AUTH_FORM,
      email: 'correo-invalido',
      password: 'password',
    })

    expect(errors.email).toBe('Ingresa un correo válido.')
  })

  it('reports a password shorter than eight characters', () => {
    const errors = validateAuthInput('sign-in', {
      ...EMPTY_AUTH_FORM,
      email: 'persona@example.com',
      password: '1234567',
    })

    expect(errors.password).toBe('Usa al menos 8 caracteres.')
  })

  it('reports a missing name in sign-up mode', () => {
    const errors = validateAuthInput('sign-up', {
      ...EMPTY_AUTH_FORM,
      email: 'persona@example.com',
      password: 'password',
      confirmPassword: 'password',
    })

    expect(errors.name).toBe('Ingresa tu nombre.')
  })

  it('reports a mismatched password confirmation in sign-up mode', () => {
    const errors = validateAuthInput('sign-up', {
      name: 'Persona',
      email: 'persona@example.com',
      password: 'password',
      confirmPassword: 'diferente',
    })

    expect(errors.confirmPassword).toBe('Las contraseñas no coinciden.')
  })

  it('returns no errors for a complete sign-up payload', () => {
    const errors = validateAuthInput('sign-up', {
      name: 'Persona',
      email: 'persona@example.com',
      password: 'password',
      confirmPassword: 'password',
    })

    expect(errors).toEqual({})
  })
})
