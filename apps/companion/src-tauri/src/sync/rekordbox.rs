use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// A track to include in the Rekordbox XML.
pub struct RekordboxTrack {
    pub file_path: String, // Absolute path
    pub title: String,
    pub artist: String,
    pub duration_secs: u32,
}

/// Generate a Rekordbox-compatible XML playlist.
pub fn generate_xml(playlist_name: &str, tracks: &[RekordboxTrack]) -> String {
    let mut xml = String::new();

    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<DJ_PLAYLISTS Version=\"1.0.0\">\n");
    xml.push_str("  <PRODUCT Name=\"Unusonic Bridge\" Version=\"1.0\" Company=\"Unusonic\"/>\n");
    xml.push_str(&format!(
        "  <COLLECTION Entries=\"{}\">\n",
        tracks.len()
    ));

    for (i, track) in tracks.iter().enumerate() {
        let id = i + 1;
        let location = path_to_file_uri(&track.file_path);
        xml.push_str(&format!(
            "    <TRACK TrackID=\"{}\" Name=\"{}\" Artist=\"{}\" TotalTime=\"{}\" Location=\"{}\"/>\n",
            id,
            xml_escape(&track.title),
            xml_escape(&track.artist),
            track.duration_secs,
            xml_escape(&location),
        ));
    }

    xml.push_str("  </COLLECTION>\n");
    xml.push_str("  <PLAYLISTS>\n");
    xml.push_str("    <NODE Type=\"0\" Name=\"ROOT\" Count=\"1\">\n");
    xml.push_str(&format!(
        "      <NODE Name=\"Unusonic\" Type=\"0\" Count=\"1\">\n"
    ));
    xml.push_str(&format!(
        "        <NODE Name=\"{}\" Type=\"1\" KeyType=\"0\" Entries=\"{}\">\n",
        xml_escape(playlist_name),
        tracks.len()
    ));

    for (i, _) in tracks.iter().enumerate() {
        xml.push_str(&format!("          <TRACK Key=\"{}\"/>\n", i + 1));
    }

    xml.push_str("        </NODE>\n");
    xml.push_str("      </NODE>\n");
    xml.push_str("    </NODE>\n");
    xml.push_str("  </PLAYLISTS>\n");
    xml.push_str("</DJ_PLAYLISTS>\n");

    xml
}

/// Write a Rekordbox XML file.
///
/// Atomic write: serializes to a `.tmp` sibling path and renames into
/// place, same pattern as `serato::write_crate`. Less critical here
/// because Rekordbox import is user-triggered rather than a watched
/// directory, but the consistency is cheap and matches the trust contract.
pub fn write_xml(
    playlist_name: &str,
    tracks: &[RekordboxTrack],
    output_dir: &Path,
) -> io::Result<PathBuf> {
    fs::create_dir_all(output_dir)?;

    let safe_name = sanitize_filename(playlist_name);
    let final_path = output_dir.join(format!("{}.xml", safe_name));
    let temp_path = output_dir.join(format!("{}.xml.tmp", safe_name));

    let xml = generate_xml(playlist_name, tracks);
    fs::write(&temp_path, xml)?;
    fs::rename(&temp_path, &final_path)?;

    log::info!("Wrote Rekordbox XML: {}", final_path.display());
    Ok(final_path)
}

/// Get the default Rekordbox XML import directory.
pub fn get_rekordbox_import_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let path = home.join("Documents/Unusonic Bridge/Rekordbox");
    Some(path)
}

/// Convert an absolute path to a file:// URI (Rekordbox format).
fn path_to_file_uri(path: &str) -> String {
    let encoded: String = path
        .split('/')
        .map(|segment| {
            percent_encode(segment)
        })
        .collect::<Vec<_>>()
        .join("/");

    format!("file://localhost{}", encoded)
}

fn percent_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("%20"),
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
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
