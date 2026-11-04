# Releasing xlsform-studio (Windows only)

Windows only until the app is code-signed: Gatekeeper reports an unsigned macOS
build as damaged and it cannot auto-update, and Linux has no signed distribution
story either. One platform done well beats three done badly.

## The model (read once)

```
package.json version  ──bump-version──▶  tauri.conf.json + Cargo.toml + Cargo.lock
        │
        └─ git tag v1.0.0 ──▶ .github/workflows/release.yml
                                   │
                                   ├─ quality gates (lint, typecheck, coverage,
                                   │   cargo fmt/clippy/test, bindings, bench)
                                   └─ windows build ──▶ DRAFT release
                                                        ├─ xlsform-studio_1.0.0_x64-setup.exe
                                                        ├─ *.sig            (updater signature)
                                                        ├─ latest.json      (updater manifest)
                                                        └─ SHA256SUMS-*.txt
                                                              │
                                              a human publishes the draft
                                                              │
                                                              ▼
                                    https://github.com/fahmiau/xlsform-studio/releases/latest
```

Rules that follow from that picture:

1. **A version is immutable.** Never re-tag the same number with different bits.
   Users who already updated will not come back for it.
2. **Drafts are invisible.** Users and the updater only see *published* releases.
3. **`latest` is the newest published, non-prerelease release.** Publish in order.
4. **The tag must equal the version** — `v1.0.0` for `1.0.0`. The release workflow
   fails the build if they disagree (`scripts/bump-version.mjs --check`).

## Setup (already applied)

| Area       | State                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| Version    | `1.0.0` in `package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`              |
| Updater    | `tauri-plugin-updater = "=2.14.1"`, registered in `src-tauri/src/lib.rs`              |
| JS         | `@tauri-apps/plugin-updater@2.14.1` (exact, matches the crate)                         |
| Config     | `plugins.updater.pubkey` + the GitHub `latest.json` endpoint                           |
| Bundling   | `createUpdaterArtifacts: true`, `targets: ["nsis"]`, `installMode: currentUser`        |
| Capability | `updater:default` in `src-tauri/capabilities/default.json`                             |
| UI         | **Preferences → Updates → Check for updates** (`src/features/preferences/sections/`)   |

Nothing checks for updates on startup. The only update traffic is a click, so the
README's "no background request" claim holds.

### The signing key — yours to keep safe

The keypair is at `%USERPROFILE%\.tauri\xlsform.key` (private) and `.pub`
(public). The public half is baked into `src-tauri/tauri.conf.json`; the private
half is the `TAURI_SIGNING_PRIVATE_KEY` repository secret.

**Back it up offline** (password manager, encrypted USB). If it is lost, every
installed copy is stuck on its current version forever — there is no recovery and
no rotation without shipping a new public key.

It was generated **without a password**. If you want one, do it *before* the
first release: regenerate with `-p`, put the new public key in `tauri.conf.json`,
re-set both secrets. After `1.0.0` ships, changing the key breaks updates for
everyone who installed it.

## Pre-flight

```powershell
pnpm bump-version --check
pnpm lint ; pnpm typecheck ; pnpm test
cargo fmt    --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test   --manifest-path src-tauri/Cargo.toml
gh secret list --repo fahmiau/xlsform-studio
```

The last one must show `TAURI_SIGNING_PRIVATE_KEY`. Without it the Windows
bundle step fails at signing time, after a 20-minute build.

Then, in **Settings → Code security**: *Secret scanning* and *Push protection*
on. A `LICENSE` file already exists.

## First release

```powershell
git add -A
git push origin main

git tag -a v1.0.0 -m "xlsform-studio 1.0.0"
git push origin v1.0.0        # a plain `git push` does NOT push tags
```

1. **Actions → ci** on `main` goes green first — the cheap check before you
   spend a Windows build.
2. **Actions → release** — quality gates (~5 min), then the Windows build
   (~15–25 min cold, faster with the Rust cache).
3. **Releases → the new draft → Edit → Publish release.** Leave *Set as the
   latest release* checked, *pre-release* unchecked.
4. **Verify the public path:** open
   `https://github.com/fahmiau/xlsform-studio/releases/latest` in a private
   window, download the `.exe`, install it, and confirm **Preferences → Updates
   → Check for updates** answers "You are on the newest version."

### Smoke checklist for the installed build

Run these against the installed `.exe`, not `pnpm tauri dev`:

- [ ] First launch opens a window; no blank screen.
- [ ] `Ctrl+O` opens a real `.xlsx`; the grid shows questions and choices.
- [ ] Edit a cell, `Ctrl+S`, reopen — the change survived, styling intact.
- [ ] `Ctrl+Z` undoes that edit; `Ctrl+Y` redoes it.
- [ ] The linter panel shows diagnostics for a form with a known mistake.
- [ ] **Preferences → Updates → Check for updates** reports "newest version".
- [ ] Close and reopen: window size and position are restored.

If the workflow fails at *Version files are in sync*, the tag and the file version
disagree — delete nothing, fix the version, delete the tag
(`git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0`) and retry. Nobody has
seen the release yet.

## Shipping an update (the normal loop)

```powershell
pnpm bump-version 1.0.1
git commit -am "chore(release): 1.0.1"
git push origin main
git tag -a v1.0.1 -m "xlsform-studio 1.0.1"
git push origin v1.0.1
```

1. The workflow rebuilds, signs the installer, writes `latest.json` with `1.0.1`
   and the `.sig` content, and creates a **draft**.
2. You publish the draft.
3. On a user's machine, **Check for updates** fetches
   `/releases/latest/download/latest.json`, compares `1.0.1 > 1.0.0`, verifies the
   signature against the pubkey baked into the app, downloads, and runs the
   installer. On Windows the app exits during install — expected; the installer
   relaunches it.

Until you publish step 2, nothing happens for anyone. That is the most common
"the updater is broken" cause.

### Semver, briefly

- `1.0.0 → 1.0.1` — bug fix, safe, everyone should take it.
- `1.0.1 → 1.1.0` — new feature, compatible with existing `.xlsx` files.
- `1.1.0 → 2.0.0` — breaks something users depend on: a file format they must
  migrate, a preference that resets, a removed feature.

When unsure, it is a patch. A surprise major is worse than a slow one.

### When a release is bad

Users who already updated cannot be pulled back: the updater refuses to downgrade
by default. The fix is always **a new, higher version** with the revert in it.
Deleting the release or the tag only changes what new downloaders get.

### Testing the update path before you have users

`pnpm tauri dev` cannot check for updates (no feed, no installed bundle). The
first real test needs two releases: install `1.0.0`, publish `1.0.1`, click the
button in the installed app.

## After the first release

- Dependabot alerts on (free; the pinned Tauri crates make updates rare).
- Add "install N-1, update to N, confirm it relaunches" to the smoke checklist.
- If downloads grow, buy a Windows code-signing certificate before building a
  landing page. SmartScreen is the real "download page" problem.
