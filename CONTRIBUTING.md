# Contributing

Thanks for helping with xlsform-studio. This project is a Tauri v2 desktop app:
React/TypeScript in `src/`, Rust in `src-tauri/`, and all XLSForm logic in a pure
TypeScript core.

## Setup

- Node 22 LTS with pnpm 12 (`corepack enable` or install pnpm 12).
- Rust stable via `rust-toolchain.toml`.
- Platform prerequisites are listed in [README.md](./README.md).

```bash
pnpm install
pnpm tauri dev
```

## Before opening a PR

Run the gates that match your change:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage        # src/core must stay >= 90% lines
pnpm format:check
pnpm bench:lint      # when touching lint, xpath, or indexes
pnpm test:e2e        # when UI flows change
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm bindings:check  # when commands/types/events change
```

Windows note: Smart App Control can transiently block fresh Rust build scripts
(`os error 4551`, `E0463`). Wait and retry, or `cargo clean -p <crate>`. Do not
change Rust code to work around it. See
[docs/adr/0002-tauri-dependency-pins.md](./docs/adr/0002-tauri-dependency-pins.md).

## Architecture rules

Read [plan.md](./plan.md) (AD-1…AD-15) and [CONTEXT.md](./CONTEXT.md) first.

- **Pure core (AD-1).** `src/core/**` has no React, Zustand, Tauri, or app
  imports. Lint enforces it.
- **One action = one store call (AD-2).** Wrap composite edits in one
  `workbookStore.apply`.
- **One XPath tokenizer (AD-9).** Never add a parallel regex/Lezer XPath parser.
- **One undo entry.** Build Mode stages a draft and Accept applies it once.
- **Tests.** Non-trivial logic ships with a test; bug fixes add a regression
  test. Do not add `@ts-ignore`, `eslint-disable`, `.skip`, or weaker coverage
  thresholds without a written reason.
- **No secrets in logs.** Never log keys, file paths, or workbook contents.

## AI changes

- Keys live only in the OS keychain. No Rust command may return a key.
- `ai_proxy` builds URLs from the trusted Rust binding; keep the path
  validation, header stripping, redirect refusal, and cancellation tests green.
- The opener capability is an exact allow-list. Adding a provider means adding
  its key/billing URLs to `src-tauri/capabilities/default.json`; the registry
  test fails otherwise.
- Chat Mode must never pass tools. Build tools run on the staging draft only.

## Commits and releases

Use Conventional Commits (`feat(core): …`, `fix(lint): …`, `docs(plan): …`).
Update the stage checkbox in `plans/stage-N-*.md` when a task lands.

Versions are single-sourced from `package.json`:

```bash
pnpm bump-version 1.0.0
```

Tag `v1.0.0` only after the human sign-off in
[docs/qa/v1-checklist.md](./docs/qa/v1-checklist.md). The release workflow
builds unsigned installers into a draft GitHub release.

## Fixtures

The real-world corpus under `tests/fixtures/xlsx/real-world` comes from pyxform
under BSD-2-Clause. Do not relicense or modify valid fixtures in a way that
breaks the zero-false-positive lint test (`src/core/lint/corpus.test.ts`).
