/**
 * Browse the authenticated user's Spotify playlists.
 * GET /api/music/user-playlists
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { spotifyUserFetch } from '@/shared/api/spotify/user-client';

type SpotifyPlaylistItem = {
  id: string;
  name: string;
  tracks: { total: number };
  images: { url: string; width: number | null }[];
  owner: { display_name: string };
};

type SpotifyPlaylistsResponse = {
  items: SpotifyPlaylistItem[];
  total: number;
};

export type UserPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
  owner: string;
  importUrl: string;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve person entity
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return NextResponse.json({ error: 'No profile' }, { status: 400 });

  const attrs = readEntityAttrs(person.attributes, 'person');
  if (!attrs.spotify_refresh_token) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 400 });
  }

  const data = await spotifyUserFetch<SpotifyPlaylistsResponse>(
    person.id,
    '/me/playlists',
    { limit: '50' },
  );

  if (!data) {
    console.error('[user-playlists] spotifyUserFetch returned null for entity', person.id);
    return NextResponse.json({ error: 'Failed to fetch playlists from Spotify' }, { status: 502 });
  }

  const playlists: UserPlaylist[] = (data.items ?? [])
    .filter((p) => p.id && p.name)
    .map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks?.total ?? 0,
      imageUrl: p.images?.[0]?.url ?? null,
      owner: p.owner?.display_name ?? '',
      importUrl: `https://open.spotify.com/playlist/${p.id}`,
    }));

  return NextResponse.json({ playlists });
}
