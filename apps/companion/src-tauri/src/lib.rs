pub mod api;
pub mod library;
pub mod sync;
pub mod watcher;

use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

/// Generate a 32-byte random nonce, hex-encoded. 64 chars on the wire.
fn generate_local_session_nonce() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Sync result — shared between library index and commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub event_id: String,
    pub event_title: String,
    pub event_date: String,
    pub matched_count: u32,
    pub total_count: u32,
    pub unmatched_songs: Vec<String>,
    pub synced_at: String,
}

/// Scan progress — shared atomics for lock-free UI polling.
#[derive(Debug)]
pub struct ScanProgress {
    pub scanning: AtomicBool,
    pub scanned_count: AtomicU32,
    pub current_folder: Mutex<String>,
}

impl Default for ScanProgress {
    fn default() -> Self {
        Self {
            scanning: AtomicBool::new(false),
            scanned_count: AtomicU32::new(0),
            current_folder: Mutex::new(String::new()),
        }
    }
}

impl ScanProgress {
    pub fn start(&self, folder: &str) {
        self.scanning.store(true, Ordering::Relaxed);
        self.scanned_count.store(0, Ordering::Relaxed);
        *self.current_folder.lock().unwrap() = folder.to_string();
    }

    pub fn increment(&self) {
        self.scanned_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn finish(&self) {
        self.scanning.store(false, Ordering::Relaxed);
    }
}

/// Global app state shared across Tauri commands and the sync engine.
#[derive(Debug)]
pub struct AppState {
    pub config: Mutex<BridgeConfig>,
    pub db_path: PathBuf,
    pub scan_progress: ScanProgress,
    /// Per-launch nonce used to authenticate loopback API requests from the
    /// portal. Generated once at startup, kept in memory only, and POSTed to
    /// `/api/bridge/local-session` so the portal can read it back via a
    /// server action. Rotates on every Bridge restart.
    pub local_session_nonce: String,
    /// True while a sync pass is running. Read by the tray-tooltip loop to
    /// show "Syncing…" state without touching the engine's internals.
    pub is_syncing: AtomicBool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub music_folders: Vec<String>,
    pub sync_interval_seconds: u64,
    pub sync_horizon_days: u32,
    pub dj_software: DjSoftware,
    pub api_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DjSoftware {
    Serato,
    Rekordbox,
    Both,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            music_folders: vec![],
            sync_interval_seconds: 60,
            sync_horizon_days: 7,
            dj_software: DjSoftware::Serato,
            api_base_url: "https://unusonic.com".to_string(),
        }
    }
}

impl AppState {
    pub fn new(config_dir: PathBuf) -> Self {
        let db_path = config_dir.join("library.sqlite");
        let config_path = config_dir.join("config.json");

        let config = if config_path.exists() {
            std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            BridgeConfig::default()
        };

        Self {
            config: Mutex::new(config),
            db_path,
            scan_progress: ScanProgress::default(),
            local_session_nonce: generate_local_session_nonce(),
            is_syncing: AtomicBool::new(false),
        }
    }

    pub fn save_config(&self, config_dir: &std::path::Path) {
        let config = self.config.lock().unwrap();
        let config_path = config_dir.join("config.json");
        if let Ok(json) = serde_json::to_string_pretty(&*config) {
            let _ = std::fs::write(config_path, json);
        }
    }
}
