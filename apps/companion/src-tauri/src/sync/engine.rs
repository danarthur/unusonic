use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use crate::library::{index, matcher};
use crate::sync::{rekordbox, serato};
use crate::{AppState, DjSoftware};

/// RAII guard that sets `is_syncing` true on construction and clears it
/// on drop — so the tray tooltip always returns to a non-syncing state
/// even if the sync bails early on an error.
struct SyncingGuard<'a>(&'a AppState);
impl<'a> SyncingGuard<'a> {
    fn new(state: &'a AppState) -> Self {
        state.is_syncing.store(true, Ordering::Relaxed);
        Self(state)
    }
}
impl<'a> Drop for SyncingGuard<'a> {
    fn drop(&mut self) {
        self.0.is_syncing.store(false, Ordering::Relaxed);
    }
}

/// A program returned by the Unusonic API.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Program {
    event_id: String,
    event_title: String,
    event_date: String,
    #[serde(default)]
    event_end_date: Option<String>,
    #[serde(default)]
    venue_name: Option<String>,
    #[serde(default)]
    call_time: Option<String>,
    #[serde(default)]
    moments: Vec<ProgramMoment>,
    song_pool: Vec<SongEntry>,
    hash: String,
}

/// Minimal shape of a DJ program moment, projected down from the portal's
/// richer `ProgramMoment` type. Bridge only needs `id` and `label` to build
/// crate dividers — notes, announcement, energy, and sort_order are ignored
/// (serde silently skips unknown fields).
#[derive(Debug, Deserialize)]
struct ProgramMoment {
    id: String,
    label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct SongEntry {
    id: String,
    title: String,
    artist: String,
    tier: String,
    assigned_moment_id: Option<String>,
    sort_order: i32,
    isrc: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProgramsResponse {
    programs: Vec<Program>,
}

/// In-memory cache of last-synced hashes to avoid re-processing.
static HASH_CACHE: std::sync::LazyLock<std::sync::Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

/// Wipe the hash cache so the next `sync_all` rebuilds every crate even
/// if the server-side program content hasn't changed. Called by the tray
/// "Sync Now" button — a user clicking that expects everything to rebuild
/// regardless of what's changed on the server, because they may have just
/// added a missing file to their local library and want the matcher to
/// run against it.
pub fn clear_hash_cache() {
    HASH_CACHE.lock().unwrap().clear();
    log::info!("Hash cache cleared");
}

/// Run the sync loop: poll every N seconds, sync changed programs.
pub async fn sync_loop(state: Arc<AppState>) {
    loop {
        let interval = {
            let config = state.config.lock().unwrap();
            config.sync_interval_seconds
        };

        if let Err(e) = sync_all(&state).await {
            log::error!("Sync cycle failed: {}", e);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;
    }
}

/// Fetch the current set of programs from the Unusonic web API. Shared
/// between `sync_all` (polling path) and `sync_one` (manual trigger).
async fn fetch_programs(
    state: &AppState,
) -> Result<
    (ProgramsResponse, String, crate::BridgeConfig, reqwest::Client),
    Box<dyn std::error::Error + Send + Sync>,
> {
    let token = get_device_token()?;
    let config = state.config.lock().unwrap().clone();
    let horizon = config.sync_horizon_days;
    let url = format!(
        "{}/api/bridge/programs?horizon={}d",
        config.api_base_url, horizon
    );

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, body).into());
    }

    let data: ProgramsResponse = res.json().await?;
    Ok((data, token, config, client))
}

/// Match, write, report, and cache a single program. The hash-cache check
/// lives in the caller (`sync_all`) so manual triggers can force a fresh
/// sync without bypassing it at the library level.
async fn process_program(
    state: &AppState,
    program: &Program,
    token: &str,
    client: &reqwest::Client,
    config: &crate::BridgeConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    log::info!("Syncing: {} ({})", program.event_title, program.event_id);

    // Order songs: by moment assignment order, then floating
    let ordered = order_songs(&program.song_pool);

    // Moment label lookup for section dividers.
    let moments_by_id: HashMap<&str, &ProgramMoment> = program
        .moments
        .iter()
        .map(|m| (m.id.as_str(), m))
        .collect();

    // Match each song against the local library. Unmatched songs still
    // get a placeholder entry in the crate so the DJ sees the gap when
    // prepping. "A visible gap beats silent omission" — the worst-case
    // UX is the DJ discovering a missing must-play on stage.
    //
    // We also insert ━━━ Moment Label ━━━ divider entries between songs
    // that cross a section boundary (moment → moment, or cued → floating).
    // The dividers are fake broken-track paths that Serato and Rekordbox
    // render as missing tracks with the label visible as the filename.
    let mut all_paths: Vec<String> = Vec::new();
    let mut rekordbox_tracks: Vec<rekordbox::RekordboxTrack> = Vec::new();
    let mut unmatched: Vec<String> = Vec::new();
    let mut matched_count: u32 = 0;
    let mut current_section: Option<String> = None;

    for song in &ordered {
        // Determine which section this song belongs to. Cued songs group by
        // moment_id; floating songs group by tier.
        let (section_key, section_label): (String, String) =
            if let Some(moment_id) = &song.assigned_moment_id {
                let label = moments_by_id
                    .get(moment_id.as_str())
                    .map(|m| m.label.clone())
                    .unwrap_or_else(|| "Moment".to_string());
                (format!("moment:{}", moment_id), label)
            } else if song.tier == "must_play" {
                ("tier:must_play".to_string(), "Must Play".to_string())
            } else if song.tier == "play_if_possible" {
                (
                    "tier:play_if_possible".to_string(),
                    "Play If Possible".to_string(),
                )
            } else {
                ("tier:other".to_string(), "Other".to_string())
            };

        // Emit a divider on every section boundary (including the first).
        if current_section.as_ref() != Some(&section_key) {
            let divider_path = make_moment_divider(&section_label);
            all_paths.push(divider_path.clone());
            rekordbox_tracks.push(rekordbox::RekordboxTrack {
                file_path: divider_path,
                title: format!("━━━ {} ━━━", section_label),
                artist: String::new(),
                duration_secs: 0,
            });
            current_section = Some(section_key);
        }

        let result = matcher::match_song(
            &state.db_path,
            &song.artist,
            &song.title,
            song.isrc.as_deref(),
        );

        if let Some(path) = result.file_path {
            all_paths.push(path.clone());
            rekordbox_tracks.push(rekordbox::RekordboxTrack {
                file_path: path,
                title: song.title.clone(),
                artist: song.artist.clone(),
                duration_secs: song.duration_ms.map(|ms| (ms / 1000) as u32).unwrap_or(0),
            });
            matched_count += 1;
        } else {
            // Build an obviously-fake placeholder path. Serato and
            // Rekordbox will both show this as a missing/broken track
            // with the filename "MISSING - Artist - Title.mp3" prominent
            // in the crate list. DJs scan crates visually and broken
            // entries prompt them to act before the gig.
            let placeholder = make_missing_placeholder(&song.title, &song.artist);
            all_paths.push(placeholder.clone());
            rekordbox_tracks.push(rekordbox::RekordboxTrack {
                file_path: placeholder,
                title: format!("MISSING — {}", song.title),
                artist: song.artist.clone(),
                duration_secs: 0,
            });
            let label = if song.artist.is_empty() {
                song.title.clone()
            } else {
                format!("{} — {}", song.artist, song.title)
            };
            unmatched.push(label);
        }
    }

    let total = ordered.len() as u32;

    // Build a descriptive crate name: "2026-05-17 Henderson Wedding - Ritz Carlton"
    let crate_name = build_crate_name(
        &program.event_title,
        &program.event_date,
        program.venue_name.as_deref(),
    );

    // Write to DJ software
    if config.dj_software == DjSoftware::Serato || config.dj_software == DjSoftware::Both {
        if let Err(e) = serato::write_crate(&crate_name, &all_paths) {
            log::error!("Serato write failed: {}", e);
        }
    }

    if config.dj_software == DjSoftware::Rekordbox || config.dj_software == DjSoftware::Both {
        if let Some(dir) = rekordbox::get_rekordbox_import_dir() {
            if let Err(e) = rekordbox::write_xml(&crate_name, &rekordbox_tracks, &dir) {
                log::error!("Rekordbox write failed: {}", e);
            }
        }
    }

    // Save sync result locally
    let _ = index::upsert_sync_result(
        &state.db_path,
        &program.event_id,
        &program.event_title,
        &program.event_date,
        matched_count,
        total,
        &unmatched,
    );

    // Report sync status to server
    let _ = report_sync_status(
        client,
        &config.api_base_url,
        token,
        &program.event_id,
        matched_count,
        total,
        &unmatched,
    )
    .await;

    // Update hash cache
    {
        let mut cache = HASH_CACHE.lock().unwrap();
        cache.insert(program.event_id.clone(), program.hash.clone());
    }

    log::info!(
        "  {}/{} tracks matched for '{}'",
        matched_count,
        total,
        program.event_title
    );

    Ok(())
}

/// Sync all upcoming programs. Called by the background loop.
/// Skips programs whose content hash hasn't changed since the last sync.
pub async fn sync_all(state: &AppState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let _guard = SyncingGuard::new(state);
    let (data, token, config, client) = fetch_programs(state).await?;
    log::info!("Fetched {} programs", data.programs.len());

    for program in &data.programs {
        // Check if program changed since last sync
        {
            let cache = HASH_CACHE.lock().unwrap();
            if let Some(prev_hash) = cache.get(&program.event_id) {
                if prev_hash == &program.hash {
                    continue; // No change, skip
                }
            }
        }
        process_program(state, program, &token, &client, &config).await?;
    }

    Ok(())
}

/// Sync a single program by event_id. Called from the loopback API when the
/// portal's "Sync Now" button fires. Bypasses the hash cache — a manual
/// trigger should always rebuild the crate with the latest server state.
pub async fn sync_one(
    state: &AppState,
    event_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let _guard = SyncingGuard::new(state);
    let (data, token, config, client) = fetch_programs(state).await?;

    let program = data
        .programs
        .iter()
        .find(|p| p.event_id == event_id)
        .ok_or_else(|| format!("No upcoming program with event_id {}", event_id))?;

    process_program(state, program, &token, &client, &config).await
}

/// Build a descriptive crate name: "YYYY-MM-DD Event Title - Venue".
/// Falls back gracefully when date or venue is missing.
fn build_crate_name(title: &str, iso_date: &str, venue: Option<&str>) -> String {
    // Grab YYYY-MM-DD from the head of an ISO 8601 timestamp.
    let date: String = iso_date.chars().take(10).collect();
    let valid_date = date.len() == 10 && date.chars().nth(4) == Some('-');

    match (valid_date, venue) {
        (true, Some(v)) if !v.trim().is_empty() => format!("{} {} - {}", date, title, v.trim()),
        (true, _) => format!("{} {}", date, title),
        (false, Some(v)) if !v.trim().is_empty() => format!("{} - {}", title, v.trim()),
        (false, _) => title.to_string(),
    }
}

/// Build an obviously-fake absolute path for a moment divider — rendered
/// by Serato and Rekordbox as a broken track whose filename reads
/// "━━━ Label ━━━". Lives in a dedicated `/unusonic-moments/` directory
/// (which doesn't exist) so it's never confused with the `MISSING` tracks
/// that come from unmatched songs.
fn make_moment_divider(label: &str) -> String {
    let safe = sanitize_placeholder(label);
    format!("/unusonic-moments/━━━ {} ━━━.mp3", safe)
}

/// Build an obviously-fake absolute path for an unmatched song. Serato and
/// Rekordbox will both surface this as a broken track named
/// "MISSING - Artist - Title.mp3" in the crate list.
fn make_missing_placeholder(title: &str, artist: &str) -> String {
    let safe_title = sanitize_placeholder(title);
    let safe_artist = sanitize_placeholder(artist);
    let filename = if safe_artist.is_empty() {
        format!("MISSING - {}.mp3", safe_title)
    } else {
        format!("MISSING - {} - {}.mp3", safe_artist, safe_title)
    };
    // Leading slash → to_serato_path strips it → Serato sees
    // "unusonic-missing/MISSING - ...mp3" relative to the volume root,
    // which doesn't exist, which is exactly the intended broken-track state.
    format!("/unusonic-missing/{}", filename)
}

/// Strip filesystem-reserved and control characters from placeholder
/// components so they don't break the crate or XML encoders.
fn sanitize_placeholder(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| !matches!(*c, '/' | '\\' | ':' | '\n' | '\r' | '\t' | '<' | '>' | '|' | '*' | '?' | '"'))
        .collect();
    cleaned.trim().to_string()
}

/// Order songs by moment assignment, then floating must-play, then play-if-possible.
fn order_songs(songs: &[SongEntry]) -> Vec<&SongEntry> {
    let mut cued: Vec<&SongEntry> = songs
        .iter()
        .filter(|s| s.assigned_moment_id.is_some() && s.tier != "do_not_play")
        .collect();
    cued.sort_by_key(|s| s.sort_order);

    let must_play: Vec<&SongEntry> = songs
        .iter()
        .filter(|s| s.tier == "must_play" && s.assigned_moment_id.is_none())
        .collect();

    let play_if_possible: Vec<&SongEntry> = songs
        .iter()
        .filter(|s| s.tier == "play_if_possible" && s.assigned_moment_id.is_none())
        .collect();

    let mut ordered = cued;
    ordered.extend(must_play);
    ordered.extend(play_if_possible);
    ordered
}

/// Get the device token from the OS keychain.
fn get_device_token() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let entry = keyring::Entry::new("unusonic-bridge", "device-token")
        .map_err(|e| format!("Keychain access failed: {}", e))?;
    let token = entry
        .get_password()
        .map_err(|_| "Not paired — no device token found")?;
    Ok(token)
}

/// Report sync status to the Unusonic API.
async fn report_sync_status(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    event_id: &str,
    matched_count: u32,
    total_count: u32,
    unmatched: &[String],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let _ = client
        .post(format!("{}/api/bridge/sync-status", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "eventId": event_id,
            "matchedCount": matched_count,
            "totalCount": total_count,
            "unmatchedSongs": unmatched,
            "bridgeVersion": "0.1.0",
        }))
        .send()
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crate_name_with_date_and_venue() {
        let n = build_crate_name(
            "Henderson Wedding",
            "2026-05-17T18:00:00Z",
            Some("Ritz Carlton"),
        );
        assert_eq!(n, "2026-05-17 Henderson Wedding - Ritz Carlton");
    }

    #[test]
    fn crate_name_with_date_only() {
        let n = build_crate_name("Henderson Wedding", "2026-05-17T18:00:00Z", None);
        assert_eq!(n, "2026-05-17 Henderson Wedding");
    }

    #[test]
    fn crate_name_with_blank_venue_falls_back() {
        let n = build_crate_name("Henderson Wedding", "2026-05-17", Some("  "));
        assert_eq!(n, "2026-05-17 Henderson Wedding");
    }

    #[test]
    fn crate_name_without_valid_date() {
        let n = build_crate_name("Henderson Wedding", "tbd", Some("Ritz Carlton"));
        assert_eq!(n, "Henderson Wedding - Ritz Carlton");
    }

    #[test]
    fn missing_placeholder_has_artist_and_title() {
        let p = make_missing_placeholder("September", "Earth, Wind & Fire");
        // The path contains the readable filename DJs will see in the
        // crate list — the directory is a deliberate "doesn't exist" marker.
        assert!(p.starts_with("/unusonic-missing/"));
        assert!(p.contains("MISSING - Earth, Wind & Fire - September.mp3"));
    }

    #[test]
    fn missing_placeholder_handles_empty_artist() {
        let p = make_missing_placeholder("Unknown Track", "");
        assert!(p.contains("MISSING - Unknown Track.mp3"));
    }

    #[test]
    fn missing_placeholder_strips_path_separators() {
        // A maliciously-named song title shouldn't be able to break out of
        // the fake directory or inject path segments.
        let p = make_missing_placeholder("a/b\\c:d", "Evil Artist");
        assert!(!p.contains("/a/"));
        assert!(!p.contains("\\"));
        assert!(!p.contains(":"));
    }

    #[test]
    fn moment_divider_has_label_in_filename() {
        let d = make_moment_divider("First Dance");
        assert!(d.starts_with("/unusonic-moments/"));
        assert!(d.contains("━━━ First Dance ━━━"));
        assert!(d.ends_with(".mp3"));
    }

    #[test]
    fn moment_divider_sanitizes_label() {
        // Labels with path separators or control characters shouldn't
        // break out of the fake directory.
        let d = make_moment_divider("Sarah/Mike: The/Wedding");
        assert!(!d.contains("/Sarah/"));
        assert!(!d.contains(":"));
    }

    #[test]
    fn moment_divider_lives_in_separate_directory_from_missing() {
        // Dividers and MISSING placeholders must never collide — they use
        // separate fake directories so Serato never merges them.
        let d = make_moment_divider("First Dance");
        let m = make_missing_placeholder("September", "Earth Wind & Fire");
        assert_ne!(
            d.split('/').nth(1).unwrap(),
            m.split('/').nth(1).unwrap(),
            "dividers and MISSING markers must live in distinct synthetic directories"
        );
    }
}
