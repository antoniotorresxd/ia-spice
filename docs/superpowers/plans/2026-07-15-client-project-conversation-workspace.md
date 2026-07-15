# Client Project and Conversation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused new-request route, persistent project/conversation navigation, project and conversation directories, project file tabs, drag assignment, and full-screen conversation views using client-only mock data.

**Architecture:** Extend the existing authenticated home workspace rather than create another shell. Introduce a stateful `WorkspaceService` whose in-memory mock owns projects, conversations, executions, and assignment mutations; route screens consume that boundary and reuse the existing composer, timeline, assistant, sidebar, and visual tokens.

**Tech Stack:** React 19, React Router DOM 7, TypeScript, CSS Modules, Vitest, Testing Library, Bun, Vite.

## Global Constraints

- Work on the existing `dev` branch as requested.
- Client only; do not change Hono routes, database models, authentication, or Python agents.
- Components never import fixtures directly and never call HTTP.
- New conversations begin with `projectId: null`; project selection never blocks the first request.
- Drag assignment must have an action-menu keyboard alternative and undo.
- Preserve unrelated changes under `tesina/` and `project/apps/agents/.env`.
- Use test-driven development for every new behavior or bug fix.
- Keep the mock boundary replaceable by a future Hono RPC service.

---

### Task 1: Workspace domain and stateful mock service

**Files:**
- Create: `project/apps/client/src/features/workspace/model/workspace-types.ts`
- Create: `project/apps/client/src/features/workspace/model/workspace-fixtures.ts`
- Create: `project/apps/client/src/features/workspace/services/workspace-service.ts`
- Create: `project/apps/client/src/features/workspace/services/mock-workspace-service.ts`
- Create: `project/apps/client/src/features/workspace/services/mock-workspace-service.test.ts`

**Interfaces:**
- Produces: `WorkspaceProject`, `WorkspaceConversation`, `WorkspaceFile`, `WorkspaceConversationDetail`, `WorkspaceSnapshot`, `ProjectInput`, `WorkspaceService`, and `createMockWorkspaceService()`.
- `WorkspaceService` methods: `getSnapshot()`, `getProject(projectId)`, `getConversation(conversationId)`, `createProject(input)`, `submitRequest(text)`, `continueConversation(conversationId, text)`, `assignConversation(conversationId, projectId)`, and `restoreConversationProject(conversationId, projectId)`.

- [ ] **Step 1: Write service contract tests**

```ts
it('creates new requests without a project', async () => {
  const service = createMockWorkspaceService()
  const created = await service.submitRequest('Diseña un filtro RC')
  expect(created.projectId).toBeNull()
  expect((await service.getSnapshot()).unassignedConversationIds).toContain(created.id)
})

it('assigns and restores a conversation project', async () => {
  const service = createMockWorkspaceService()
  const conversation = await service.submitRequest('Diseña un filtro RC')
  const moved = await service.assignConversation(conversation.id, 'project-filters')
  expect(moved.projectId).toBe('project-filters')
  const restored = await service.restoreConversationProject(conversation.id, null)
  expect(restored.projectId).toBeNull()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test:client -- mock-workspace-service.test.ts`

Expected: FAIL because the workspace service modules do not exist.

- [ ] **Step 3: Implement exact domain contracts**

```ts
export type WorkspaceProject = {
  id: string
  name: string
  description: string
  conversationIds: string[]
  updatedAt: string
}

export type WorkspaceService = {
  getSnapshot(): Promise<WorkspaceSnapshot>
  getProject(projectId: string): Promise<WorkspaceProjectDetail>
  getConversation(conversationId: string): Promise<WorkspaceConversationDetail>
  createProject(input: ProjectInput): Promise<WorkspaceProject>
  submitRequest(text: string): Promise<WorkspaceConversationDetail>
  continueConversation(conversationId: string, text: string): Promise<WorkspaceConversationDetail>
  assignConversation(conversationId: string, projectId: string): Promise<WorkspaceConversation>
  restoreConversationProject(conversationId: string, projectId: string | null): Promise<WorkspaceConversation>
}
```

Implement deterministic fixtures for three projects, at least five conversations, unassigned work, complete and partial files, and active/completed/failed executions. Clone fixture collections inside `createMockWorkspaceService()` so tests and app sessions do not share mutable state.

- [ ] **Step 4: Verify GREEN and mutation isolation**

Run: `bun run test:client -- mock-workspace-service.test.ts`

Expected: PASS for creation, assignment, restoration, lookup, project creation, continuation, missing IDs, and independent service instances.

- [ ] **Step 5: Commit the service slice**

```bash
git add project/apps/client/src/features/workspace/model project/apps/client/src/features/workspace/services
git commit -m "feat(client): add mock workspace domain"
```

### Task 2: Persistent workspace shell and route graph

**Files:**
- Create: `project/apps/client/src/features/workspace/components/WorkspaceShell.tsx`
- Create: `project/apps/client/src/features/workspace/components/WorkspaceShell.module.css`
- Create: `project/apps/client/src/features/workspace/components/WorkspaceShell.test.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.test.tsx`
- Modify: `project/apps/client/src/App.tsx`
- Modify: `project/apps/client/src/App.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceSnapshot`, `WorkspaceService`, existing `AssistantPanel`, profile popover, and `ConversationSummary` compatibility data.
- Produces routes `/new`, `/projects`, `/projects/:projectId`, `/conversations`, `/conversations/:conversationId`; `WorkspaceShell` renders persistent navigation and an `<Outlet />`-style child region.

- [ ] **Step 1: Write failing route and sidebar tests**

```tsx
expect(screen.getByRole('link', { name: 'Nueva solicitud' })).toHaveAttribute('href', '/new')
expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/projects')
expect(screen.getByRole('button', { name: 'Expandir Filtros analógicos' })).toHaveAttribute('aria-expanded', 'false')
```

Add `App.test.tsx` assertions that authenticated users can render headings for `/new`, `/projects`, `/projects/project-filters`, `/conversations`, and `/conversations/conversation-filter`.

- [ ] **Step 2: Verify RED**

Run: `bun run test:client -- WorkspaceShell.test.tsx HomeSidebar.test.tsx App.test.tsx`

Expected: FAIL because navigation buttons are not links and the new routes are absent.

- [ ] **Step 3: Implement shell and route-aware sidebar**

Make navigation definitions real `NavLink`s, render `Sin proyecto`, render projects as disclosure buttons, and show their recent conversations only while expanded. Keep profile interactions unchanged. Add minimal route screens with the approved headings so the route graph is complete before their full feature slices are implemented.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:client -- WorkspaceShell.test.tsx HomeSidebar.test.tsx App.test.tsx`

Expected: PASS with active-route semantics, project disclosure behavior, and all five routes.

- [ ] **Step 5: Commit the navigation slice**

```bash
git add project/apps/client/src/App.tsx project/apps/client/src/App.test.tsx project/apps/client/src/features/home/components/HomeSidebar.tsx project/apps/client/src/features/home/components/HomeSidebar.test.tsx project/apps/client/src/features/workspace/components
git commit -m "feat(client): add project workspace routing"
```

### Task 3: Focused new-request experience

**Files:**
- Create: `project/apps/client/src/features/workspace/components/NewRequestScreen.tsx`
- Create: `project/apps/client/src/features/workspace/components/NewRequestScreen.module.css`
- Create: `project/apps/client/src/features/workspace/components/NewRequestScreen.test.tsx`
- Modify: `project/apps/client/src/App.tsx`

**Interfaces:**
- Consumes: `WorkspaceService.submitRequest(text)` and React Router navigation.
- Produces: focused composer route that navigates successful requests to `/conversations/:conversationId`.

- [ ] **Step 1: Write failing behavior tests**

```tsx
it('keeps the focused route free of dashboard summaries', () => {
  renderScreen()
  expect(screen.getByRole('heading', { name: '¿Qué quieres diseñar?' })).toBeVisible()
  expect(screen.queryByText('Resumen de actividad')).not.toBeInTheDocument()
})

it('creates an unassigned conversation and navigates', async () => {
  await user.type(screen.getByRole('textbox'), 'Diseña un filtro RC')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
  expect(service.submitRequest).toHaveBeenCalledWith('Diseña un filtro RC')
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/conversations/conversation-new')
})
```

- [ ] **Step 2: Verify RED**

Run: `bun run test:client -- NewRequestScreen.test.tsx`

Expected: FAIL because the focused screen does not exist.

- [ ] **Step 3: Implement the approved clean composition**

Render the central heading, explanatory copy, large composer, context control, automatic mode label, and three example prompts. Reuse validation semantics from `NaturalLanguageComposer`, retain text after service rejection, disable duplicate submission, and navigate only after a resolved service result.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:client -- NewRequestScreen.test.tsx`

Expected: PASS for clean composition, empty validation, pending state, failure retention, examples, and successful navigation.

- [ ] **Step 5: Commit the new-request slice**

```bash
git add project/apps/client/src/features/workspace/components/NewRequestScreen* project/apps/client/src/App.tsx
git commit -m "feat(client): add focused new request flow"
```

### Task 4: Global projects directory and creation

**Files:**
- Create: `project/apps/client/src/features/workspace/components/ProjectsScreen.tsx`
- Create: `project/apps/client/src/features/workspace/components/ProjectsScreen.module.css`
- Create: `project/apps/client/src/features/workspace/components/ProjectsScreen.test.tsx`
- Create: `project/apps/client/src/features/workspace/components/CreateProjectDialog.tsx`
- Modify: `project/apps/client/src/App.tsx`

**Interfaces:**
- Consumes: `WorkspaceService.getSnapshot()` and `createProject(input)`.
- Produces: searchable dense project directory and accessible project creation dialog.

- [ ] **Step 1: Write failing list and creation tests**

```tsx
expect(await screen.findByRole('row', { name: /Filtros analógicos/ })).toHaveTextContent('12 conversaciones')
await user.type(screen.getByRole('searchbox', { name: 'Buscar proyectos' }), 'fuente')
expect(screen.queryByRole('row', { name: /Filtros analógicos/ })).not.toBeInTheDocument()
await user.click(screen.getByRole('button', { name: 'Nuevo proyecto' }))
await user.type(screen.getByLabelText('Nombre'), 'Sensores')
await user.click(screen.getByRole('button', { name: 'Crear proyecto' }))
expect(service.createProject).toHaveBeenCalledWith({ name: 'Sensores', description: '' })
```

- [ ] **Step 2: Verify RED**

Run: `bun run test:client -- ProjectsScreen.test.tsx`

Expected: FAIL because the project directory and dialog are absent.

- [ ] **Step 3: Implement directory, filtering, ordering, and dialog**

Use a semantic table at desktop widths and CSS grid rows that stack on mobile. Preserve conversation/file counts, updated metadata, empty state, load retry, safe errors, focus trap, Escape dismissal, and trigger-focus restoration.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:client -- ProjectsScreen.test.tsx`

Expected: PASS for populated, empty, filtered, ordered, loading, error, and creation states.

- [ ] **Step 5: Commit the projects slice**

```bash
git add project/apps/client/src/features/workspace/components/ProjectsScreen* project/apps/client/src/features/workspace/components/CreateProjectDialog.tsx project/apps/client/src/App.tsx
git commit -m "feat(client): add project directory"
```

### Task 5: Project detail tabs and conversation assignment

**Files:**
- Create: `project/apps/client/src/features/workspace/components/ProjectScreen.tsx`
- Create: `project/apps/client/src/features/workspace/components/ProjectScreen.module.css`
- Create: `project/apps/client/src/features/workspace/components/ProjectScreen.test.tsx`
- Create: `project/apps/client/src/features/workspace/components/ConversationDropTarget.tsx`
- Create: `project/apps/client/src/features/workspace/components/ConversationActions.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.tsx`
- Modify: `project/apps/client/src/App.tsx`

**Interfaces:**
- Consumes: `getProject`, `assignConversation`, `restoreConversationProject`, sidebar conversation drag payload `{ conversationId, previousProjectId }`.
- Produces: project landing page with semantic `Conversaciones` and `Archivos` tabs; drag, keyboard move, success/undo, and failure rollback interactions.

- [ ] **Step 1: Write failing tab and assignment tests**

```tsx
expect(await screen.findByRole('tab', { name: 'Conversaciones 12' })).toHaveAttribute('aria-selected', 'true')
await user.click(screen.getByRole('tab', { name: 'Archivos 38' }))
expect(screen.getByRole('tabpanel', { name: 'Archivos' })).toHaveTextContent('report.pdf')
fireEvent.drop(screen.getByRole('region', { name: 'Asignar a Filtros analógicos' }), {
  dataTransfer: { getData: () => JSON.stringify({ conversationId: 'conversation-draft', previousProjectId: null }) },
})
expect(service.assignConversation).toHaveBeenCalledWith('conversation-draft', 'project-filters')
```

Add tests that `Mover a proyecto` invokes the same callback, undo restores `null`, and rejected assignment leaves the item under `Sin proyecto` with an alert.

- [ ] **Step 2: Verify RED**

Run: `bun run test:client -- ProjectScreen.test.tsx HomeSidebar.test.tsx`

Expected: FAIL because the tabs and assignment interactions do not exist.

- [ ] **Step 3: Implement project landing and assignment state machine**

Use an explicit state union:

```ts
type AssignmentState =
  | { status: 'idle' }
  | { status: 'saving'; conversationId: string; projectId: string }
  | { status: 'saved'; conversationId: string; previousProjectId: string | null; projectId: string }
  | { status: 'error'; conversationId: string; message: string }
```

The sidebar sets `application/x-workspace-conversation` drag data. `ConversationDropTarget` validates the parsed ID before calling `onAssign`. The live region announces success; `Deshacer` calls `restoreConversationProject` and refreshes the snapshot. Tabs filter locally and files link to their source conversations.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:client -- ProjectScreen.test.tsx HomeSidebar.test.tsx`

Expected: PASS for tabs, filtering, drag assignment, invalid payload rejection, keyboard movement, undo, rollback, and empty states.

- [ ] **Step 5: Commit the project-detail slice**

```bash
git add project/apps/client/src/features/workspace/components/ProjectScreen* project/apps/client/src/features/workspace/components/ConversationDropTarget.tsx project/apps/client/src/features/workspace/components/ConversationActions.tsx project/apps/client/src/features/home/components/HomeSidebar.tsx project/apps/client/src/App.tsx
git commit -m "feat(client): add project detail and conversation assignment"
```

### Task 6: Global conversation directory and full-screen conversation

**Files:**
- Create: `project/apps/client/src/features/workspace/components/ConversationsScreen.tsx`
- Create: `project/apps/client/src/features/workspace/components/ConversationScreen.tsx`
- Create: `project/apps/client/src/features/workspace/components/ConversationScreen.module.css`
- Create: `project/apps/client/src/features/workspace/components/ConversationsScreen.test.tsx`
- Create: `project/apps/client/src/features/workspace/components/ConversationScreen.test.tsx`
- Modify: `project/apps/client/src/App.tsx`

**Interfaces:**
- Consumes: `WorkspaceService.getSnapshot()`, `getConversation(id)`, `continueConversation(id, text)`, existing `ActivityTimeline` and generated-file UI.
- Produces: cross-project filtered directory and dedicated full-screen conversation route.

- [ ] **Step 1: Write failing directory and detail tests**

```tsx
expect(await screen.findByRole('row', { name: /Filtro RC de 1 kHz/ })).toHaveTextContent('Filtros analógicos')
await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
expect(screen.getByRole('row', { name: /Diseñar divisor/ })).toBeVisible()

expect(await screen.findByRole('heading', { name: 'Filtro RC de 1 kHz' })).toBeVisible()
expect(screen.getByText('Interpretación')).toBeVisible()
expect(screen.getByRole('region', { name: 'Archivos generados' })).toHaveTextContent('report.pdf')
```

Add continuation tests for empty validation, pending state, retained text on failure, and updated conversation on success.

- [ ] **Step 2: Verify RED**

Run: `bun run test:client -- ConversationsScreen.test.tsx ConversationScreen.test.tsx`

Expected: FAIL because neither route screen implements the approved directory or detail behavior.

- [ ] **Step 3: Implement both screens**

The directory filters by normalized search text, project, and execution state. The detail route renders project breadcrumb or `Sin proyecto`, metrics, messages, timeline, files, and a continuation composer in one centered reading column. It does not render a permanent adjacent conversation list.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test:client -- ConversationsScreen.test.tsx ConversationScreen.test.tsx`

Expected: PASS for directory filtering, missing detail, complete/active/failed execution, files, and continuation states.

- [ ] **Step 5: Commit the conversation slice**

```bash
git add project/apps/client/src/features/workspace/components/ConversationsScreen* project/apps/client/src/features/workspace/components/ConversationScreen* project/apps/client/src/App.tsx
git commit -m "feat(client): add conversation directory and detail"
```

### Task 7: Integration, responsive polish, and verification

**Files:**
- Modify: `project/apps/client/src/features/workspace/components/WorkspaceShell.module.css`
- Modify: `project/apps/client/src/features/workspace/components/NewRequestScreen.module.css`
- Modify: `project/apps/client/src/features/workspace/components/ProjectsScreen.module.css`
- Modify: `project/apps/client/src/features/workspace/components/ProjectScreen.module.css`
- Modify: `project/apps/client/src/features/workspace/components/ConversationScreen.module.css`
- Modify: `project/apps/client/src/App.test.tsx`

**Interfaces:**
- Consumes: all completed route slices.
- Produces: one coherent responsive workspace with no regressions to home, settings, authentication, or assistant behavior.

- [ ] **Step 1: Add integration assertions**

Test navigation from new request to conversation, conversation assignment followed by project reload, project file source navigation, and settings/profile access from the new shell.

- [ ] **Step 2: Run integration tests and verify failures expose missing wiring**

Run: `bun run test:client -- App.test.tsx WorkspaceShell.test.tsx`

Expected: any missing service refresh or route wiring fails before the final integration edits.

- [ ] **Step 3: Complete responsive and interaction polish**

At `max-width: 1080px`, hide secondary metric columns. At `max-width: 720px`, use the existing sidebar drawer and stacked list rows. Add visible focus styles, reduced-motion rules, skeleton geometry, long-name truncation, drop-hover state, notification positioning, and assistant collision spacing.

- [ ] **Step 4: Run complete verification**

Run from `project/`:

```bash
bun run test:client
bun run lint:client
bun run build:client
```

Expected: all test files pass with zero failures, ESLint exits 0, and TypeScript/Vite build exits 0.

- [ ] **Step 5: Perform visual QA**

Inspect `/new`, `/projects`, one project conversation tab, its files tab, `/conversations`, and one full-screen conversation at desktop and mobile widths. Verify drag feedback, keyboard movement, undo, long titles, empty states, and assistant overlap.

- [ ] **Step 6: Review repository scope**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only client workspace files and approved documentation are part of this feature, while existing `tesina/` and agents `.env` changes remain untouched.

- [ ] **Step 7: Commit final integration polish**

```bash
git add project/apps/client/src
git commit -m "feat(client): complete project conversation workspace"
```
