use std::path::Path;
use strsim::normalized_damerau_levenshtein;
use unicode_normalization::UnicodeNormalization;

use super::index;

/// Match result: the local file path if found, or None.
pub struct MatchResult {
    pub file_path: Option<String>,
    pub confidence: f64,
}

/// Minimum similarity threshold for fuzzy matching (0.0–1.0).
const FUZZY_THRESHOLD: f64 = 0.7;

/// Try to match a song to a file in the local library.
/// Strategy: ISRC first (exact), then fuzzy title+artist.
pub fn match_song(
    db_path: &Path,
    artist: &str,
    title: &str,
    isrc: Option<&str>,
) -> MatchResult {
    // 1. ISRC match (exact, highest confidence)
    if let Some(isrc) = isrc {
        if !isrc.is_empty() {
            if let Ok(Some(path)) = index::find_by_isrc(db_path, isrc) {
                return MatchResult {
                    file_path: Some(path),
                    confidence: 1.0,
                };
            }
        }
    }

    // 2. Fuzzy title+artist match
    let norm_artist = normalize(artist);
    let norm_title = normalize(title);

    if let Ok(candidates) = index::find_by_artist_title(db_path, artist, title) {
        let mut best_path: Option<String> = None;
        let mut best_score: f64 = 0.0;

        for (path, cand_artist, cand_title) in &candidates {
            let artist_sim = normalized_damerau_levenshtein(&norm_artist, &normalize(cand_artist));
            let title_sim = normalized_damerau_levenshtein(&norm_title, &normalize(cand_title));

            // Weighted: title matters more than artist (0.6/0.4)
            let score = title_sim * 0.6 + artist_sim * 0.4;

            if score > best_score {
                best_score = score;
                best_path = Some(path.clone());
            }
        }

        if best_score >= FUZZY_THRESHOLD {
            return MatchResult {
                file_path: best_path,
                confidence: best_score,
            };
        }
    }

    MatchResult {
        file_path: None,
        confidence: 0.0,
    }
}

/// Normalize a string for fuzzy comparison:
/// - Unicode NFC normalization
/// - Lowercase
/// - Strip common suffixes like "(feat. ...)", "(Remix)", etc.
/// - Collapse whitespace
fn normalize(s: &str) -> String {
    let s: String = s.nfc().collect();
    let s = s.to_lowercase();

    // Strip parenthetical suffixes like (feat. X), (Remix), [Original Mix]
    let s = strip_parens(&s);

    // Collapse whitespace and trim
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_parens(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut depth = 0i32;
    for ch in s.chars() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => {
                depth -= 1;
                continue;
            }
            _ if depth > 0 => continue,
            _ => result.push(ch),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize() {
        assert_eq!(normalize("  Hello   World  "), "hello world");
        // `normalize` applies `strip_parens` then `split_whitespace().join(" ")`,
        // which collapses and trims whitespace — so trailing spaces from the
        // parens-strip step disappear.
        assert_eq!(normalize("Song (feat. Artist)"), "song");
        assert_eq!(normalize("Track [Remix]"), "track");
    }

    #[test]
    fn test_strip_parens() {
        assert_eq!(strip_parens("hello (world)"), "hello ");
        assert_eq!(strip_parens("test [foo] bar"), "test  bar");
    }
}
