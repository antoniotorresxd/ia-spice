export type AuthMode = 'sign-in' | 'sign-up'

export type SocialProvider = 'google' | 'microsoft' | 'github'

export type AuthFormValues = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export type FieldErrors = Partial<Record<keyof AuthFormValues, string>>

export type AuthResult = { ok: true } | { ok: false; message: string }

export type AuthService = {
  signInWithEmail(input: Pick<AuthFormValues, 'email' | 'password'>): Promise<AuthResult>
  signUpWithEmail(input: Pick<AuthFormValues, 'name' | 'email' | 'password'>): Promise<AuthResult>
  signInWithProvider(provider: SocialProvider): Promise<AuthResult>
  signOut(): Promise<AuthResult>
}

export const EMPTY_AUTH_FORM: AuthFormValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}
