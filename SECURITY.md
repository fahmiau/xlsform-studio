# Security policy

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** (private advisory) on this
repository. Do not open a public issue for a suspected vulnerability. Include
the version, platform, reproduction steps, and the impact you expect.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

v1 installers are unsigned (Q3). SmartScreen/Gatekeeper warnings are expected;
verify downloads against the `SHA256SUMS-*.txt` files attached to the release.

## Design controls

- **Keys**: stored in the OS credential store through `keyring` (Windows
  Credential Manager, macOS Keychain, Linux Secret Service). No command returns
  a key; the AI SDK holds only a placeholder and Rust injects the real header.
- **Network**: the production CSP has no external `connect-src`. The only egress
  is the `ai_proxy` command, restricted to the base URL stored in a Rust
  binding, with redirects disabled and `..`/absolute-URL/`@` paths rejected.
  Provider auth headers, `Host`, `Cookie`, and `Content-Length` cannot be
  overridden by the WebView.
- **External links**: `tauri-plugin-opener` is granted `open_url` only, with an
  exact URL allow-list covering the provider key/billing pages. There is no
  `open_path` or `reveal_item_in_dir` permission. A registry test enforces that
  every preset URL is in the allow-list.
- **Markdown**: assistant messages render through `react-markdown` +
  `remark-gfm` with no raw HTML plugin, no remote images, and no clickable
  model-supplied links.
- **Workbook files**: reads/writes go through scoped `.xlsx` commands with
  atomic saves; there is no general filesystem plugin.
- **Data on disk**: preferences contain no secrets; recovery snapshots contain
  workbook data only and are never sent anywhere.
- **Logs**: the proxy logs method, host, status, and duration only — never
  bodies, headers, or keys.

## Threat model notes

- A malicious provider response cannot redirect the proxy or leak the key to
  another host.
- A malicious model output can only propose staged changes. It cannot write to
  the document without Accept, and Chat Mode has no tools.
- A compromised WebView cannot read stored keys: it can only ask the proxy to
  call an already-bound provider origin.
- Linux systems without a Secret Service cannot store keys; the app reports the
  keychain error and local keyless models still work.
- Unsigned binaries can be tampered with between the release and the user. Use
  the published SHA-256 checksums and build from source when in doubt.
