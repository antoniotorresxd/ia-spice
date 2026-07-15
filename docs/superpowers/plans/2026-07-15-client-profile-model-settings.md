# Client Profile and Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated profile and LLM-model settings routes, a keyboard-accessible profile menu, and a polished minimized assistant orb using client-only mock data.

**Architecture:** Better Auth remains the outer gate in `App`; authenticated users enter a React Router tree for home, profile, and model settings. Settings screens depend on a typed `SettingsService`, whose in-memory implementation owns mock profile, connection, and per-agent assignment state. The existing sidebar and assistant remain shared visual primitives, while route-specific screens own only their central content.

**Tech Stack:** React 19, TypeScript 6, React Router DOM 7, CSS Modules, Vitest 3, Testing Library, Bun workspace.

## Global Constraints

- Implement client-only mock behavior; do not modify the Hono server, database, or Python agents project.
- Do not call Hono RPC, `fetch`, provider APIs, or Better Auth profile mutation APIs.
- Routes are `/`, `/settings/profile`, and `/settings/models`; unknown authenticated routes redirect to `/`.
- The profile menu contains exactly Perfil, Modelos y providers, and Cerrar sesión.
- The profile route edits name and avatar locally; email is read-only.
- Supported connection providers are `openai`, `anthropic`, `google`, and `openai_compatible`.
- OpenAI, Anthropic, and Google require an API key; OpenAI-compatible requires `baseUrl` and permits an empty key.
- A connection can be reused by multiple agents, each with a different model.
- Configurable agents are Orquestador, Cálculo, Escritura, and Curador; Shell has no LLM assignment.
- Never store API keys in `localStorage`, cookies, URLs, logs, or readable fixture state after creation.
- After saving, expose only `hasKey` and `keyHint`; omit full keys from list and update responses.
- Preserve the existing home behavior, keyboard access, focus restoration, responsive layout, and reduced-motion support.

---

## Planned File Structure

```text
project/apps/client/
  package.json
  src/
    App.tsx
    App.test.tsx
    features/home/components/
      HomeSidebar.tsx
      HomeSidebar.test.tsx
      AssistantPanel.tsx
      AssistantPanel.test.tsx
      HomeScreen.module.css
    features/settings/
      components/
        SettingsShell.tsx
        SettingsShell.module.css
        ProfileSettingsScreen.tsx
        ProfileSettingsScreen.test.tsx
        ModelSettingsScreen.tsx
        ModelSettingsScreen.test.tsx
        ConnectionForm.tsx
        AgentAssignmentList.tsx
      model/
        settings-types.ts
        settings-fixtures.ts
        settings-validation.ts
        settings-validation.test.ts
      services/
        settings-service.ts
        mock-settings-service.ts
        mock-settings-service.test.ts
```

---

### Task 1: Define settings types, validation, and in-memory service

**Files:**
- Create: `project/apps/client/src/features/settings/model/settings-types.ts`
- Create: `project/apps/client/src/features/settings/model/settings-fixtures.ts`
- Create: `project/apps/client/src/features/settings/model/settings-validation.ts`
- Test: `project/apps/client/src/features/settings/model/settings-validation.test.ts`
- Create: `project/apps/client/src/features/settings/services/settings-service.ts`
- Create: `project/apps/client/src/features/settings/services/mock-settings-service.ts`
- Test: `project/apps/client/src/features/settings/services/mock-settings-service.test.ts`

**Interfaces:**
- Consumes: no settings code.
- Produces: `UserProfile`, `LlmConnection`, `ConnectionInput`, `AgentAssignment`, `SettingsService`, `createMockSettingsService()`, and singleton `mockSettingsService`.

- [ ] **Step 1: Write failing validation and service tests**

```ts
it('requires a key for hosted providers', () => {
  expect(validateConnection({ label: 'Claude', provider: 'anthropic', apiKey: '', baseUrl: '' })).toEqual({ apiKey: 'Ingresa una API key.' })
})

it('requires a base URL for OpenAI-compatible connections', () => {
  expect(validateConnection({ label: 'Ollama', provider: 'openai_compatible', apiKey: '', baseUrl: '' })).toEqual({ baseUrl: 'Ingresa la URL del servidor.' })
})

it('never returns a full key after creating a connection', async () => {
  const service = createMockSettingsService()
  const created = await service.createConnection({
    label: 'Claude personal', provider: 'anthropic', apiKey: 'sk-ant-secret-1234', baseUrl: '',
  })
  expect(created).toMatchObject({ hasKey: true, keyHint: '1234' })
  expect(JSON.stringify(created)).not.toContain('sk-ant-secret-1234')
})

it('reuses one connection with different models', async () => {
  const service = createMockSettingsService()
  await service.updateAgentAssignment('orchestrator', { connectionId: 'connection-openai', model: 'gpt-5' })
  await service.updateAgentAssignment('curator', { connectionId: 'connection-openai', model: 'gpt-5-mini' })
  const assignments = await service.listAgentAssignments()
  expect(assignments.find((item) => item.agentId === 'orchestrator')?.model).toBe('gpt-5')
  expect(assignments.find((item) => item.agentId === 'curator')?.model).toBe('gpt-5-mini')
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/settings/model/settings-validation.test.ts src/features/settings/services/mock-settings-service.test.ts`

Expected: FAIL because the settings modules do not exist.

- [ ] **Step 3: Define the domain and service interface**

```ts
export type LlmProvider = 'openai' | 'anthropic' | 'google' | 'openai_compatible'
export type AgentId = 'orchestrator' | 'calculation' | 'writer' | 'curator'
export type UserProfile = { name: string; email: string; avatarUrl: string | null }
export type ConnectionInput = { label: string; provider: LlmProvider; apiKey: string; baseUrl: string }
export type LlmConnection = {
  id: string; label: string; provider: LlmProvider; baseUrl: string | null;
  hasKey: boolean; keyHint: string | null; createdAt: string; updatedAt: string
}
export type AgentAssignment = {
  agentId: AgentId; label: string; connectionId: string | null; model: string
}
export type AgentAssignmentInput = Pick<AgentAssignment, 'connectionId' | 'model'>
```

```ts
export type SettingsService = {
  getProfile(): Promise<UserProfile>
  updateProfile(input: Pick<UserProfile, 'name' | 'avatarUrl'>): Promise<UserProfile>
  listConnections(): Promise<LlmConnection[]>
  createConnection(input: ConnectionInput): Promise<LlmConnection>
  updateConnection(id: string, input: ConnectionInput): Promise<LlmConnection>
  deleteConnection(id: string): Promise<void>
  listAgentAssignments(): Promise<AgentAssignment[]>
  updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}
```

- [ ] **Step 4: Implement validation and the stateful mock**

`validateConnection` returns a field-error object. Trim labels and URLs. Require label for all providers, key for hosted providers when creating a connection without an existing key, and a valid `http:` or `https:` URL for `openai_compatible`. `createMockSettingsService` closes over cloned fixtures. Store full keys in no returned object; compute only `hasKey` and last four characters. Editing with an empty key preserves `hasKey` and `keyHint`. Deleting clears matching assignment `connectionId` values.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/settings/model/settings-validation.test.ts src/features/settings/services/mock-settings-service.test.ts`

Expected: PASS.

```bash
git add project/apps/client/src/features/settings/model project/apps/client/src/features/settings/services
git commit -m "feat(client): add mock settings service"
```

---

### Task 2: Add authenticated routing

**Files:**
- Modify: `project/apps/client/package.json`
- Modify: `project/bun.lock`
- Modify: `project/apps/client/src/App.tsx`
- Modify: `project/apps/client/src/App.test.tsx`

**Interfaces:**
- Consumes: `mockHomeService`, `mockSettingsService`, existing Better Auth session gate.
- Produces: authenticated route tree for `/`, `/settings/profile`, and `/settings/models`.

- [ ] **Step 1: Add routing integration tests**

```tsx
it.each([
  ['/settings/profile', 'Tu perfil'],
  ['/settings/models', 'Modelos y providers'],
])('renders %s for authenticated users', async (path, heading) => {
  window.history.pushState({}, '', path)
  setSessionState({ data: session })
  render(<App />)
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
})

it('redirects unknown authenticated routes home', async () => {
  window.history.pushState({}, '', '/unknown')
  setSessionState({ data: session })
  render(<App />)
  expect(await screen.findByRole('heading', { name: /buenos días/i })).toBeVisible()
})
```

- [ ] **Step 2: Run `App.test.tsx` and verify RED**

Run: `bun run --cwd project/apps/client test -- src/App.test.tsx`

Expected: FAIL because App ignores the URL.

- [ ] **Step 3: Add React Router DOM**

Run: `cd project && bun add --cwd apps/client react-router-dom@^7.18.1`

Expected: `package.json` and `bun.lock` include `react-router-dom`.

- [ ] **Step 4: Implement the authenticated route tree**

Wrap only the authenticated branch in `BrowserRouter`. Render `HomeScreen` at `/`, profile and models screens with `SettingsShell`, and `<Navigate replace to="/" />` for `*`. Inject the same `mockSettingsService` into both settings screens. Keep unauthenticated `AuthScreen` outside the router.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/App.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/package.json project/bun.lock project/apps/client/src/App.tsx project/apps/client/src/App.test.tsx
git commit -m "feat(client): add authenticated settings routes"
```

---

### Task 3: Replace the sidebar footer with an accessible profile menu

**Files:**
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.tsx`
- Create: `project/apps/client/src/features/home/components/HomeSidebar.test.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeScreen.module.css`

**Interfaces:**
- Consumes: `useNavigate()` inside the authenticated router and existing `onSignOut` callback.
- Produces: profile trigger and popover with exact actions Perfil, Modelos y providers, and Cerrar sesión.

- [ ] **Step 1: Write failing interaction tests**

Render `HomeSidebar` inside `MemoryRouter`. Assert opening by `Perfil de Antonio`, menu role, navigation to `/settings/profile` and `/settings/models`, `Escape` closure, outside-click closure, sign-out delegation, and trigger focus restoration.

```tsx
await user.click(screen.getByRole('button', { name: 'Perfil de Antonio' }))
expect(screen.getByRole('menu', { name: 'Menú de perfil' })).toBeVisible()
await user.keyboard('{Escape}')
expect(screen.queryByRole('menu')).not.toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Perfil de Antonio' })).toHaveFocus()
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/HomeSidebar.test.tsx`

Expected: FAIL because the current footer has an isolated sign-out button.

- [ ] **Step 3: Implement the menu**

Use local open state, trigger/menu refs, a document `pointerdown` listener only while open, and a keydown listener for `Escape`. Menu items navigate then close. Await sign-out after closing. Use `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, and `role="menuitem"`. Restore trigger focus for Escape and outside close.

- [ ] **Step 4: Style desktop popover and mobile bottom sheet**

Replace `.home-user-menu` rules with a unified bordered trigger. Position the menu above the trigger with low-contrast borders and panel shadow. Under 720px, anchor it as a bottom sheet inside the sidebar safe area. Add reduced-motion overrides.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/HomeSidebar.test.tsx src/features/home/components/HomeScreen.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/home/components/HomeSidebar*
git add project/apps/client/src/features/home/components/HomeScreen.module.css
git commit -m "feat(client): add profile navigation menu"
```

---

### Task 4: Build the profile settings route

**Files:**
- Create: `project/apps/client/src/features/settings/components/SettingsShell.tsx`
- Create: `project/apps/client/src/features/settings/components/SettingsShell.module.css`
- Create: `project/apps/client/src/features/settings/components/ProfileSettingsScreen.tsx`
- Test: `project/apps/client/src/features/settings/components/ProfileSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `SettingsService`, authenticated user name/email, `HomeSidebar`, `AssistantPanel`.
- Produces: route heading `Tu perfil`, editable name/avatar preview, read-only email, save/discard behavior.

- [ ] **Step 1: Write failing profile tests**

Test mock load, disabled email, empty-name error, successful save, discard restore, safe service error, avatar preview creation, and `URL.revokeObjectURL` on replacement/unmount.

```tsx
expect(await screen.findByDisplayValue('Ada Lovelace')).toBeVisible()
expect(screen.getByLabelText('Correo electrónico')).toBeDisabled()
await user.clear(screen.getByLabelText('Nombre'))
await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu nombre.')
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ProfileSettingsScreen.test.tsx`

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Implement shell and profile form**

`SettingsShell` renders the shared sidebar, a compact topbar, central content slot, and assistant. `ProfileSettingsScreen` loads once from the injected service, maintains saved and draft values, validates trimmed name, keeps email disabled, and reports safe success/error through `aria-live`. Create an object URL for selected avatar files and revoke the previous URL before replacement and on unmount.

- [ ] **Step 4: Add responsive settings styling**

Use a readable max-width form, section dividers rather than large cards, 44px controls, and the same graphite/mint tokens. At mobile widths, reuse sidebar drawer behavior and stack actions.

- [ ] **Step 5: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ProfileSettingsScreen.test.tsx src/App.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/settings/components/SettingsShell* project/apps/client/src/features/settings/components/ProfileSettingsScreen*
git commit -m "feat(client): add profile settings screen"
```

---

### Task 5: Build connection management

**Files:**
- Create: `project/apps/client/src/features/settings/components/ConnectionForm.tsx`
- Create: `project/apps/client/src/features/settings/components/ModelSettingsScreen.tsx`
- Test: `project/apps/client/src/features/settings/components/ModelSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `SettingsService`, `LlmConnection`, validation from Task 1.
- Produces: route heading `Modelos y providers`, connection list, create/edit dialog, masked key display, and confirmed deletion.

- [ ] **Step 1: Write failing connection tests**

Test empty state, provider-specific fields, key masking, create, edit without key replacement, safe errors, and assigned-connection deletion confirmation.

```tsx
await user.click(screen.getByRole('button', { name: 'Nueva conexión' }))
await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic')
expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password')
await user.type(screen.getByLabelText('API key'), 'sk-ant-private-1234')
await user.click(screen.getByRole('button', { name: 'Guardar conexión' }))
expect(await screen.findByText('••••1234')).toBeVisible()
expect(screen.queryByText('sk-ant-private-1234')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ModelSettingsScreen.test.tsx`

Expected: FAIL because model settings do not exist.

- [ ] **Step 3: Implement connection list and form dialog**

Load connections and assignments together. `ConnectionForm` owns draft input and calls validated create/update callbacks. Show base URL only for `openai_compatible`. Editing starts with an empty key and copy `Déjala vacía para conservar la actual`. After save, clear the draft key before closing. Use a native confirmation dialog surface for deleting assigned connections; confirmation calls service delete and reloads both collections.

- [ ] **Step 4: Run focused tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ModelSettingsScreen.test.tsx`

Expected: connection tests PASS.

```bash
git add project/apps/client/src/features/settings/components/ConnectionForm.tsx project/apps/client/src/features/settings/components/ModelSettingsScreen*
git commit -m "feat(client): add LLM connection settings"
```

---

### Task 6: Add per-agent assignments

**Files:**
- Create: `project/apps/client/src/features/settings/components/AgentAssignmentList.tsx`
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.tsx`
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: connections and assignments loaded by `ModelSettingsScreen`.
- Produces: four assignment rows with independent connection/model save actions.

- [ ] **Step 1: Add failing assignment tests**

Assert exact agent labels Orquestador, Cálculo, Escritura, Curador; assert Shell absent; reuse one connection with distinct models; show `Sin configurar` when connection/model missing; show attention after deleting a selected connection.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ModelSettingsScreen.test.tsx`

Expected: FAIL because assignment controls are missing.

- [ ] **Step 3: Implement `AgentAssignmentList`**

Render a semantic list. Each row owns a draft `connectionId` and `model`, a Save button, and safe status text. Disable Save only while that row is submitting. Permit blank assignments and label them `Sin configurar`. Do not infer a model from provider or change other rows when saving.

- [ ] **Step 4: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/settings/components/ModelSettingsScreen.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/settings/components/AgentAssignmentList.tsx project/apps/client/src/features/settings/components/ModelSettingsScreen*
git commit -m "feat(client): assign LLM models per agent"
```

---

### Task 7: Replace the minimized assistant button with the approved orb

**Files:**
- Modify: `project/apps/client/src/features/home/components/AssistantPanel.tsx`
- Modify: `project/apps/client/src/features/home/components/AssistantPanel.test.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeScreen.module.css`

**Interfaces:**
- Consumes: existing assistant mode state.
- Produces: 48×48 EM orb with availability indicator and tooltip `Abrir asistente`.

- [ ] **Step 1: Update tests first**

After minimizing, assert the opener has accessible name `Abrir asistente`, contains no visible text node `Abrir asistente`, exposes tooltip text on hover/focus, opens compact mode, and regains focus after close.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/AssistantPanel.test.tsx`

Expected: FAIL because the current opener displays text.

- [ ] **Step 3: Implement and style the orb**

Use `aria-label="Abrir asistente"`, visible `EM`, decorative availability dot, and a tooltip with `role="tooltip"` controlled by CSS hover/focus-within. Style 48×48, 14px radius, restrained mint border, inset highlight, and responsive safe-area offsets. Preserve the opener DOM node for focus restoration and disable motion under reduced motion.

- [ ] **Step 4: Run tests and commit**

Run: `bun run --cwd project/apps/client test -- src/features/home/components/AssistantPanel.test.tsx`

Expected: PASS.

```bash
git add project/apps/client/src/features/home/components/AssistantPanel* project/apps/client/src/features/home/components/HomeScreen.module.css
git commit -m "fix(client): refine minimized assistant trigger"
```

---

### Task 8: Full verification and visual QA

**Files:**
- Modify only files from Tasks 1–7 if verification reveals defects.

- [ ] **Step 1: Run complete automated verification**

Run: `cd project && bun run test:client && bun run lint:client && bun run build:client`

Expected: all tests PASS, ESLint exits 0, TypeScript and Vite build successfully.

- [ ] **Step 2: Verify desktop and mobile interactions manually**

Run: `cd project && bun run dev:client -- --host 0.0.0.0`

At 1440×900, 768×1024, and 320×700 verify: profile menu placement; outside click/Escape/focus return; settings route layout; provider form switching; masked keys; delete confirmation; four agent rows; orb does not cover primary actions; no horizontal scroll.

- [ ] **Step 3: Verify keyboard and reduced motion**

Tab through sidebar, menu, forms, dialogs, assignments, and assistant. Enable reduced motion and confirm menus, drawers, tooltip, and orb do not animate.

- [ ] **Step 4: Commit verification fixes if required**

```bash
git add project/apps/client
git commit -m "fix(client): polish settings accessibility and layout"
```

Skip only if verification changes no files.
