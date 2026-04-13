'use client';

import { useState, useTransition } from 'react';
import { Music, ExternalLink, Unplug, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSpotifyAuthUrl, disconnectSpotify } from '@/features/auth/spotify-connect/actions';
import { updateMyProfile } from '../actions';

/* ── Spotify Icon ───────────────────────────────────────────────── */

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

/* ── Types ──────────────────────────────────────────────────────── */

interface ConnectedAccountsProps {
  entityId: string;
  spotifyUserId: string | null;
  spotifyDisplayName: string | null;
  appleMusicConnected: boolean;
  musicLibraryPath: string | null;
}

/* ── Component ──────────────────────────────────────────────────── */

export function ConnectedAccounts({
  entityId,
  spotifyUserId,
  spotifyDisplayName,
  appleMusicConnected,
  musicLibraryPath,
}: ConnectedAccountsProps) {
  const [isPending, startTransition] = useTransition();
  const [libraryPath, setLibraryPath] = useState(musicLibraryPath ?? '');
  const [pathSaved, setPathSaved] = useState(false);

  const handleConnectSpotify = () => {
    startTransition(async () => {
      const result = await getSpotifyAuthUrl();
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.url;
    });
  };

  const handleDisconnectSpotify = () => {
    startTransition(async () => {
      const result = await disconnectSpotify();
      if (result.ok) {
        toast.success('Spotify disconnected');
        window.location.reload();
      } else {
        toast.error(result.error ?? 'Failed to disconnect');
      }
    });
  };

  const handleSaveLibraryPath = () => {
    startTransition(async () => {
      const result = await updateMyProfile(entityId, {
        music_library_path: libraryPath.trim() || null,
      });
      if (result.ok) {
        setPathSaved(true);
        setTimeout(() => setPathSaved(false), 2000);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Music className="size-4 text-[var(--stage-text-secondary)]" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
          Connected accounts
        </h3>
      </div>

      {/* Spotify */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--stage-surface-elevated)]">
        <div className="flex items-center gap-3 min-w-0">
          <SpotifyIcon className="size-5 text-[#1DB954] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)]">Spotify</p>
            {spotifyUserId ? (
              <p className="text-xs text-[var(--stage-text-secondary)] truncate">
                {spotifyDisplayName || spotifyUserId}
              </p>
            ) : (
              <p className="text-xs text-[var(--stage-text-tertiary)]">Not connected</p>
            )}
          </div>
        </div>

        {spotifyUserId ? (
          <button
            onClick={handleDisconnectSpotify}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--stage-text-secondary)] bg-[oklch(1_0_0/0.06)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
          >
            <Unplug className="size-3" />
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnectSpotify}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1DB954] text-white hover:bg-[#1ed760] transition-colors disabled:opacity-[0.45]"
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
            Connect
          </button>
        )}
      </div>

      {/* Apple Music — placeholder for MusicKit JS integration */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--stage-surface-elevated)]">
        <div className="flex items-center gap-3 min-w-0">
          <Music className="size-5 text-[#FC3C44] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)]">Apple Music</p>
            <p className="text-xs text-[var(--stage-text-tertiary)]">
              {appleMusicConnected ? 'Connected this session' : 'Requires Apple Developer Program ($99/yr)'}
            </p>
          </div>
        </div>
      </div>

      {/* Music library path (for Serato/Rekordbox export) */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--stage-surface-elevated)]">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-[var(--stage-text-secondary)]" />
          <p className="text-sm font-medium text-[var(--stage-text-primary)]">Music library folder</p>
        </div>
        <p className="text-xs text-[var(--stage-text-tertiary)]">
          Used for Serato and Rekordbox export. Set the root folder where your music files live.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={libraryPath}
            onChange={(e) => setLibraryPath(e.target.value)}
            placeholder="/Users/me/Music/"
            className="flex-1 text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)]"
          />
          <button
            onClick={handleSaveLibraryPath}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors disabled:opacity-[0.45]"
          >
            {pathSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
