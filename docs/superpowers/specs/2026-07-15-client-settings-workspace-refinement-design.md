# Client Settings Workspace Refinement Design

## Goal

Convert the current settings routes into a cohesive Codex-inspired settings workspace while keeping all data client-side and preserving the existing mock service boundary for a future RPC implementation.

## Approved interaction

- The profile popover exposes one `Configuración` destination and `Cerrar sesión`; model configuration is no longer a top-level popover item.
- `Configuración` opens `/settings/profile` and displays an internal settings navigation with `Perfil` and `Modelos y providers`.
- Selecting an internal destination updates the central workspace through React Router without replacing the surrounding application shell.
- The active settings destination is visibly selected and exposed with `aria-current="page"`.
- The assistant opener remains in the DOM for focus restoration, but is visually hidden whenever the assistant is compact or expanded.

## Visual structure

The application sidebar remains at the far left. Settings adds a narrow secondary rail inspired by Codex: back-to-app control, title, optional search affordance, and the two settings destinations. The central panel uses a restrained maximum width, stronger section hierarchy, consistent spacing, subtle borders, and compact controls.

The models screen contains:

1. A header with title, description, and a primary `Nueva conexión` action.
2. A `Conexiones` surface with one structured row per provider connection: provider identity, masked credential or local endpoint, status, and edit/delete actions.
3. An `Asignaciones por agente` surface with one compact row per configurable agent. Each row contains status, connection selector, model field, and a save action. Agents may independently choose models while sharing a connection.
4. Styled dialogs and empty/error states consistent with the settings workspace.

## Responsive behavior

On wide screens the application sidebar, settings rail, and content panel form three columns. On narrower screens the settings rail becomes a horizontal selector above the content, while the existing application sidebar retains its current mobile behavior.

## Data and scope

No backend work is included. Existing `SettingsService` methods and mock fixtures remain the sole data boundary. No API keys are exposed beyond their existing masked hints.

## Verification

Component tests cover the unified profile menu, route-aware settings navigation, assistant opener visibility, and model workspace semantics. The complete client test suite, ESLint, TypeScript/Vite build, and an in-browser visual pass are required before completion.
