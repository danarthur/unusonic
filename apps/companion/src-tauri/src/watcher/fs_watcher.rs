use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use crate::library::{index, scanner};
use crate::AppState;

/// Watch configured music folders for changes and re-index affected files.
pub fn watch_music_folders(state: &AppState, db_path: &Path) {
    let (tx, rx) = mpsc::channel();

    let mut watcher = match RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    ) {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to create file watcher: {}", e);
            return;
        }
    };

    // Watch all configured folders
    {
        let config = state.config.lock().unwrap();
        for folder in &config.music_folders {
            let path = Path::new(folder);
            if path.exists() {
                if let Err(e) = watcher.watch(path, RecursiveMode::Recursive) {
                    log::warn!("Failed to watch {}: {}", folder, e);
                }
            }
        }
    }

    log::info!("File watcher started");

    // Process events. Per-file indexing instead of scanning the whole parent
    // folder on every touch — a 10k-track library was being fully re-walked
    // every time a single file changed.
    for event in rx {
        match event.kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                for path in &event.paths {
                    if scanner::is_audio_file(path) {
                        log::debug!("File changed: {}", path.display());
                        if let Err(e) = scanner::index_file(path, db_path) {
                            log::warn!("Re-index failed for {}: {}", path.display(), e);
                        }
                    }
                }
            }
            EventKind::Remove(_) => {
                // Delete the row for the removed file. The matcher would
                // otherwise return a path that no longer exists and the crate
                // writer would emit it as a broken track — indistinguishable
                // from our intentional MISSING placeholders.
                for path in &event.paths {
                    if scanner::is_audio_file(path) {
                        let file_path = path.to_string_lossy().to_string();
                        if let Err(e) = index::delete_track_by_path(db_path, &file_path) {
                            log::warn!("Failed to remove deleted track {}: {}", file_path, e);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}
