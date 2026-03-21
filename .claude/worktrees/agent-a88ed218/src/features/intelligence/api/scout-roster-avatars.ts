/**
 * Roster Avatar Assignment — Isolated module for troubleshooting
 *
 * PIPELINE:
 * 1. Structured blocks (Cluster Scanner finds per-person blocks with [HAS_IMAGE_URL])
 *    → blockAvatars[i] = parseAvatarFromBlock(blocks[i]) → roster[i] gets correct avatar ✓
 *
 * 2. Body fallback (one long block, e.g. Showit, layout not matched)
 *    → blockAvatars all null
 *    → avatarPool = getAvatarPoolForBodyFallback(block, rosterSize)
 *    → roster[i] gets avatarPool[i] if present
 *
 * KNOWN ISSUE: Body fallback assignment is wrong/mixed
 * - DOM order of images ≠ roster order (AI extracts names in reading order)
 * - URL patterns vary by CMS (Showit /200/, Squarespace, Wix, etc.)
 * - Current strategy: return [] (no avatars) to avoid wrong photos
 *
 * TO FIX LATER:
 * - Option A: Improve Cluster Scanner to find structured blocks on more CMSes
 * - Option B: Use AI to match image index to person (pass image list + roster, get mapping)
 * - Option C: Parse HTML for img–name proximity (complex, fragile)
 *
 * Debug: Run Scout with debug checkbox, check allImgUrls, avatarPool, rosterOrder in console
 */

function toAbsoluteImgUrl(u: string): string {
  return u.startsWith('//') ? `https:${u}` : u;
}

function isValidImgUrl(u: string): boolean {
  return !!(/^https?:\/\//i.test(u) || u.startsWith('//'));
}

/** Parse [HAS_IMAGE_URL: url] from block. For structured blocks. */
export function parseAvatarFromBlock(block: string): string | null {
  const tagged = block.match(/\[HAS_IMAGE_URL:\s*([^\]]+)\]/);
  if (tagged) {
    const u = tagged[1].trim();
    if (u && isValidImgUrl(u)) return toAbsoluteImgUrl(u);
  }
  if (block.length > 4000) return null;
  const imgSrc = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgSrc) {
    const u = imgSrc[1].trim();
    if (u && isValidImgUrl(u)) return toAbsoluteImgUrl(u);
  }
  return null;
}

/** Extract all img src URLs from block (document order). For debug + body fallback strategies. */
export function parseAllImgUrlsFromBlock(block: string): string[] {
  if (block.length < 500) return [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  const urls: string[] = [];
  let m;
  while ((m = regex.exec(block)) !== null) {
    const u = m[1].trim();
    if (u && isValidImgUrl(u)) urls.push(toAbsoluteImgUrl(u));
  }
  return urls;
}

/**
 * Body fallback: get avatar URLs to assign by roster index.
 * Currently returns [] — assignment is unreliable (DOM order ≠ roster order).
 * Swap strategy here when experimenting.
 */
export function getAvatarPoolForBodyFallback(block: string, rosterSize: number): string[] {
  const urls = parseAllImgUrlsFromBlock(block);
  if (urls.length === 0) return [];

  // --- STRATEGY: pick one (assignment order may still be wrong) ---
  const strategy: 'none' | 'skip2' | 'showit200' = 'none';

  if (strategy === 'none') return [];
  if (strategy === 'skip2') {
    const skip = Math.min(2, Math.max(0, urls.length - rosterSize));
    return urls.slice(skip, skip + rosterSize);
  }
  if (strategy === 'showit200') {
    const headshots = urls.filter((u) => /\/200\//.test(u));
    return headshots.length >= rosterSize ? headshots.slice(0, rosterSize) : [];
  }
  return [];
}

/** Assign avatarUrl to each roster member. Structured blocks first, then body fallback pool. */
export function assignAvatarsToRoster(
  blocks: string[],
  rawRoster: Array<{ firstName?: string; lastName?: string; name?: string; jobTitle?: string; role?: string; normalizedRole?: string; avatarUrl?: string | null }>,
  blockAvatars: (string | null)[]
): { avatarUrl: string | null }[] {
  const isBodyFallback = blocks.length === 1 && blocks[0].length > 4000 && blockAvatars.every((b) => !b);
  const avatarPool = isBodyFallback ? getAvatarPoolForBodyFallback(blocks[0], Math.min(rawRoster.length, 20)) : [];

  return rawRoster.slice(0, 20).map((r, i) => {
    let avatarUrl: string | null = null;
    if (r.avatarUrl && typeof r.avatarUrl === 'string') {
      const u = r.avatarUrl.trim();
      if (u && /^https?:\/\//i.test(u)) avatarUrl = u;
    }
    if (!avatarUrl && blockAvatars[i]) avatarUrl = blockAvatars[i];
    if (!avatarUrl && avatarPool[i]) avatarUrl = avatarPool[i];
    return { avatarUrl };
  });
}

/** Build debug object for troubleshooting avatar assignment. */
export function buildAvatarDebug(
  blocks: string[],
  roster: Array<{ firstName: string; lastName: string }>,
  blockAvatars: (string | null)[]
): {
  allImgUrls?: string[];
  avatarPool?: string[];
  rosterOrder?: string[];
} {
  const isBodyFallback = blocks.length === 1 && blocks[0].length > 4000;
  if (!isBodyFallback) return {};
  const rosterSize = roster.length;
  return {
    allImgUrls: parseAllImgUrlsFromBlock(blocks[0]),
    avatarPool: getAvatarPoolForBodyFallback(blocks[0], rosterSize),
    rosterOrder: roster.map((m) => `${m.firstName} ${m.lastName}`),
  };
}
