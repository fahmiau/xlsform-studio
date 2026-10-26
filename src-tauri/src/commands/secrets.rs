//! BYOK secrets and provider bindings (AD-7).
//!
//! The WebView never sees a key. It registers a *binding* (base URL + auth
//! style + key) and the proxy reads that binding in Rust. No command returns
//! the key: `secret_status` only reports `bound` / `has_key`.
//!
//! Keyed providers store the binding JSON in the OS credential store. Keyless
//! providers (Ollama, LM Studio) have nothing secret to store, so their
//! binding lives in a plain JSON file under the app data directory. That keeps
//! local models working on a Linux box without a Secret Service (R6) while
//! guaranteeing keys never touch disk in plaintext.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use reqwest::Url;
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::commands::files::atomic_write_with;
use crate::error::AppError;

/// Keychain service name = the bundle identifier (Q2).
pub const KEYCHAIN_SERVICE: &str = "io.github.fahmiau.xlsformstudio";
const BINDINGS_FILE: &str = "ai-bindings.json";
const MAX_PROVIDER_ID: usize = 128;

/// Process-wide guard for the keyless binding file (read-modify-write).
static BINDINGS_LOCK: Mutex<()> = Mutex::new(());

/// How Rust attaches the key to a proxied request. Part of the binding, so the
/// WebView cannot choose how (or whether) a key is sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum AuthStyle {
    Bearer,
    XApiKey,
    XGoogApiKey,
    None,
}

impl AuthStyle {
    /// Header name the proxy owns for this style.
    pub fn header_name(self) -> Option<&'static str> {
        match self {
            Self::Bearer => Some("authorization"),
            Self::XApiKey => Some("x-api-key"),
            Self::XGoogApiKey => Some("x-goog-api-key"),
            Self::None => None,
        }
    }
}

/// Binding supplied by the frontend when the user saves a provider.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SecretBindingInput {
    pub base_url: String,
    pub auth: AuthStyle,
    pub api_key: Option<String>,
}

/// Stored binding. Never serialized to the WebView.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub base_url: String,
    pub auth: AuthStyle,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    pub bound: bool,
    pub has_key: bool,
}

fn invalid(detail: impl Into<String>) -> AppError {
    AppError::InvalidPath(detail.into())
}

/// A provider id is part of a credential-store entry name, so keep it boring.
pub fn validate_provider_id(provider_id: &str) -> Result<(), AppError> {
    let trimmed = provider_id.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_PROVIDER_ID {
        return Err(invalid("provider id must be 1-128 characters"));
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(invalid(
            "provider id may only contain letters, digits, '.', '-' and '_'",
        ));
    }
    Ok(())
}

fn is_loopback(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    matches!(host, "localhost" | "127.0.0.1" | "::1") || host.ends_with(".localhost")
}

/// Normalize a provider base URL: scheme + host + port + path prefix, no
/// trailing slash, no query, no fragment, no user info. `https` is required
/// unless the host is loopback (local Ollama / LM Studio).
pub fn normalize_base_url(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(invalid("base URL is empty"));
    }
    let mut url = Url::parse(trimmed).map_err(|_| invalid("base URL is not a valid URL"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(invalid(
            "base URL must use https (http is only allowed on loopback)",
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(invalid("base URL must not contain credentials"));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(invalid("base URL must not contain a query or fragment"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| invalid("base URL has no host"))?
        .to_owned();
    if url.scheme() == "http" && !is_loopback(&host) {
        return Err(invalid(
            "http is only allowed for loopback providers; use https otherwise",
        ));
    }
    if url.path() == "/" {
        url.set_path("");
    }
    let mut normalized = url.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    if normalized.is_empty() {
        return Err(invalid("base URL is empty"));
    }
    Ok(normalized)
}

/// Validate the request path appended to the bound base URL.
///
/// Rejecting schemes, `..`, `@` and backslashes means the final URL can only be
/// `base_url + path`, never another host or an absolute URL.
pub fn validate_proxy_path(path: &str) -> Result<(), AppError> {
    if !path.starts_with('/') {
        return Err(invalid("request path must start with '/'"));
    }
    if path.starts_with("//") {
        return Err(invalid("request path must not start with '//'"));
    }
    if path.contains("..")
        || path.contains("://")
        || path.contains('@')
        || path.contains('\\')
        || path.contains('#')
    {
        return Err(invalid(
            "request path must not contain '..', a scheme, '@', '\\' or '#'",
        ));
    }
    if path.chars().any(|ch| ch.is_control() || ch.is_whitespace()) {
        return Err(invalid("request path must not contain whitespace"));
    }
    Ok(())
}

/// Build the final URL and re-check that it stayed under the bound origin.
pub fn resolve_proxy_url(base_url: &str, path: &str) -> Result<Url, AppError> {
    validate_proxy_path(path)?;
    let base = Url::parse(base_url).map_err(|_| invalid("stored base URL is invalid"))?;
    let joined = format!("{base_url}{path}");
    let url = Url::parse(&joined).map_err(|_| invalid("request URL is invalid"))?;
    if url.scheme() != base.scheme()
        || url.host_str() != base.host_str()
        || url.port() != base.port()
    {
        return Err(invalid("request URL escaped the bound provider origin"));
    }
    Ok(url)
}

/// Headers the proxy owns; a request-supplied value is dropped.
pub fn is_reserved_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization"
            | "x-api-key"
            | "x-goog-api-key"
            | "host"
            | "cookie"
            | "content-length"
            | "connection"
            | "transfer-encoding"
            | "proxy-authorization"
    )
}

/// Build request headers: request headers first (reserved ones dropped), then
/// the auth header derived from the binding.
pub fn build_headers(binding: &Binding, requested: &[ProxyHeader]) -> Vec<(String, String)> {
    let mut headers: Vec<(String, String)> = requested
        .iter()
        .filter(|header| {
            !header.name.trim().is_empty()
                && !is_reserved_header(&header.name)
                && !header.value.contains(['\r', '\n'])
        })
        .map(|header| (header.name.trim().to_owned(), header.value.clone()))
        .collect();

    if let (Some(name), Some(key)) = (binding.auth.header_name(), binding.api_key.as_deref()) {
        let value = if binding.auth == AuthStyle::Bearer {
            format!("Bearer {key}")
        } else {
            key.to_owned()
        };
        headers.push((name.to_owned(), value));
    }
    headers
}

/// Header pair crossing the IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProxyHeader {
    pub name: String,
    pub value: String,
}

fn binding_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(BINDINGS_FILE)
}

fn read_keyless_bindings(app_data_dir: &Path) -> Result<BTreeMap<String, Binding>, AppError> {
    let path = binding_path(app_data_dir);
    if !path.is_file() {
        return Ok(BTreeMap::new());
    }
    let text = fs::read_to_string(&path)
        .map_err(|err| AppError::Io(format!("provider bindings: {err}")))?;
    serde_json::from_str(&text).map_err(|_| AppError::Io("provider bindings are corrupt".into()))
}

fn write_keyless_bindings(
    app_data_dir: &Path,
    bindings: &BTreeMap<String, Binding>,
) -> Result<(), AppError> {
    fs::create_dir_all(app_data_dir)
        .map_err(|err| AppError::Io(format!("app data directory: {err}")))?;
    let json = serde_json::to_vec(bindings)
        .map_err(|err| AppError::Io(format!("provider bindings: {err}")))?;
    atomic_write_with(&binding_path(app_data_dir), |file| {
        use std::io::Write as _;
        file.write_all(&json)
    })
    .map_err(|err| AppError::Io(format!("provider bindings: {err}")))
}

fn set_keyless_binding(
    app_data_dir: &Path,
    provider_id: &str,
    binding: &Binding,
) -> Result<(), AppError> {
    let _guard = BINDINGS_LOCK
        .lock()
        .map_err(|_| AppError::Io("provider binding lock poisoned".into()))?;
    let mut bindings = read_keyless_bindings(app_data_dir)?;
    bindings.insert(provider_id.to_owned(), binding.clone());
    write_keyless_bindings(app_data_dir, &bindings)
}

fn remove_keyless_binding(app_data_dir: &Path, provider_id: &str) -> Result<(), AppError> {
    let _guard = BINDINGS_LOCK
        .lock()
        .map_err(|_| AppError::Io("provider binding lock poisoned".into()))?;
    let mut bindings = read_keyless_bindings(app_data_dir)?;
    if bindings.remove(provider_id).is_none() {
        return Ok(());
    }
    write_keyless_bindings(app_data_dir, &bindings)
}

fn keyring_entry(provider_id: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(KEYCHAIN_SERVICE, provider_id)
        .map_err(|err| AppError::Keyring(format!("system keychain unavailable: {err}")))
}

fn keyring_get(provider_id: &str) -> Result<Option<String>, AppError> {
    match keyring_entry(provider_id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::Keyring(format!(
            "could not read the key from the system keychain: {err}"
        ))),
    }
}

fn keyring_set(provider_id: &str, value: &str) -> Result<(), AppError> {
    keyring_entry(provider_id)?
        .set_password(value)
        .map_err(|err| AppError::Keyring(format!("could not store the key: {err}")))
}

fn keyring_delete(provider_id: &str) -> Result<(), AppError> {
    match keyring_entry(provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Keyring(format!(
            "could not remove the key: {err}"
        ))),
    }
}

/// Look up the trusted binding for a provider. Keyless bindings live in the
/// non-secret file; keyed bindings live in the OS credential store.
pub fn load_binding(app_data_dir: &Path, provider_id: &str) -> Result<Option<Binding>, AppError> {
    validate_provider_id(provider_id)?;
    if let Some(binding) = read_keyless_bindings(app_data_dir)?.remove(provider_id) {
        return Ok(Some(binding));
    }
    let Some(json) = keyring_get(provider_id)? else {
        return Ok(None);
    };
    let binding: Binding = serde_json::from_str(&json)
        .map_err(|_| AppError::Keyring("stored provider binding is corrupt".into()))?;
    if binding.base_url.is_empty() {
        return Err(AppError::Keyring(
            "stored provider binding has no base URL".into(),
        ));
    }
    Ok(Some(binding))
}

/// An unbound provider may never use the proxy (AD-8: no general egress).
pub fn require_binding(binding: Option<Binding>) -> Result<Binding, AppError> {
    binding.ok_or_else(|| invalid("provider is not configured"))
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map_err(|err| AppError::Io(format!("app data directory unavailable: {err}")))
}

#[tauri::command]
#[specta::specta]
pub async fn secret_set(
    app: tauri::AppHandle,
    provider_id: String,
    binding: SecretBindingInput,
) -> Result<SecretStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_provider_id(&provider_id)?;
        let base_url = normalize_base_url(&binding.base_url)?;
        let api_key = binding
            .api_key
            .map(|key| key.trim().to_owned())
            .filter(|key| !key.is_empty());

        if binding.auth == AuthStyle::None {
            // Nothing secret to store: keep the binding out of the keychain so
            // local providers work even when no Secret Service is available.
            keyring_delete(&provider_id)?;
            let stored = Binding {
                base_url,
                auth: AuthStyle::None,
                api_key: None,
            };
            set_keyless_binding(&app_data_dir(&app)?, &provider_id, &stored)?;
            return Ok(SecretStatus {
                bound: true,
                has_key: false,
            });
        }

        let Some(api_key) = api_key else {
            return Err(invalid("an API key is required for this provider"));
        };
        let stored = Binding {
            base_url,
            auth: binding.auth,
            api_key: Some(api_key),
        };
        let json = serde_json::to_string(&stored)
            .map_err(|err| AppError::Keyring(format!("could not encode the binding: {err}")))?;
        keyring_set(&provider_id, &json)?;
        remove_keyless_binding(&app_data_dir(&app)?, &provider_id)?;
        Ok(SecretStatus {
            bound: true,
            has_key: true,
        })
    })
    .await
    .map_err(|err| AppError::Keyring(format!("secret task failed: {err}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn secret_status(
    app: tauri::AppHandle,
    provider_id: String,
) -> Result<SecretStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let binding = load_binding(&app_data_dir(&app)?, &provider_id)?;
        Ok(SecretStatus {
            bound: binding.is_some(),
            has_key: binding.and_then(|b| b.api_key).is_some(),
        })
    })
    .await
    .map_err(|err| AppError::Keyring(format!("secret task failed: {err}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn secret_delete(app: tauri::AppHandle, provider_id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_provider_id(&provider_id)?;
        remove_keyless_binding(&app_data_dir(&app)?, &provider_id)?;
        keyring_delete(&provider_id)
    })
    .await
    .map_err(|err| AppError::Keyring(format!("secret task failed: {err}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding(auth: AuthStyle, key: Option<&str>) -> Binding {
        Binding {
            base_url: "https://api.example.test/v1".into(),
            auth,
            api_key: key.map(str::to_owned),
        }
    }
    fn header(name: &str, value: &str) -> ProxyHeader {
        ProxyHeader {
            name: name.into(),
            value: value.into(),
        }
    }

    #[test]
    fn normalizes_https_base_urls() {
        assert_eq!(
            normalize_base_url("  https://api.anthropic.com/v1/ ").unwrap(),
            "https://api.anthropic.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.openai.com").unwrap(),
            "https://api.openai.com"
        );
        assert_eq!(
            normalize_base_url("https://generativelanguage.googleapis.com/v1beta").unwrap(),
            "https://generativelanguage.googleapis.com/v1beta"
        );
    }

    #[test]
    fn allows_http_only_on_loopback() {
        assert_eq!(
            normalize_base_url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1"
        );
        assert_eq!(
            normalize_base_url("http://127.0.0.1:1234/v1").unwrap(),
            "http://127.0.0.1:1234/v1"
        );
        assert!(normalize_base_url("http://api.example.test/v1").is_err());
        assert!(normalize_base_url("http://[::1]:11434/v1").is_ok());
    }

    #[test]
    fn rejects_unsafe_base_urls() {
        for raw in [
            "",
            "   ",
            "api.example.test/v1",
            "ftp://api.example.test/v1",
            "https://user:pass@api.example.test/v1",
            "https://api.example.test/v1?key=1",
            "https://api.example.test/v1#frag",
            "file:///C:/secrets.txt",
        ] {
            assert!(
                normalize_base_url(raw).is_err(),
                "expected a rejection for {raw:?}"
            );
        }
    }

    #[test]
    fn accepts_relative_api_paths() {
        for path in [
            "/models",
            "/chat/completions",
            "/v1/messages?beta=true",
            "/models/gemini-2.0:streamGenerateContent?alt=sse",
        ] {
            assert!(
                validate_proxy_path(path).is_ok(),
                "expected {path:?} to be accepted"
            );
        }
    }

    #[test]
    fn rejects_path_traversal_and_absolute_urls() {
        for path in [
            "",
            "models",
            "//evil.example/x",
            "/../admin",
            "/v1/../../x",
            "https://evil.example/x",
            "/x://evil",
            "/x@evil.example",
            "/x\\..\\y",
            "/x#fragment",
            "/x y",
            "/x\r\nHost: evil",
        ] {
            assert!(
                validate_proxy_path(path).is_err(),
                "expected a rejection for {path:?}"
            );
        }
    }

    #[test]
    fn resolves_only_under_the_bound_origin() {
        let url = resolve_proxy_url("https://api.example.test/v1", "/models").unwrap();
        assert_eq!(url.as_str(), "https://api.example.test/v1/models");
        assert_eq!(url.host_str(), Some("api.example.test"));

        let url = resolve_proxy_url("http://localhost:11434/v1", "/chat/completions").unwrap();
        assert_eq!(url.as_str(), "http://localhost:11434/v1/chat/completions");
    }

    #[test]
    fn injects_auth_header_per_style() {
        let request = [header("content-type", "application/json")];

        let bearer = build_headers(&binding(AuthStyle::Bearer, Some("sk-test")), &request);
        assert!(bearer.contains(&("authorization".into(), "Bearer sk-test".into())));

        let x_api = build_headers(&binding(AuthStyle::XApiKey, Some("sk-ant-test")), &request);
        assert!(x_api.contains(&("x-api-key".into(), "sk-ant-test".into())));

        let google = build_headers(
            &binding(AuthStyle::XGoogApiKey, Some("AIza-test")),
            &request,
        );
        assert!(google.contains(&("x-goog-api-key".into(), "AIza-test".into())));

        let keyless = build_headers(&binding(AuthStyle::None, None), &request);
        assert_eq!(
            keyless,
            vec![("content-type".to_string(), "application/json".to_string())]
        );
    }

    #[test]
    fn js_cannot_override_auth_or_host_headers() {
        let requested = [
            header("Authorization", "Bearer attacker"),
            header("x-api-key", "attacker"),
            header("x-goog-api-key", "attacker"),
            header("Host", "evil.example"),
            header("Cookie", "session=1"),
            header("content-length", "1"),
            header("X-Custom", "ok"),
        ];
        let headers = build_headers(&binding(AuthStyle::Bearer, Some("real-key")), &requested);

        assert!(headers.contains(&("X-Custom".into(), "ok".into())));
        assert!(!headers
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("host")));
        assert!(!headers
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("cookie")));
        assert!(!headers
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("content-length")));
        let auth: Vec<_> = headers
            .iter()
            .filter(|(name, _)| name.eq_ignore_ascii_case("authorization"))
            .collect();
        assert_eq!(
            auth,
            vec![&("authorization".to_string(), "Bearer real-key".to_string())]
        );
    }

    #[test]
    fn strips_header_injection_attempts() {
        let requested = [header("x-test", "a\r\nx-evil: 1")];
        let headers = build_headers(&binding(AuthStyle::None, None), &requested);
        assert!(headers.is_empty());
    }

    #[test]
    fn provider_ids_are_restricted() {
        assert!(validate_provider_id("openrouter-work").is_ok());
        assert!(validate_provider_id("instance.1_a").is_ok());
        let long = "x".repeat(129);
        for id in ["", " ", "a/b", "a\\b", "a b", "a@b", long.as_str()] {
            assert!(
                validate_provider_id(id).is_err(),
                "expected {id:?} to be rejected"
            );
        }
    }

    #[test]
    fn unbound_providers_cannot_use_the_proxy() {
        assert!(matches!(
            require_binding(None),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn keyless_bindings_round_trip_without_a_keychain() {
        let dir = tempfile::tempdir().unwrap();
        let stored = Binding {
            base_url: "http://localhost:11434/v1".into(),
            auth: AuthStyle::None,
            api_key: None,
        };
        set_keyless_binding(dir.path(), "ollama", &stored).unwrap();
        assert_eq!(
            load_binding(dir.path(), "ollama").unwrap(),
            Some(stored.clone())
        );

        remove_keyless_binding(dir.path(), "ollama").unwrap();
        assert_eq!(load_binding(dir.path(), "ollama").unwrap(), None);
        // Removing twice is a no-op.
        remove_keyless_binding(dir.path(), "ollama").unwrap();
    }

    #[test]
    fn keyless_binding_file_never_contains_an_api_key() {
        let dir = tempfile::tempdir().unwrap();
        set_keyless_binding(
            dir.path(),
            "local",
            &Binding {
                base_url: "http://localhost:1234/v1".into(),
                auth: AuthStyle::None,
                api_key: None,
            },
        )
        .unwrap();
        let text = fs::read_to_string(binding_path(dir.path())).unwrap();
        assert!(!text.contains("apiKey"));
    }
}
