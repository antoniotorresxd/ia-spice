# Final settings fixes — TDD report

## Scope

- Added a reusable settings dialog with initial focus, Escape dismissal, Tab focus containment, and opener focus restoration.
- Added dirty connection-form dismissal confirmation shared by Cancel and Escape, including dirty-state reset after save/reopen.
- Explicitly close the profile menu when mobile navigation closes.
- Disable profile name, avatar input, discard, and submit controls during an in-flight save.
- Preserved unrelated `project/apps/agents/.env` and `tesina/` changes.

## RED evidence

Focused regression command:

`./node_modules/.bin/vitest run src/features/home/components/HomeSidebar.test.tsx src/features/settings/components/ProfileSettingsScreen.test.tsx src/features/settings/components/ModelSettingsScreen.test.tsx`

Initial result: 4 failures / 29 tests. Expected failures showed missing connection-dialog initial focus, missing delete-dialog initial focus, missing dirty Escape dismissal behavior, and enabled profile name during a deferred save.

Additional dirty-state regression command:

`./node_modules/.bin/vitest run src/features/settings/components/ModelSettingsScreen.test.tsx -t "clears dirty state"`

Result before fix: 1 failure; `window.confirm` was unexpectedly called after a successful save and clean reopen.

## GREEN evidence

Focused covering suite:

`./node_modules/.bin/vitest run src/features/home/components/HomeSidebar.test.tsx src/features/settings/components/ProfileSettingsScreen.test.tsx src/features/settings/components/ModelSettingsScreen.test.tsx`

Result: 3 files passed, 30 tests passed, 0 failed.

Full client suite:

`./node_modules/.bin/vitest run`

Result: 19 files passed, 95 tests passed, 0 failed.

Lint:

`./node_modules/.bin/eslint .`

Result: exit 0, no diagnostics.

Build:

`/home/antonioxd/.bun/bin/bun run build`

Result: server RPC declarations, TypeScript project build, and Vite production build all exited 0; 101 modules transformed.

All commands ran from `project/apps/client` with Linux Bun available at `/home/antonioxd/.bun/bin`.
