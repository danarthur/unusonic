# Roster Avatar Troubleshooting

When Scout finds team members but photos are missing or wrong, the logic lives here:

## File to edit

**`src/features/intelligence/api/scout-roster-avatars.ts`**

## Flow

1. **Structured blocks** (Cluster Scanner finds per-person blocks with `[HAS_IMAGE_URL]`)
   - Works: `blockAvatars[i]` maps to roster person `i`
   - No changes needed

2. **Body fallback** (one long block, e.g. Showit, layout not matched)
   - `getAvatarPoolForBodyFallback()` controls which images we use
   - Strategy is set via the `strategy` variable

## Debug

1. Enable the Debug checkbox in the Scout UI
2. Run a scan
3. Open browser console, find `[Scout Debug]`
4. Inspect: `allImgUrls`, `avatarPool`, `rosterOrder`

## Strategies (body fallback)

In `getAvatarPoolForBodyFallback`, set `strategy` to:

- **`'none'`** (default) — No avatars. Safest.
- **`'skip2'`** — Skip first 2 images (hero/logo), use next N. Photos may be wrong.
- **`'showit200'`** — Showit only: use images with `/200/` in URL. CMS-specific.

## Fixes to explore

1. **Cluster Scanner** — Add selectors so more sites produce structured blocks instead of body fallback.
2. **AI-based matching** — Ask AI to map image index → person from the block content.
3. **Proximity parsing** — Parse HTML and associate each img with the nearest name text.
