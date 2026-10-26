# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **AI BYOK assistant (Stage 6).** Provider registry as data (Gemini,
  Anthropic, OpenRouter, OpenAI, Groq, xAI, DeepSeek, Mistral, Ollama, LM
  Studio, Custom), paste-to-detect setup, live model listing, multi-provider
  management, and a friendly error table.
- **Chat Mode** with token-budgeted form context, streaming markdown, and
  Copy / Insert into Active Cell (one undo step).
- **Build Mode** with four XLSForm tools on a staged draft, an
  emerald/amber/rose-strikethrough diff, auto-reveal in collapsed groups, and
  Accept/Revert as one transaction.
- **Rust AI proxy**: OS keychain secrets, URL binding, header injection,
  redirect refusal, cancellation, and streaming over a Tauri channel, with
  wiremock coverage.
- **Release pipeline**: `v*` tag workflow building `.msi`, NSIS `.exe`, `.deb`,
  `.AppImage`, and separate arm64/x86_64 `.dmg` files into a draft release,
  with quality gates, a 15 MB binary-size budget, and SHA-256 checksums.
- **Documentation**: README rewrite (install, unsigned bypass, offline/privacy,
  BYOK/Ollama), CONTRIBUTING, SECURITY, changelog, issue templates, QA
  checklist, and the v1 security review.

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
