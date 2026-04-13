use rusqlite::{Connection, params};
use std::path::Path;
use crate::SyncResult;

/// Initialize the SQLite database with the library schema.
pub fn init_db(db_path: &Path) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            artist TEXT,
            title TEXT,
            album TEXT,
            isrc TEXT,
            duration_secs REAL,
            bpm REAL,
            musical_key TEXT,
            file_hash TEXT,
            indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON tracks(isrc) WHERE isrc IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_tracks_artist_title ON tracks(artist, title);

        CREATE TABLE IF NOT EXISTS sync_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            event_title TEXT NOT NULL,
            event_date TEXT NOT NULL,
            matched_count INTEGER NOT NULL DEFAULT 0,
            total_count INTEGER NOT NULL DEFAULT 0,
            unmatched_songs TEXT NOT NULL DEFAULT '[]',
            synced_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(event_id)
        );

        CREATE TABLE IF NOT EXISTS scan_state (
            folder_path TEXT PRIMARY KEY,
            last_scan_at TEXT NOT NULL DEFAULT (datetime('now')),
            track_count INTEGER NOT NULL DEFAULT 0
        );"
    )?;

    Ok(())
}

/// Get the total number of indexed tracks.
pub fn get_track_count(db_path: &Path) -> Result<u64, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let count: u64 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))?;
    Ok(count)
}

/// Insert or update a track in the index.
pub fn upsert_track(
    db_path: &Path,
    file_path: &str,
    file_name: &str,
    artist: Option<&str>,
    title: Option<&str>,
    album: Option<&str>,
    isrc: Option<&str>,
    duration_secs: Option<f64>,
    bpm: Option<f64>,
    musical_key: Option<&str>,
    file_hash: Option<&str>,
) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "INSERT INTO tracks (file_path, file_name, artist, title, album, isrc, duration_secs, bpm, musical_key, file_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(file_path) DO UPDATE SET
            file_name = excluded.file_name,
            artist = excluded.artist,
            title = excluded.title,
            album = excluded.album,
            isrc = excluded.isrc,
            duration_secs = excluded.duration_secs,
            bpm = excluded.bpm,
            musical_key = excluded.musical_key,
            file_hash = excluded.file_hash,
            indexed_at = datetime('now')",
        params![file_path, file_name, artist, title, album, isrc, duration_secs, bpm, musical_key, file_hash],
    )?;
    Ok(())
}

/// Delete a single track row by its file path. Called by the file watcher
/// when a Remove event fires.
pub fn delete_track_by_path(db_path: &Path, file_path: &str) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![file_path])?;
    Ok(())
}

/// Remove tracks from the index whose files no longer exist on disk within
/// a given folder. Called after a scan completes. Returns the number of
/// purged rows.
pub fn prune_missing_tracks(db_path: &Path, folder: &str) -> Result<usize, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    // Collect candidate paths under this folder first (cheap), then delete
    // any whose files don't exist anymore. Done in two passes to avoid
    // iterating and deleting from the same statement.
    let prefix = format!("{}%", folder.trim_end_matches(['/', '\\']));
    let mut stmt = conn.prepare("SELECT file_path FROM tracks WHERE file_path LIKE ?1")?;
    let paths: Vec<String> = stmt
        .query_map(params![prefix], |row| row.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    let mut purged = 0usize;
    for path in &paths {
        if !std::path::Path::new(path).exists() {
            conn.execute("DELETE FROM tracks WHERE file_path = ?1", params![path])?;
            purged += 1;
        }
    }

    if purged > 0 {
        log::info!("Pruned {} orphaned tracks from {}", purged, folder);
    }
    Ok(purged)
}

/// Find a track by ISRC code.
pub fn find_by_isrc(db_path: &Path, isrc: &str) -> Result<Option<String>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare("SELECT file_path FROM tracks WHERE isrc = ?1 LIMIT 1")?;
    let result = stmt.query_row(params![isrc], |row| row.get::<_, String>(0));
    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Find tracks by artist and title (for fuzzy matching).
pub fn find_by_artist_title(
    db_path: &Path,
    artist: &str,
    title: &str,
) -> Result<Vec<(String, String, String)>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    // Broad search — the matcher module handles fuzzy scoring
    let mut stmt = conn.prepare(
        "SELECT file_path, COALESCE(artist, ''), COALESCE(title, '') FROM tracks
         WHERE artist LIKE ?1 OR title LIKE ?2
         LIMIT 50"
    )?;
    let pattern_artist = format!("%{}%", artist);
    let pattern_title = format!("%{}%", title);
    let rows = stmt.query_map(params![pattern_artist, pattern_title], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;
    rows.collect()
}

/// Upsert a sync result into local history.
pub fn upsert_sync_result(
    db_path: &Path,
    event_id: &str,
    event_title: &str,
    event_date: &str,
    matched_count: u32,
    total_count: u32,
    unmatched_songs: &[String],
) -> Result<(), rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let unmatched_json = serde_json::to_string(unmatched_songs).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT INTO sync_history (event_id, event_title, event_date, matched_count, total_count, unmatched_songs)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(event_id) DO UPDATE SET
            event_title = excluded.event_title,
            event_date = excluded.event_date,
            matched_count = excluded.matched_count,
            total_count = excluded.total_count,
            unmatched_songs = excluded.unmatched_songs,
            synced_at = datetime('now')",
        params![event_id, event_title, event_date, matched_count, total_count, unmatched_json],
    )?;
    Ok(())
}

/// Get recent sync results.
pub fn get_recent_syncs(db_path: &Path, limit: u32) -> Result<Vec<SyncResult>, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT event_id, event_title, event_date, matched_count, total_count, unmatched_songs, synced_at
         FROM sync_history ORDER BY synced_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        let unmatched_json: String = row.get(5)?;
        let unmatched: Vec<String> = serde_json::from_str(&unmatched_json).unwrap_or_default();
        Ok(SyncResult {
            event_id: row.get(0)?,
            event_title: row.get(1)?,
            event_date: row.get(2)?,
            matched_count: row.get(3)?,
            total_count: row.get(4)?,
            unmatched_songs: unmatched,
            synced_at: row.get(6)?,
        })
    })?;
    rows.collect()
}
