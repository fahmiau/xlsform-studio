//! Streaming AI proxy (AD-7, AD-8).
//!
//! The WebView sends a *relative path* and headers; Rust looks up the trusted
//! binding for the provider, injects the auth header, and streams the response
//! back over a Tauri channel. Requests can only reach URLs under the bound
//! base URL, redirects are never followed, and the key never leaves Rust.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine as _;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::Manager;
use tokio::sync::watch;

use crate::commands::secrets::{
    build_headers, load_binding, normalize_base_url, resolve_proxy_url, validate_provider_id,
    AuthStyle, Binding, ProxyHeader,
};
use crate::error::AppError;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Maximum silence between two response chunks before the stream is aborted.
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub code: u16,
    /// Lowercased header names.
    pub headers: Vec<ProxyHeader>,
}

/// One event on the streaming channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum ProxyEvent {
    Status(ProxyStatus),
    /// Base64 bytes; base64 keeps the IPC payload compact.
    Chunk(String),
    Done,
    Error(String),
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    pub request_id: String,
    pub provider_id: String,
    /// Must start with `/`; appended to the bound base URL.
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub headers: Vec<ProxyHeader>,
    #[serde(default)]
    pub body: Option<String>,
}

/// Managed proxy state: the shared HTTP client and in-flight cancellation
/// handles. Locks are never held across `.await`.
pub struct AiProxyState {
    registry: Mutex<HashMap<String, watch::Sender<bool>>>,
    client: Client,
}

impl AiProxyState {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            // Provider streaming responses can be long; idleness is bounded
            // per chunk below instead of a whole-response timeout.
            .build()
            .map_err(|err| AppError::Network(format!("could not build the HTTP client: {err}")))?;
        Ok(Self {
            registry: Mutex::new(HashMap::new()),
            client,
        })
    }

    fn register(&self, request_id: &str) -> Result<watch::Receiver<bool>, AppError> {
        if request_id.is_empty() || request_id.len() > 128 {
            return Err(AppError::InvalidPath("invalid request id".into()));
        }
        let mut registry = self
            .registry
            .lock()
            .map_err(|_| AppError::Network("proxy registry lock poisoned".into()))?;
        if registry.contains_key(request_id) {
            return Err(AppError::InvalidPath("duplicate request id".into()));
        }
        let (sender, receiver) = watch::channel(false);
        registry.insert(request_id.to_owned(), sender);
        Ok(receiver)
    }

    fn finish(&self, request_id: &str) {
        if let Ok(mut registry) = self.registry.lock() {
            registry.remove(request_id);
        }
    }

    fn cancel(&self, request_id: &str) {
        if let Ok(registry) = self.registry.lock() {
            if let Some(sender) = registry.get(request_id) {
                let _ = sender.send(true);
            }
        }
    }
}

fn parse_method(method: &str) -> Result<Method, AppError> {
    match method.trim().to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        other => Err(AppError::InvalidPath(format!(
            "method {other} is not allowed through the AI proxy"
        ))),
    }
}

fn safe_header_map(pairs: &[(String, String)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (name, value) in pairs {
        let Ok(name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(value) = HeaderValue::from_str(value) else {
            continue;
        };
        map.insert(name, value);
    }
    map
}

fn response_headers(headers: &HeaderMap) -> Vec<ProxyHeader> {
    headers
        .iter()
        .filter(|(name, _)| {
            // Cookies are irrelevant to model APIs and never belong in JS state.
            !matches!(
                name.as_str(),
                "set-cookie" | "connection" | "transfer-encoding" | "content-length"
            )
        })
        .filter_map(|(name, value)| {
            value.to_str().ok().map(|value| ProxyHeader {
                name: name.as_str().to_owned(),
                value: value.to_owned(),
            })
        })
        .collect()
}

fn provider_host(base_url: &str) -> String {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| "unknown".into())
}

fn emit(sink: &mut (dyn FnMut(ProxyEvent) + Send), event: ProxyEvent) {
    sink(event);
}

/// Core streaming loop, independent of Tauri so it is unit-testable.
pub(crate) async fn run_proxy(
    client: &Client,
    binding: Binding,
    request: ProxyRequest,
    mut cancel: watch::Receiver<bool>,
    sink: &mut (dyn FnMut(ProxyEvent) + Send),
) -> Result<(), AppError> {
    let url = resolve_proxy_url(&binding.base_url, &request.path)?;
    let method = parse_method(&request.method)?;
    let headers = safe_header_map(&build_headers(&binding, &request.headers));
    let body = request.body.clone().unwrap_or_default();

    if *cancel.borrow() {
        return Ok(());
    }

    let started = Instant::now();
    let mut builder = client
        .request(method.clone(), url.clone())
        .headers(headers)
        .header("accept-encoding", "identity");
    if method == Method::POST {
        builder = builder.body(body);
    }

    let response = tokio::select! {
        _ = cancel.changed() => return Ok(()),
        result = builder.send() => result.map_err(|err| {
            log::warn!(
                "ai_proxy {method} {} failed after {} ms: {err}",
                provider_host(&binding.base_url),
                started.elapsed().as_millis()
            );
            AppError::Network(format!("could not reach the provider: {err}"))
        })?,
    };

    let status = response.status();
    log::info!(
        "ai_proxy {method} {} -> {} in {} ms",
        provider_host(&binding.base_url),
        status.as_u16(),
        started.elapsed().as_millis()
    );
    emit(
        sink,
        ProxyEvent::Status(ProxyStatus {
            code: status.as_u16(),
            headers: response_headers(response.headers()),
        }),
    );

    let mut response = response;
    loop {
        let next = tokio::select! {
            _ = cancel.changed() => return Ok(()),
            next = tokio::time::timeout(IDLE_TIMEOUT, response.chunk()) => next,
        };
        match next {
            Err(_) => {
                emit(
                    sink,
                    ProxyEvent::Error("the provider stopped sending data".into()),
                );
                return Ok(());
            }
            Ok(Err(err)) => {
                emit(
                    sink,
                    ProxyEvent::Error(format!("provider stream failed: {err}")),
                );
                return Ok(());
            }
            Ok(Ok(None)) => {
                emit(sink, ProxyEvent::Done);
                return Ok(());
            }
            Ok(Ok(Some(chunk))) => {
                emit(
                    sink,
                    ProxyEvent::Chunk(base64::engine::general_purpose::STANDARD.encode(chunk)),
                );
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ai_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiProxyState>,
    request: ProxyRequest,
    on_event: Channel<ProxyEvent>,
) -> Result<(), AppError> {
    validate_provider_id(&request.provider_id)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| AppError::Io(format!("app data directory unavailable: {err}")))?;
    // The binding lookup is blocking keychain I/O; do it off the async runtime.
    let provider_id = request.provider_id.clone();
    let binding = tauri::async_runtime::spawn_blocking(move || {
        crate::commands::secrets::require_binding(load_binding(&app_data_dir, &provider_id)?)
    })
    .await
    .map_err(|err| AppError::Network(format!("binding lookup failed: {err}")))??;

    // Defensive: the stored base URL was normalized on write, but re-normalize
    // so a hand-edited file cannot smuggle a query or credentials.
    let binding = Binding {
        base_url: normalize_base_url(&binding.base_url)?,
        ..binding
    };
    if binding.auth != AuthStyle::None && binding.api_key.is_none() {
        return Err(AppError::Keyring(
            "provider has no stored key; save it again".into(),
        ));
    }

    let cancel = state.register(&request.request_id)?;
    let request_id = request.request_id.clone();
    let mut sink = move |event: ProxyEvent| {
        let _ = on_event.send(event);
    };
    let result = run_proxy(&state.client, binding, request, cancel, &mut sink).await;
    state.finish(&request_id);
    if let Err(err) = &result {
        sink(ProxyEvent::Error(match err {
            AppError::InvalidPath(detail) | AppError::Network(detail) => detail.clone(),
            other => other.to_string(),
        }));
    }
    result
}

/// Cancel an in-flight proxy stream. Idempotent: unknown ids are a no-op.
#[tauri::command]
#[specta::specta]
pub fn ai_proxy_cancel(
    state: tauri::State<'_, AiProxyState>,
    request_id: String,
) -> Result<(), AppError> {
    state.cancel(&request_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::watch;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn binding(base_url: String, auth: AuthStyle, key: Option<&str>) -> Binding {
        Binding {
            base_url,
            auth,
            api_key: key.map(str::to_owned),
        }
    }

    fn request(base_url_kind: &str, path: &str, method: &str) -> ProxyRequest {
        ProxyRequest {
            request_id: "req-1".into(),
            provider_id: "test".into(),
            path: path.into(),
            method: method.into(),
            headers: vec![ProxyHeader {
                name: "content-type".into(),
                value: "application/json".into(),
            }],
            body: (base_url_kind == "post").then(|| r#"{"model":"x"}"#.into()),
        }
    }

    fn client() -> Client {
        Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .unwrap()
    }

    async fn run(
        binding: Binding,
        request: ProxyRequest,
    ) -> (Vec<ProxyEvent>, Result<(), AppError>) {
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let mut events = Vec::new();
        let result = Box::pin(run_proxy(
            &client(),
            binding,
            request,
            cancel_rx,
            &mut |event| events.push(event),
        ))
        .await;
        (events, result)
    }

    fn chunks(events: &[ProxyEvent]) -> String {
        let mut bytes = Vec::new();
        for event in events {
            if let ProxyEvent::Chunk(encoded) = event {
                bytes.extend(
                    base64::engine::general_purpose::STANDARD
                        .decode(encoded)
                        .unwrap(),
                );
            }
        }
        String::from_utf8(bytes).unwrap()
    }

    #[tokio::test]
    async fn streams_status_chunks_and_done_from_a_mock_provider() {
        let server = MockServer::start().await;
        let body = "data: {\"delta\":\"hello\"}\n\ndata: {\"delta\":\" world\"}\n\n";
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(header("authorization", "Bearer sk-test"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_string(body),
            )
            .expect(1)
            .mount(&server)
            .await;

        let (events, result) = run(
            binding(
                format!("{}/v1", server.uri()),
                AuthStyle::Bearer,
                Some("sk-test"),
            ),
            request("post", "/chat/completions", "POST"),
        )
        .await;

        result.unwrap();
        assert!(matches!(
            events.first(),
            Some(ProxyEvent::Status(status)) if status.code == 200
        ));
        assert_eq!(chunks(&events), body);
        assert_eq!(events.last(), Some(&ProxyEvent::Done));
    }

    #[tokio::test]
    async fn injects_the_auth_header_for_each_style() {
        for (auth, header_name, expected) in [
            (AuthStyle::XApiKey, "x-api-key", "sk-ant-test"),
            (AuthStyle::XGoogApiKey, "x-goog-api-key", "AIza-test"),
        ] {
            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/v1/models"))
                .and(header(header_name, expected))
                .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
                .expect(1)
                .mount(&server)
                .await;

            let (events, result) = run(
                binding(format!("{}/v1", server.uri()), auth, Some(expected)),
                request("get", "/models", "GET"),
            )
            .await;
            result.unwrap();
            assert!(matches!(
                events.first(),
                Some(ProxyEvent::Status(status)) if status.code == 200
            ));
        }
    }

    #[tokio::test]
    async fn keyless_loopback_provider_works() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"data":[]}"#))
            .mount(&server)
            .await;

        let (events, result) = run(
            binding(format!("{}/v1", server.uri()), AuthStyle::None, None),
            request("get", "/models", "GET"),
        )
        .await;
        result.unwrap();
        assert_eq!(chunks(&events), r#"{"data":[]}"#);
        assert_eq!(events.last(), Some(&ProxyEvent::Done));
    }

    #[tokio::test]
    async fn passes_provider_error_bodies_through() {
        let server = MockServer::start().await;
        let body = r#"{"error":{"message":"invalid key"}}"#;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(401).set_body_string(body))
            .mount(&server)
            .await;

        let (events, result) = run(
            binding(
                format!("{}/v1", server.uri()),
                AuthStyle::Bearer,
                Some("bad"),
            ),
            request("get", "/models", "GET"),
        )
        .await;
        result.unwrap();
        assert!(matches!(
            events.first(),
            Some(ProxyEvent::Status(status)) if status.code == 401
        ));
        assert_eq!(chunks(&events), body);
    }

    #[tokio::test]
    async fn refuses_to_follow_redirects() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/redirect"))
            .respond_with(
                ResponseTemplate::new(302)
                    .insert_header("location", format!("{}/v1/target", server.uri())),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/target"))
            .respond_with(ResponseTemplate::new(200).set_body_string("should-not-arrive"))
            .expect(0)
            .mount(&server)
            .await;

        let (events, result) = run(
            binding(format!("{}/v1", server.uri()), AuthStyle::Bearer, Some("k")),
            request("get", "/redirect", "GET"),
        )
        .await;
        result.unwrap();
        assert!(matches!(
            events.first(),
            Some(ProxyEvent::Status(status)) if status.code == 302
        ));
        assert_eq!(chunks(&events), "");
    }

    #[tokio::test]
    async fn cancellation_stops_the_stream() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/slow"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string("late")
                    .set_delay(Duration::from_secs(10)),
            )
            .mount(&server)
            .await;

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let _ = cancel_tx.send(true);
        });
        let mut events = Vec::new();
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            run_proxy(
                &client(),
                binding(format!("{}/v1", server.uri()), AuthStyle::None, None),
                request("get", "/slow", "GET"),
                cancel_rx,
                &mut |event| events.push(event),
            ),
        )
        .await
        .expect("cancellation should return promptly");
        cancel_task.await.unwrap();

        result.unwrap();
        assert!(
            !events.contains(&ProxyEvent::Done),
            "a cancelled stream must not report Done"
        );
    }

    #[tokio::test]
    async fn path_traversal_is_rejected_before_any_request() {
        let server = MockServer::start().await;
        let (events, result) = run(
            binding(format!("{}/v1", server.uri()), AuthStyle::None, None),
            request("get", "/../admin", "GET"),
        )
        .await;
        assert!(matches!(result, Err(AppError::InvalidPath(_))));
        assert!(events.is_empty());
        assert!(server.received_requests().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn unsupported_methods_are_rejected() {
        let server = MockServer::start().await;
        let (events, result) = run(
            binding(format!("{}/v1", server.uri()), AuthStyle::None, None),
            request("get", "/models", "DELETE"),
        )
        .await;
        assert!(matches!(result, Err(AppError::InvalidPath(_))));
        assert!(events.is_empty());
    }

    #[test]
    fn registry_rejects_duplicate_in_flight_ids() {
        let state = AiProxyState::new().unwrap();
        let _first = state.register("same-id").unwrap();
        assert!(matches!(
            state.register("same-id"),
            Err(AppError::InvalidPath(_))
        ));
        state.finish("same-id");
        assert!(state.register("same-id").is_ok());
    }

    #[test]
    fn cancelling_an_unknown_request_is_a_no_op() {
        let state = AiProxyState::new().unwrap();
        state.cancel("missing");
    }
}
