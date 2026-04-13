/**
 * Import a Spotify or Apple Music playlist by URL.
 * POST /api/music/import-playlist  { url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { spotifyFetch, isSpotifyConfigured } from '@/shared/api/spotify/client';
import { appleMusicFetch, isAppleMusicConfigured } from '@/shared/api/apple-music/client';
import type { SearchResult } from '../search/route';

/* ── URL Parsing ────────────────────────────────────────────────── */

type PlaylistRef =
  | { service: 'spotify'; id: string }
  | { service: 'apple'; id: string; storefront: string };

function parsePlaylistUrl(url: string): PlaylistRef | null {
  // Spotify: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  const spotifyMatch = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (spotifyMatch) return { service: 'spotify', id: spotifyMatch[1] };

  // Apple Music: https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb
  const appleMatch = url.match(/music\.apple\.com\/([a-z]{2})\/playlist\/.+?\/(pl\.[a-zA-Z0-9]+)/);
  if (appleMatch) return { service: 'apple', id: appleMatch[2], storefront: appleMatch[1] };

  return null;
}

/* ── Spotify Playlist Fetch ─────────────────────────────────────── */

type SpotifyPlaylistTrack = {
  track: {
    id: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string; width: number }[] };
    duration_ms: number;
    preview_url: string | null;
    external_ids?: { isrc?: string };
  } | null;
};

type SpotifyPlaylistResponse = {
  name: string;
  tracks: { items: SpotifyPlaylistTrack[]; next: string | null; total: number };
};

async function importSpotifyPlaylist(id: string): Promise<{ name: string; tracks: SearchResult[] } | null> {
  const playlist = await spotifyFetch<SpotifyPlaylistResponse>(`/playlists/${id}`, {
    fields: 'name,tracks(items(track(id,name,artists(name),album(name,images),duration_ms,preview_url,external_ids)),next,total)',
    market: 'US',
  });

  if (!playlist) return null;

  const tracks: SearchResult[] = [];

  for (const item of playlist.tracks.items) {
    if (!item.track) continue;
    const t = item.track;
    const art = t.album.images.find(i => i.width >= 200 && i.width <= 400) ?? t.album.images[0];
    tracks.push({
      title: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      album: t.album.name,
      spotify_id: t.id,
      apple_music_id: null,
      isrc: t.external_ids?.isrc ?? null,
      artwork_url: art?.url ?? null,
      duration_ms: t.duration_ms,
      preview_url: t.preview_url,
    });
  }

  // Paginate if more than 100 tracks
  let nextUrl = playlist.tracks.next;
  while (nextUrl) {
    // next is a full URL — extract path+params
    const parsed = new URL(nextUrl);
    const path = parsed.pathname.replace('/v1', '');
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => { params[k] = v; });

    const page = await spotifyFetch<{ items: SpotifyPlaylistTrack[]; next: string | null }>(path, params);
    if (!page) break;

    for (const item of page.items) {
      if (!item.track) continue;
      const t = item.track;
      const art = t.album.images.find(i => i.width >= 200 && i.width <= 400) ?? t.album.images[0];
      tracks.push({
        title: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        spotify_id: t.id,
        apple_music_id: null,
        isrc: t.external_ids?.isrc ?? null,
        artwork_url: art?.url ?? null,
        duration_ms: t.duration_ms,
        preview_url: t.preview_url,
      });
    }

    nextUrl = page.next;
  }

  return { name: playlist.name, tracks };
}

/* ── Apple Music Playlist Fetch ─────────────────────────────────── */

type AppleMusicPlaylistResponse = {
  data: [{
    attributes: { name: string };
    relationships?: {
      tracks?: {
        data: {
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
        }[];
        next?: string;
      };
    };
  }];
};

async function importAppleMusicPlaylist(id: string, storefront: string): Promise<{ name: string; tracks: SearchResult[] } | null> {
  const playlist = await appleMusicFetch<AppleMusicPlaylistResponse>(
    `/catalog/${storefront}/playlists/${id}`,
    { include: 'tracks' },
  );

  if (!playlist?.data?.[0]) return null;

  const entry = playlist.data[0];
  const tracks: SearchResult[] = [];

  const rawTracks = entry.relationships?.tracks?.data ?? [];
  for (const s of rawTracks) {
    const artUrl = s.attributes.artwork.url
      .replace('{w}', '300').replace('{h}', '300');
    tracks.push({
      title: s.attributes.name,
      artist: s.attributes.artistName,
      album: s.attributes.albumName,
      spotify_id: null,
      apple_music_id: s.id,
      isrc: s.attributes.isrc ?? null,
      artwork_url: artUrl,
      duration_ms: s.attributes.durationInMillis,
      preview_url: s.attributes.previews?.[0]?.url ?? null,
    });
  }

  return { name: entry.attributes.name, tracks };
}

/* ── Route ──────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  const ref = parsePlaylistUrl(url);
  if (!ref) return NextResponse.json({ error: 'Could not parse playlist URL' }, { status: 400 });

  if (ref.service === 'spotify') {
    if (!isSpotifyConfigured()) {
      return NextResponse.json({ error: 'Spotify not configured' }, { status: 501 });
    }
    const result = await importSpotifyPlaylist(ref.id);
    if (!result) {
      return NextResponse.json({ error: 'Could not load playlist. It may be private or deleted.' }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (ref.service === 'apple') {
    if (!isAppleMusicConfigured()) {
      return NextResponse.json({ error: 'Apple Music not configured' }, { status: 501 });
    }
    const result = await importAppleMusicPlaylist(ref.id, ref.storefront);
    if (!result) {
      return NextResponse.json({ error: 'Could not load playlist. It may be private or unavailable in this region.' }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unsupported service' }, { status: 400 });
}
