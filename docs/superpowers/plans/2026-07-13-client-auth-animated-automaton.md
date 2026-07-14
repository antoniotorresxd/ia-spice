# Client Authentication with Animated Automaton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite starter with an accessible authentication experience supporting email/password and three social providers while presenting the complete multi-agent solution as an animated finite-state automaton.

**Architecture:** Keep Better Auth behind an `AuthService` adapter and preserve the existing Hono RPC client as the separate typed API boundary. Compose focused React components with CSS Modules; drive the automaton from a declarative model and timeline so rendering, motion, and reduced-motion behavior remain independently testable.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Better Auth 1.6, Hono RPC, CSS Modules, Vitest, Testing Library, jsdom.

## Global Constraints

- Work only in `project/apps/client` except for root workspace installation and this plan.
- Preserve concurrent monorepo work: `project/package.json`, `src/lib/rpc.ts`, the `server` workspace dependency, and the Vite `/api` proxy.
- Better Auth handles `/api/auth/*`; Hono RPC handles typed application APIs.
- React components never call `fetch` directly.
- Do not configure OAuth secrets or modify the server in this slice.
- Keep Google, Microsoft, GitHub, and email/password visible and accessible.
- Passwords require at least eight characters; sessions remain in Better Auth cookies, never `localStorage`.
- Support WCAG AA, keyboard navigation, visible focus, `aria-live`, and `prefers-reduced-motion`.
- Show `Inicio â†’ Orquestador â†’ CÃ¡lculo â†’ SÃ­ntesis â†’ Curador`, the `adjust` loop, and Aceptado/Rechazado terminals.
- Commands run from `project/` unless stated otherwise.

---

## File Structure

- `src/features/auth/model/auth-types.ts`: UI/service contracts.
- `src/features/auth/model/auth-validation.ts`: pure form validation.
- `src/features/auth/services/auth-client.ts`: Better Auth React client.
- `src/features/auth/services/auth-service.ts`: safe domain adapter.
- `src/features/auth/components/AuthForm.tsx`: form state and submission.
- `src/features/auth/components/SocialAuthButtons.tsx`: provider actions.
- `src/features/auth/components/ProviderIcon.tsx`: inline SVG provider marks.
- `src/features/auth/components/AuthScreen.tsx`: approved F3A composition.
- `src/features/auth/components/AuthScreen.module.css`: layout and form visuals.
- `src/components/automaton/automaton-model.ts`: topology and timeline.
- `src/components/automaton/SolutionAutomaton.tsx`: animated semantic SVG.
- `src/components/automaton/SolutionAutomaton.module.css`: diagram styling/motion.
- `src/styles/tokens.css`: product tokens.
- `src/styles/globals.css`: reset, viewport, focus, reduced motion.
- `src/test/setup.ts`, `vitest.config.ts`: test environment.
- Co-located `*.test.ts(x)` files: validation, adapter, automaton, form, and app gate tests.

---

### Task 1: Test foundation and authentication contracts

**Files:**
- Modify: `project/apps/client/package.json`
- Create: `project/apps/client/vitest.config.ts`
- Create: `project/apps/client/src/test/setup.ts`
- Create: `project/apps/client/src/features/auth/model/auth-types.ts`
- Create: `project/apps/client/src/features/auth/model/auth-validation.ts`
- Test: `project/apps/client/src/features/auth/model/auth-validation.test.ts`

**Interfaces:**
- Produces: `AuthMode`, `SocialProvider`, `AuthFormValues`, `FieldErrors`, `AuthResult`, `AuthService`, `EMPTY_AUTH_FORM`, `validateAuthInput`.
- Consumes: no feature code.

- [ ] **Step 1: Add direct runtime and test dependencies**

Add `better-auth: ^1.6.23`, scripts `test: vitest run` and `test:watch: vitest`, plus `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom`. Preserve every monorepo dependency.

- [ ] **Step 2: Install from the workspace root**

Run: `bun install`

Expected: Bun updates `project/bun.lock` and links the `server` workspace.

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: true },
})
```

Create `src/test/setup.ts` importing `@testing-library/jest-dom/vitest` and installing a writable `window.matchMedia` shim whose `matches` defaults to `false` and whose listener methods are no-ops.

- [ ] **Step 4: Define exact domain contracts**

```ts
export type AuthMode = 'sign-in' | 'sign-up'
export type SocialProvider = 'google' | 'microsoft' | 'github'
export type AuthFormValues = { name: string; email: string; password: string; confirmPassword: string }
export type FieldErrors = Partial<Record<keyof AuthFormValues, string>>
export type AuthResult = { ok: true } | { ok: false; message: string }
export type AuthService = {
  signInWithEmail(input: Pick<AuthFormValues, 'email' | 'password'>): Promise<AuthResult>
  signUpWithEmail(input: Pick<AuthFormValues, 'name' | 'email' | 'password'>): Promise<AuthResult>
  signInWithProvider(provider: SocialProvider): Promise<AuthResult>
  signOut(): Promise<AuthResult>
}
export const EMPTY_AUTH_FORM: AuthFormValues = { name: '', email: '', password: '', confirmPassword: '' }
```

- [ ] **Step 5: Write failing validation tests**

Assert invalid email â†’ `Ingresa un correo vÃ¡lido.`, password shorter than eight â†’ `Usa al menos 8 caracteres.`, missing sign-up name â†’ `Ingresa tu nombre.`, mismatched confirmation â†’ `Las contraseÃ±as no coinciden.`, and a complete payload â†’ `{}`.

- [ ] **Step 6: Verify the red state**

Run: `bun --cwd apps/client test -- src/features/auth/model/auth-validation.test.ts`

Expected: FAIL because `auth-validation.ts` does not exist.

- [ ] **Step 7: Implement validation**

Use `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, trim name/email, enforce `password.length >= 8`, and validate confirmation only in `sign-up` mode. Return `FieldErrors`; do not throw.

- [ ] **Step 8: Verify and commit**

Run the focused test; expected PASS. Commit only the manifest, lockfile, Vitest setup, and auth model files with `test(client): add auth validation foundation`.

---

### Task 2: Better Auth service adapter

**Files:**
- Create: `project/apps/client/src/features/auth/services/auth-client.ts`
- Create: `project/apps/client/src/features/auth/services/auth-service.ts`
- Test: `project/apps/client/src/features/auth/services/auth-service.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces: `authClient`, `createAuthService(client)`, and `authService`.

- [ ] **Step 1: Write failing adapter tests**

Use a narrow fake with `signIn.email`, `signIn.social`, `signUp.email`, and `signOut`. Assert:

```ts
await service.signInWithEmail({ email: 'ada@example.com', password: 'password123' })
expect(client.signIn.email).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123' })

await service.signInWithProvider('github')
expect(client.signIn.social).toHaveBeenCalledWith({ provider: 'github', callbackURL: '/' })
```

Also return `{ error: { code: 'INVALID_EMAIL_OR_PASSWORD' } }` and assert the safe message `No pudimos iniciar sesiÃ³n. Revisa tus datos e intÃ©ntalo de nuevo.` rather than raw server data.

- [ ] **Step 2: Verify the red state**

Run: `bun --cwd apps/client test -- src/features/auth/services/auth-service.test.ts`

Expected: FAIL because `auth-service.ts` does not exist.

- [ ] **Step 3: Create the React client**

```ts
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient()
```

Do not hardcode port 3001; the Vite proxy keeps `/api/auth/*` same-origin.

- [ ] **Step 4: Implement the adapter**

Define a structural `BetterAuthClientPort` containing only the four methods used. Map:

```ts
signInWithEmail(input) => client.signIn.email(input)
signUpWithEmail(input) => client.signUp.email(input)
signInWithProvider(provider) => client.signIn.social({ provider, callbackURL: '/' })
signOut() => client.signOut()
```

Return `{ ok: true }` without an error. Use safe Spanish messages for sign-in, sign-up, social-provider unavailable, and sign-out failures. Export `authService = createAuthService(authClient)`.

- [ ] **Step 5: Verify and commit**

Run the adapter test; expected PASS. Commit the two service files and test with `feat(client): add Better Auth service adapter`.

---

### Task 3: Declarative animated automaton

**Files:**
- Create: `project/apps/client/src/components/automaton/automaton-model.ts`
- Create: `project/apps/client/src/components/automaton/SolutionAutomaton.tsx`
- Create: `project/apps/client/src/components/automaton/SolutionAutomaton.module.css`
- Test: `project/apps/client/src/components/automaton/SolutionAutomaton.test.tsx`

**Interfaces:**
- Produces: `AUTOMATON_STATES`, `AUTOMATON_EDGES`, `AUTOMATON_TIMELINE`, and `<SolutionAutomaton stepDurationMs?: number />`.
- Consumes: `matchMedia('(prefers-reduced-motion: reduce)')`.

- [ ] **Step 1: Write failing component tests**

Use fake timers. Assert visible labels for Inicio, Orquestador, CÃ¡lculo, SÃ­ntesis, Curador, Aceptado, Rechazado. Assert active progression:

```tsx
render(<SolutionAutomaton stepDurationMs={100} />)
expect(screen.getByTestId('state-orchestrator')).toHaveAttribute('data-active', 'true')
act(() => vi.advanceTimersByTime(300))
expect(screen.getByTestId('state-curator')).toHaveAttribute('data-active', 'true')
act(() => vi.advanceTimersByTime(100))
expect(screen.getByTestId('edge-adjust')).toHaveAttribute('data-active', 'true')
act(() => vi.advanceTimersByTime(300))
expect(screen.getByTestId('state-accepted')).toHaveAttribute('data-active', 'true')
```

Add a reduced-motion test whose custom `matchMedia` returns `matches: true`; advancing timers must not change the active state.

- [ ] **Step 2: Verify the red state**

Run: `bun --cwd apps/client test -- src/components/automaton/SolutionAutomaton.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Define the topology once**

State IDs are `start | orchestrator | calculation | synthesis | curator | accepted | rejected`. Each state has Spanish label, uppercase caption, SVG coordinates, and tone. Edges are `entry`, `valid`, `values`, `metrics`, `adjust`, `accept`, `reject`, `invalid`; each stores from/to, label, and SVG path.

Use this exact demo timeline:

```ts
export const AUTOMATON_TIMELINE = [
  { state: 'orchestrator', edge: 'entry' },
  { state: 'calculation', edge: 'valid' },
  { state: 'synthesis', edge: 'values' },
  { state: 'curator', edge: 'metrics' },
  { state: 'synthesis', edge: 'adjust' },
  { state: 'curator', edge: 'metrics' },
  { state: 'accepted', edge: 'accept' },
  { state: 'accepted', edge: null },
] as const
```

- [ ] **Step 4: Implement semantic SVG and controller**

Initialize at index 0; one interval advances modulo the timeline at `stepDurationMs ?? 1400`. Do not start it for reduced motion. Map model arrays rather than duplicating topology in JSX. Expose `data-testid="state-${id}"`, `data-testid="edge-${id}"`, and `data-active`. Include SVG `<title>` and `<desc>`.

- [ ] **Step 5: Implement motion styling**

Active paths animate a directional dash/indicator; active nodes receive controlled border/glow. Mint marks the main route, violet marks Curador/adjust, gray marks inactive/reject. Accepted gets a terminal double-ring. At 320px SVG text remains legible. `prefers-reduced-motion` removes every animation/transition while leaving a useful static path.

- [ ] **Step 6: Verify and commit**

Run the focused automaton test; expected PASS. Commit the automaton directory with `feat(client): add animated solution automaton`.

---

### Task 4: Accessible sign-in and sign-up form

**Files:**
- Create: `project/apps/client/src/features/auth/components/ProviderIcon.tsx`
- Create: `project/apps/client/src/features/auth/components/SocialAuthButtons.tsx`
- Create: `project/apps/client/src/features/auth/components/AuthForm.tsx`
- Test: `project/apps/client/src/features/auth/components/AuthForm.test.tsx`

**Interfaces:**
- Consumes: Task 1 contracts/validation and Task 2 `AuthService` implementation.
- Produces: `<AuthForm service: AuthService />`.

- [ ] **Step 1: Write failing behavior tests**

With `userEvent` and a fake service, test: valid sign-in submits once; sign-up reveals/validates name and confirmation; `Continuar con GitHub` calls provider `github`; a failed result appears in an `aria-live` region; and a pending promise disables all submission actions.

The email assertion is exact:

```ts
expect(service.signInWithEmail).toHaveBeenCalledWith({
  email: 'ada@example.com',
  password: 'password123',
})
```

- [ ] **Step 2: Verify the red state**

Run: `bun --cwd apps/client test -- src/features/auth/components/AuthForm.test.tsx`

Expected: FAIL because `AuthForm` does not exist.

- [ ] **Step 3: Implement provider controls**

`ProviderIcon` renders inline SVG marks for Google, Microsoft, and GitHub with `aria-hidden="true"`; production must not use letters or ambiguous Unicode. `SocialAuthButtons` accepts `{ disabled, onProvider }` and renders real buttons named `Continuar con Google`, `Continuar con Microsoft`, and `Continuar con GitHub`.

- [ ] **Step 4: Implement form state**

Own `mode`, `values`, `errors`, `formError`, `pending`, and `passwordVisible`. Submit in this order: clear global error, validate, set pending, call the mode-specific service with only allowed fields, place failure in `role="status" aria-live="polite"`, clear pending in `finally`. Mode switching resets all form state. Inputs use real labels, `aria-invalid`, and `aria-describedby`. Visibility button names toggle between `Mostrar contraseÃ±a` and `Ocultar contraseÃ±a`.

- [ ] **Step 5: Verify and commit**

Run the five focused tests; expected PASS. Commit the components/test with `feat(client): add accessible authentication form`.

---

### Task 5: F3A composition and responsive styling

**Files:**
- Create: `project/apps/client/src/features/auth/components/AuthScreen.tsx`
- Create: `project/apps/client/src/features/auth/components/AuthScreen.module.css`
- Create: `project/apps/client/src/styles/tokens.css`
- Create: `project/apps/client/src/styles/globals.css`
- Modify: `project/apps/client/src/index.css`
- Modify: `project/apps/client/src/App.css`

**Interfaces:**
- Consumes: `<SolutionAutomaton />`, `<AuthForm service />`, `AuthService`.
- Produces: `<AuthScreen service: AuthService />`.

- [ ] **Step 1: Add product tokens and reset**

Use these anchor tokens:

```css
:root {
  --color-bg: #08090c;
  --color-surface: #15171b;
  --color-surface-strong: #101216;
  --color-border: rgba(255, 255, 255, 0.1);
  --color-text: #f3f4f4;
  --color-text-muted: #7e8587;
  --color-mint: #72e2c6;
  --color-violet: #9b8cff;
  --radius-control: 0.5rem;
  --radius-panel: 1.25rem;
  --shadow-panel: 0 2.25rem 6rem rgba(0, 0, 0, 0.62);
  --duration-fast: 180ms;
  --duration-automaton: 1400ms;
}
```

Globals set box sizing, zero body margin, system font, dark color scheme, `100dvh`, selection and focus-visible styles, and reduced motion. `index.css` only imports `tokens.css` and `globals.css`; remove all Vite starter rules from `App.css`.

- [ ] **Step 2: Compose the approved screen**

`AuthScreen` renders one `<main>`, decorative auroras, one outer `<section aria-label="Acceso a SPICE">`, a story `<aside>` containing local brand/headline/automaton/footer, one form section containing `AuthForm`, and legal text. The automaton is the only high-information card in the story panel.

- [ ] **Step 3: Implement F3A styling**

Desktop uses one outer border/radius, one internal divider, and columns `minmax(0, 1.08fr) minmax(22rem, 0.92fr)`. Add mint/violet/blue CSS-gradient auroras, restrained glass blur, grain from CSS/SVG data texture, 44px controls, and non-layout-shifting hover/focus. Below 860px, form appears first and story second. Below 560px, reduce outer margins/radius, show provider names, and prevent overflow at 320px. Reduced motion stops auroras and transforms but retains color/depth.

- [ ] **Step 4: Run client checks**

Run:

```bash
bun --cwd apps/client test
bun --cwd apps/client run lint
bun --cwd apps/client run build
```

Expected: all tests PASS; lint and build exit 0.

- [ ] **Step 5: Commit the composition**

Commit AuthScreen, its CSS Module, styles, `index.css`, and `App.css` with `feat(client): build F3A authentication experience`.

---

### Task 6: Session gate and final verification

**Files:**
- Modify: `project/apps/client/src/App.tsx`
- Test: `project/apps/client/src/App.test.tsx`
- Verify only: `project/apps/client/src/lib/rpc.ts`

**Interfaces:**
- Consumes: `authClient.useSession()`, `authService`, `<AuthScreen />`.
- Produces: root loading, unauthenticated, and authenticated states.

- [ ] **Step 1: Write failing app-gate tests**

Mock the session boundary. Test: pending shows `Preparando tu espacioâ€¦`; no session shows AuthScreen; a session shows `SesiÃ³n activa`, user name, and `Cerrar sesiÃ³n`. Do not test or build a dashboard.

- [ ] **Step 2: Verify the red state**

Run: `bun --cwd apps/client test -- src/App.test.tsx`

Expected: FAIL because `App.tsx` is still the Vite starter.

- [ ] **Step 3: Replace the starter**

Use `authClient.useSession()`. Pending returns an `aria-busy` loading main; unauthenticated returns `<AuthScreen service={authService} />`; authenticated returns the minimal user name/sign-out state. Sign-out delegates to `authService.signOut()` and shows a safe inline error. Delete all counter and Vite/React/hero asset imports.

- [ ] **Step 4: Preserve Hono RPC**

Confirm `src/lib/rpc.ts` still imports `AppType` from `server` and exports `hc<AppType>('/')`. If concurrent work leaves it uncompilable, stop and report the exact type error before changing its contract.

- [ ] **Step 5: Run final automated checks**

Run `bun --cwd apps/client test`, `bun --cwd apps/client run lint`, and `bun --cwd apps/client run build`.

Expected: every command exits 0 with fresh output.

- [ ] **Step 6: Verify visually in the browser**

Run `bun run dev`. Inspect desktop 1440Ã—900, tablet 820Ã—1180, mobile 390Ã—844 and 320Ã—700, keyboard traversal, overflow, active state/edge progression, visible Curadorâ†’SÃ­ntesis loop, Accepted pause, reduced motion, and accessible provider/form names.

- [ ] **Step 7: Audit concurrent-work safety**

Run:

```bash
git status --short
git diff --check
git diff -- project/apps/client
```

Expected: no whitespace errors and no accidental removal of the monorepo dependency, Hono RPC client, Vite proxy, or unrelated work.

- [ ] **Step 8: Commit completion**

Commit `App.tsx` and `App.test.tsx` with `feat(client): connect auth experience to session state`.

---

## Completion Criteria

- Vite starter absent; sign-in/sign-up operate through `AuthService`.
- Google, Microsoft, and GitHub invoke Better Auth with correct provider IDs; unavailable server configuration returns a safe message.
- Full automaton is visible, animated, responsive, and static-useful with reduced motion.
- F3A is one surface with one internal divider.
- `src/lib/rpc.ts` and concurrent monorepo integration remain intact.
- Tests, lint, build, and browser verification pass with fresh evidence.


