use axum::{
    body::Body,
    extract::{Path as AxumPath, Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{Json, Response},
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::library::index;
use crate::sync::engine;
use crate::AppState;

/// Endpoints that do NOT require the per-launch nonce. `/status` stays open
/// so the portal can probe whether Bridge is running before it has a nonce
/// to send.
const PUBLIC_PATHS: &[&str] = &["/status"];

/// Allowed Host header values. Anything else is rejected with 403 to defend
/// against DNS rebinding attacks — a malicious site that makes a DNS record
/// point at 127.0.0.1 can only succeed if the browser sends a Host we accept.
const ALLOWED_HOSTS: &[&str] = &["127.0.0.1:19433", "localhost:19433"];

/// Allowlisted origins for CORS. The old `Access-Control-Allow-Origin: *`
/// made any website in the user's browser able to read loopback responses;
/// that was a CVE-2018-5702-shaped footgun. We enumerate the portal origins
/// explicitly. Add preview/staging domains here if needed during Phase 1.5.
fn allowed_origins() -> Vec<HeaderValue> {
    vec![
        HeaderValue::from_static("https://unusonic.com"),
        HeaderValue::from_static("https://www.unusonic.com"),
        HeaderValue::from_static("http://localhost:3000"),
        HeaderValue::from_static("http://127.0.0.1:3000"),
    ]
}

/// Axum middleware that rejects any request whose Host header isn't a
/// known loopback binding. Runs before CORS so that a DNS-rebinding request
/// never even sees the CORS layer.
async fn validate_host(req: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if ALLOWED_HOSTS.contains(&host) {
        Ok(next.run(req).await)
    } else {
        log::warn!("[loopback] Rejected request with Host: {}", host);
        Err(StatusCode::FORBIDDEN)
    }
}

/// Axum middleware that requires a Bearer token matching the current
/// per-launch nonce on all non-public endpoints. The portal fetches the
/// nonce via a server action (Supabase-authenticated) before calling
/// loopback, so a random site or browser extension can't trigger a sync
/// even if it bypasses CORS.
async fn require_nonce(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = req.uri().path();
    if PUBLIC_PATHS.contains(&path) {
        return Ok(next.run(req).await);
    }
    // Allow CORS preflight through — browsers send an unauthenticated
    // OPTIONS before the real request.
    if req.method() == Method::OPTIONS {
        return Ok(next.run(req).await);
    }

    let provided = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("");

    if provided == state.local_session_nonce {
        Ok(next.run(req).await)
    } else {
        log::warn!("[loopback] Rejected {} — missing or invalid nonce", path);
        Err(StatusCode::UNAUTHORIZED)
    }
}

/// Start the local HTTP API on 127.0.0.1:19433.
/// This is what the web app probes to detect Bridge.
pub async fn start(state: Arc<AppState>) {
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins())
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        // The portal sends `Authorization` (the nonce) and `Content-Type`
        // on real requests. `Any` is fine here because the real gate is the
        // `require_nonce` middleware below, and the Host/CORS layers are
        // defense in depth — tightening this further buys nothing.
        .allow_headers(Any);

    let app = Router::new()
        .route("/status", get(status_handler))
        .route("/library/stats", get(library_stats_handler))
        .route("/sync/trigger", post(trigger_sync_handler))
        .route("/sync/trigger/{event_id}", post(trigger_sync_event_handler))
        .route("/sync/history", get(sync_history_handler))
        // Layers run bottom-up: Host → nonce → CORS → handler. A request
        // that fails the Host check never even sees the nonce layer.
        .layer(cors)
        .layer(middleware::from_fn_with_state(state.clone(), require_nonce))
        .layer(middleware::from_fn(validate_host))
        .with_state(state);

    // Bind explicitly to 127.0.0.1 — never 0.0.0.0. This ensures the API is
    // never exposed on LAN interfaces even if a firewall is misconfigured.
    let listener = match tokio::net::TcpListener::bind("127.0.0.1:19433").await {
        Ok(l) => l,
        Err(e) => {
            log::error!("Failed to bind local API on port 19433: {}", e);
            return;
        }
    };

    log::info!("Local API listening on http://127.0.0.1:19433");

    if let Err(e) = axum::serve(listener, app).await {
        log::error!("Local API server error: {}", e);
    }
}

async fn status_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let has_token = keyring::Entry::new("unusonic-bridge", "device-token")
        .and_then(|e| e.get_password())
        .is_ok();

    let config = state.config.lock().unwrap();
    let recent = index::get_recent_syncs(&state.db_path, 1).unwrap_or_default();

    Json(json!({
        "version": "0.1.0",
        "authenticated": has_token,
        "syncEnabled": has_token && !config.music_folders.is_empty(),
        "lastSync": recent.first().map(|s| &s.synced_at),
    }))
}

async fn library_stats_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let track_count = index::get_track_count(&state.db_path).unwrap_or(0);
    let config = state.config.lock().unwrap();

    Json(json!({
        "trackCount": track_count,
        "folders": config.music_folders,
    }))
}

async fn trigger_sync_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let s = state.clone();
    tokio::spawn(async move {
        if let Err(e) = engine::sync_all(&s).await {
            log::error!("Triggered sync failed: {}", e);
        }
    });

    Json(json!({ "ok": true, "message": "Sync triggered" }))
}

async fn trigger_sync_event_handler(
    State(state): State<Arc<AppState>>,
    AxumPath(event_id): AxumPath<String>,
) -> Json<Value> {
    let s = state.clone();
    let id = event_id.clone();
    tokio::spawn(async move {
        if let Err(e) = engine::sync_one(&s, &id).await {
            log::error!("Triggered sync failed for {}: {}", id, e);
        }
    });

    Json(json!({ "ok": true, "message": format!("Sync triggered for {}", event_id) }))
}

async fn sync_history_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let results = index::get_recent_syncs(&state.db_path, 20).unwrap_or_default();
    Json(json!({ "history": results }))
}
