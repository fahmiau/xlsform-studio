# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-15

### Added

- **AI BYOK assistant (Stage 6).** Provider registry as data (Gemini,
  Anthropic, OpenRouter, OpenAI, Groq, xAI, DeepSeek, Mistral, Ollama, LM
  Studio, Custom), paste-to-detect setup, live model listing, multi-provider
  management, and a friendly error table.
- **Chat Mode** with token-budgeted form context, streaming markdown,
  interactive `xlsform-choices` clarification cards, and Copy / Insert into
  Active Cell (one undo step).
- **Build Mode** with XLSForm tools on a staged draft, `ask_question`
  clarification prompts, live inline process status, emerald/amber/rose-strikethrough
  diff with changed-column header indicators, auto-reveal in collapsed groups,
  and Accept/Revert as one transaction.
- **Image & PDF attachments** in Chat and Build Mode via file picker,
  drag-and-drop, and clipboard paste (5 MB cap, read through a scoped Rust
  command).
- **Rust AI proxy**: OS keychain secrets, URL binding, header injection,
  redirect refusal, cancellation, and streaming over a Tauri channel, with
  wiremock coverage.
- **Native webview zoom**: `Ctrl+=`, `Ctrl+-`, and `Ctrl+0` shortcuts plus a
  persisted Preferences zoom selector (`80%`–`150%`).
- **Signed in-app updates & Windows release pipeline**: `v*` tag workflow
  building a signed Windows NSIS `.exe` into a draft GitHub release with
  `latest.json`, quality gates, a 15 MB binary-size budget, SHA-256 checksums,
  and manual **Preferences → Updates → Check for updates**.
- **Documentation**: README (Windows install, unsigned SmartScreen note,
  offline/privacy, BYOK/Ollama), CONTRIBUTING, SECURITY, changelog, and issue
  templates.

## [0.1.0] — 2026-10-21

### Added

- Tauri v2 shell with a typed, Specta-generated command surface.
- Pure TypeScript core model, ExcelJS round-trip `.xlsx` I/O, derived indexes,
  pure ops, and zundo history.
- Glide grid for survey/choices/settings with TSV clipboard, fill, row/column
  operations, folding, crash recovery, and autosave.
- Choices drawer with slug auto-naming, locks, shared-list forking, and filters.
- CodeMirror XPath IDE and the XLS-001…011 linter.
- Rename refactoring, multi-language views, command palette, and preferences.
