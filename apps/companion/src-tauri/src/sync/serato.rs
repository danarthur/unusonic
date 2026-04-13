use std::fs;
use std::io;
use std::path::PathBuf;

/// Encode a string to UTF-16 Big Endian bytes.
fn to_utf16be(s: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(s.len() * 2);
    for c in s.encode_utf16() {
        bytes.push((c >> 8) as u8);
        bytes.push((c & 0xFF) as u8);
    }
    bytes
}

/// Write a TLV block: [4-byte ASCII tag][4-byte big-endian length][data].
fn write_tlv(buf: &mut Vec<u8>, tag: &[u8; 4], data: &[u8]) {
    buf.extend_from_slice(tag);
    buf.extend_from_slice(&(data.len() as u32).to_be_bytes());
    buf.extend_from_slice(data);
}

/// Convert an absolute file path to a Serato-relative path.
/// macOS: strip leading '/' → "Users/dj/Music/file.mp3"
/// Windows: strip drive letter + colon → "Music/file.mp3"
fn to_serato_path(absolute_path: &str) -> String {
    if cfg!(target_os = "windows") {
        // "D:\Music\file.mp3" → "Music/file.mp3"
        if let Some(pos) = absolute_path.find('\\') {
            return absolute_path[pos + 1..].replace('\\', "/");
        }
        if let Some(pos) = absolute_path.find('/') {
            if pos <= 2 {
                return absolute_path[pos + 1..].to_string();
            }
        }
        absolute_path.to_string()
    } else {
        // "/Users/dj/Music/file.mp3" → "Users/dj/Music/file.mp3"
        absolute_path.strip_prefix('/').unwrap_or(absolute_path).to_string()
    }
}

/// Generate a Serato .crate binary from a list of absolute file paths.
pub fn generate_crate(tracks: &[String]) -> Vec<u8> {
    let mut buf = Vec::new();

    // Version header
    let version = to_utf16be("1.0/Serato ScratchLive Crate");
    write_tlv(&mut buf, b"vrsn", &version);

    // Track entries
    for track in tracks {
        let serato_path = to_serato_path(track);
        let ptrk_data = to_utf16be(&serato_path);

        let mut otrk_inner = Vec::new();
        write_tlv(&mut otrk_inner, b"ptrk", &ptrk_data);
        write_tlv(&mut buf, b"otrk", &otrk_inner);
    }

    buf
}

/// Get the Serato subcrates directory for the current platform.
pub fn get_serato_subcrates_dir() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        let home = dirs::home_dir()?;
        let path = home.join("Music/_Serato_/Subcrates");
        if path.exists() {
            return Some(path);
        }
        // Try creating if _Serato_ exists
        let serato = home.join("Music/_Serato_");
        if serato.exists() {
            let subcrates = serato.join("Subcrates");
            fs::create_dir_all(&subcrates).ok()?;
            return Some(subcrates);
        }
        None
    } else {
        // Windows: check common drive roots
        for drive in &["C:", "D:", "E:", "F:"] {
            let path = PathBuf::from(format!("{}\\Music\\_Serato_\\Subcrates", drive));
            if path.exists() {
                return Some(path);
            }
            let path2 = PathBuf::from(format!("{}\\_Serato_\\Subcrates", drive));
            if path2.exists() {
                return Some(path2);
            }
        }
        None
    }
}

/// Write a .crate file into the Unusonic subcrate folder.
///
/// All Unusonic crates land under a virtual "Unusonic" parent in Serato's
/// sidebar via the `%%` nesting convention — the physical file lives
/// alongside other subcrates but Serato groups it visually. This is the
/// "visually segregated from the DJ's own crates" trust contract: Bridge
/// never writes to crates outside the Unusonic namespace and the DJ can
/// delete the whole Unusonic group without touching their own work.
///
/// Atomic write: serializes the crate to a `.tmp` sibling path and then
/// calls `fs::rename` to swap it atomically into place. On POSIX the
/// rename is atomic per spec; on Windows it's atomic for the common case
/// where both files are on the same volume (which they always are here).
/// This means Serato can be actively reading the crate file while Bridge
/// updates it — worst case Serato sees the old version or the new version,
/// never a half-written one.
pub fn write_crate(event_name: &str, tracks: &[String]) -> io::Result<PathBuf> {
    let subcrates = get_serato_subcrates_dir()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Serato subcrates directory not found"))?;

    let safe_name = sanitize_filename(event_name);
    // Serato subcrate nesting uses %% as separator
    let final_path = subcrates.join(format!("Unusonic%%{}.crate", safe_name));
    let temp_path = subcrates.join(format!("Unusonic%%{}.crate.tmp", safe_name));

    let data = generate_crate(tracks);
    fs::write(&temp_path, data)?;
    // Atomic rename — replaces any existing file at final_path. If this
    // fails, the .tmp file is left behind for manual inspection.
    fs::rename(&temp_path, &final_path)?;

    log::info!("Wrote Serato crate: {}", final_path.display());
    Ok(final_path)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_serato_path_macos() {
        assert_eq!(
            to_serato_path("/Users/dj/Music/Artist - Title.mp3"),
            "Users/dj/Music/Artist - Title.mp3"
        );
    }

    #[test]
    fn test_generate_crate_not_empty() {
        let tracks = vec!["/Users/dj/Music/track.mp3".to_string()];
        let data = generate_crate(&tracks);
        // Should start with 'vrsn' tag
        assert_eq!(&data[0..4], b"vrsn");
        assert!(data.len() > 50);
    }
}
