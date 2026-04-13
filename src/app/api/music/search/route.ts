/**
 * Unified music search — queries Spotify + Apple Music, dedupes by ISRC.
 * GET /api/music/search?q=...&limit=8
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { spotifyFetch, isSpotifyConfigured } from '@/shared/api/spotify/client';
import { appleMusicFetch, isAppleMusicConfigured, DEFAULT_STOREFRONT } from '@/shared/api/apple-music/client';

export type SearchResult = {
  title: string;
  artist: string;
  album: string;
  spotify_id: string | null;
  apple_music_id: string | null;
  isrc: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  preview_url: string | null;
};

/* ── Spotify types (partial) ────────────────────────────────────── */

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  duration_ms: number;
  preview_url: string | null;
  external_ids?: { isrc?: string };
};

type SpotifySearchResponse = {
  tracks?: { items: SpotifyTrack[] };
};

/* ── Apple Music types (partial) ────────────────────────────────── */

type AppleMusicSong = {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    artwork: { url: string };
    previews: { url: string }[];
    isrc?: string;
  };
};

type AppleMusicSearchResponse = {
  results?: { songs?: { data: AppleMusicSong[] } };
};

/* ── Normalizers ────────────────────────────────────────────────── */

function normalizeSpotifyTrack(t: SpotifyTrack): SearchResult {
  const art = t.album.images.find(i => i.width >= 200 && i.width <= 400) ?? t.album.images[0];
  return {
    title: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    album: t.album.name,
    spotify_id: t.id,
    apple_music_id: null,
    isrc: t.external_ids?.isrc ?? null,
    artwork_url: art?.url ?? null,
    duration_ms: t.duration_ms,
    preview_url: t.preview_url,
  };
}

function normalizeAppleMusicSong(s: AppleMusicSong): SearchResult {
  const artUrl = s.attributes.artwork.url
    .replace('{w}', '300').replace('{h}', '300');
  return {
    title: s.attributes.name,
    artist: s.attributes.artistName,
    album: s.attributes.albumName,
    spotify_id: null,
    apple_music_id: s.id,
    isrc: s.attributes.isrc ?? null,
    artwork_url: artUrl,
    duration_ms: s.attributes.durationInMillis,
    preview_url: s.attributes.previews?.[0]?.url ?? null,
  };
}

/* ── Deduplication ──────────────────────────────────────────────── */

function dedupeByIsrc(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  const out: SearchResult[] = [];

  for (const r of results) {
    if (r.isrc) {
      const existing = seen.get(r.isrc);
      if (existing) {
        // Merge: prefer Apple Music preview (more reliable), keep both IDs
        if (!existing.preview_url && r.preview_url) existing.preview_url = r.preview_url;
        if (!existing.spotify_id && r.spotify_id) existing.spotify_id = r.spotify_id;
        if (!existing.apple_music_id && r.apple_music_id) existing.apple_music_id = r.apple_music_id;
        if (!existing.artwork_url && r.artwork_url) existing.artwork_url = r.artwork_url;
        continue;
      }
      seen.set(r.isrc, r);
    }
    out.push(r);
  }

  return out;
}

/* ── Route ──────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '8', 10), 20);
  const hasSpotify = isSpotifyConfigured();
  const hasApple = isAppleMusicConfigured();

  if (!hasSpotify && !hasApple) {
    return NextResponse.json({ error: 'No music service configured' }, { status: 501 });
  }

  // Query in parallel
  const [spotifyResults, appleResults] = await Promise.all([
    hasSpotify
      ? spotifyFetch<SpotifySearchResponse>('/search', {
          q, type: 'track', limit: String(limit), market: 'US',
        })
      : null,
    hasApple
      ? appleMusicFetch<AppleMusicSearchResponse>(
          `/catalog/${DEFAULT_STOREFRONT}/search`,
          { term: q, types: 'songs', limit: String(limit) },
        )
      : null,
  ]);

  const results: SearchResult[] = [];

  // Apple Music first (better previews)
  if (appleResults?.results?.songs?.data) {
    results.push(...appleResults.results.songs.data.map(normalizeAppleMusicSong));
  }

  if (spotifyResults?.tracks?.items) {
    results.push(...spotifyResults.tracks.items.map(normalizeSpotifyTrack));
  }

  const deduped = dedupeByIsrc(results).slice(0, limit);

  return NextResponse.json({ results: deduped });
}
