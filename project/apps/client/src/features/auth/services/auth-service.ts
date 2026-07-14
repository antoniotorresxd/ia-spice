import type {
  AuthFormValues,
  AuthResult,
  AuthService,
  SocialProvider,
} from '../model/auth-types'
import { authClient } from './auth-client'

type AuthClientResult = {
  error?: unknown
}

type EmailSignInInput = Pick<AuthFormValues, 'email' | 'password'>
type EmailSignUpInput = Pick<AuthFormValues, 'name' | 'email' | 'password'>

export type BetterAuthClientPort = {
  signIn: {
    email(input: EmailSignInInput): Promise<AuthClientResult>
    social(input: { provider: SocialProvider; callbackURL: string }): Promise<AuthClientResult>
  }
  signUp: {
    email(input: EmailSignUpInput): Promise<AuthClientResult>
  }
  signOut(): Promise<AuthClientResult>
}

const FAILURE_MESSAGES = {
  signIn: 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
  signUp: 'No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.',
  social:
    'Este proveedor no está disponible por el momento. Inténtalo de nuevo más tarde.',
  signOut: 'No pudimos cerrar sesión. Inténtalo de nuevo.',
} as const

async function runAuthOperation(
  operation: () => Promise<AuthClientResult>,
  failureMessage: string,
): Promise<AuthResult> {
  try {
    const result = await operation()

    return result.error ? { ok: false, message: failureMessage } : { ok: true }
  } catch {
    return { ok: false, message: failureMessage }
  }
}

export function createAuthService(client: BetterAuthClientPort): AuthService {
  return {
    signInWithEmail: (input) =>
      runAuthOperation(() => client.signIn.email(input), FAILURE_MESSAGES.signIn),
    signUpWithEmail: (input) =>
      runAuthOperation(() => client.signUp.email(input), FAILURE_MESSAGES.signUp),
    signInWithProvider: (provider) =>
      runAuthOperation(
        () => client.signIn.social({ provider, callbackURL: '/' }),
        FAILURE_MESSAGES.social,
      ),
    signOut: () => runAuthOperation(() => client.signOut(), FAILURE_MESSAGES.signOut),
  }
}

export const authService = createAuthService(authClient)
