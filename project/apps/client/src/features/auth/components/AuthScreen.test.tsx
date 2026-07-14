import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import type { AuthResult, AuthService } from '../model/auth-types'
import { AuthScreen } from './AuthScreen'

afterEach(cleanup)

it('composes the SPICE story, solution automaton, and authentication form', () => {
  const service: AuthService = {
    signInWithEmail: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signUpWithEmail: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signInWithProvider: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
    signOut: vi.fn(async (): Promise<AuthResult> => ({ ok: true })),
  }

  render(<AuthScreen service={service} />)

  expect(
    screen.getByRole('region', { name: 'Acceso a SPICE' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Orquestador')).toBeVisible()
  expect(screen.getByText('Curador')).toBeVisible()
  expect(screen.getByText('Aceptado')).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Inicia sesión' }),
  ).toBeVisible()
})
