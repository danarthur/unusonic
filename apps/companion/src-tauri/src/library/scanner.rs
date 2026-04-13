use lofty::prelude::*;
use lofty::probe::Probe;
use std::path::Path;
use walkdir::WalkDir;

use super::index;

/// Audio file extensions we index.
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "flac", "wav", "aiff", "aif", "ogg", "wma", "alac",
];

/// Scan a single folder and index all audio files.
/// If `progress` is provided, updates scan state for UI polling.
pub fn scan_folder(folder: &str, db_path: &Path) -> Result<u32, Box<dyn std::error::Error>> {
    scan_folder_with_progress(folder, db_path, None)
}

pub fn scan_folder_with_progress(
    folder: &str,
    db_path: &Path,
    progress: Option<&crate::ScanProgress>,
) -> Result<u32, Box<dyn std::error::Error>> {
    if let Some(p) = progress {
        p.start(folder);
    }
    let mut count = 0u32;

    for entry in WalkDir::new(folder)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        if !ext.as_ref().map_or(false, |e| AUDIO_EXTENSIONS.contains(&e.as_str())) {
            continue;
        }

        if let Err(e) = index_file(path, db_path) {
            log::warn!("Failed to index {}: {}", path.display(), e);
            continue;
        }

        count += 1;
        if let Some(p) = progress {
            p.increment();
        }
        if count % 500 == 0 {
            log::info!("Indexed {} tracks from {}", count, folder);
        }
    }

    if let Some(p) = progress {
        p.finish();
    }

    // Purge orphaned rows: files that were in the index but no longer exist
    // on disk. Leaving stale entries is NOT harmless — the matcher would
    // return file paths that don't exist and those would end up in crates
    // as broken tracks (independent from our intentional MISSING placeholders).
    if let Err(e) = index::prune_missing_tracks(db_path, folder) {
        log::warn!("Orphan purge failed for {}: {}", folder, e);
    }

    log::info!("Scan complete: {} tracks from {}", count, folder);
    Ok(count)
}

/// Returns true if the file extension matches one of our indexed audio types.
pub fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.as_str()))
        .unwrap_or(false)
}

/// Read ID3/metadata tags from a single audio file and insert into the index.
///
/// Exposed as `pub` so the file watcher can re-index individual files in
/// place instead of re-scanning the whole parent directory on every change.
pub fn index_file(path: &Path, db_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Read tags via lofty
    let tagged_file = Probe::open(path)?.read()?;
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let (artist, title, album, isrc, bpm, musical_key) = if let Some(tag) = tag {
        let artist = tag.artist().map(|s| s.to_string());
        let title = tag.title().map(|s| s.to_string());
        let album = tag.album().map(|s| s.to_string());

        // ISRC: stored in TSRC frame (ID3v2) or custom field
        let isrc = tag
            .get_string(&ItemKey::Isrc)
            .map(|s| s.to_string());

        // BPM
        let bpm = tag
            .get_string(&ItemKey::Bpm)
            .and_then(|s| s.parse::<f64>().ok());

        // Musical key
        let musical_key = tag
            .get_string(&ItemKey::InitialKey)
            .map(|s| s.to_string());

        (artist, title, album, isrc, bpm, musical_key)
    } else {
        (None, None, None, None, None, None)
    };

    // Duration from audio properties
    let duration_secs = tagged_file
        .properties()
        .duration()
        .as_secs_f64();
    let duration = if duration_secs > 0.0 {
        Some(duration_secs)
    } else {
        None
    };

    index::upsert_track(
        db_path,
        &file_path,
        &file_name,
        artist.as_deref(),
        title.as_deref(),
        album.as_deref(),
        isrc.as_deref(),
        duration,
        bpm,
        musical_key.as_deref(),
        None, // file_hash — skip for now, can add later for dedup
    )?;

    Ok(())
}
