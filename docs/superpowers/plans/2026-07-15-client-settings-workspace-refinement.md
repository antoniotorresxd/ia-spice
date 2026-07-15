# Client Settings Workspace Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Codex-inspired client-only settings workspace, polish model/provider configuration, and remove the duplicated assistant opener while its panel is open.

**Architecture:** Keep the existing application shell and mock service boundary. Add route-aware settings navigation inside `SettingsShell`, give model configuration its own focused CSS module, and retain the assistant opener node while enforcing its hidden visual state.

**Tech Stack:** React 19, React Router DOM 7, TypeScript, CSS Modules, Vitest, Testing Library, Bun/Vite.

## Global Constraints

- Work directly on branch `dev`.
- Client only; do not add or change backend/RPC behavior.
- Preserve the existing `SettingsService` interface and mock data boundary.
- Preserve unrelated changes under `tesina/` and `project/apps/agents/.env`.
- Follow test-driven development: each behavior test must fail for the expected reason before production code changes.

---

### Task 1: Assistant opener visibility

**Files:**
- Modify: `project/apps/client/src/features/home/components/AssistantPanel.test.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeScreen.module.css`

**Interfaces:**
- Consumes: existing `AssistantPanel` modes `minimized | compact | expanded`.
- Produces: opener is visible only in `minimized`, while its stable DOM node remains available for focus restoration.

- [ ] Add assertions that `Abrir asistente` is not visible in compact or expanded mode and is visible in minimized mode.
- [ ] Run `bun run test:client -- AssistantPanel.test.tsx` and confirm the new assertion fails because the class display rule overrides the native `hidden` attribute.
- [ ] Add an explicit `.home-assistant-opener[hidden] { display: none; }` rule.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Unified settings entry and route-aware navigation

**Files:**
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.test.tsx`
- Modify: `project/apps/client/src/features/home/components/HomeSidebar.tsx`
- Create: `project/apps/client/src/features/settings/components/SettingsShell.test.tsx`
- Modify: `project/apps/client/src/features/settings/components/SettingsShell.tsx`
- Modify: `project/apps/client/src/features/settings/components/SettingsShell.module.css`

**Interfaces:**
- Consumes: React Router `useLocation`, `NavLink`, and existing `/settings/profile`, `/settings/models` routes.
- Produces: profile popover item `Configuración`; internal navigation links `Perfil` and `Modelos y providers` with route-derived active state.

- [ ] Replace the two profile-menu route expectations with one expectation that `Configuración` navigates to `/settings/profile`.
- [ ] Run the sidebar test and confirm it fails because that menu item does not exist.
- [ ] Update `HomeSidebar` to render `Configuración` and `Cerrar sesión` only.
- [ ] Add a shell test that renders each settings route and asserts the correct internal link has `aria-current="page"` and `Volver a la aplicación` targets `/`.
- [ ] Run the shell test and confirm it fails because the internal rail does not exist.
- [ ] Implement the settings rail and responsive styles, then re-run both focused tests.

### Task 3: Structured model/provider workspace

**Files:**
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.test.tsx`
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.tsx`
- Modify: `project/apps/client/src/features/settings/components/AgentAssignmentList.tsx`
- Modify: `project/apps/client/src/features/settings/components/ConnectionForm.tsx`
- Modify: `project/apps/client/src/features/settings/components/SettingsDialog.tsx`
- Create: `project/apps/client/src/features/settings/components/ModelSettingsScreen.module.css`

**Interfaces:**
- Consumes: existing `LlmConnection[]`, `AgentAssignment[]`, and `SettingsService` mutation methods.
- Produces: labelled `Conexiones` and `Asignaciones por agente` surfaces; compact semantic rows with status and existing actions.

- [ ] Add semantic assertions for the two labelled surfaces, provider status, and agent-row controls while preserving all existing mutation tests.
- [ ] Run the focused model screen tests and confirm the new assertions fail because the surfaces and row structure are absent.
- [ ] Add CSS-module class contracts to the screen, connection form, dialog, and assignment rows; keep all service calls unchanged.
- [ ] Implement the polished two-section layout, compact rows, empty state, action hierarchy, focus states, and responsive stacking.
- [ ] Re-run the focused model tests and refactor only after they are green.

### Task 4: Full verification and visual QA

**Files:**
- Review all files modified by Tasks 1-3.

**Interfaces:**
- Consumes: completed settings refinement.
- Produces: verified client behavior and presentation.

- [ ] Run `bun run test:client` from `project/`; expect all test files and tests to pass with zero failures.
- [ ] Run `bun run lint:client`; expect exit code 0 and no ESLint errors.
- [ ] Run `bun run build:client`; expect TypeScript and Vite build exit code 0.
- [ ] Open `/settings/models` in the local app and inspect wide and narrow layouts, assistant compact/expanded/minimized states, profile popover, and both settings destinations.
- [ ] Review `git diff --check` and `git status --short`, confirming unrelated user files remain untouched.
