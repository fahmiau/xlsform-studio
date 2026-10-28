# AGENTS.md

Operating manual for coding agents working in **xlsform-studio** — an offline-first
Tauri v2 desktop IDE for authoring [XLSForm](https://xlsform.org/) `.xlsx` files
(React 19 + TypeScript frontend, Rust shell, pure-TS core).

This file is the entry point. It is deliberately short on prose and long on
rules, paths, and commands. Everything here is verified against the code, not
the older design docs, where they disagree.

**Read next, in this order:**

| Doc                                                      | When you need it                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| [docs/agents/codebase-map.md](./docs/agents/codebase-map.md)   | Module-by-module graph: what lives where, what depends on what   |
| [docs/agents/recipes.md](./docs/agents/recipes.md)             | Step-by-step playbooks for the changes this repo actually gets   |
| [docs/agents/domain-glossary.md](./docs/agents/domain-glossary.md) | XLSForm/ODK vocabulary and the project's own shorthand     |
| [docs/agents/status.md](./docs/agents/status.md)               | What is done, what is unverified, what is intentionally absent   |

**Authoritative but longer:** [PRD.md](./PRD.md) (requirements) →
[plan.md](./plan.md) (architecture decisions AD-1…AD-15 + stage map) →
[CONTRIBUTING.md](./CONTRIBUTING.md) (human-facing gates) →
[docs/adr/](./docs/adr) (three ratified decisions).

---

## 1. Fast start

Prerequisites: **Node 22 LTS**, **pnpm 12**, **Rust stable** (`rust-toolchain.toml`,
MSRV 1.90), plus the platform WebView toolchain (WebView2 / WebKitGTK 4.1 / Xcode CLT).

```bash
pnpm install
pnpm tauri dev        # the real thing: native window, native IPC
pnpm dev              # Vite only, port 1420, NO native IPC — most features are dead here
```

`pnpm dev` is only useful for pure UI work and for Playwright, which stubs the
IPC bridge. If you claim a behavior works, it was checked in `pnpm tauri dev`.

| Command                        | What it actually runs                                      |
| ------------------------------ | ---------------------------------------------------------- |
| `pnpm build`                   | `tsc -b && vite build` (not a Tauri bundle)                |
| `pnpm lint`                    | `eslint .` — includes the AD-1 boundary rule               |
| `pnpm typecheck`               | `tsc -b --noEmit` (strict, `noUncheckedIndexedAccess`)     |
| `pnpm test`                    | `vitest run` — jsdom, setup in `tests/setup.ts`            |
| `pnpm coverage`                | v8 coverage with the `src/core` gate (see §2)              |
| `pnpm bench:lint`              | linter benchmark, **≤ 15 ms** local median                 |
| `pnpm bench:indexes`           | index rebuild, ≤ 5 ms target                               |
| `pnpm bench:grid`              | grid projection benchmark                                  |
| `pnpm test:e2e`                | Playwright on `pnpm dev`, Tauri IPC mocked per test        |
| `pnpm bindings:check`          | regenerate Specta bindings and fail on drift               |
| `pnpm fixtures`                | rebuild the synthetic corpus + reference form              |
| `pnpm bump-version <x.y.z>`    | sync `package.json` / `tauri.conf.json` / `Cargo.toml`     |

Rust gates (always with the manifest path):

```bash
cargo fmt   --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

---

## 2. Verify before you say "done"

Pick the row that matches the change. Do not skip rows because they look slow.

| Changed                                  | Required before reporting done                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| Anything in `src/`                       | `pnpm lint`, `pnpm typecheck`, `pnpm test`                      |
| `src/core/**`                            | above **+** `pnpm coverage` (gate fails below the thresholds)   |
| `src/core/lint/**`, `xpath/**`, `indexes/**` | above **+** `pnpm bench:lint` / `bench:indexes`             |
| Anything in `src-tauri/**`               | the three `cargo` gates above                                   |
| A `#[tauri::command]`, `AppError` variant, or event | `pnpm bindings` then `pnpm bindings:check` must show no diff |
| UI flow, shortcut, or dialog             | `pnpm test:e2e` **and** a manual pass in `pnpm tauri dev`        |
| `.xlsx` read/write                       | `pnpm test` — `roundtrip.test.ts` + `corpus.test.ts` must stay green |
| Docs only                                | nothing, but keep links valid                                   |

Non-negotiables (from plan.md §7):

- No new `@ts-ignore`, `eslint-disable`, `.skip`, `.todo`, or lowered coverage
  threshold without a written reason in the change description.
- Bug fixes ship with a regression test. New `src/core` logic ships with tests.
- Never log secrets, API keys, absolute file paths, or workbook contents.
- If you did not verify something in the native app, say so explicitly.

---

## 3. Architecture in one page

```
┌──────────────────────────────────────────────────────────────────────┐
│ WebView (React 19)                                                   │
│                                                                      │
│  src/features/**   shell · grid · choices · formula · outline ·       │
│                    lint-panel · languages · ai · preferences · file   │
│        │  reads            ▲ subscribes          │ commands/actions   │
│        ▼                   │                     ▼                   │
│  src/state/**      workbookStore (zundo) · derivedStore · uiStore ·   │
│                    prefsStore · stagingStore                          │
│        │  calls ops        │ recompute                               │
│        ▼                   │                                          │
│  src/core/**       PURE TypeScript over plain data (AD-1)             │
│                    model · xlsx · indexes · ops · xpath · lint ·      │
│                    refactor · slug · languages · ai                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Specta-typed IPC only
┌───────────────────────────────▼──────────────────────────────────────┐
│ Rust (src-tauri)  files · recovery · secrets · ai_proxy · app_info    │
│                   OS keychain · atomic writes · network egress        │
└──────────────────────────────────────────────────────────────────────┘
```

Dependencies point **inward**. `src/core` imports nothing but `src/core` and
`zod`/`exceljs`; `src/state` imports `core`; `src/features` imports both; Rust
knows nothing about the frontend's shape beyond the command signatures.

**Data flow, end to end**

- **Open**: `fileActions.openFile` → `commands.readWorkbook` (base64) →
  `core/xlsx/read.readWorkbook` → `workbookStore.load(data, {sourceHandle})`.
  The ExcelJS workbook is kept as an opaque `sourceHandle` for style-preserving
  writes; `warnings` from imperfect input rows are stored and shown in
  `AppShell`.
- **Edit**: a feature calls `workbookStore.apply(label, data => op(data), meta)`.
  One call = one `set` = **one undo entry**, however many ops it composes.
- **Save**: `core/xlsx/write.writeWorkbook(data, {sourceHandle})` → base64 →
  `commands.saveWorkbook` (temp file + fsync + rename, `AppError::FileLocked`
  on Excel's exclusive lock).
- **Derived**: `derivedStore` subscribes to `workbookStore`; any new `data`
  reference triggers index rebuild (sync) and lint (150 ms debounce, immediate
  on load/new).
- **AI Build**: `stagingStore` holds `{base, draft, diff}`; tools call the same
  `core/ops` on the draft; the grid renders a merged diff view; Accept commits
  the draft in one `apply`.

---

## 4. Hard rules and how each one is enforced

| #   | Rule | Enforcement / failure mode |
| --- | ---- | -------------------------- |
| R1 | **`src/core` stays pure.** No React, Zustand, zundo, Tauri, IPC, or app-layer imports. | ESLint `no-restricted-imports` in `eslint.config.js`. If you "need" Zustand in core, the state belongs in the caller. |
| R2 | **One user action = one `workbookStore.apply` = one undo entry.** Composite work composes ops inside the updater. | Call `apply` once. Two `apply` calls for one intent means users need two `Ctrl+Z`. |
| R3 | **One XPath implementation.** `core/xpath/tokenize.ts` feeds highlighting, autocomplete, lint rules XLS-004/005/008/011, and rename. | Do not add a regex or Lezer parser beside it. |
| R4 | **No network from the WebView.** CSP is `default-src 'self'` with IPC origins only; no external `connect-src`. | All provider traffic goes through `ai_proxy` in Rust. Adding a browser `fetch` to a provider will be blocked at runtime. |
| R5 | **API keys never enter JS.** Rust reads them from the OS keychain, injects headers, refuses redirects. | No command may return a key; the AI SDK receives a placeholder. Opener URLs are an exact allow-list in `src-tauri/capabilities/default.json` and a test fails if a provider is missing. |
| R6 | **`src/ipc/bindings.ts` is generated.** | Edit Rust and run `pnpm bindings`. A manual edit is erased and fails `bindings:check`. |
| R7 | **Headers are stored verbatim.** `ColumnKey` is the literal header text; meaning comes from `resolveColumn()`. | Breaking this renames columns on save and destroys round-trip fidelity. Duplicate headers get a `#2` model key but keep `headerText` for writing. |
| R8 | **Round-trip is load-bearing.** Values, header text, column order, sheet order, and unmanaged sheets survive a save; data-row styling after row moves is best effort. | `src/core/xlsx/roundtrip.test.ts` + the fixture corpus. Never "fix" a failing round-trip by normalizing the input. |
| R9 | **Linter must not produce false positives.** | `src/core/lint/corpus.test.ts` runs the whole rule set over real-world forms and asserts zero findings. |
| R10 | **Chat Mode never gets tools.** Build tools run on the staging draft only. | Enforced by construction in `features/ai/client.ts` (`chatStreamParams` has no `tools`) and tests. |
| R11 | **No silent scope creep.** Post-v1 backlog is listed in plan.md §11. | If a request is on that list, say so instead of building it. |

---

## 5. Repository map (short form)

```
src/core/          pure TS — the product's brain. Start at model/types.ts
  model/           types, column resolver, question types, appearances, factory, settings
  xlsx/            read / write / coerce / io  (ExcelJS)
  indexes/         variables, choices, groups, row ids — recomputed per data change
  ops/             rows, cells, columns, groups, choices, languages (pure, immer-friendly)
  xpath/           tokenize, function catalog, completion context
  lint/            runner + rules/xls001…xls011 + diagnostics index
  refactor/        renameVariable, renameList, renameChoiceValue (token-aware)
  slug/            slugify, list modes, name-lock inference
  ai/              zod tool schemas, applyTools, context budget, diff, lintDelta
src/state/         workbookStore (zundo) · derivedStore · uiStore · prefsStore · stagingStore
src/features/      one folder per surface; hooks + components + colocated tests
src/ipc/           GENERATED bindings.ts
src/lib/           command registry, shortcuts, base64, AppError → copy, theme
src-tauri/src/     commands/{files,recovery,secrets,ai_proxy,app_info}.rs, error.rs, lib.rs
tests/             fixtures/ (xlsx corpus, reference form), e2e/ (Playwright)
scripts/           benches, binary-size check, checksums, version bump
docs/              adr/ · agents/ · perf/ · qa/ · security/
plans/             stage-1…stage-6 plans; checkboxes are the progress tracker
```

Full detail, including exports and call paths: [docs/agents/codebase-map.md](./docs/agents/codebase-map.md).

Use codegraph to find context if needed

---

## 6. Where to change what

| Task                                   | Touch this                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------- |
| A lint message is wrong or missing     | `src/core/lint/rules/xls0NN.ts`; register in `rules/index.ts`; add a case to `rules.test.ts`; re-run `corpus.test.ts` |
| Add a new lint rule                    | New `rules/xls012.ts` exporting `LintRule`, register it, test it, benchmark it — recipe in [recipes.md](./docs/agents/recipes.md) |
| A column is misread                    | `core/model/columns.ts` (`resolveColumn`, alias tables) + `header-aliases.test.ts` |
| A cell value is mangled on open/save   | `core/xlsx/coerce.ts` (typing) or `write.ts` (emit rules); add a fixture, not a special case |
| Autocomplete / highlighting is off     | `core/xpath/*` for semantics; `features/formula/*` for presentation only   |
| Rename misses a reference              | `core/refactor/*` — replacement is token-based, never `String.replace` across text |
| Grid renders or edits wrongly          | `features/grid/` — `projection.ts`, `cellEditPipeline.ts`, `cells/*`, `editors/*` |
| A keyboard shortcut does nothing       | `lib/appCommands.ts` (registry) → `lib/shortcuts.ts` (capture-phase handler) → WebView2 accelerator lock in `src-tauri/src/lib.rs` |
| File save/open behavior                | `features/file/fileActions.ts` + `src-tauri/src/commands/files.rs` (atomic write, lock mapping) |
| AI provider setup / streaming          | `features/ai/*` for UX, `src-tauri/src/commands/ai_proxy.rs` for egress, `capabilities/default.json` for new opener URLs |
| Add a native command                   | `src-tauri/src/commands/*.rs`, register in `specta_builder()` in `lib.rs`, `pnpm bindings`, then wrap in `features/` — recipe in [recipes.md](./docs/agents/recipes.md) |

---

## 7. Conventions

- **Formatting** is Prettier: single quotes, semicolons, trailing commas, print
  width 100, 2 spaces, LF. Run `pnpm format` rather than hand-wrapping.
- **Type imports** must be `import type` / inline `type` (`consistent-type-imports`).
  Unused args/vars must be `_`-prefixed to pass lint.
- **`console.log` is a lint warning.** Only `warn`/`error` are allowed; user
  feedback goes through `sonner` toasts.
- **Tests live next to the source** (`foo.ts` + `foo.test.ts`). Only e2e and
  shared fixtures live under `tests/`. Component tests use Testing Library on
  jsdom; the Glide canvas is not pixel-tested — test the pure adapters instead.
- **Docblocks carry provenance.** Existing code cites `AD-n`, `Task n.n`, and
  `PRD §n` in comments; match that style so a reader can trace a line back to a
  decision.
- **Commit messages** are Conventional Commits (`feat(core): …`, `fix(lint): …`,
  `docs(plan): …`). When a plan task lands, tick its checkbox in
  `plans/stage-N-*.md` — those files are the progress tracker.
- **Rust**: keep `lib.rs` thin (builder + registration); commands live in
  `commands/`, every command returns `Result<T, AppError>`, and Tauri/Specta
  crates stay pinned with `=` in `Cargo.toml` (ADR 0002).

---

## 8. Traps that have already cost time

1. **`pnpm dev` is not the app.** No IPC → file dialogs, keychain, and AI are
   inert. Reproduce in `pnpm tauri dev`.
2. **WebView2 eats accelerators.** `Ctrl+R`/`F5`/DevTools are handled before the
   page sees them; `preventDefault` cannot stop them. The Rust side disables
   them (`lock_down_browser_accelerators`). Match shortcuts on `event.code`, not
   `event.key`, because of layout-dependent keys like `Ctrl+[`.
3. **Glide Data Grid is canvas.** No DOM nodes per cell; assert on the adapter
   functions (`projection`, `cellContent`, `clipboard`) and use e2e for pixels.
4. **jsdom gaps are patched in `tests/setup.ts`** (`ResizeObserver`,
   `Range.getClientRects`, `scrollIntoView`). If a component test dies on layout
   APIs, extend that file rather than mocking inside the test.
5. **Windows Smart App Control** can transiently block fresh Rust build scripts
   (`os error 4551`, `E0463`). Wait and retry or `cargo clean -p <crate>`; do not
   change Rust code to work around it (ADR 0002).
6. **`exactOptionalPropertyTypes` is off, `noUncheckedIndexedAccess` is on.**
   Array/record reads are `T | undefined` — write the guard instead of `!`.
7. **Do not regenerate fixtures to make a test pass.** The corpus encodes
   real-world quirks; a green test after a fixture rewrite proves nothing.
8. **Undo history only stores `data`.** Action metadata lives in a `WeakMap`
   (`getActionMeta`). Do not put UI state into the temporal store.

---

## 9. Keeping this file honest

- If you change a rule in §4, a command in §1, or a path in §5 in the same
  change, update this file in that change.
- If a claim here contradicts the code, the **code wins** — fix the doc.
- `docs/agents/status.md` is a snapshot with a date. Refresh the date when you
  update it; do not let it drift into fiction.
