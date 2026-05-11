/**
 * normalize-human-name
 *
 * Render-time fix for stray uppercase letters mid-word in user-entered
 * names — e.g. "Mike SIncere" → "Mike Sincere". Pure presentation; we
 * do NOT touch entity write paths or run a backfill. The original
 * casing stays in `directory.entities`; this helper only normalises
 * what's drawn on screen.
 *
 * Conservative by design. The rule is "fix obvious finger-slips,
 * preserve recognised compound forms":
 *
 *   - "Mike"      → "Mike"      (single leading capital, untouched)
 *   - "SIncere"   → "Sincere"   (mid-word capital, title-cased)
 *   - "MCDONALD"  → "Mcdonald"  (all caps without Mc/O' pattern, title-cased)
 *   - "McDonald"  → "McDonald"  (Mc/Mac pattern, preserved)
 *   - "O'Brien"   → "O'Brien"   (Irish/Scottish O' pattern, preserved)
 *   - "van der"   → "van der"   (Dutch lowercase particle, preserved)
 *   - "de la"     → "de la"     (Romance lowercase particle, preserved)
 *
 * Hyphenated names ("Smith-Jones") are normalised per-segment so each
 * side of the hyphen still gets the same treatment.
 */

const PRESERVE_LOWERCASE_PARTICLES = new Set([
  'van',
  'von',
  'der',
  'den',
  'de',
  'del',
  'della',
  'di',
  'da',
  'la',
  'le',
  'el',
  'al',
  'bin',
  'ibn',
]);

/** "McDonald", "MacArthur" — preserve as-is when the pattern matches. */
function isMcMacPattern(word: string): boolean {
  return /^(Mc|Mac)[A-Z][a-zA-Z]*$/.test(word);
}

/** "O'Brien", "D'Angelo" — preserve as-is when the pattern matches. */
function isApostrophePattern(word: string): boolean {
  return /^[A-Z]'[A-Z][a-zA-Z]*$/.test(word);
}

/** Title-case a single word: first letter upper, rest lower. */
function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Normalise a single space-separated token. Hyphenated tokens are
 * recursed through per-segment so "smith-Jones" becomes "Smith-Jones".
 */
function normaliseToken(token: string, isFirstToken: boolean): string {
  if (token.length === 0) return token;

  // Hyphenated: recurse on each side, treating each side as a "first token"
  // so "Smith-Jones" stays cased correctly.
  if (token.includes('-')) {
    return token
      .split('-')
      .map((segment) => normaliseToken(segment, true))
      .join('-');
  }

  // Lowercase Dutch/Romance/etc. particle — preserve only when it isn't
  // the leading token. "de la Cruz" keeps "de" + "la" lowercase, but
  // "De Niro" (where "De" is the family name's first piece) keeps the
  // original capitalisation if the user typed it that way.
  if (!isFirstToken && PRESERVE_LOWERCASE_PARTICLES.has(token.toLowerCase())) {
    return token.toLowerCase();
  }

  // Mc / Mac compound — preserve as-typed when the pattern fits.
  if (isMcMacPattern(token)) return token;

  // O' / D' apostrophe compound — preserve as-typed when the pattern fits.
  if (isApostrophePattern(token)) return token;

  // Single-letter token (initial). Always uppercase.
  if (token.length === 1) return token.toUpperCase();

  // Inspect upper-case letter positions. The "leave it alone" case is
  // exactly one uppercase letter at index 0 ("Mike"). Anything else —
  // mid-word uppercase ("SIncere"), all-caps ("MIKE"), all-lower
  // ("mike") — gets title-cased.
  let upperCount = 0;
  let firstUpperIdx = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch >= 'A' && ch <= 'Z') {
      upperCount++;
      if (firstUpperIdx === -1) firstUpperIdx = i;
    }
  }

  if (upperCount === 1 && firstUpperIdx === 0) {
    return token;
  }

  return titleCaseWord(token);
}

/**
 * Normalise a full human name for display. Idempotent and safe on
 * empty / null-ish input — callers don't need to guard.
 */
export function normalizeHumanName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length === 0) return '';

  // Collapse runs of whitespace so "Mike   Sincere" doesn't keep the
  // accidental double-space the user typed. We re-join with single
  // spaces so the rendered name is visually tidy.
  const tokens = trimmed.split(/\s+/);
  return tokens
    .map((token, idx) => normaliseToken(token, idx === 0))
    .join(' ');
}
