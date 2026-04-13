#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use unusonic_bridge_lib::library::index;
use unusonic_bridge_lib::{AppState, api, library, sync, watcher};

mod commands;

/// Tray icon ID. The background tooltip loop looks up the tray by this id
/// via `app.tray_by_id()`.
const TRAY_ID: &str = "main";

/// Build the tray tooltip string from current state. Five states:
///   * "not paired"
///   * "syncing…"
///   * "no shows synced yet"
///   * "Event Title — matched/total"
///   * "error" (future — not reached today because sync errors don't
///     persist anywhere the tooltip can see)
fn build_tooltip(state: &AppState) -> String {
    let paired = keyring::Entry::new("unusonic-bridge", "device-token")
        .and_then(|e| e.get_password())
        .is_ok();
    if !paired {
        return "Unusonic Bridge — not paired".to_string();
    }

    if state.is_syncing.load(Ordering::Relaxed) {
        return "Unusonic Bridge — syncing…".to_string();
    }

    match index::get_recent_syncs(&state.db_path, 1)
        .ok()
        .and_then(|v| v.into_iter().next())
    {
        Some(s) => format!(
            "Unusonic Bridge — {} — {}/{} ready",
            s.event_title, s.matched_count, s.total_count
        ),
        None => "Unusonic Bridge — no shows synced yet".to_string(),
    }
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Auto-updater. Registered unconditionally — if no update manifest is
        // reachable (Phase 1.0 internal alpha, no releases yet) the plugin
        // just doesn't find updates. Customer builds in Phase 1.5 will have a
        // real Ed25519 pubkey in tauri.conf.json and a manifest at the
        // GitHub Releases URL.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Resolve config directory
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| dirs::home_dir().unwrap().join(".unusonic-bridge"));
            std::fs::create_dir_all(&config_dir).ok();

            // Initialize app state
            let state = Arc::new(AppState::new(config_dir.clone()));
            app.manage(state.clone());
            app.manage(config_dir.clone());

            // Initialize the library database
            let db_path = state.db_path.clone();
            library::index::init_db(&db_path).expect("Failed to init library database");

            // Build tray menu
            let sync_now = MenuItem::with_id(app, "sync_now", "Sync Now", true, None::<&str>)?;
            let show_window = MenuItem::with_id(app, "show", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Bridge", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&sync_now, &show_window, &quit])?;

            // Load the tray icon from the bundled bytes. Embedding via
            // include_bytes! means no runtime file-resolution surprises.
            let icon_bytes = include_bytes!("../icons/tray-icon.png");
            let tray_icon = Image::from_bytes(icon_bytes)?;

            // Create tray icon. Built synchronously inside setup() so
            // macOS tray click event delivery works reliably (see Tauri
            // issues #11413 / #11462 / #13770 — async tray creation drops
            // events). Menu events are the primary interaction surface —
            // bare click events on the icon are unreliable across platforms
            // and we deliberately don't use `on_tray_icon_event`.
            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip(build_tooltip(&state))
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "sync_now" => {
                        // Manual "Sync Now" is a force-refresh: wipe the
                        // hash cache first so every crate rebuilds even if
                        // the server-side program content is unchanged.
                        // The DJ may have just added a missing track to
                        // their library and wants the matcher to re-run.
                        sync::engine::clear_hash_cache();
                        let state = app.state::<Arc<AppState>>();
                        let s = state.inner().clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = sync::engine::sync_all(&s).await {
                                log::error!("Manual sync failed: {}", e);
                            }
                        });
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Start background sync loop
            let sync_state = state.clone();
            tauri::async_runtime::spawn(async move {
                sync::engine::sync_loop(sync_state).await;
            });

            // Start file watcher for music folders
            let watch_state = state.clone();
            let watch_db = db_path.clone();
            std::thread::spawn(move || {
                watcher::fs_watcher::watch_music_folders(&watch_state, &watch_db);
            });

            // Start local HTTP API
            let api_state = state.clone();
            tauri::async_runtime::spawn(async move {
                api::server::start(api_state).await;
            });

            // POST the per-launch nonce to the web API if we have a device
            // token. No-op if Bridge isn't paired yet — pairing triggers
            // its own POST in commands::pair_with_code.
            let nonce_state = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = api::session::post_local_session_nonce(&nonce_state).await {
                    log::warn!("Initial nonce POST failed (will retry on next pair): {}", e);
                }
            });

            // Tray tooltip refresh loop. Polls state every 5s and updates
            // the tray tooltip in place. Polling (rather than reactive
            // events) keeps the engine agnostic of Tauri handles and is
            // cheap enough at 5s granularity.
            let tooltip_state = state.clone();
            let tooltip_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last: Option<String> = None;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    let next = build_tooltip(&tooltip_state);
                    if last.as_deref() == Some(next.as_str()) {
                        continue; // nothing changed, skip the IPC round trip
                    }
                    if let Some(tray) = tooltip_app.tray_by_id(TRAY_ID) {
                        let _ = tray.set_tooltip(Some(&next));
                    }
                    last = Some(next);
                }
            });

            // Hide window on close (keep in tray)
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::get_settings,
            commands::trigger_sync,
            commands::pair_with_code,
            commands::unpair_device,
            commands::add_music_folder,
            commands::remove_music_folder,
            commands::set_dj_software,
            commands::pick_music_folder,
            commands::get_scan_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Unusonic Bridge");
}
