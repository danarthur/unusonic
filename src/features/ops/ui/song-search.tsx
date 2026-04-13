'use client';

/**
 * SongSearch — shared across the DJ program tab and the client portal.
 *
 * Moved from `src/app/(portal)/schedule/[assignmentId]/song-search.tsx`
 * on 2026-04-10 as part of the client portal Songs slice (slice 2 of
 * `docs/reference/client-portal-songs-design.md` §17). Original prop
 * surface is intact; the new `copyPreset` prop (B3) lets the component
 * adapt its language, placeholder, and empty-state behavior to the
 * caller's audience without any staff-only behavior leaking into the
 * client portal.
 *
 * **Two presets:**
 *
 * - `operator` (default) — what the DJ sees on the program tab. Keeps the
 *   "Artist — Title" dash-parser shortcut, offers a `+` manual-entry
 *   affordance, uses DJ-operator copy. Unchanged from pre-move behavior.
 * - `client` — what a wedding couple sees on `/client/songs`. Drops the
 *   dash parser (couples type "the umbrella song by rihanna", not
 *   "Rihanna — Umbrella"), drops the manual-entry `+` button (force a
 *   search hit so the DJ gets streaming IDs), and uses warmer,
 *   couple-facing copy.
 *
 * Staff-only behavior lives in the caller (program-tab.tsx) — this
 * component does not emit staff actions and does not need to be audited
 * for "what happens if a client triggers this path."
 *
 * @module features/ops/ui/song-search
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Pause, Music, Plus } from 'lucide-react';
import type { SearchResult } from '@/app/api/music/search/route';

/* ── Types ──────────────────────────────────────────────────────── */

/**
 * Audience preset for the SongSearch component.
 *
 * See the module-level JSDoc for the behavior differences. If in doubt
 * between operator and client, pick `client` — it's the stricter, safer
 * default for any non-DJ surface.
 */
export type SongSearchCopyPreset = 'operator' | 'client';

export interface SongSearchProps {
  /** Called when a track is selected from results OR entered manually (operator preset only). */
  onSelect: (result: SearchResult | { title: string; artist: string }) => void;
  placeholder?: string;
  className?: string;
  /** Size variant for different contexts. */
  size?: 'sm' | 'md';
  /**
   * Audience preset. Defaults to `'operator'` for backward compatibility
   * with the DJ program tab. The client portal MUST pass `'client'`.
   */
  copyPreset?: SongSearchCopyPreset;
}

type PresetConfig = {
  defaultPlaceholder: string;
  allowManualEntry: boolean;
  parseDashSeparator: boolean;
  noResultsHeadline: string;
  noResultsHint: string;
  manualEntryFooter: string;
};

const PRESETS: Record<SongSearchCopyPreset, PresetConfig> = {
  operator: {
    defaultPlaceholder: 'Search or type Artist \u2014 Song',
    allowManualEntry: true,
    parseDashSeparator: true,
    noResultsHeadline: 'No results found',
    noResultsHint:
      'Press Enter or click to add \u201C{query}\u201D as a custom entry. Use \u201CArtist \u2014 Title\u201D format for best results.',
    manualEntryFooter:
      'Enter to add custom entry \u00b7 use \u201CArtist \u2014 Title\u201D format',
  },
  client: {
    defaultPlaceholder: 'Search for a song or artist',
    allowManualEntry: false,
    parseDashSeparator: false,
    noResultsHeadline: 'No matches',
    noResultsHint: 'Try a different spelling, or search by artist name.',
    manualEntryFooter: '',
  },
};

/* ── Duration formatter ─────────────────────────────────────────── */

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Shared audio singleton ─────────────────────────────────────── */

let globalAudio: HTMLAudioElement | null = null;
let globalPlayingUrl: string | null = null;

function getAudio() {
  if (!globalAudio && typeof window !== 'undefined') {
    globalAudio = new Audio();
    globalAudio.addEventListener('ended', () => { globalPlayingUrl = null; });
  }
  return globalAudio;
}

/* ── Component ──────────────────────────────────────────────────── */

export function SongSearch({
  onSelect,
  placeholder,
  className,
  size = 'md',
  copyPreset = 'operator',
}: SongSearchProps) {
  const preset = PRESETS[copyPreset];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}&limit=8`, {
          signal: abortRef.current.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setIsOpen(true);
          setHighlightIndex(-1);
        } else if (res.status === 501) {
          // No music service configured — don't show error, just skip
          setResults([]);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setResults([]);
        }
      }
      setIsLoading(false);
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelect(result);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, [onSelect]);

  const handleManualEntry = useCallback(() => {
    if (!preset.allowManualEntry) return;
    if (!query.trim()) return;
    // Operator-only dash parser: "Artist — Title" or "Artist - Title" format.
    // Client preset disables this to avoid surfacing DJ operator shorthand.
    if (preset.parseDashSeparator) {
      const separatorMatch = query.match(/^(.+?)\s*[—–-]\s*(.+)$/);
      const artist = separatorMatch ? separatorMatch[1].trim() : '';
      const title = separatorMatch ? separatorMatch[2].trim() : query.trim();
      onSelect({ title, artist });
    } else {
      onSelect({ title: query.trim(), artist: '' });
    }
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, [query, onSelect, preset.allowManualEntry, preset.parseDashSeparator]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && results[highlightIndex]) {
        handleSelect(results[highlightIndex]);
      } else if (preset.allowManualEntry) {
        handleManualEntry();
      }
      // Client preset with no highlighted result: Enter does nothing.
      // The user must pick a search result — no manual entry fallback.
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const togglePreview = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = getAudio();
    if (!audio) return;

    if (globalPlayingUrl === url) {
      audio.pause();
      globalPlayingUrl = null;
      setPlayingUrl(null);
    } else {
      audio.src = url;
      audio.play().catch(() => {});
      globalPlayingUrl = url;
      setPlayingUrl(url);
      audio.onended = () => { globalPlayingUrl = null; setPlayingUrl(null); };
    }
  };

  const isSm = size === 'sm';
  const effectivePlaceholder = placeholder ?? preset.defaultPlaceholder;

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (results.length > 0) setIsOpen(true); }}
            placeholder={effectivePlaceholder}
            aria-label="Search songs"
            className={`w-full bg-[var(--ctx-well)] rounded-lg text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)] ${
              isSm ? 'text-xs pl-7 pr-3 py-1.5' : 'text-sm pl-8 pr-3 py-1.5'
            }`}
          />
          <Search className={`absolute top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none ${
            isSm ? 'left-2 size-3' : 'left-2.5 size-3.5'
          }`} />
          {isLoading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <div className="size-3 border border-[var(--stage-text-tertiary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        {preset.allowManualEntry && query.trim() && (
          <button
            onClick={handleManualEntry}
            className={`shrink-0 flex items-center justify-center rounded-lg bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors ${
              isSm ? 'size-7' : 'size-8'
            }`}
            title="Add as custom entry"
          >
            <Plus className={isSm ? 'size-3' : 'size-3.5'} />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      <AnimatePresence>
        {isOpen && (results.length > 0 || (!isLoading && query.trim().length >= 2)) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute z-50 left-0 right-0 mt-1 max-h-[320px] overflow-y-auto rounded-xl bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0/0.08)] shadow-lg"
          >
            {results.length > 0 ? (
              <>
                {results.map((result, i) => (
                  <button
                    key={`${result.spotify_id ?? result.apple_music_id ?? i}`}
                    onClick={() => handleSelect(result)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      i === highlightIndex ? 'bg-[oklch(1_0_0/0.06)]' : 'hover:bg-[oklch(1_0_0/0.04)]'
                    }`}
                  >
                    {/* Artwork */}
                    {result.artwork_url ? (
                      <img
                        src={result.artwork_url}
                        alt=""
                        className="size-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded bg-[oklch(1_0_0/0.06)] flex items-center justify-center shrink-0">
                        <Music className="size-4 text-[var(--stage-text-tertiary)]" />
                      </div>
                    )}

                    {/* Track info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                        {result.title}
                      </p>
                      <p className="text-xs text-[var(--stage-text-secondary)] truncate">
                        {result.artist}
                        {result.duration_ms ? ` \u00b7 ${formatDuration(result.duration_ms)}` : ''}
                      </p>
                    </div>

                    {/* Preview button */}
                    {result.preview_url && (
                      <button
                        onClick={(e) => togglePreview(result.preview_url!, e)}
                        className="shrink-0 size-7 flex items-center justify-center rounded-full bg-[oklch(1_0_0/0.08)] hover:bg-[oklch(1_0_0/0.12)] transition-colors"
                        aria-label={playingUrl === result.preview_url ? 'Pause preview' : 'Play preview'}
                      >
                        {playingUrl === result.preview_url ? (
                          <Pause className="size-3" />
                        ) : (
                          <Play className="size-3 ml-0.5" />
                        )}
                      </button>
                    )}
                  </button>
                ))}

                {/* Operator-only footer hint — clients don't see manual-entry copy */}
                {preset.manualEntryFooter && (
                  <div className="px-3 py-2 border-t border-[oklch(1_0_0/0.04)] text-xs text-[var(--stage-text-tertiary)]">
                    {preset.manualEntryFooter}
                  </div>
                )}
              </>
            ) : preset.allowManualEntry ? (
              /* Operator preset — prominent manual-entry prompt on no results */
              <button
                onClick={handleManualEntry}
                className="w-full px-3 py-4 text-left hover:bg-[oklch(1_0_0/0.04)] transition-colors"
              >
                <p className="text-xs font-medium text-[var(--stage-text-secondary)]">
                  {preset.noResultsHeadline}
                </p>
                <p className="text-xs text-[var(--stage-text-tertiary)] mt-1">
                  {preset.noResultsHint.replace('{query}', query)}
                </p>
              </button>
            ) : (
              /* Client preset — read-only no-results state, no manual entry */
              <div className="px-3 py-4">
                <p className="text-xs font-medium text-[var(--stage-text-secondary)]">
                  {preset.noResultsHeadline}
                </p>
                <p className="text-xs text-[var(--stage-text-tertiary)] mt-1">
                  {preset.noResultsHint}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
