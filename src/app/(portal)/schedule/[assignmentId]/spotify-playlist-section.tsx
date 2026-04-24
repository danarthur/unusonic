'use client';

import { useState, useTransition, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music, ExternalLink, Loader2, ChevronDown, ChevronUp,
  ListMusic, Link2, Download, RefreshCw, Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import { getSpotifyAuthUrl, disconnectSpotify } from '@/features/auth/spotify-connect/actions';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { UserPlaylist } from '@/app/api/music/user-playlists/route';

/* ── Spotify Icon ───────────────────────────────────────────────── */

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

/* ── Types ──────────────────────────────────────────────────────── */

interface SpotifyPlaylistSectionProps {
  spotifyUserId: string | null;
  spotifyDisplayName: string | null;
  spotifyLink: string;
  appleMusicLink: string;
  onSpotifyLinkChange: (v: string) => void;
  onAppleMusicLinkChange: (v: string) => void;
  onImport: (url: string) => void;
  onCreatePlaylist: () => Promise<void>;
  importing: boolean;
  creatingPlaylist: boolean;
  songPoolHasSpotifyTracks: boolean;
}

/* ── Component ─────────────────────────────────────────────────── */

export function SpotifyPlaylistSection({
  spotifyUserId,
  spotifyDisplayName,
  spotifyLink,
  appleMusicLink,
  onSpotifyLinkChange,
  onAppleMusicLinkChange,
  onImport,
  onCreatePlaylist,
  importing,
  creatingPlaylist,
  songPoolHasSpotifyTracks,
}: SpotifyPlaylistSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [browsing, setBrowsing] = useState(false);
  const [playlists, setPlaylists] = useState<UserPlaylist[] | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);

  // Listen for popup callback signal (storage event + visibility fallback)
  useEffect(() => {
    function checkCallback() {
      const val = localStorage.getItem('spotify_callback');
      if (val) {
        localStorage.removeItem('spotify_callback');
        if (val === 'connected') {
          toast.success('Spotify connected');
          window.location.reload();
        } else if (val === 'denied') {
          toast.error('Spotify access was denied');
        } else {
          toast.error('Spotify connection failed. Try again.');
        }
      }
    }

    // Storage event fires when another tab writes to localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'spotify_callback') checkCallback();
    };
    // Fallback: check when user returns to this tab
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkCallback();
    };

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleConnect = () => {
    startTransition(async () => {
      const result = await getSpotifyAuthUrl(window.location.pathname, true);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, '_blank');
    });
  };

  const handleDisconnect = () => {
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

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const res = await fetch('/api/music/user-playlists');
      if (res.status === 400) {
        setNeedsReauth(true);
        setLoadingPlaylists(false);
        return;
      }
      if (!res.ok) {
        toast.error('Failed to load playlists');
        setLoadingPlaylists(false);
        return;
      }
      const data = await res.json();
      setPlaylists(data.playlists);
    } catch {
      toast.error('Failed to load playlists');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const toggleBrowse = () => {
    if (!browsing && !playlists) fetchPlaylists();
    setBrowsing(v => !v);
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
      <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] flex items-center gap-2">
        <SpotifyIcon className="size-3.5 text-[#1DB954]" />
        Spotify
      </h4>

      {/* ── Not connected state ─────────────────────────────────── */}
      {!spotifyUserId ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--stage-text-tertiary)]">
            Connect Spotify to browse your playlists and auto-generate playlists from the timeline.
          </p>
          <button
            onClick={handleConnect}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[#1DB954] text-[oklch(1_0_0)] hover:bg-[#1ed760] transition-colors disabled:opacity-[0.45]"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <SpotifyIcon className="size-3.5" />}
            Connect Spotify
          </button>
        </div>
      ) : (
        /* ── Connected state ──────────────────────────────────── */
        <div className="flex flex-col gap-3">
          {/* Status + disconnect */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--stage-text-secondary)]">
              {spotifyDisplayName || spotifyUserId}
            </span>
            <button
              onClick={handleDisconnect}
              disabled={isPending}
              className="flex items-center gap-1 text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-[0.45]"
            >
              <Unplug className="size-2.5" />
              Disconnect
            </button>
          </div>

          {/* Re-auth prompt */}
          {needsReauth && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[oklch(0.75_0.15_55/0.1)] border border-[oklch(0.75_0.15_55/0.2)]">
              <RefreshCw className="size-3 text-[oklch(0.75_0.15_55)] shrink-0" />
              <p className="text-xs text-[oklch(0.75_0.15_55)]">
                Permissions need updating.
              </p>
              <button
                onClick={handleConnect}
                disabled={isPending}
                className="text-xs font-medium text-[oklch(0.75_0.15_55)] underline hover:no-underline ml-auto shrink-0"
              >
                Reconnect
              </button>
            </div>
          )}

          {/* Browse playlists toggle */}
          <button
            onClick={toggleBrowse}
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.06)] transition-colors text-xs font-medium text-[var(--stage-text-secondary)]"
          >
            <span className="flex items-center gap-2">
              <ListMusic className="size-3.5" />
              Browse my playlists
            </span>
            {browsing ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {/* Playlist browser */}
          <AnimatePresence>
            {browsing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={STAGE_LIGHT}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                  {loadingPlaylists ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-4 animate-spin text-[var(--stage-text-tertiary)]" />
                    </div>
                  ) : playlists && playlists.length > 0 ? (
                    playlists.map((pl) => (
                      <PlaylistRow
                        key={pl.id}
                        playlist={pl}
                        onImport={() => { onImport(pl.importUrl); setBrowsing(false); }}
                        onLink={() => { onSpotifyLinkChange(pl.importUrl); setBrowsing(false); toast.success('Playlist linked'); }}
                        importing={importing}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-[var(--stage-text-tertiary)] py-4 text-center">
                      No playlists found
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create playlist from timeline */}
          {songPoolHasSpotifyTracks && (
            <button
              onClick={onCreatePlaylist}
              disabled={creatingPlaylist}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
            >
              {creatingPlaylist ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Create Spotify playlist from timeline
            </button>
          )}

          {/* Linked playlist */}
          {spotifyLink && (
            <div className="flex items-center gap-2 text-xs text-[var(--stage-text-tertiary)]">
              <Link2 className="size-3 shrink-0" />
              <a
                href={spotifyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-[var(--stage-text-secondary)] transition-colors underline"
              >
                {spotifyLink}
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Manual URL paste (collapsible) ───────────────────── */}
      <div className="border-t border-[oklch(1_0_0/0.04)] pt-2">
        <button
          onClick={() => setManualExpanded(v => !v)}
          className="flex items-center gap-1.5 text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
        >
          {manualExpanded ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
          Paste playlist URL
        </button>
        <AnimatePresence>
          {manualExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={STAGE_LIGHT}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pt-2">
                <ManualImportField
                  label="Spotify"
                  value={spotifyLink}
                  onChange={onSpotifyLinkChange}
                  onImport={onImport}
                  importing={importing}
                  placeholder="https://open.spotify.com/playlist/..."
                />
                <ManualImportField
                  label="Apple Music"
                  value={appleMusicLink}
                  onChange={onAppleMusicLinkChange}
                  onImport={onImport}
                  importing={importing}
                  placeholder="https://music.apple.com/playlist/..."
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Playlist Row ───────────────────────────────────────────────── */

function PlaylistRow({
  playlist,
  onImport,
  onLink,
  importing,
}: {
  playlist: UserPlaylist;
  onImport: () => void;
  onLink: () => void;
  importing: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[oklch(1_0_0/0.04)] transition-colors group">
      {/* Artwork */}
      <div className="size-9 rounded bg-[oklch(1_0_0/0.06)] shrink-0 overflow-hidden">
        {playlist.imageUrl ? (
          <img src={playlist.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Music className="size-4 m-auto mt-2.5 text-[var(--stage-text-tertiary)]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--stage-text-primary)] truncate">
          {playlist.name}
        </p>
        <p className="text-[10px] text-[var(--stage-text-tertiary)]">
          {playlist.trackCount} track{playlist.trackCount !== 1 ? 's' : ''}
          {playlist.owner ? ` \u00b7 ${playlist.owner}` : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onImport}
          disabled={importing}
          className="text-[10px] font-medium px-2 py-1 rounded bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors disabled:opacity-[0.45]"
          title="Import all tracks into song pool"
        >
          Import
        </button>
        <button
          onClick={onLink}
          className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
          title="Link playlist without importing tracks"
        >
          <Link2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

/* ── Manual Import Field ────────────────────────────────────────── */

function ManualImportField({ label, value, onChange, onImport, importing, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; onImport: (url: string) => void; importing: boolean; placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="stage-label text-[var(--stage-text-tertiary)]">{label}</label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)]"
        />
        {value && (
          <>
            <button
              onClick={() => onImport(value)}
              disabled={importing}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors disabled:opacity-[0.45] shrink-0"
            >
              {importing ? <Loader2 className="size-3 animate-spin" /> : 'Import'}
            </button>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors shrink-0"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
