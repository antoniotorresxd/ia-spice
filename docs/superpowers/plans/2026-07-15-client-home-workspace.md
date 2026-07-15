# Client Home Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authenticated placeholder with a polished, responsive Ecosistema Multiagente workspace backed by deterministic mock data and a service boundary ready for Hono RPC.

**Architecture:** `App` keeps the authentication gate and injects a `HomeService` into a feature-local `HomeScreen`. Focused presentational components render overview, usage, execution timeline, context, and assistant states; only the mock service imports fixtures. Local state drives the demo interactions, while exported domain types and the service interface remain stable for a future `RpcHomeService`.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, Better Auth session hook, Vitest 3, Testing Library, Bun workspace scripts.

## Global Constraints

- The visible product identity is `Ecosistema Multiagente`; use `SPICE` only for simulation technology or file types.
- This slice uses deterministic mock data and makes no home-related HTTP or Hono RPC calls.
- Components must not import fixtures directly; all data enters through `HomeService` or props.
- The information hierarchy is `Project → conversations → executions → generated files`.
- Tokens are the primary usage metric; estimated cost is secondary and explicitly labeled as an estimate.
- A prompt is submitted before project assignment and creates an unassigned temporary conversation.
- The execution sequence is `Interpretation → Calculation → Simulation → Curation → Result`.
- The assistant supports minimized, compact, and expanded states without permanently dominating the workspace.
- Preserve WCAG AA contrast, keyboard access, visible focus, semantic status announcements, and `prefers-reduced-motion` behavior.
- Do not add runtime dependencies for icons, charts, state management, or data fetching.

---

## Planned File Structure

```text
project/apps/client/src/
  App.tsx                                      # authentication gate and home injection
  App.test.tsx                                 # authenticated integration tests
  App.css                                      # session-loading state only after cleanup
  features/home/
    components/
      HomeScreen.tsx                           # stateful feature composition
      HomeScreen.module.css                    # responsive three-region shell
      HomeScreen.test.tsx                      # feature interaction tests
      HomeSidebar.tsx                          # primary navigation and recents
      HomeOverview.tsx                         # resting dashboard composition
      UsageSummary.tsx                         # period selector and usage metrics
      UsageSummary.test.tsx                    # usage presentation states
      ActivityTimeline.tsx                     # selected execution timeline
      ActivityTimeline.module.css              # timeline states and expansion
      ActivityTimeline.test.tsx                # timeline semantics and interaction
      NaturalLanguageComposer.tsx              # prompt validation and submit
      NaturalLanguageComposer.test.tsx         # prompt behavior
      AssistantPanel.tsx                       # minimized/compact/expanded assistant
      AssistantPanel.test.tsx                  # assistant state behavior
      ContextPanel.tsx                         # selected project/execution/files metadata
    model/
      home-types.ts                            # domain and service-facing types
      home-fixtures.ts                         # mock-only deterministic data
    services/
      home-service.ts                          # replaceable HomeService interface
      mock-home-service.ts                     # fixture-backed implementation
      mock-home-service.test.ts                # contract behavior tests
```

---

### Task 1: Define the home domain and deterministic mock service

**Files:**
- Create: `project/apps/client/src/features/home/model/home-types.ts`
- Create: `project/apps/client/src/features/home/model/home-fixtures.ts`
- Create: `project/apps/client/src/features/home/services/home-service.ts`
- Create: `project/apps/client/src/features/home/services/mock-home-service.ts`
- Test: `project/apps/client/src/features/home/services/mock-home-service.test.ts`

**Interfaces:**
- Consumes: no earlier home code.
- Produces: `UsagePeriod`, `ExecutionStage`, `ConversationExecution`, `HomeOverviewData`, `PromptInput`, `HomeService`, and singleton `mockHomeService`.

- [ ] **Step 1: Write failing service contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { createMockHomeService } from './mock-home-service'

describe('MockHomeService', () => {
  it('returns tokens as the primary usage metric for the selected period', async () => {
    const service = createMockHomeService()
    const overview = await service.getHomeOverview('30d')

    expect(overview.usage.period).toBe('30d')
    expect(overview.usage.tokens).toEqual({ used: 184_200, limit: 500_000 })
    expect(overview.usage.estimatedCostUsd).toBe(3.84)
  })

  it('creates an unassigned temporary conversation from a prompt', async () => {
    const service = createMockHomeService()
    const execution = await service.submitPrompt({
      text: 'Diseña un filtro RC de 1 kHz',
    })

    expect(execution.projectId).toBeNull()
    expect(execution.conversation.isTemporary).toBe(true)
    expect(execution.stages.map((stage) => stage.kind)).toEqual([
      'interpretation', 'calculation', 'simulation', 'curation', 'result',
    ])
  })

  it('assigns a temporary conversation to an existing project', async () => {
    const service = createMockHomeService()
    const assigned = await service.assignConversationToProject(
      'conversation-draft',
      'project-filter',
    )

    expect(assigned.projectId).toBe('project-filter')
    expect(assigned.isTemporary).toBe(false)
  })
})
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `bun run --cwd project/apps/client test -- src/features/home/services/mock-home-service.test.ts`

Expected: FAIL because `mock-home-service` does not exist.

- [ ] **Step 3: Define exact domain types and service interface**

```ts
// model/home-types.ts
export type UsagePeriod = '7d' | '30d' | '90d'
export type StageKind =
  | 'interpretation' | 'calculation' | 'simulation' | 'curation' | 'result'
export type StageStatus = 'pending' | 'active' | 'completed' | 'failed'

export type GeneratedFile = {
  id: string
  name: string
  kind: 'netlist' | 'data' | 'schematic' | 'report'
  partial: boolean
}

export type ExecutionStage = {
  id: string
  kind: StageKind
  label: string
  actor: string
  status: StageStatus
  durationMs: number | null
  summary: string
  metrics: Array<{ label: string; value: string }>
}

export type ConversationSummary = {
  id: string
  title: string
  projectId: string | null
  isTemporary: boolean
  updatedAt: string
}

export type ConversationExecution = {
  id: string
  projectId: string | null
  conversation: ConversationSummary
  status: 'active' | 'completed' | 'failed'
  stages: ExecutionStage[]
  files: GeneratedFile[]
}

export type UsageMetrics = {
  period: UsagePeriod
  tokens: { used: number; limit: number } | null
  estimatedCostUsd: number | null
  executions: number
  successRate: number
  processingMinutes: number
  generatedFiles: number
}

export type HomeOverviewData = {
  usage: UsageMetrics
  recentProjects: Array<{ id: string; name: string; conversationCount: number }>
  recentConversations: ConversationSummary[]
  recentFiles: GeneratedFile[]
  recentExecutions: ConversationExecution[]
  isDemo: true
}

export type PromptInput = { text: string }
```

```ts
// services/home-service.ts
import type {
  ConversationExecution, ConversationSummary, HomeOverviewData,
  PromptInput, UsagePeriod,
} from '../model/home-types'

export type HomeService = {
  getHomeOverview(period: UsagePeriod): Promise<HomeOverviewData>
  getRecentActivity(): Promise<ConversationExecution[]>
  submitPrompt(input: PromptInput): Promise<ConversationExecution>
  assignConversationToProject(
    conversationId: string,
    projectId: string,
  ): Promise<ConversationSummary>
}
```

- [ ] **Step 4: Add typed fixtures and implement `createMockHomeService()`**

Create fixtures for `7d`, `30d`, and `90d`, plus active, completed, failed, empty, and unavailable-usage states. Implement every method by returning `structuredClone(...)` of fixture data so component actions cannot mutate the fixture source. `submitPrompt` must trim input, reject empty text with `new Error('Prompt text is required')`, and return the fixed `conversation-draft` execution. `assignConversationToProject` must return the fixed draft conversation with the supplied project id and `isTemporary: false`.

```ts
export function createMockHomeService(): HomeService {
  return {
    async getHomeOverview(period) {
      return structuredClone({ ...homeOverviewFixture, usage: usageByPeriod[period] })
    },
    async getRecentActivity() {
      return structuredClone(homeOverviewFixture.recentExecutions)
    },
    async submitPrompt({ text }) {
      if (!text.trim()) throw new Error('Prompt text is required')
      return structuredClone(activeDraftExecutionFixture)
    },
    async assignConversationToProject(_conversationId, projectId) {
      return { ...structuredClone(draftConversationFixture), projectId, isTemporary: false }
    },
  }
}

export const mockHomeService = createMockHomeService()
```

- [ ] **Step 5: Run the focused tests**

Run: `bun run --cwd project/apps/client test -- src/features/home/services/mock-home-service.test.ts`

Expected: PASS with 3 tests.

- [ ] **Step 6: Commit the domain boundary**

```bash
git add project/apps/client/src/features/home/model project/apps/client/src/features/home/services
git commit -m "feat(client): add mock home service contract"
```

---

### Task 2: Build usage summary and resting overview

**Files:**
- Create: `project/apps/client/src/features/home/components/UsageSummary.tsx`
- Create: `project/apps/client/src/features/home/components/UsageSummary.test.tsx`
- Create: `project/apps/client/src/features/home/components/HomeOverview.tsx`

**Interfaces:**
- Consumes: `HomeOverviewData`, `UsageMetrics`, and `UsagePeriod` from Task 1.
- Produces: `UsageSummary({ usage, onPeriodChange })` and `HomeOverview({ data, onPeriodChange })`.

- [ ] **Step 1: Write failing usage presentation tests**

```tsx
it('presents tokens first and cost as an estimate', () => {
  render(<UsageSummary usage={usageFixture} onPeriodChange={vi.fn()} />)
  expect(screen.getByText('184,200 / 500,000')).toBeVisible()
  expect(screen.getByText('$3.84 estimados')).toBeVisible()
})

it('does not invent unavailable usage values', () => {
  render(<UsageSummary usage={{ ...usageFixture, tokens: null, estimatedCostUsd: null }} onPeriodChange={vi.fn()} />)
  expect(screen.getAllByText('Datos no disponibles')).toHaveLength(2)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/UsageSummary.test.tsx`

Expected: FAIL because `UsageSummary` does not exist.

- [ ] **Step 3: Implement `UsageSummary` with semantic metrics**

Render a labeled period `<select>` with `7d`, `30d`, and `90d`; use `Intl.NumberFormat('en-US')` for token values and `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` for estimated cost. Render a `<dl>` in this order: tokens, estimated cost, executions/success rate, processing time, generated files. Null tokens or cost render exactly `Datos no disponibles`.

- [ ] **Step 4: Implement `HomeOverview` composition**

Render the `UsageSummary`, a compact “Actividad reciente” list from `recentExecutions`, a “Proyectos recientes” list, and “Archivos recientes”. Include a visible `Datos de demostración` label whenever `data.isDemo` is true. Do not import fixtures.

- [ ] **Step 5: Run focused tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/UsageSummary.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/home/components/UsageSummary* project/apps/client/src/features/home/components/HomeOverview.tsx
git commit -m "feat(client): add home usage overview"
```

---

### Task 3: Build the accessible operational timeline

**Files:**
- Create: `project/apps/client/src/features/home/components/ActivityTimeline.tsx`
- Create: `project/apps/client/src/features/home/components/ActivityTimeline.module.css`
- Test: `project/apps/client/src/features/home/components/ActivityTimeline.test.tsx`

**Interfaces:**
- Consumes: `ConversationExecution` and `ExecutionStage` from Task 1.
- Produces: `ActivityTimeline({ execution })` with locally expandable stages.

- [ ] **Step 1: Write failing timeline tests**

```tsx
it('renders the five execution stages as an ordered list', () => {
  render(<ActivityTimeline execution={activeDraftExecutionFixture} />)
  expect(screen.getByRole('list', { name: 'Actividad de ejecución' })).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByText('Interpretación')).toBeVisible()
  expect(screen.getByText('Resultado')).toBeVisible()
})

it('expands metrics from the selected stage', async () => {
  const user = userEvent.setup()
  render(<ActivityTimeline execution={activeDraftExecutionFixture} />)
  await user.click(screen.getByRole('button', { name: /ver detalles de cálculo/i }))
  expect(screen.getByText('R: 1.6 kΩ')).toBeVisible()
})

it('keeps a failed stage and partial files visible', () => {
  render(<ActivityTimeline execution={failedExecutionFixture} />)
  expect(screen.getByText('La simulación no convergió')).toBeVisible()
  expect(screen.getByText('partial-output.csv')).toBeVisible()
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/ActivityTimeline.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement timeline semantics and stage expansion**

Use `<ol aria-label="Actividad de ejecución">`. Each stage is an `<li data-status={stage.status}>` with actor, duration, summary, and a button named `Ver detalles de ${stage.label}`. Toggle an `aria-expanded` region containing each metric as `${label}: ${value}`. Give the active summary `role="status"`; give failed summaries `role="alert"`. Render generated files after the ordered list and append `· parcial` to partial files.

- [ ] **Step 4: Add timeline styling**

Use a single-column vertical rail. Completed nodes use mint, active nodes use a bordered mint treatment, failed nodes use `--color-danger`, and pending nodes use muted neutral. Add expanded content without changing the horizontal alignment. Under `prefers-reduced-motion: reduce`, remove pulses and transitions.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/ActivityTimeline.test.tsx`

Expected: PASS with 3 tests.

```bash
git add project/apps/client/src/features/home/components/ActivityTimeline*
git commit -m "feat(client): add operational activity timeline"
```

---

### Task 4: Build the prompt composer and assistant states

**Files:**
- Create: `project/apps/client/src/features/home/components/NaturalLanguageComposer.tsx`
- Test: `project/apps/client/src/features/home/components/NaturalLanguageComposer.test.tsx`
- Create: `project/apps/client/src/features/home/components/AssistantPanel.tsx`
- Test: `project/apps/client/src/features/home/components/AssistantPanel.test.tsx`

**Interfaces:**
- Consumes: async callback `onSubmit(text: string): Promise<void>`.
- Produces: validated prompt submissions and `AssistantPanel` states `'minimized' | 'compact' | 'expanded'`.

- [ ] **Step 1: Write failing composer and assistant tests**

```tsx
it('rejects whitespace and submits trimmed language', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<NaturalLanguageComposer onSubmit={onSubmit} />)
  await user.type(screen.getByLabelText('Describe qué quieres diseñar'), '  Filtro RC  ')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
  expect(onSubmit).toHaveBeenCalledWith('Filtro RC')
})

it('moves through minimized, compact, and expanded states', async () => {
  const user = userEvent.setup()
  render(<AssistantPanel />)
  await user.click(screen.getByRole('button', { name: 'Minimizar asistente' }))
  expect(screen.getByRole('button', { name: 'Abrir asistente' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Abrir asistente' }))
  await user.click(screen.getByRole('button', { name: 'Expandir asistente' }))
  expect(screen.getByRole('dialog', { name: 'Asistente del Ecosistema Multiagente' })).toHaveAttribute('data-mode', 'expanded')
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/NaturalLanguageComposer.test.tsx src/features/home/components/AssistantPanel.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement `NaturalLanguageComposer`**

Use a controlled `<textarea>`, error text `Escribe una solicitud antes de continuar.`, `aria-describedby`, and an `aria-live="polite"` status. Disable duplicate submission while awaiting `onSubmit`. Clear the field only on success; on rejection show `No pudimos iniciar la solicitud. Inténtalo de nuevo.` without exposing the thrown message.

- [ ] **Step 4: Implement `AssistantPanel`**

Keep mode in local state. Minimized mode renders only `Abrir asistente`. Compact and expanded modes render a dialog named `Asistente del Ecosistema Multiagente` with buttons `Minimizar asistente`, `Expandir asistente` or `Contraer asistente`, and `Cerrar asistente`. Store the invoking button ref and return focus after closing. Do not simulate a backend answer; show fixed demonstration copy and a disabled composer labeled `Disponible al conectar el backend`.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/NaturalLanguageComposer.test.tsx src/features/home/components/AssistantPanel.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/home/components/NaturalLanguageComposer* project/apps/client/src/features/home/components/AssistantPanel*
git commit -m "feat(client): add home prompt and assistant controls"
```

---

### Task 5: Compose the responsive home workspace

**Files:**
- Create: `project/apps/client/src/features/home/components/HomeSidebar.tsx`
- Create: `project/apps/client/src/features/home/components/ContextPanel.tsx`
- Create: `project/apps/client/src/features/home/components/HomeScreen.tsx`
- Create: `project/apps/client/src/features/home/components/HomeScreen.module.css`
- Test: `project/apps/client/src/features/home/components/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `HomeService`, authenticated `userName`, and `onSignOut(): Promise<void>`.
- Produces: `HomeScreen({ service, userName, onSignOut })`, the complete authenticated experience.

- [ ] **Step 1: Write failing feature integration tests**

```tsx
it('loads the operational overview through the service', async () => {
  render(<HomeScreen service={createMockHomeService()} userName="Ada" onSignOut={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: /buenos días, ada/i })).toBeVisible()
  expect(screen.getByText('Datos de demostración')).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
})

it('switches from overview to an active timeline after prompt submission', async () => {
  const user = userEvent.setup()
  render(<HomeScreen service={createMockHomeService()} userName="Ada" onSignOut={vi.fn()} />)
  await user.type(screen.getByLabelText('Describe qué quieres diseñar'), 'Filtro RC')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
  expect(await screen.findByRole('list', { name: 'Actividad de ejecución' })).toBeVisible()
  expect(screen.getByText('Sin proyecto')).toBeVisible()
})

it('changes the selected usage period through the service', async () => {
  const service = createMockHomeService()
  const spy = vi.spyOn(service, 'getHomeOverview')
  const user = userEvent.setup()
  render(<HomeScreen service={service} userName="Ada" onSignOut={vi.fn()} />)
  await screen.findByText('Datos de demostración')
  await user.selectOptions(screen.getByLabelText('Periodo de consumo'), '90d')
  expect(spy).toHaveBeenLastCalledWith('90d')
})
```

- [ ] **Step 2: Run tests and verify failure**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/HomeScreen.test.tsx`

Expected: FAIL because `HomeScreen` does not exist.

- [ ] **Step 3: Implement navigation and context components**

`HomeSidebar` renders the exact identity `Ecosistema Multiagente`, navigation items Inicio, Nueva solicitud, Proyectos, Conversaciones, Archivos, and Ejecuciones, then recent conversations and a sign-out button. `ContextPanel` renders selected execution status, project or `Sin proyecto`, conversation update time, and files. Both receive data only through props.

- [ ] **Step 4: Implement `HomeScreen` state and data flow**

On mount, call `service.getHomeOverview('30d')`. Preserve the previous overview while a changed period loads. Track `{ overview, period, selectedExecution, loadError }`. `submitPrompt` calls the service and sets `selectedExecution`; this changes the main content from `HomeOverview` to `ActivityTimeline`. Add `aria-live="polite"` text for loading, submission success, and safe errors. A retry button repeats the current period request.

- [ ] **Step 5: Implement the polished responsive shell**

Use CSS Grid with desktop columns `14rem minmax(0, 1fr) 17rem`. Keep the central content width readable but not card-like. Use low-contrast separators, 6–8px control radii, 12–16px panel radii, and shadows only on the floating assistant. At `max-width: 1024px`, hide the context panel behind a labeled toggle. At `max-width: 720px`, collapse the sidebar behind a menu button, stack usage metrics, and render the assistant as a bottom sheet. Ensure no horizontal scrolling at 320px.

- [ ] **Step 6: Run feature tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/HomeScreen.test.tsx`

Expected: PASS with 3 tests.

```bash
git add project/apps/client/src/features/home/components
git commit -m "feat(client): compose authenticated home workspace"
```

---

### Task 6: Replace the authenticated placeholder in `App`

**Files:**
- Modify: `project/apps/client/src/App.tsx`
- Modify: `project/apps/client/src/App.test.tsx`
- Modify: `project/apps/client/src/App.css`

**Interfaces:**
- Consumes: `HomeScreen`, `mockHomeService`, authenticated user name, and existing `authService.signOut()`.
- Produces: session gate that renders AuthScreen or the complete HomeScreen.

- [ ] **Step 1: Update the authenticated integration test first**

Replace the old “Sesión activa” assertion with:

```tsx
it('shows the Ecosistema Multiagente home with a session', async () => {
  setSessionState({ data: session })
  render(<App />)

  expect(await screen.findByText('Ecosistema Multiagente')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Sesión activa' })).not.toBeInTheDocument()
})
```

Keep the pending-session, unauthenticated, sign-out delegation, and safe sign-out error tests. Update mojibake expectations in the touched test file to correctly encoded Spanish.

- [ ] **Step 2: Run `App.test.tsx` and verify failure**

Run: `bun run --cwd project/apps/client test -- src/App.test.tsx`

Expected: FAIL because App still renders “Sesión activa”.

- [ ] **Step 3: Inject the home service from `App`**

```tsx
if (!session) return <AuthScreen service={authService} />

return (
  <HomeScreen
    onSignOut={handleSignOut}
    service={mockHomeService}
    userName={session.user.name}
  />
)
```

Make `handleSignOut` throw `new Error(result.message)` when `authService.signOut()` returns `{ ok: false }`, so `HomeScreen` owns safe feedback next to its sign-out control. Remove the placeholder card state and its CSS. Keep only session-loading styles and reduced-motion handling in `App.css`.

- [ ] **Step 4: Run the integration tests**

Run: `bun run --cwd project/apps/client test -- src/App.test.tsx`

Expected: PASS for all App tests.

- [ ] **Step 5: Commit the authenticated integration**

```bash
git add project/apps/client/src/App.tsx project/apps/client/src/App.test.tsx project/apps/client/src/App.css
git commit -m "feat(client): show workspace after authentication"
```

---

### Task 7: Complete accessibility, visual, and regression verification

**Files:**
- Modify if verification exposes defects: files created or changed in Tasks 1–6 only.

**Interfaces:**
- Consumes: complete home feature.
- Produces: verified, buildable client with no new lint or test regressions.

- [ ] **Step 1: Run the complete client test suite**

Run: `bun run --cwd project/apps/client test`

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

Run: `bun run --cwd project/apps/client lint`

Expected: exit 0 with no errors.

- [ ] **Step 3: Run the production build**

Run: `bun run --cwd project/apps/client build`

Expected: TypeScript and Vite build complete successfully. If the server declaration prebuild requires environment configuration, run `bun run --cwd project/apps/client exec tsc -b` and `bun run --cwd project/apps/client exec vite build` separately, record the prebuild limitation, and require both client-only commands to pass.

- [ ] **Step 4: Perform manual browser verification**

Run: `bun run --cwd project/apps/client dev -- --host 0.0.0.0`

Verify at desktop (1440×900), tablet (768×1024), and mobile (320×700): no horizontal overflow; sidebar/context drawers are keyboard operable; prompt submission shows the timeline; assistant modes do not cover primary controls; long names wrap or truncate predictably; tokens remain primary and estimated cost secondary; failed and partial states remain visible.

- [ ] **Step 5: Verify reduced motion and keyboard behavior**

Enable `prefers-reduced-motion: reduce`; confirm no timeline pulse, aurora drift, or panel transition remains. Tab through navigation, period selector, prompt, timeline disclosures, assistant controls, context drawer, and sign-out. Confirm focus is visible and closing overlays returns focus to their opener.

- [ ] **Step 6: Commit verification fixes, if any**

```bash
git add project/apps/client/src
git commit -m "fix(client): polish home accessibility and responsiveness"
```

Skip this commit only when verification required no file changes.

