# xlsform-studio

Offline-first desktop IDE for authoring [XLSForm](https://xlsform.org/) `.xlsx`
files, built with Tauri v2, React 19, and TypeScript.

> Status: **v1.0 feature-complete** (Stage 6). The release workflow and QA
> checklist exist; tagging `v1.0.0` and publishing the draft release wait for a
> human sign-off. See [plan.md](./plan.md), [plans/](./plans), and
> [CONTEXT.md](./CONTEXT.md).

## Features

- **Canvas grid** (Glide Data Grid) for `survey`, `choices`, and `settings`,
  with Excel/Sheets/LibreOffice TSV clipboard, fill handle, frozen columns,
  folding, and crash recovery.
- **Choices drawer** with auto-bound `list_name`, slugified choice names,
  manual name locks, shared-list forking, and cascading-filter columns.
- **XPath IDE** (CodeMirror 6) with `${variable}` and ODK function
  autocomplete, choice-value completion, and signature help.
- **Static linter** XLS-001…011 with click-to-jump diagnostics.
- **Rename refactoring** for variables, lists, and choice values, in one undo
  step.
- **Multi-language views** (all / single / split) and an Add Language dialog.
- **AI BYOK assistant** — Chat (read-only) and Build (staged tool calls with a
  visual diff and one-click Accept/Revert), through the user's own key or a
  local Ollama/LM Studio server.
- Round-trip-preserving `.xlsx` I/O via ExcelJS: values, headers, column and
  sheet order, and unmanaged sheets survive a save.

## Install (Windows, unsigned — Q3)

**[Download the latest release](https://github.com/fahmiau/xlsform-studio/releases/latest)**
(one NSIS `.exe`; the SHA-256 sums are attached to each release). Windows 10/11
x64 only for now — Linux and macOS builds are not published, because an unsigned
build cannot update itself and macOS reports one as damaged.

The builds are **not code-signed** yet. Run the installer, choose **More info**,
then **Run anyway**. If your organization blocks unsigned binaries, install from
source instead.

Updates ship inside the app: **Preferences → Updates → Check for updates**. The
check is manual — the app never phones home on its own.

## Offline & privacy

The app is offline-first. With the network disconnected, editing, linting,
refactoring, AI setup, and local models all work. There is **no telemetry** and
no background request: the only network traffic is what you start — an AI
request, or **Check for updates** (one HTTPS call to GitHub Releases, which
fetches `latest.json` and, if there is a newer build, the signed installer). The
WebView CSP has no external `connect-src`; both of those calls are Rust
commands/plugins, not WebView fetches.

- API keys live in the OS credential store (Windows Credential Manager, macOS
  Keychain, Linux Secret Service). No command returns a key to the UI, and the
  AI SDK receives a placeholder that Rust replaces.
- The proxy can only reach the provider base URL stored in its Rust binding;
  redirects are not followed, and the key is injected by Rust (never by JS).
- “Get a key” / billing links open the system browser through
  `tauri-plugin-opener`, scoped to the exact provider URLs listed in the
  registry. Model-supplied links in chat are plain text.
- The AI key input is write-only: it is cleared after Save and never enters
  preferences, recovery snapshots, logs, or React state beyond the keystroke.

## AI setup (BYOK)

Open the AI drawer with `Ctrl+J`.

1. **Paste a key.** The app detects the provider from the key prefix
   (`AIza…` → Gemini, `sk-ant-…` → Anthropic, `sk-or-…` → OpenRouter,
   `gsk_…` → Groq, `xai-…` → xAI, `sk-…` → OpenAI), stores it in the keychain,
   lists models, and picks a tool-capable default. Save is the only step.
2. **Use a local model.** While the card is visible it probes
   `http://localhost:11434/v1` (Ollama) and `http://localhost:1234/v1`
   (LM Studio). For Ollama: install it, run `ollama serve`, then
   `ollama pull qwen2.5:7b` (or any tool-capable model). Nothing leaves the
   machine and no key is needed.
3. **Custom.** Any OpenAI-compatible gateway (for example LiteLLM) with a base
   URL, optional key, and model ID.

Multiple providers can be saved at once; Preferences → **AI** manages them,
tests the model list, and switches the active one. Azure OpenAI, AWS Bedrock,
and Vertex AI need different auth shapes and are out of scope for v1 — use
OpenRouter or a custom gateway.

**Chat Mode** has no tools and cannot write to the workbook. Code blocks have
**Copy** and **Insert into Active Cell** (one undo step). **Build Mode** passes
the four XLSForm tools, stages every call on a draft, shows inserted rows in
emerald, modified cells in amber, and deleted rows in rose strikethrough, then
waits for **Accept (Enter)** or **Revert (Esc)**. Accept is one undo entry;
`Ctrl+Z` removes the whole AI change.

## Build from source

Requirements: Node 22 LTS (pnpm 12), Rust stable (`rust-toolchain.toml`), and
the platform WebView toolchain (WebView2 on Windows, WebKitGTK 4.1 development
packages on Linux, Xcode command line tools on macOS).

```bash
pnpm install
pnpm tauri dev      # native app
pnpm tauri build    # installers under src-tauri/target/release/bundle
```

### Commands

| Command                                      | Purpose                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                                   | Vite dev server (browser preview; no native IPC)       |
| `pnpm tauri dev`                             | Native app                                             |
| `pnpm build`                                 | Typecheck and build the web assets                     |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality gates                                          |
| `pnpm coverage`                              | Unit tests with the `src/core` ≥ 90% line gate         |
| `pnpm format:check`                          | Prettier                                               |
| `pnpm bench:lint`                            | Linter benchmark (≤ 15 ms local median)                |
| `pnpm bench:grid` / `pnpm bench:indexes`     | Grid projection / index benchmarks                     |
| `pnpm test:e2e`                              | Playwright flows with mocked Tauri IPC                 |
| `pnpm bindings` / `pnpm bindings:check`      | Regenerate / verify Specta bindings                    |
| `pnpm bump-version 1.0.0`                    | Sync package/Tauri/Cargo versions                      |
| `pnpm fixtures`                              | Regenerate the synthetic corpus and the reference form |

Rust gates: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test`, all with `--manifest-path src-tauri/Cargo.toml`.

### Layout

```
src/core/        pure TypeScript: model, xlsx I/O, indexes, ops, lint, AI tools
src/state/       zustand stores: document (zundo), derived, UI, prefs, staging
src/features/    shell, grid, choices, formula, outline, lint, languages, AI
src/ipc/         bindings.ts — generated by tauri-specta, do not edit
src-tauri/       Rust shell, scoped commands, Specta registration
tests/fixtures/  .xlsx corpus + reference-form generator
docs/adr/        architecture decision records
docs/qa/         release QA checklist
docs/security/   v1 security review
```

`src/core` may not import React, Zustand, Tauri, or app-layer modules; ESLint
enforces this. Every user action maps to one `workbookStore.apply` call and one
undo entry.

## Architecture decisions

- [ADR 0001 — `.xlsx` library: exceljs](./docs/adr/0001-xlsx-library.md)
- [ADR 0002 — Tauri dependency pins](./docs/adr/0002-tauri-dependency-pins.md)
- [ADR 0003 — Optional tauri-agent-kit bridge](./docs/adr/0003-agent-kit.md)
- Master plan: [plan.md](./plan.md); stage plans: [plans/](./plans)

## Optional native diagnostics (Windows x64)

```powershell
$env:TAURI_AGENT_KIT = "1"
pnpm tauri dev --features agent-kit
```

Debug builds only; release builds never start the bridge. See ADR 0003.

## Contributing & security

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).
Bundled pyxform fixtures are BSD-2-Clause; see `third-party/pyxform-LICENSE`.

## License

MIT.
