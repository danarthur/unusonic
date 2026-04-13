/**
 * Create a Spotify playlist from the DJ program timeline.
 * POST /api/music/create-playlist
 * Body: { name: string, description?: string, trackUris: string[] }
 * Returns: { url: string, id: string }
 *
 * Requires the playlist-modify-private scope. If the user's token was issued
 * before this scope was added, Spotify returns 403 — the client detects this
 * and prompts re-authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { spotifyUserPost } from '@/shared/api/spotify/user-client';

type SpotifyPlaylist = {
  id: string;
  external_urls: { spotify: string };
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !Array.isArray(body.trackUris) || body.trackUris.length === 0) {
    return NextResponse.json({ error: 'name and trackUris[] required' }, { status: 400 });
  }

  const { name, description, trackUris } = body as {
    name: string;
    description?: string;
    trackUris: string[];
  };

  // Resolve person entity + Spotify user ID
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return NextResponse.json({ error: 'No profile' }, { status: 400 });

  const attrs = readEntityAttrs(person.attributes, 'person');
  if (!attrs.spotify_user_id || !attrs.spotify_refresh_token) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 400 });
  }

  // Create playlist
  const createResult = await spotifyUserPost<SpotifyPlaylist>(
    person.id,
    `/users/${attrs.spotify_user_id}/playlists`,
    {
      name,
      description: description ?? 'Created from Unusonic DJ Program',
      public: false,
    },
  );

  if (!createResult.data) {
    if (createResult.status === 403) {
      return NextResponse.json(
        { error: 'Missing playlist permissions. Please reconnect Spotify.' },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 502 });
  }

  const playlistId = createResult.data.id;

  // Add tracks in batches of 100 (Spotify API limit)
  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    const addResult = await spotifyUserPost(
      person.id,
      `/playlists/${playlistId}/tracks`,
      { uris: batch },
    );
    if (!addResult.data) {
      // Playlist was created but tracks partially failed — still return the URL
      console.error(`[create-playlist] Failed to add tracks batch ${i}–${i + batch.length}`);
      break;
    }
  }

  return NextResponse.json({
    url: createResult.data.external_urls.spotify,
    id: playlistId,
  });
}
