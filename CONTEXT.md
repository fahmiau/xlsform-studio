# CONTEXT.md

Project map and handoff state for AI coding agents and humans. Rules and workflow gates live in [AGENTS.md](./AGENTS.md); setup and scripts in [README.md](./README.md); master architecture decisions (`AD-1`…`AD-15`) in [plan.md](./plan.md); and detailed stage plans in [plans/](./plans/).

## What this is

`xlsform-studio` (`io.github.fahmiau.xlsformstudio`) — an offline-first desktop IDE for authoring XLSForm `.xlsx` files. Built with Tauri v2 (Rust shell) + React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Glide Data Grid + CodeMirror 6.

## Current status & handoff

| Stage                               | Plan                                                                                         | Status        | Notes                                                                                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation                      | [stage-1-foundation.md](./plans/stage-1-foundation.md)                                       | ✅ Complete   | Tauri shell, `exceljs` I/O (ADR 0001), typed model, indexes, `zundo` store, atomic file save + recovery, CI workflows                                                                                                                  |
| 2 — Grid editor                     | [stage-2-grid-editor.md](./plans/stage-2-grid-editor.md)                                     | ✅ Complete   | Glide Data Grid for `survey`/`choices`, Settings sheet form+grid view, TSV clipboard, fill handle, row/col ops, crash recovery                                                                                                         |
| 3 — Choices & hierarchy             | [stage-3-choices-and-hierarchy.md](./plans/stage-3-choices-and-hierarchy.md)                 | ✅ Complete   | `type`/`appearance` editors, Smart Choices Drawer, slug engine + `nameLocked` inference (`AD-14`), group folding, auto-pairing, Outline Tree + `@dnd-kit`                                                                              |
| 4 — Formula IDE & linter            | [stage-4-formula-ide-and-linter.md](./plans/stage-4-formula-ide-and-linter.md)               | ✅ Complete   | Shared XPath tokenizer (`AD-9`, ~1.61 ms/1.5k exprs), CodeMirror 6 formula bar & cell overlay, linter rules `XLS-001`…`XLS-011` (~11–13 ms local median vs ≤ 15 ms gate), Lint panel + badge + grid/outline markers + `F8`/`Shift+F8`  |
| 5 — Refactoring, languages, palette | [stage-5-refactoring-languages-palette.md](./plans/stage-5-refactoring-languages-palette.md) | ⏭ **Next up** | Tasks 5.1–5.7: token-aware variable/list/choice rename refactoring, multi-language discovery & view modes (All / Single / Translation Split View), Add Language dialog, `Ctrl+K` command palette & shortcuts sheet, Preferences dialog |
| 6 — AI & release                    | [stage-6-ai-and-release.md](./plans/stage-6-ai-and-release.md)                               | ⏳ Pending    | Tasks 6.1–6.9: Rust `keyring` secrets + streaming `ai_proxy`, BYOK settings, AI Chat + Build Mode with draft diff staging (`AD-11`), release CI/CD & v1.0 QA                                                                           |

- **Current baseline (post-Stage 4):** 752 Vitest unit/component tests passing across 58 files (`src/core` line coverage ~97.5%), 13 Playwright E2E smoke tests passing, `pnpm bench:lint` wired into `.github/workflows/ci.yml` (`LINT_BENCH_LIMIT_MS=25` in CI, `15` ms local default).
- **Optional Stage 4 warm-up nits (non-blocking, can ride with Stage 5):**
  1. `scripts/bench-lint.ts`: validate `LINT_BENCH_LIMIT_MS` before running the benchmark warm-up/measurement loop so invalid env input fails fast.
  2. `src/core/lint/rules/rules.test.ts`: in the `XLS-002` test `'still warns for the case variant when the exact duplicates are lowercase'`, also assert `expect(warnings[0]?.message).toContain('"age" (row 1), "age" (row 2)')` for symmetry with the uppercase test.
- **Stage 5 integration pointers:**
  - Task 5.1 (`renameVariable`) should use `extractVarRefs` / `tokenizeXPath` from `src/core/xpath/tokenize.ts` and hook into `src/features/grid/useCellEditPipeline.ts` so the cell edit + propagation commit in a single `workbookStore.apply(...)` undo step.
  - Task 5.2 (`renameList`, `renameChoiceValue`) hooks into `src/features/choices-drawer/` (`ChoiceListDrawer.tsx` / header & mode regeneration) and matches choice literals using the same comparison/function patterns as `src/core/xpath/context.ts` and `src/core/lint/rules/xls011.ts`. Per Q6 in `plan.md`, choice value rename auto-applies in the same transaction and shows a toast with `[Undo]`.
  - Task 5.3 (`discoverLanguages`, `defaultLanguage`, `primaryLabelColumn`) should unify existing primary-label resolution in `src/core/indexes/variables.ts`, `src/features/grid/columns.ts`, `src/core/lint/rules/xls010.ts`, choices drawer, and completions. Note: keep `XLS-010`'s full-sheet skip when no recognized `label` column exists so legacy single-colon corpus fixtures (`group.xlsx`, `loop.xlsx`) stay at zero false positives.

## Data flow (one direction, never reversed)

```
.xlsx file ──exceljs──▶ src/core/xlsx ──▶ WorkbookData ──▶ workbookStore (zundo, limit 100)
                                               │
                            src/core/ops (pure (data,args)=>data) applied via one apply()/set()
                                               │
                     derivedStore ◀── src/core/indexes, src/core/lint, src/core/xpath
                                               │
                     features/* (grid, formula, lint-panel, outline, …) ◀── uiStore / prefsStore
```

Rust side (`src-tauri`) exposes typed commands; bindings are generated into `src/ipc/bindings.ts` via `tauri-specta`.

## Directory map

| Path                           | Role                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/model/`              | `types.ts` (`WorkbookData`, `SheetData`, `Row`), `columns.ts` (`resolveColumn` for verbatim headers & aliases), `questionTypes.ts`, `parseType.ts`, `factory.ts`                                      |
| `src/core/xlsx/`               | `read.ts`, `write.ts`, `coerce.ts` — lossless `.xlsx` I/O via `exceljs` + passthrough sheets                                                                                                          |
| `src/core/ops/`                | Pure immer-compatible mutations: `rows.ts`, `cells.ts`, `columns.ts`, `groups.ts`, `choices.ts` (and `languages.ts` in Stage 5)                                                                       |
| `src/core/indexes/`            | `variables.ts` (`variableMap`), `choices.ts` (`choicesByList`), `groupTree.ts` (`groupTree`), `rowIndexById`                                                                                          |
| `src/core/xpath/`              | `tokenize.ts` (shared hand-written XPath lexer + `extractVarRefs`), `functions.ts` (ODK function catalog), `context.ts` (cursor context & choice-literal patterns)                                    |
| `src/core/lint/`               | `types.ts`, `context.ts`, `runner.ts`, `rules/xls001.ts`…`xls011.ts`, `corpus.test.ts`                                                                                                                |
| `src/core/slug/`               | `slugify.ts` — snake/camel/passthrough slug engine, auto-numbering, `nameLocked` inference                                                                                                            |
| `src/state/`                   | `workbookStore.ts` (document + `zundo`), `derivedStore.ts` (indexes + debounced lint), `uiStore.ts` (selection, folds, panels, flash), `prefsStore.ts`                                                |
| `src/features/grid/`           | Glide Data Grid wrapper, `columns.ts`, `projection.ts` (fold/row projection), `useCellEditPipeline.ts`, `cells/` (type/appearance/markers), `editors/` (CodeMirror overlay, type/appearance popovers) |
| `src/features/formula/`        | `FormulaBar.tsx` (CodeMirror 6 for XPath columns, native input for plain text), `extensions.ts`, `completions.ts`, `lintExtension.ts`, `highlight.ts`                                                 |
| `src/features/choices-drawer/` | `ChoiceListDrawer.tsx`, bulk paste, slug mode toggle, shared-list indicator, cascade filter helper                                                                                                    |
| `src/features/outline/`        | `OutlinePanel.tsx` — virtualized hierarchy tree + `@dnd-kit` block drag-and-drop + error dots                                                                                                         |
| `src/features/lint-panel/`     | `LintPanel.tsx`, `LintBadge.tsx`, `navigate.ts` (`F8` / `Shift+F8` next/prev problem), `useDiagnosticsIndex.ts`                                                                                       |
| `src/features/settings-sheet/` | `SettingsSheetView.tsx` — form view + grid view (per Q7) for the `settings` tab                                                                                                                       |
| `src/features/file/`           | Open/save/new workflow, dirty guard, crash recovery banner & autosave hook                                                                                                                            |
| `src/features/shell/`          | `AppShell.tsx`, top bar, left sidebar tabs (Outline / Lint), right drawer host, status bar                                                                                                            |
| `src/lib/`                     | `commands.ts` (command registry), `shortcuts.ts` (capture-phase shortcut dispatcher), `platform.ts`                                                                                                   |
| `src/ipc/bindings.ts`          | **Generated** `tauri-specta` bindings — do not edit by hand                                                                                                                                           |
| `src-tauri/`                   | Rust shell (`lib.rs`, `error.rs`, `build.rs` manifest embedding), `commands/{files.rs, recovery.rs}` (and `secrets.rs`, `ai_proxy.rs` in Stage 6)                                                     |
| `tests/fixtures/`              | `generate-reference.ts`, `reference-workbook.ts`, synthetic edge-case `.xlsx` files, and `xlsx/real-world/` (pyxform corpus)                                                                          |
| `tests/e2e/`                   | Playwright smoke specs with mocked Tauri IPC                                                                                                                                                          |
| `docs/adr/`                    | `0001-xlsx-library.md`, `0002-tauri-dependency-pins.md`, `0003-agent-kit.md`                                                                                                                          |
| `docs/perf/`                   | Per-stage verification and benchmark records (`stage-2.md`…`stage-4.md`)                                                                                                                              |

## Key invariants & resolved product decisions

1. **Bundle ID (Q2):** `io.github.fahmiau.xlsformstudio`.
2. **`.xlsx` engine (Q1 / ADR 0001):** `exceljs` preserves styles, column widths, frozen panes, and unmanaged sheets.
3. **Settings UI (Q7):** Both form view and grid view are supported.
4. **Choice rename UX (Q6):** Auto-apply in one undo transaction with an `[Undo]` toast (no pre-confirmation modal).
5. **Release targets (Q3, Q4, Q8):** Ship unsigned for v1 (with README bypass docs); separate `aarch64` and `x86_64` macOS DMGs; no auto-updater in v1.
6. **Non-XPath formula bar (Stage 4 note):** `FormulaBar.tsx` uses CodeMirror 6 when the active column is an XPath column (`relevant`, `calculation`, `constraint`, `choice_filter`, `repeat_count`, `trigger`) and a lightweight native `<input>` for plain-text columns (`label`, `name`, etc.) so plain text is never decorated with XPath tokens or bracket errors.

## Test & benchmark commands

- **Unit & component:** `pnpm test` (Vitest, colocated `*.test.ts(x)`)
- **Core coverage gate:** `pnpm coverage` (`src/core` ≥ 90% lines)
- **Benchmarks:** `pnpm bench:xlsx`, `pnpm bench:indexes`, `pnpm bench:lint`, `pnpm bench:grid`
- **E2E smoke:** `pnpm test:e2e` (Playwright, mocked IPC)
- **Rust checks:** `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml`
- **IPC drift check:** `pnpm bindings:check`
