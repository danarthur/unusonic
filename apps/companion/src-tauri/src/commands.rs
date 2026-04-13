use std::path::PathBuf;
use std::sync::Arc;
use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use unusonic_bridge_lib::{AppState, DjSoftware, SyncResult};
use unusonic_bridge_lib::api;
use unusonic_bridge_lib::library;
use unusonic_bridge_lib::sync;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    authenticated: bool,
    sync_enabled: bool,
    library_track_count: u64,
    last_sync: Option<String>,
    recent_syncs: Vec<SyncResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSettings {
    music_folders: Vec<String>,
    sync_interval_seconds: u64,
    sync_horizon_days: u32,
    dj_software: String,
    authenticated: bool,
    device_name: String,
}

#[tauri::command]
pub async fn get_app_status(state: State<'_, Arc<AppState>>) -> Result<AppStatus, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let track_count = library::index::get_track_count(&state.db_path).unwrap_or(0);
    let has_token = keyring::Entry::new("unusonic-bridge", "device-token")
        .and_then(|e| e.get_password())
        .is_ok();

    // Get recent sync results from local DB
    let recent = library::index::get_recent_syncs(&state.db_path, 10).unwrap_or_default();

    Ok(AppStatus {
        authenticated: has_token,
        sync_enabled: has_token && !config.music_folders.is_empty(),
        library_track_count: track_count,
        last_sync: recent.first().map(|s| s.synced_at.clone()),
        recent_syncs: recent,
    })
}

#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<AppState>>) -> Result<BridgeSettings, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let has_token = keyring::Entry::new("unusonic-bridge", "device-token")
        .and_then(|e| e.get_password())
        .is_ok();

    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown device".to_string());

    Ok(BridgeSettings {
        music_folders: config.music_folders.clone(),
        sync_interval_seconds: config.sync_interval_seconds,
        sync_horizon_days: config.sync_horizon_days,
        dj_software: match config.dj_software {
            DjSoftware::Serato => "serato".to_string(),
            DjSoftware::Rekordbox => "rekordbox".to_string(),
            DjSoftware::Both => "both".to_string(),
        },
        authenticated: has_token,
        device_name,
    })
}

#[tauri::command]
pub async fn trigger_sync(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let s = state.inner().clone();
    sync::engine::sync_all(&s).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pair_with_code(state: State<'_, Arc<AppState>>, code: String) -> Result<(), String> {
    let base_url = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        config.api_base_url.clone()
    };

    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown device".to_string());

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/api/bridge/pair", base_url))
        .json(&serde_json::json!({
            "code": code,
            "deviceName": device_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
        let body: serde_json::Value = res.json().await.unwrap_or_default();
        let msg = body["error"].as_str().unwrap_or("Pairing failed");
        return Err(msg.to_string());
    }

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let token = body["token"]
        .as_str()
        .ok_or("No token in response")?;

    // Store token in OS keychain
    let entry = keyring::Entry::new("unusonic-bridge", "device-token")
        .map_err(|e| format!("Keychain error: {}", e))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store token: {}", e))?;

    // Now that we're paired, POST the per-launch nonce so the portal can
    // authenticate loopback calls. If this fails we log and move on —
    // Bridge's next startup will retry, and the 60s poll still works.
    if let Err(e) = api::session::post_local_session_nonce(state.inner()).await {
        log::warn!("Post-pair nonce POST failed: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn unpair_device(_state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Remove token from keychain
    if let Ok(entry) = keyring::Entry::new("unusonic-bridge", "device-token") {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[tauri::command]
pub async fn add_music_folder(
    state: State<'_, Arc<AppState>>,
    config_dir: State<'_, PathBuf>,
    path: String,
) -> Result<(), String> {
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        if !config.music_folders.contains(&path) {
            config.music_folders.push(path.clone());
        }
    }
    state.save_config(&config_dir);

    // Trigger a library scan for the new folder (with progress tracking)
    let s = state.inner().clone();
    let db_path = state.db_path.clone();
    std::thread::spawn(move || {
        if let Err(e) = library::scanner::scan_folder_with_progress(&path, &db_path, Some(&s.scan_progress)) {
            log::error!("Scan failed for {}: {}", path, e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn remove_music_folder(
    state: State<'_, Arc<AppState>>,
    config_dir: State<'_, PathBuf>,
    path: String,
) -> Result<(), String> {
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.music_folders.retain(|f| f != &path);
    }
    state.save_config(&config_dir);
    Ok(())
}

#[tauri::command]
pub async fn set_dj_software(
    state: State<'_, Arc<AppState>>,
    config_dir: State<'_, PathBuf>,
    value: String,
) -> Result<(), String> {
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.dj_software = match value.as_str() {
            "serato" => DjSoftware::Serato,
            "rekordbox" => DjSoftware::Rekordbox,
            "both" => DjSoftware::Both,
            _ => return Err("Invalid DJ software option".to_string()),
        };
    }
    state.save_config(&config_dir);
    Ok(())
}

#[tauri::command]
pub async fn pick_music_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app.dialog().file().blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    scanning: bool,
    scanned_count: u32,
    current_folder: String,
}

#[tauri::command]
pub async fn get_scan_progress(state: State<'_, Arc<AppState>>) -> Result<ScanStatus, String> {
    use std::sync::atomic::Ordering;
    Ok(ScanStatus {
        scanning: state.scan_progress.scanning.load(Ordering::Relaxed),
        scanned_count: state.scan_progress.scanned_count.load(Ordering::Relaxed),
        current_folder: state.scan_progress.current_folder.lock().unwrap().clone(),
    })
}
