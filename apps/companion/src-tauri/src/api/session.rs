//! Per-launch local session nonce handshake.
//!
//! On startup (and after a successful pair) Bridge POSTs its in-memory
//! `AppState.local_session_nonce` to the Unusonic web API at
//! `/api/bridge/local-session`, authenticated with the opaque device token
//! from the OS keychain. The web server persists the nonce on the device
//! token row so the portal can read it via a server action and include it
//! as `Authorization: Bearer {nonce}` on loopback API calls. Bridge's
//! loopback middleware then validates against the same in-memory value.
//!
//! The nonce is regenerated on every Bridge launch; if the user restarts
//! Bridge the old nonce dies and the portal will fetch the new one the
//! next time it needs to call loopback.

use crate::AppState;

/// Read the opaque Bridge device token from the OS keychain.
fn read_device_token() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let entry = keyring::Entry::new("unusonic-bridge", "device-token")?;
    Ok(entry.get_password()?)
}

/// POST the current in-memory nonce to the Unusonic web API.
/// No-ops gracefully (Ok) if no device token is present — Bridge isn't
/// paired yet, so there's nothing to authenticate with.
pub async fn post_local_session_nonce(
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let token = match read_device_token() {
        Ok(t) => t,
        Err(_) => {
            log::debug!("[nonce] Skipping POST — no device token in keychain");
            return Ok(());
        }
    };

    let base_url = {
        let config = state.config.lock().unwrap();
        config.api_base_url.clone()
    };

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/api/bridge/local-session", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "nonce": state.local_session_nonce }))
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("local-session returned {}: {}", status, body).into());
    }

    log::info!("[nonce] Posted fresh local-session nonce to {}", base_url);
    Ok(())
}
