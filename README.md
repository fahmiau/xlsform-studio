# xlsform-studio

A fast, offline desktop editor for [XLSForm](https://xlsform.org/) (`.xlsx`)
surveys — built for researchers, M&E teams, and data managers who author forms
in Excel for **ODK Collect / Central**, **KoboToolbox**, **SurveyCTO**, or
**CommCare**.

---

## Who is this for?

If you only need a short, simple survey, a drag-and-drop web form builder is
usually faster. **xlsform-studio** is built for people who use **Excel or Google
Sheets** because their surveys have complex skip logic, cascading choices,
repeat groups, multiple languages, or strict workbook conventions — and who are
tired of Excel's blind spots:

| Pain point in Excel                                       | In xlsform-studio                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Typing `${question_name}` and ODK functions blind         | Formula autocomplete (`Ctrl+Space`) for `${variables}`, choice values, and ODK functions with inline parameter hints           |
| Uploading to Kobo/ODK only to find a typo 2 minutes later | Instant error & warning checks (`XLS-001…011`) as you type — click a diagnostic or press `F8` to jump straight to the cell     |
| Switching back and forth between `survey` and `choices`   | **Choices drawer** (`Ctrl+Enter`) right next to the question, with auto-slugified choice names and cascading-filter columns    |
| Renaming a variable breaks `${old_name}` formulas         | Safe rename refactoring updates references across expressions, choice lists, and choice values in one `Ctrl+Z` undo step       |
| Managing 2–5 languages in wide spreadsheets               | Switch between **All languages**, **Single language**, or **Side-by-side split** views                                         |
| Losing track inside nested `begin_group` / `begin_repeat` | Outline sidebar (`Ctrl+F` to search), collapsible blocks (`Ctrl+[` / `Ctrl+]`), and wrap shortcuts (`Ctrl+G` / `Ctrl+Shift+G`) |
| Messing up existing `.xlsx` files                         | Opens and saves `.xlsx` directly while preserving custom columns, unmanaged sheets, header text, and styling                   |

> Works completely **offline** — no Excel license, no account, and no cloud
> server required.

---

## Download & Install (Windows)

> **Platform support:** Windows 10 / 11 (64-bit) only for v1.0. Linux and macOS
> builds are not published yet because unsigned builds cannot auto-update and
> macOS Gatekeeper blocks unsigned apps.

1. Open the **[Latest Release](https://github.com/fahmiau/xlsform-studio/releases/latest)** page.
2. Scroll down to **Assets** and download **`xlsform-studio_1.0.0_x64-setup.exe`**
   _(you do not need `Source code (zip)` or `.sig` files)_.
3. Double-click the downloaded `.exe` to install.
   - **Windows / Edge warning:** Because this v1.0 release is open-source and
     does not yet have a paid Windows code-signing certificate, Edge may warn
     that the installer _"isn't commonly downloaded"_ and Windows SmartScreen
     may say _"Windows protected your PC"_. Click **Keep** in Edge, then **More
     info → Run anyway** in Windows.
   - To verify the download before running it, compare its SHA-256 hash against
     `SHA256SUMS-windows-x64.txt` on the release page.
   - If your organization blocks unsigned `.exe` files, ask IT or build from
     source below.
4. **Updates:** Open **Preferences → Updates → Check for updates** inside the
   app. The app never checks automatically in the background.

---

## Quick tour & shortcuts

- **Spreadsheet feel:** Copy and paste tab-separated ranges directly between
  xlsform-studio, Excel, Google Sheets, and LibreOffice Calc; drag the fill
  handle; freeze columns; and recover unsaved work after a crash.
- **No hidden menus needed:** Press `Ctrl+K` at any time to search every
  command, or `Shift+?` to see all shortcuts.
- **Readable at any screen DPI:** Zoom with `Ctrl+=`, `Ctrl+-`, and `Ctrl+0`
  (or pick `80%`–`150%` in **Preferences**).

| Shortcut                       | Action                                            |
| ------------------------------ | ------------------------------------------------- |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New / Open / Save `.xlsx`                         |
| `Ctrl+Z` / `Ctrl+Y`            | Undo / Redo                                       |
| `Ctrl+Enter`                   | Open the Choices drawer for the active question   |
| `Ctrl+Space`                   | Trigger `${variable}` / ODK function autocomplete |
| `Ctrl+G` / `Ctrl+Shift+G`      | Wrap selected rows in a `group` or `repeat`       |
| `Ctrl+[` / `Ctrl+]`            | Collapse / expand active group or repeat          |
| `Ctrl+I` / `Ctrl+Shift+I`      | Insert row below / above                          |
| `Ctrl+F`                       | Search the form outline                           |
| `F8` / `Shift+F8`              | Jump to next / previous validation problem        |
| `Ctrl+J`                       | Toggle the optional AI assistant                  |
| `Ctrl+K`                       | Open command palette                              |

---

## Optional AI assistant (BYOK or local)

The editor works 100% without AI. If you want an assistant that understands your
current XLSForm, press `Ctrl+J`:

1. **Use your own API key (BYOK):** Paste a key and click **Save** — the app
   auto-detects the provider from the key prefix (`AIza…` Google Gemini,
   `sk-ant-…` Anthropic Claude, `sk-or-…` OpenRouter, `gsk_…` Groq,
   `xai-…` xAI, `sk-…` OpenAI), or pick **DeepSeek**, **Mistral**, or a
   **Custom** OpenAI/Anthropic-compatible gateway (such as LiteLLM). Azure
   OpenAI, AWS Bedrock, and Vertex AI are not built-in for v1 — use OpenRouter
   or a custom gateway.
2. **Use a local model (free, 100% offline):** Install
   [Ollama](https://ollama.com/) (`ollama serve`, then `ollama pull qwen2.5:7b`
   or any tool-capable model) or [LM Studio](https://lmstudio.ai/). While the
   local card is visible, the app probes `http://localhost:11434/v1` and
   `http://localhost:1234/v1`. Nothing leaves your computer.

- **Chat Mode** is read-only and cannot edit your workbook. Code blocks include
  **Copy** and **Insert into Active Cell**.
- **Build Mode** drafts edits safely without touching your saved file: added
  rows appear in emerald, edited cells in amber, and deleted rows in rose
  strikethrough. Review the diff and press **Accept (Enter)** (one `Ctrl+Z`
  step undoes the whole AI change) or **Revert (Esc)**.
- **Attachments:** Drop, paste, or pick **images or PDFs** (up to 5 MB) — for
  example a paper questionnaire or screenshot — and ask Chat or Build Mode to
  turn them into XLSForm questions.

---

## Offline & privacy

- **Zero telemetry and no background requests:** With Wi-Fi off, editing,
  validation, refactoring, and local AI models all work. The only network calls
  happen when _you_ send an AI prompt or click **Check for updates**.
- **Keys stay in your OS credential store:** API keys are saved in Windows
  Credential Manager (macOS Keychain / Linux Secret Service on source builds),
  never in preferences files, crash recovery snapshots, logs, or frontend UI
  state.
- **Scoped Rust proxy & WebView CSP:** The UI cannot make arbitrary external
  fetch requests; Rust injects the stored key only when calling the saved
  provider endpoint and refuses HTTP redirects.

---

## For developers & contributors

Built with **Tauri v2**, **React 19**, **TypeScript**, and **Rust**.

### Build from source

Requirements: **Node 22 LTS** (`pnpm` 12), **Rust stable**
(`rust-toolchain.toml`), and the platform WebView toolchain (WebView2 on
Windows, WebKitGTK 4.1 development packages on Linux, Xcode command line tools
on macOS).

```bash
pnpm install
pnpm tauri dev      # native app
pnpm tauri build    # installers under src-tauri/target/release/bundle
```

### Commands

| Command                                      | Purpose                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                                   | Vite dev server (browser preview; no native IPC) |
| `pnpm tauri dev`                             | Native desktop app                               |
| `pnpm build`                                 | Typecheck and build web assets                   |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality gates                                    |
| `pnpm coverage`                              | Unit tests with the `src/core` ≥ 90% line gate   |
| `pnpm format:check`                          | Prettier formatting check                        |
| `pnpm bench:lint`                            | Linter benchmark (≤ 15 ms local median)          |
| `pnpm bench:grid` / `pnpm bench:indexes`     | Grid projection / index benchmarks               |
| `pnpm test:e2e`                              | Playwright flows with mocked Tauri IPC           |
| `pnpm bindings` / `pnpm bindings:check`      | Regenerate / verify Specta bindings              |
| `pnpm bump-version <x.y.z>`                  | Sync package / Tauri / Cargo versions            |
| `pnpm fixtures`                              | Regenerate synthetic corpus and reference form   |

Rust gates: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
and `cargo test` (all with `--manifest-path src-tauri/Cargo.toml`).

### Layout

```text
src/core/        pure TypeScript: model, xlsx I/O, indexes, ops, lint, AI tools
src/state/       zustand stores: document (zundo), derived, UI, prefs, staging
src/features/    shell, grid, choices, formula, outline, lint, languages, AI
src/ipc/         bindings.ts — generated by tauri-specta, do not edit
src-tauri/       Rust shell, scoped commands, Specta registration
tests/fixtures/  .xlsx corpus + reference-form generator
```

`src/core` may not import React, Zustand, Tauri, or app-layer modules; ESLint
enforces this (`AD-1`). Every user action maps to one `workbookStore.apply` call
and one undo entry (`AD-2`).

### Architecture decisions

- **`.xlsx` via ExcelJS** — round-trips unmanaged sheets, header text, column
  order, and cell styling that simpler parsers drop.
- **Tauri and Specta crates are pinned with `=`** — prevents unexpected minor API
  drift and avoids fresh build scripts tripping Windows Smart App Control.
- **`tauri-agent-kit` is optional and debug-only** — release builds never start
  the automation bridge.

### Optional native diagnostics (Windows x64)

```powershell
$env:TAURI_AGENT_KIT = "1"
pnpm tauri dev --features agent-kit
```

### Contributing, changelog & security

See [CONTRIBUTING.md](./CONTRIBUTING.md), [CHANGELOG.md](./CHANGELOG.md), and
[SECURITY.md](./SECURITY.md). Bundled pyxform test fixtures are BSD-2-Clause;
see `third-party/pyxform-LICENSE`.

## License

MIT.
