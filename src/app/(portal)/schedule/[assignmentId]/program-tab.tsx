'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, Reorder, useDragControls, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Music, ListMusic, Users, GripVertical, Loader2, Ban,
  ChevronDown, ChevronUp, Check, ArrowRight, Radio, Mic, Download,
  Bookmark, Copy, Trash2, Layers, Pencil, Share2, Link,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveDjPrep } from '@/features/ops/actions/save-dj-prep';
import { getClientSongRequestsForEvent } from '@/features/ops/actions/get-client-song-requests';
import type { ProgramMoment, ProgramTimeline, SongEntry, SongTier, DjClientInfo, DjProgramDataV3, DjTimelineTemplate, ClientDetails, FieldDef } from '@/features/ops/lib/dj-prep-schema';
import { CLIENT_FIELD_SCHEMAS, archetypeToGroup, emptyClientDetails } from '@/features/ops/lib/dj-prep-schema';
import { saveDjTemplate, deleteDjTemplate } from '@/features/ops/actions/save-dj-templates';
import { generateClientEventLink } from '@/features/ops/actions/generate-client-event-link';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { SongSearch } from '@/features/ops/ui/song-search';
import { FromCoupleSection } from '@/features/ops/ui/from-couple-section';
import type { SearchResult } from '@/app/api/music/search/route';
import { generateSeratoCrate, downloadCrate } from './export-crate';
import { generateRekordboxXml, downloadRekordboxXml } from './export-rekordbox';
import { LexiconPush } from './lexicon-push';
import { BridgeStatus } from './bridge-status';
import { SpotifyPlaylistSection } from './spotify-playlist-section';

/* ── Time Formatting ────────────────────────────────────────────── */

function parseAndFormatTime(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  let ampmHint: 'am' | 'pm' | null = null;
  let cleaned = s;
  if (/[ap]m?$/.test(cleaned)) {
    ampmHint = cleaned.includes('p') ? 'pm' : 'am';
    cleaned = cleaned.replace(/[ap]m?$/, '');
  }
  let hours: number;
  let minutes: number;
  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
  } else if (/^\d{4}$/.test(cleaned)) {
    hours = parseInt(cleaned.slice(0, 2), 10);
    minutes = parseInt(cleaned.slice(2), 10);
  } else if (/^\d{3}$/.test(cleaned)) {
    hours = parseInt(cleaned[0], 10);
    minutes = parseInt(cleaned.slice(1), 10);
  } else if (/^\d{1,2}$/.test(cleaned)) {
    hours = parseInt(cleaned, 10);
    minutes = 0;
  } else {
    return '';
  }
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) return '';
  if (hours === 0 && !ampmHint) { hours = 12; ampmHint = 'am'; }
  else if (hours > 12) { hours -= 12; ampmHint = ampmHint ?? 'pm'; }
  else if (hours === 12) { ampmHint = ampmHint ?? 'pm'; }
  else { ampmHint = ampmHint ?? (hours >= 7 && hours <= 11 ? 'am' : 'pm'); }
  if (hours < 1 || hours > 12) return '';
  return `${hours}:${String(minutes).padStart(2, '0')} ${ampmHint.toUpperCase()}`;
}

/* ── Default Templates ──────────────────────────────────────────── */

type MomentTemplate = { label: string; energy: number | null };

const TIMELINE_TEMPLATES: Record<string, MomentTemplate[]> = {
  wedding: [
    { label: 'Cocktail hour', energy: 4 },
    { label: 'Guest seating', energy: 3 },
    { label: 'Grand entrance', energy: 7 },
    { label: 'First dance', energy: 6 },
    { label: 'Dinner', energy: 3 },
    { label: 'Toasts', energy: 2 },
    { label: 'Open dancing', energy: 8 },
    { label: 'Last dance', energy: 5 },
  ],
  corporate: [
    { label: 'Pre-event / networking', energy: 4 },
    { label: 'Welcome and introductions', energy: 5 },
    { label: 'Keynote / presentations', energy: 3 },
    { label: 'Dinner', energy: 3 },
    { label: 'Awards / recognition', energy: 6 },
    { label: 'Dancing / entertainment', energy: 8 },
    { label: 'Wrap', energy: 4 },
  ],
  concert: [
    { label: 'Doors open', energy: 4 },
    { label: 'Opening act', energy: 6 },
    { label: 'Changeover', energy: 3 },
    { label: 'Headliner', energy: 9 },
    { label: 'Encore', energy: 10 },
    { label: 'House music / exit', energy: 4 },
  ],
  festival: [
    { label: 'Gates open', energy: 5 },
    { label: 'Set 1', energy: 6 },
    { label: 'Set 2', energy: 7 },
    { label: 'Set 3', energy: 8 },
    { label: 'Headliner', energy: 10 },
    { label: 'Closing set', energy: 6 },
  ],
  private: [
    { label: 'Arrival / welcome', energy: 4 },
    { label: 'Dinner', energy: 3 },
    { label: 'Entertainment', energy: 7 },
    { label: 'Dancing', energy: 8 },
    { label: 'Wind down', energy: 4 },
  ],
  conference: [
    { label: 'Registration / coffee', energy: 3 },
    { label: 'Opening remarks', energy: 5 },
    { label: 'Breakout sessions', energy: 4 },
    { label: 'Lunch', energy: 3 },
    { label: 'Afternoon sessions', energy: 4 },
    { label: 'Networking reception', energy: 6 },
    { label: 'Closing', energy: 4 },
  ],
};

/** Convert a built-in archetype template to a ProgramTimeline with fresh UUIDs. */
function templateToTimeline(name: string, template: MomentTemplate[], sortOrder: number): ProgramTimeline {
  return {
    id: crypto.randomUUID(),
    name,
    sort_order: sortOrder,
    moments: template.map((t, i) => ({
      id: crypto.randomUUID(),
      label: t.label,
      time: '',
      notes: '',
      announcement: '',
      energy: t.energy,
      sort_order: i,
    })),
  };
}

/** Built-in starter templates exposed in the template picker. */
const STARTER_TEMPLATES: { key: string; label: string }[] = [
  { key: 'wedding', label: 'Wedding' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'concert', label: 'Concert' },
  { key: 'festival', label: 'Festival' },
  { key: 'private', label: 'Private party' },
  { key: 'conference', label: 'Conference' },
];

/* ── Energy stripe color ────────────────────────────────────────── */

/** Returns an achromatic OKLCH lightness value for the energy stripe (1=dim, 10=bright) */
function energyLightness(energy: number | null): string {
  if (energy == null) return 'oklch(0.20 0 0)';
  const l = 0.15 + (energy / 10) * 0.7; // 0.15 → 0.85
  return `oklch(${l.toFixed(2)} 0 0)`;
}

/* ── Props ──────────────────────────────────────────────────────── */

export interface ProgramTabProps {
  eventId: string;
  initialTimelines: ProgramTimeline[];
  initialSongPool: SongEntry[];
  /**
   * Couple-authored song requests loaded from
   * `run_of_show_data.client_song_requests`. Read-only on the DJ side
   * in this slice — mutations flow through ops_songs_* RPCs only.
   * `saveDjPrep` must NEVER serialize this array (slice 12 invariant).
   * Optional for backward compat with older callers — defaults to [].
   */
  initialClientRequests?: SongEntry[];
  initialClientInfo: DjClientInfo;
  initialClientDetails: ClientDetails;
  initialClientNotes: string;
  initialSpotifyLink: string | null;
  initialAppleMusicLink: string | null;
  initialActiveMomentId?: string | null;
  initialActiveTimelineId?: string | null;
  eventArchetype: string | null;
  djTemplates: DjTimelineTemplate[];
  spotifyUserId?: string | null;
  spotifyDisplayName?: string | null;
}

/* ── Main Component ─────────────────────────────────────────────── */

export function ProgramTab({
  eventId,
  initialTimelines,
  initialSongPool,
  initialClientRequests = [],
  initialClientInfo,
  initialClientDetails,
  initialClientNotes,
  initialSpotifyLink,
  initialAppleMusicLink,
  initialActiveMomentId,
  initialActiveTimelineId,
  eventArchetype,
  djTemplates: initialDjTemplates,
  spotifyUserId,
  spotifyDisplayName,
}: ProgramTabProps) {
  // Program state — multi-timeline
  const [timelines, setTimelines] = useState<ProgramTimeline[]>(initialTimelines);
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(
    initialActiveTimelineId ?? initialTimelines[0]?.id ?? null,
  );
  const [songPool, setSongPool] = useState<SongEntry[]>(initialSongPool);
  // Couple-authored song requests (separate array from songPool, owned by
  // the client_songs_* / ops_songs_* RPC family). Read-only from this
  // component's perspective — mutations go through from-couple-section.
  // Polled every 30s to close the A8 stale-view gap per Songs design doc §0.
  const [clientRequests, setClientRequests] = useState<SongEntry[]>(initialClientRequests);
  const [clientInfo, setClientInfo] = useState<DjClientInfo>(initialClientInfo);
  const [clientDetails, setClientDetails] = useState<ClientDetails>(initialClientDetails);
  const [clientNotes, setClientNotes] = useState(initialClientNotes);
  const [spotifyLink, setSpotifyLink] = useState(initialSpotifyLink ?? '');
  const [appleMusicLink, setAppleMusicLink] = useState(initialAppleMusicLink ?? '');

  // Template state
  const [djTemplates, setDjTemplates] = useState<DjTimelineTemplate[]>(initialDjTemplates);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // UI state
  const [clientExpanded, setClientExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assigningSongId, setAssigningSongId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showMode, setShowMode] = useState(false);
  const [activeMomentId, setActiveMomentId] = useState<string | null>(initialActiveMomentId ?? null);
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [renamingTimelineId, setRenamingTimelineId] = useState<string | null>(null);

  // Derived: active timeline
  const activeTimeline = useMemo(
    () => timelines.find(t => t.id === activeTimelineId) ?? null,
    [timelines, activeTimelineId],
  );
  const moments = activeTimeline?.moments ?? [];

  // All moments flattened (for exports, show mode, song assignment picker)
  const allMoments = useMemo(
    () => timelines.sort((a, b) => a.sort_order - b.sort_order).flatMap(t => t.moments),
    [timelines],
  );

  // Auto-save
  const isDirty = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef({ timelines, songPool, clientInfo, clientDetails, clientNotes, spotifyLink, appleMusicLink, activeTimelineId });

  // Keep latest ref in sync
  useEffect(() => {
    latestDataRef.current = { timelines, songPool, clientInfo, clientDetails, clientNotes, spotifyLink, appleMusicLink, activeTimelineId };
  }, [timelines, songPool, clientInfo, clientDetails, clientNotes, spotifyLink, appleMusicLink, activeTimelineId]);

  // Handle ?spotify=connected return from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyResult = params.get('spotify');
    if (spotifyResult === 'connected') {
      toast.success('Spotify connected');
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      window.history.replaceState({}, '', url.toString());
    } else if (spotifyResult === 'denied') {
      toast.error('Spotify access was denied');
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      window.history.replaceState({}, '', url.toString());
    } else if (spotifyResult === 'error' || spotifyResult === 'expired') {
      toast.error('Spotify connection failed. Try again.');
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Fire-and-forget save when active moment changes (show mode)
  useEffect(() => {
    if (activeMomentId !== (initialActiveMomentId ?? null)) {
      saveDjPrep(eventId, { dj_active_moment_id: activeMomentId }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMomentId]);

  // Poll client_song_requests every 30 seconds (A8 stale-view fix).
  //
  // A DJ who leaves this tab open for hours while prepping would
  // otherwise miss couple song adds made in the meantime. The poll is
  // lightweight (one small table read via a server action) and independent
  // of the 3s autosave cycle to avoid coupling DJ edit latency to
  // couple-request visibility.
  //
  // The poll never mutates songPool — that's the DJ's locally-owned
  // state. It only refreshes the read-only clientRequests slice.
  useEffect(() => {
    const intervalMs = 30_000;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await getClientSongRequestsForEvent(eventId);
        if (!cancelled && result.ok) {
          setClientRequests(result.requests);
        }
      } catch {
        // Fail silent — polling is best-effort.
      }
    };

    const handle = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [eventId]);

  // Mark dirty on any change
  useEffect(() => {
    isDirty.current = true;
    // Schedule auto-save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (isDirty.current) triggerSave();
    }, 3000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelines, songPool, clientInfo, clientDetails, clientNotes, spotifyLink, appleMusicLink]);

  // Prevent accidental navigation during unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const triggerSave = useCallback(async () => {
    const d = latestDataRef.current;
    setIsSaving(true);
    setSaveStatus('saving');

    const payload: Partial<DjProgramDataV3> = {
      dj_program_version: 3,
      dj_program_timelines: d.timelines.map((tl, ti) => ({
        ...tl,
        sort_order: ti,
        moments: tl.moments.map((m, mi) => ({ ...m, sort_order: mi })),
      })),
      dj_song_pool: d.songPool,
      dj_client_info: d.clientInfo,
      dj_client_details: d.clientDetails,
      dj_client_notes: d.clientNotes,
      dj_spotify_link: d.spotifyLink || null,
      dj_apple_music_link: d.appleMusicLink || null,
      dj_active_timeline_id: d.activeTimelineId,
    };

    const result = await saveDjPrep(eventId, payload);
    setIsSaving(false);

    if (result.ok) {
      isDirty.current = false;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } else {
      setSaveStatus('idle');
      toast.error(result.error ?? 'Failed to save', { duration: Infinity });
    }
  }, [eventId]);

  /* ── Timeline helpers ─────────────────────────────────────────── */

  const updateActiveTimeline = useCallback((updater: (moments: ProgramMoment[]) => ProgramMoment[]) => {
    if (!activeTimelineId) return;
    setTimelines(prev => prev.map(tl =>
      tl.id === activeTimelineId ? { ...tl, moments: updater(tl.moments) } : tl
    ));
  }, [activeTimelineId]);

  const addTimeline = useCallback((name: string, moments: ProgramMoment[] = []) => {
    const newTl: ProgramTimeline = {
      id: crypto.randomUUID(),
      name,
      moments,
      sort_order: timelines.length,
    };
    setTimelines(prev => [...prev, newTl]);
    setActiveTimelineId(newTl.id);
    setTemplatePickerOpen(false);
  }, [timelines.length]);

  const removeTimeline = useCallback((tlId: string) => {
    const tl = timelines.find(t => t.id === tlId);
    if (!tl) return;
    // Unassign songs that were cued to moments in this timeline
    const momentIds = new Set(tl.moments.map(m => m.id));
    setSongPool(prev => prev.map(s =>
      s.assigned_moment_id && momentIds.has(s.assigned_moment_id)
        ? { ...s, assigned_moment_id: null, tier: 'must_play' as SongTier }
        : s
    ));
    setTimelines(prev => {
      const next = prev.filter(t => t.id !== tlId);
      if (activeTimelineId === tlId) {
        setActiveTimelineId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [timelines, activeTimelineId]);

  const renameTimeline = useCallback((tlId: string, name: string) => {
    setTimelines(prev => prev.map(tl =>
      tl.id === tlId ? { ...tl, name } : tl
    ));
    setRenamingTimelineId(null);
  }, []);

  const applyStarterTemplate = useCallback((key: string) => {
    const template = TIMELINE_TEMPLATES[key];
    if (!template) return;
    const label = STARTER_TEMPLATES.find(s => s.key === key)?.label ?? key;
    addTimeline(label, template.map((t, i) => ({
      id: crypto.randomUUID(),
      label: t.label,
      time: '',
      notes: '',
      announcement: '',
      energy: t.energy,
      sort_order: i,
    })));
  }, [addTimeline]);

  const applySavedTemplate = useCallback((template: DjTimelineTemplate) => {
    for (const tl of template.timelines) {
      addTimeline(tl.name, tl.moments.map((m, i) => ({
        id: crypto.randomUUID(),
        label: m.label,
        time: '',
        notes: '',
        announcement: '',
        energy: m.energy,
        sort_order: i,
      })));
    }
    setTemplatePickerOpen(false);
  }, [addTimeline]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (timelines.length === 0) return;
    const name = window.prompt('Template name');
    if (!name?.trim()) return;
    setSavingTemplate(true);
    const template: DjTimelineTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      timelines: timelines.map(tl => ({
        name: tl.name,
        moments: tl.moments.map(m => ({ label: m.label, energy: m.energy })),
      })),
      created_at: new Date().toISOString(),
    };
    const result = await saveDjTemplate(template);
    setSavingTemplate(false);
    if (result.ok) {
      setDjTemplates(prev => [...prev, template]);
      toast.success('Template saved');
    } else {
      toast.error('error' in result ? result.error : 'Failed to save template');
    }
  }, [timelines]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    const result = await deleteDjTemplate(templateId);
    if (result.ok) {
      setDjTemplates(prev => prev.filter(t => t.id !== templateId));
      toast.success('Template deleted');
    } else {
      toast.error('Failed to delete template');
    }
  }, []);

  const [sharingLink, setSharingLink] = useState(false);
  const handleShareWithClient = useCallback(async () => {
    setSharingLink(true);
    const result = await generateClientEventLink(eventId);
    setSharingLink(false);
    if (result.ok) {
      const fullUrl = `${window.location.origin}${result.url}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Client link copied to clipboard');
    } else {
      toast.error('error' in result ? result.error : 'Failed to generate link');
    }
  }, [eventId]);

  /* ── Moment helpers ───────────────────────────────────────────── */

  const addMoment = () => {
    updateActiveTimeline(prev => [...prev, {
      id: crypto.randomUUID(),
      label: '',
      time: '',
      notes: '',
      announcement: '',
      energy: null,
      sort_order: prev.length,
    }]);
  };

  const setMoments = useCallback((updater: ProgramMoment[] | ((prev: ProgramMoment[]) => ProgramMoment[])) => {
    if (!activeTimelineId) return;
    setTimelines(prev => prev.map(tl =>
      tl.id === activeTimelineId
        ? { ...tl, moments: typeof updater === 'function' ? updater(tl.moments) : updater }
        : tl
    ));
  }, [activeTimelineId]);

  const handleActivateMoment = (momentId: string) => {
    setActiveMomentId(prev => prev === momentId ? null : momentId);
  };

  const updateMoment = (id: string, updates: Partial<ProgramMoment>) => {
    updateActiveTimeline(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const removeMoment = (id: string) => {
    updateActiveTimeline(prev => prev.filter(m => m.id !== id));
    // Unassign any songs from this moment
    setSongPool(prev => prev.map(s =>
      s.assigned_moment_id === id ? { ...s, assigned_moment_id: null, tier: 'must_play' as SongTier } : s
    ));
  };

  /* ── Song helpers ─────────────────────────────────────────────── */

  const addSong = (tier: SongTier, title: string, momentId?: string | null) => {
    if (!title.trim()) return;
    // Parse "Artist — Title" or "Artist - Title" format
    const separatorMatch = title.match(/^(.+?)\s*[—–-]\s*(.+)$/);
    const artist = separatorMatch ? separatorMatch[1].trim() : '';
    const songTitle = separatorMatch ? separatorMatch[2].trim() : title.trim();

    setSongPool(prev => [...prev, {
      id: crypto.randomUUID(),
      title: songTitle,
      artist,
      tier: momentId ? 'cued' : tier,
      assigned_moment_id: momentId ?? null,
      sort_order: prev.length,
      notes: '',
      added_by: 'dj',
    }]);
  };

  const addSongFromSearch = (result: SearchResult | { title: string; artist: string }, tier: SongTier, momentId?: string | null) => {
    const isSearch = 'spotify_id' in result;
    setSongPool(prev => [...prev, {
      id: crypto.randomUUID(),
      title: result.title,
      artist: result.artist,
      tier: momentId ? 'cued' : tier,
      assigned_moment_id: momentId ?? null,
      sort_order: prev.length,
      notes: '',
      added_by: 'dj',
      ...(isSearch ? {
        spotify_id: result.spotify_id,
        apple_music_id: result.apple_music_id,
        isrc: result.isrc,
        artwork_url: result.artwork_url,
        duration_ms: result.duration_ms,
        preview_url: result.preview_url,
      } : {}),
    }]);
  };

  const importPlaylist = async (url: string) => {
    if (!url.trim()) return;
    setImportingPlaylist(true);
    try {
      const res = await fetch('/api/music/import-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to import playlist');
        return;
      }
      const data = await res.json();
      const tracks = data.tracks as SearchResult[];
      if (tracks.length === 0) {
        toast.error('Playlist is empty');
        return;
      }
      // Deduplicate against existing pool
      const existingIsrcs = new Set(songPool.filter(s => s.isrc).map(s => s.isrc));
      const existingKeys = new Set(songPool.map(s => `${s.artist}::${s.title}`.toLowerCase()));
      let added = 0;
      for (const track of tracks) {
        if (track.isrc && existingIsrcs.has(track.isrc)) continue;
        if (existingKeys.has(`${track.artist}::${track.title}`.toLowerCase())) continue;
        addSongFromSearch(track, 'must_play');
        added++;
      }
      toast.success(`Imported ${added} track${added !== 1 ? 's' : ''}${added < tracks.length ? ` (${tracks.length - added} duplicates skipped)` : ''}`);
    } catch {
      toast.error('Failed to import playlist');
    } finally {
      setImportingPlaylist(false);
    }
  };

  const createSpotifyPlaylist = useCallback(async () => {
    // Collect all songs with spotify_id, ordered by timeline
    const cuedSongs = allMoments.flatMap(m =>
      songPool
        .filter(s => s.assigned_moment_id === m.id && s.spotify_id)
        .sort((a, b) => a.sort_order - b.sort_order)
    );
    const floatingSongs = songPool
      .filter(s => !s.assigned_moment_id && ['must_play', 'play_if_possible'].includes(s.tier) && s.spotify_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const allTracks = [...cuedSongs, ...floatingSongs];
    if (allTracks.length === 0) {
      toast.error('No Spotify tracks to export');
      return;
    }

    setCreatingPlaylist(true);
    try {
      const trackUris = allTracks.map(s => `spotify:track:${s.spotify_id}`);
      const res = await fetch('/api/music/create-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `DJ Program — ${new Date().toLocaleDateString()}`,
          description: 'Created from Unusonic DJ Program',
          trackUris,
        }),
      });

      if (res.status === 403) {
        toast.error('Spotify permissions need updating. Please reconnect your account.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to create playlist');
        return;
      }

      const { url } = await res.json();
      setSpotifyLink(url);
      toast.success('Spotify playlist created');
    } catch {
      toast.error('Failed to create playlist');
    } finally {
      setCreatingPlaylist(false);
    }
  }, [allMoments, songPool]);

  const removeSong = (songId: string) => {
    setSongPool(prev => prev.filter(s => s.id !== songId));
  };

  const assignSongToMoment = (songId: string, momentId: string | null) => {
    setSongPool(prev => prev.map(s =>
      s.id === songId
        ? { ...s, assigned_moment_id: momentId, tier: momentId ? 'cued' : 'must_play' }
        : s
    ));
    setAssigningSongId(null);
  };

  const unassignSong = (songId: string) => {
    setSongPool(prev => prev.map(s =>
      s.id === songId ? { ...s, assigned_moment_id: null, tier: 'must_play' } : s
    ));
  };

  /* ── Derived data ─────────────────────────────────────────────── */

  const songsForMoment = useCallback(
    (momentId: string) => songPool
      .filter(s => s.assigned_moment_id === momentId)
      .sort((a, b) => a.sort_order - b.sort_order),
    [songPool],
  );

  const floatingMustPlay = useMemo(
    () => songPool.filter(s => s.tier === 'must_play' && !s.assigned_moment_id),
    [songPool],
  );
  const floatingPlayIfPossible = useMemo(
    () => songPool.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id),
    [songPool],
  );
  const doNotPlaySongs = useMemo(
    () => songPool.filter(s => s.tier === 'do_not_play'),
    [songPool],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col gap-0"
    >
      {/* ── Client Strip (sticky) ───────────────────────────────── */}
      <ClientStrip
        clientDetails={clientDetails}
        clientNotes={clientNotes}
        eventArchetype={eventArchetype}
        expanded={clientExpanded && !showMode}
        onToggle={() => !showMode && setClientExpanded(v => !v)}
        onUpdateDetails={(updates) => setClientDetails(prev => ({ ...prev, ...updates } as ClientDetails))}
        onUpdateNotes={setClientNotes}
        saveStatus={saveStatus}
        isSaving={isSaving}
        showMode={showMode}
        onToggleShowMode={() => setShowMode(v => !v)}
        onShareWithClient={handleShareWithClient}
        sharingLink={sharingLink}
      />

      {/* ── Show Mode ───────────────────────────────────────────── */}
      {showMode ? (
        <div className="flex flex-col gap-2 mt-4">
          {timelines.sort((a, b) => a.sort_order - b.sort_order).map((tl) => (
            <div key={tl.id} className="flex flex-col gap-2">
              {timelines.length > 1 && (
                <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mt-3 mb-1 px-1">
                  {tl.name}
                </h3>
              )}
              {tl.moments.map((moment, i) => {
                const isActive = activeMomentId === moment.id;
                const allFlat = timelines.sort((a, b) => a.sort_order - b.sort_order).flatMap(t => t.moments);
                const globalIdx = allFlat.findIndex(m => m.id === moment.id);
                const activeGlobalIdx = allFlat.findIndex(m => m.id === activeMomentId);
                const isNext = !activeMomentId
                  ? globalIdx === 0
                  : activeGlobalIdx + 1 === globalIdx;
                const songs = songsForMoment(moment.id);

                return (
                  <button
                    key={moment.id}
                    onClick={() => handleActivateMoment(moment.id)}
                    className={`
                      flex gap-3 p-4 rounded-xl text-left transition-colors relative overflow-hidden
                      ${isActive
                        ? 'bg-[oklch(1_0_0/0.08)] ring-1 ring-[var(--stage-accent)]'
                        : isNext
                          ? 'bg-[oklch(1_0_0/0.04)]'
                          : 'bg-transparent hover:bg-[oklch(1_0_0/0.03)]'
                      }
                    `}
                  >
                    {/* Energy stripe */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ backgroundColor: energyLightness(moment.energy) }}
                    />

                    <div className="flex flex-col gap-1.5 min-w-0 pl-2 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-[var(--stage-text-tertiary)] w-16 shrink-0">
                          {moment.time || '—'}
                        </span>
                        <span className={`text-base font-semibold tracking-tight truncate ${isActive ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'}`}>
                          {moment.label || 'Untitled'}
                        </span>
                        {isActive && <Radio className="size-3.5 text-[var(--stage-accent)] shrink-0 animate-pulse" />}
                      </div>

                      {/* Announcement — prominent in show mode */}
                      {moment.announcement && (isActive || isNext) && (
                        <div className="flex items-start gap-2 ml-[4.75rem]">
                          <Mic className="size-3 text-[var(--stage-text-tertiary)] shrink-0 mt-0.5" />
                          <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed whitespace-pre-wrap">
                            {moment.announcement}
                          </p>
                        </div>
                      )}

                      {/* Songs — compact list */}
                      {songs.length > 0 && (
                        <div className="flex flex-col gap-0.5 ml-[4.75rem]">
                          {songs.map(song => (
                            <span key={song.id} className="text-xs text-[var(--stage-text-tertiary)]">
                              {song.artist ? `${song.artist} — ${song.title}` : song.title}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes — visible for active/next */}
                      {moment.notes && (isActive || isNext) && (
                        <p className="text-xs text-[var(--stage-text-tertiary)] ml-[4.75rem] italic">
                          {moment.notes}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
      /* ── Edit Mode: 2-col layout ─────────────────────────────── */
      <div className="flex flex-col gap-4 mt-4">

        {/* ── Timeline Tab Bar ──────────────────────────────────── */}
        <TimelineTabBar
          timelines={timelines}
          activeTimelineId={activeTimelineId}
          renamingTimelineId={renamingTimelineId}
          onSelect={setActiveTimelineId}
          onRename={renameTimeline}
          onStartRename={setRenamingTimelineId}
          onRemove={removeTimeline}
          onAddBlank={() => addTimeline(`Timeline ${timelines.length + 1}`)}
          onOpenPicker={() => setTemplatePickerOpen(true)}
          onSaveAsTemplate={handleSaveAsTemplate}
          savingTemplate={savingTemplate}
          hasTimelines={timelines.length > 0}
        />

        {/* ── Template Picker ───────────────────────────────────── */}
        <AnimatePresence>
          {templatePickerOpen && (
            <TemplatePicker
              djTemplates={djTemplates}
              onApplyStarter={applyStarterTemplate}
              onApplySaved={applySavedTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onClose={() => setTemplatePickerOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ── Empty State ───────────────────────────────────────── */}
        {timelines.length === 0 && !templatePickerOpen && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Layers className="size-10 text-[var(--stage-text-tertiary)]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--stage-text-secondary)]">No timelines yet</p>
              <p className="text-xs text-[var(--stage-text-tertiary)] mt-1">Create a blank timeline or start from a template</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => addTimeline('Timeline 1')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--stage-accent)] text-[var(--stage-void)] hover:opacity-90 transition-opacity"
              >
                <Plus className="size-3.5" /> New blank timeline
              </button>
              <button
                onClick={() => setTemplatePickerOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
              >
                <Copy className="size-3.5" /> From template
              </button>
            </div>
          </div>
        )}

      {activeTimeline && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,minmax(0,360px)] gap-6 items-start">

        {/* ── Program Timeline (main column) ────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] flex items-center gap-2">
              <ListMusic className="size-4" /> {activeTimeline.name}
            </h3>
            <span className="text-[10px] tabular-nums text-[var(--stage-text-tertiary)]">
              {moments.length} moment{moments.length !== 1 ? 's' : ''}
            </span>
          </div>

          <Reorder.Group
            axis="y"
            values={moments}
            onReorder={setMoments}
            className="flex flex-col gap-3"
          >
            {moments.map((moment) => (
              <MomentCard
                key={moment.id}
                moment={moment}
                songs={songsForMoment(moment.id)}
                onUpdate={(updates) => updateMoment(moment.id, updates)}
                onRemove={() => removeMoment(moment.id)}
                onAddSong={(result) => addSongFromSearch(result, 'cued', moment.id)}
                onRemoveSong={removeSong}
                onUnassignSong={unassignSong}
              />
            ))}
          </Reorder.Group>

          <button
            onClick={addMoment}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors mt-1 w-fit"
          >
            <Plus className="size-3.5" /> Add moment
          </button>
        </div>

        {/* ── Song Sidebar (desktop: right rail, mobile: toggle drawer) ── */}
        <div className="flex flex-col gap-4">
          {/* Mobile toggle */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="lg:hidden flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[var(--stage-surface-elevated)] text-sm font-medium text-[var(--stage-text-primary)]"
          >
            <span className="flex items-center gap-2">
              <Music className="size-4" />
              Song lists
              {floatingMustPlay.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]">
                  {floatingMustPlay.length} unassigned
                </span>
              )}
            </span>
            {sidebarOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {/* Sidebar content — always visible on desktop, toggle on mobile */}
          <div className={`flex flex-col gap-4 ${sidebarOpen ? '' : 'hidden lg:flex'}`}>
            {/* From the couple — read-only couple requests with Ack / Cue actions */}
            <FromCoupleSection
              eventId={eventId}
              requests={clientRequests}
              onAcknowledged={(entryId) =>
                setClientRequests((prev) =>
                  prev.map((r) =>
                    r.id === entryId
                      ? { ...r, acknowledged_at: new Date().toISOString() }
                      : r,
                  ),
                )
              }
              onPromoted={(entryId, promotedEntry) => {
                // Drop from clientRequests locally — the poll will reconfirm on next tick.
                setClientRequests((prev) => prev.filter((r) => r.id !== entryId));
                // Add to the DJ pool optimistically so the entry appears in a
                // tier bucket without waiting for a save+refresh cycle.
                setSongPool((prev) => [...prev, promotedEntry]);
              }}
            />

            <SongListSection
              label="Must play"
              icon={Music}
              songs={floatingMustPlay}
              tier="must_play"
              onAdd={(result) => addSongFromSearch(result, 'must_play')}
              onRemove={removeSong}
              onAssign={(songId) => setAssigningSongId(songId)}
              moments={allMoments}
              description="Client requested. Assign to a moment or play when it fits."
            />

            <SongListSection
              label="Play if possible"
              icon={Music}
              songs={floatingPlayIfPossible}
              tier="play_if_possible"
              onAdd={(result) => addSongFromSearch(result, 'play_if_possible')}
              onRemove={removeSong}
              onAssign={(songId) => setAssigningSongId(songId)}
              moments={allMoments}
              description="Nice-to-have. Use DJ judgment."
            />

            <SongListSection
              label="Do not play"
              icon={Ban}
              songs={doNotPlaySongs}
              tier="do_not_play"
              onAdd={(result) => addSongFromSearch(result, 'do_not_play')}
              onRemove={removeSong}
              description="Hard blacklist. Never play these."
            />

            {/* Spotify + playlist management */}
            <SpotifyPlaylistSection
              spotifyUserId={spotifyUserId ?? null}
              spotifyDisplayName={spotifyDisplayName ?? null}
              spotifyLink={spotifyLink}
              appleMusicLink={appleMusicLink}
              onSpotifyLinkChange={setSpotifyLink}
              onAppleMusicLinkChange={setAppleMusicLink}
              onImport={importPlaylist}
              onCreatePlaylist={createSpotifyPlaylist}
              importing={importingPlaylist}
              creatingPlaylist={creatingPlaylist}
              songPoolHasSpotifyTracks={songPool.some(s => s.spotify_id)}
            />

            {/* DJ Software Sync + Export */}
            {songPool.length > 0 && (
              <div className="flex flex-col gap-3">
                {/* Bridge companion app status (auto-detected) */}
                <BridgeStatus eventId={eventId} />

                {/* Lexicon push (auto-detected, shows only when available) */}
                <LexiconPush
                  eventTitle={eventArchetype ? `${eventArchetype} Program` : 'DJ Program'}
                  moments={allMoments}
                  songPool={songPool}
                />

                <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Export for DJ software</h4>
                <button
                  onClick={() => {
                    const blob = generateSeratoCrate('DJ Program', allMoments, songPool, '/Music/');
                    downloadCrate(blob, 'dj-program');
                    toast.success('Serato crate exported');
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
                >
                  <Download className="size-3.5" />
                  Serato (.crate)
                </button>
                <button
                  onClick={() => {
                    const xml = generateRekordboxXml('DJ Program', allMoments, songPool, '/Music/');
                    downloadRekordboxXml(xml, 'dj-program');
                    toast.success('Rekordbox XML exported');
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
                >
                  <Download className="size-3.5" />
                  Rekordbox (.xml)
                </button>
                <button
                  onClick={() => {
                    const m3u = generateM3U(allMoments, songPool, 'DJ Program');
                    downloadM3U(m3u, 'dj-program.m3u');
                    toast.success('M3U playlist exported');
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
                >
                  <Download className="size-3.5" />
                  M3U playlist
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
      </div>
      )}

      {/* ── Mobile Assign Picker (bottom sheet) ─────────────────── */}
      <AnimatePresence>
        {assigningSongId && (
          <MobileAssignPicker
            songId={assigningSongId}
            songPool={songPool}
            moments={allMoments}
            onAssign={assignSongToMoment}
            onCancel={() => setAssigningSongId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════ */

/* ── Timeline Tab Bar ─────────────────────────────────────────── */

function TimelineTabBar({
  timelines,
  activeTimelineId,
  renamingTimelineId,
  onSelect,
  onRename,
  onStartRename,
  onRemove,
  onAddBlank,
  onOpenPicker,
  onSaveAsTemplate,
  savingTemplate,
  hasTimelines,
}: {
  timelines: ProgramTimeline[];
  activeTimelineId: string | null;
  renamingTimelineId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStartRename: (id: string | null) => void;
  onRemove: (id: string) => void;
  onAddBlank: () => void;
  onOpenPicker: () => void;
  onSaveAsTemplate: () => void;
  savingTemplate: boolean;
  hasTimelines: boolean;
}) {
  const [renameValue, setRenameValue] = useState('');

  if (!hasTimelines) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[oklch(1_0_0/0.06)] -mx-4 px-4 overflow-x-auto">
      {timelines.sort((a, b) => a.sort_order - b.sort_order).map((tl) => (
        <div key={tl.id} className="flex items-center shrink-0 group">
          {renamingTimelineId === tl.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (renameValue.trim()) onRename(tl.id, renameValue.trim());
                else onStartRename(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') onStartRename(null);
              }}
              className="px-3 py-2 text-sm font-medium bg-transparent text-[var(--stage-text-primary)] outline-none border-b-2 border-[var(--stage-accent)] w-32"
            />
          ) : (
            <button
              onClick={() => onSelect(tl.id)}
              onDoubleClick={() => {
                setRenameValue(tl.name);
                onStartRename(tl.id);
              }}
              className={`relative px-3 py-2.5 text-sm font-medium transition-colors duration-[80ms] ${
                activeTimelineId === tl.id
                  ? 'text-[var(--stage-text-primary)]'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              }`}
            >
              {tl.name || 'Untitled'}
              {activeTimelineId === tl.id && (
                <motion.div
                  layoutId="timeline-tab-indicator"
                  className="absolute bottom-0 left-3 right-3 h-0.5 bg-[var(--stage-accent)] rounded-full"
                  transition={STAGE_LIGHT}
                />
              )}
            </button>
          )}

          {/* Edit/delete controls — visible on hover */}
          {activeTimelineId === tl.id && renamingTimelineId !== tl.id && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
              <button
                onClick={() => {
                  setRenameValue(tl.name);
                  onStartRename(tl.id);
                }}
                className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] p-0.5"
                aria-label="Rename timeline"
              >
                <Pencil className="size-3" />
              </button>
              {timelines.length > 0 && (
                <button
                  onClick={() => {
                    if (tl.moments.length === 0 || window.confirm(`Delete "${tl.name}" and its ${tl.moments.length} moments?`)) {
                      onRemove(tl.id);
                    }
                  }}
                  className="text-[var(--stage-text-tertiary)] hover:text-[oklch(0.7_0.15_25)] p-0.5"
                  aria-label="Delete timeline"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add timeline */}
      <div className="flex items-center gap-1 ml-1 shrink-0">
        <button
          onClick={onAddBlank}
          className="flex items-center gap-1 px-2 py-2 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          aria-label="Add blank timeline"
          title="Add blank timeline"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={onOpenPicker}
          className="flex items-center gap-1 px-2 py-2 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          aria-label="Add from template"
          title="Add from template"
        >
          <Copy className="size-3.5" />
        </button>
      </div>

      {/* Save as template — right side */}
      {hasTimelines && (
        <button
          onClick={onSaveAsTemplate}
          disabled={savingTemplate}
          className="flex items-center gap-1.5 ml-auto shrink-0 px-2.5 py-1.5 text-[10px] font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          title="Save current timelines as a reusable template"
        >
          <Bookmark className="size-3" />
          {savingTemplate ? 'Saving...' : 'Save as template'}
        </button>
      )}
    </div>
  );
}

/* ── Template Picker ──────────────────────────────────────────── */

function TemplatePicker({
  djTemplates,
  onApplyStarter,
  onApplySaved,
  onDeleteTemplate,
  onClose,
}: {
  djTemplates: DjTimelineTemplate[];
  onApplyStarter: (key: string) => void;
  onApplySaved: (template: DjTimelineTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
            Choose a template
          </h3>
          <button onClick={onClose} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
            <X className="size-4" />
          </button>
        </div>

        {/* Saved templates */}
        {djTemplates.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-2">
              Your templates
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {djTemplates.map((t) => (
                <div key={t.id} className="group relative">
                  <button
                    onClick={() => onApplySaved(t)}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--stage-text-primary)] block truncate">{t.name}</span>
                    <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                      {t.timelines.length} timeline{t.timelines.length !== 1 ? 's' : ''}
                      {' \u00b7 '}
                      {t.timelines.reduce((sum, tl) => sum + tl.moments.length, 0)} moments
                    </span>
                  </button>
                  <button
                    onClick={() => onDeleteTemplate(t.id)}
                    className="absolute top-1.5 right-1.5 p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[oklch(0.7_0.15_25)] opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete template"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Built-in starters */}
        <div>
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-2">
            Starters
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STARTER_TEMPLATES.map((s) => {
              const template = TIMELINE_TEMPLATES[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => onApplyStarter(s.key)}
                  className="text-left px-3 py-2.5 rounded-lg bg-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                >
                  <span className="text-sm font-medium text-[var(--stage-text-primary)] block">{s.label}</span>
                  <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                    {template?.length ?? 0} moments
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Client Strip ───────────────────────────────────────────────── */

function ClientStrip({
  clientDetails,
  clientNotes,
  eventArchetype,
  expanded,
  onToggle,
  onUpdateDetails,
  onUpdateNotes,
  saveStatus,
  isSaving,
  showMode,
  onToggleShowMode,
  onShareWithClient,
  sharingLink,
}: {
  clientDetails: ClientDetails;
  clientNotes: string;
  eventArchetype: string | null;
  expanded: boolean;
  onToggle: () => void;
  onUpdateDetails: (updates: Partial<ClientDetails>) => void;
  onUpdateNotes: (notes: string) => void;
  saveStatus: 'idle' | 'saving' | 'saved';
  isSaving: boolean;
  showMode: boolean;
  onToggleShowMode: () => void;
  onShareWithClient: () => void;
  sharingLink: boolean;
}) {
  const group = clientDetails.archetype;
  const fields = CLIENT_FIELD_SCHEMAS[group] ?? CLIENT_FIELD_SCHEMAS.generic;

  // Derive display name for the collapsed strip
  const displayName = useMemo(() => {
    const d = clientDetails as Record<string, unknown>;
    if (group === 'wedding') {
      const a = (d.couple_name_a as string) || '';
      const b = (d.couple_name_b as string) || '';
      if (a && b) return `${a} & ${b}`;
      return a || b || 'Client name';
    }
    if (group === 'corporate') return (d.company_name as string) || (d.event_contact_name as string) || 'Client';
    if (group === 'social') return (d.honoree_name as string) || (d.primary_contact_name as string) || 'Client';
    if (group === 'performance') return (d.headliner as string) || (d.promoter_name as string) || 'Client';
    return (d.primary_contact_name as string) || 'Client name';
  }, [clientDetails, group]);

  const pronunciation = (clientDetails as Record<string, unknown>).pronunciation as string || '';

  return (
    <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-[var(--stage-void)] border-b border-[oklch(1_0_0/0.06)]">
      {/* Top row: names + pronunciation + show mode toggle + save status */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={onToggle} className="flex flex-col gap-0.5 text-left min-w-0">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-[var(--stage-text-secondary)] shrink-0" />
            <span className={`font-semibold truncate ${showMode ? 'text-base text-[var(--stage-text-primary)]' : 'text-sm text-[var(--stage-text-primary)]'}`}>
              {displayName}
            </span>
            {!showMode && (expanded ? <ChevronUp className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" /> : <ChevronDown className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />)}
          </div>
          {pronunciation && (
            <span className={`text-[var(--stage-text-secondary)] ml-6 italic ${showMode ? 'text-sm' : 'text-xs'}`}>
              {pronunciation}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {/* Save status */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--stage-text-tertiary)]">
            {saveStatus === 'saving' && <><Loader2 className="size-3 animate-spin" /> Saving</>}
            {saveStatus === 'saved' && <><Check className="size-3" /> Saved</>}
          </div>

          {/* Share with client */}
          <button
            onClick={onShareWithClient}
            disabled={sharingLink}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
            title="Copy client link to clipboard"
          >
            {sharingLink ? <Loader2 className="size-3 animate-spin" /> : <Link className="size-3" />}
            Share
          </button>

          {/* Show mode toggle */}
          <button
            onClick={onToggleShowMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showMode
                ? 'bg-[var(--stage-accent)] text-[var(--stage-void)]'
                : 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)]'
            }`}
          >
            <Radio className="size-3" />
            {showMode ? 'Live' : 'Show mode'}
          </button>
        </div>
      </div>

      {/* Expanded client card — dynamic fields from schema */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-[oklch(1_0_0/0.04)]">
              {fields.map((field) => (
                <DynamicField
                  key={field.key}
                  field={field}
                  value={(clientDetails as Record<string, unknown>)[field.key] as string ?? ''}
                  onChange={(v) => onUpdateDetails({ [field.key]: v } as Partial<ClientDetails>)}
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[oklch(1_0_0/0.04)]">
              <label htmlFor="program-client-notes" className="stage-label text-[var(--stage-text-tertiary)] mb-1.5 block">Notes</label>
              <textarea
                id="program-client-notes"
                value={clientNotes}
                onChange={(e) => onUpdateNotes(e.target.value)}
                rows={3}
                placeholder="Vibe, dress code, genres to lean into, curfew, sound restrictions..."
                className="w-full text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Renders a single field from the CLIENT_FIELD_SCHEMAS, as input or textarea. */
function DynamicField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `client-${field.key}`;
  if (field.multiline) {
    return (
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor={id} className="stage-label text-[var(--stage-text-tertiary)]">{field.label}</label>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="w-full text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="stage-label text-[var(--stage-text-tertiary)]">{field.label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="text-sm bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none focus-visible:border-[var(--stage-accent)]"
      />
    </div>
  );
}

/* ── Moment Card (draggable) ────────────────────────────────────── */

function MomentCard({
  moment,
  songs,
  onUpdate,
  onRemove,
  onAddSong,
  onRemoveSong,
  onUnassignSong,
}: {
  moment: ProgramMoment;
  songs: SongEntry[];
  onUpdate: (updates: Partial<ProgramMoment>) => void;
  onRemove: () => void;
  onAddSong: (result: SearchResult | { title: string; artist: string }) => void;
  onRemoveSong: (songId: string) => void;
  onUnassignSong: (songId: string) => void;
}) {
  const [timeInput, setTimeInput] = useState(moment.time);
  const [notesOpen, setNotesOpen] = useState(!!moment.notes);
  const [announcementOpen, setAnnouncementOpen] = useState(!!moment.announcement);
  const dragControls = useDragControls();

  const handleTimeBlur = () => {
    const formatted = parseAndFormatTime(timeInput);
    setTimeInput(formatted);
    onUpdate({ time: formatted });
  };

  return (
    <Reorder.Item
      value={moment}
      dragListener={false}
      dragControls={dragControls}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0/0.06)] relative overflow-hidden"
      data-surface="surface"
    >
      {/* Energy stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: energyLightness(moment.energy) }}
      />

      {/* Header row: drag handle + time + label + energy + remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          className="touch-none text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <input
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          onBlur={handleTimeBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="6:00 PM"
          aria-label="Moment time"
          className="w-[5.5rem] text-xs font-mono bg-transparent text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-secondary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus-visible:border-[var(--stage-accent)] pb-0.5"
        />
        <input
          value={moment.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g. First Dance, Cocktail Hour"
          aria-label="Moment label"
          className="flex-1 text-sm font-medium bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus-visible:border-[var(--stage-accent)] pb-0.5"
        />
        <button onClick={onRemove} aria-label="Remove moment" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
          <X className="size-4" />
        </button>
      </div>

      {/* Cued songs */}
      {songs.length > 0 && (
        <div className="flex flex-col gap-1.5 ml-6 mt-1">
          {songs.map((song) => (
            <div key={song.id} className="flex items-center gap-2 text-xs group">
              {song.artwork_url ? (
                <img src={song.artwork_url} alt="" className="size-5 rounded shrink-0 object-cover" />
              ) : (
                <Music className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" />
              )}
              <span className="text-[var(--stage-text-secondary)] truncate">
                {song.artist ? `${song.artist} — ${song.title}` : song.title}
              </span>
              {song.notes && (
                <span className="text-[var(--stage-text-tertiary)] truncate hidden sm:inline">({song.notes})</span>
              )}
              <div className="flex items-center gap-1 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onUnassignSong(song.id)} aria-label="Move to must-play" title="Move to must-play list" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
                  <ArrowRight className="size-3" />
                </button>
                <button onClick={() => onRemoveSong(song.id)} aria-label="Remove song" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add song to moment — search-enabled */}
      <div className="ml-6">
        <SongSearch
          size="sm"
          placeholder="Add song..."
          onSelect={(result) => onAddSong(result)}
        />
      </div>

      {/* Announcement script */}
      {announcementOpen ? (
        <div className="ml-6 mt-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Mic className="size-3 text-[var(--stage-text-tertiary)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">MC script</span>
          </div>
          <textarea
            value={moment.announcement}
            onChange={(e) => onUpdate({ announcement: e.target.value })}
            rows={2}
            placeholder="Ladies and gentlemen, please welcome for the first time..."
            className="w-full text-xs bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.04)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
          />
        </div>
      ) : null}

      {/* Per-moment notes */}
      {notesOpen ? (
        <div className="ml-6 mt-1">
          <textarea
            value={moment.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
            placeholder="Genre direction, vibe, energy notes..."
            className="w-full text-xs bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.04)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
          />
        </div>
      ) : null}

      {/* Action row: add notes / add script / energy */}
      <div className="flex items-center gap-3 ml-6 flex-wrap">
        {!announcementOpen && (
          <button
            onClick={() => setAnnouncementOpen(true)}
            className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            + MC script
          </button>
        )}
        {!notesOpen && (
          <button
            onClick={() => setNotesOpen(true)}
            className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            + Notes
          </button>
        )}
        {/* Inline energy selector */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-[var(--stage-text-tertiary)]">Energy</span>
          <div className="flex gap-px">
            {[1,2,3,4,5,6,7,8,9,10].map(level => (
              <button
                key={level}
                onClick={() => onUpdate({ energy: moment.energy === level ? null : level })}
                aria-label={`Energy ${level}`}
                className="w-2.5 h-4 rounded-sm transition-colors"
                style={{
                  backgroundColor: (moment.energy ?? 0) >= level
                    ? energyLightness(level)
                    : 'oklch(1 0 0 / 0.06)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}

/* ── Song List Section ──────────────────────────────────────────── */

function SongListSection({
  label,
  icon: Icon,
  songs,
  tier,
  onAdd,
  onRemove,
  onAssign,
  moments,
  description,
}: {
  label: string;
  icon: typeof Music;
  songs: SongEntry[];
  tier: SongTier;
  onAdd: (result: SearchResult | { title: string; artist: string }) => void;
  onRemove: (songId: string) => void;
  onAssign?: (songId: string) => void;
  moments?: ProgramMoment[];
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="size-4 text-[var(--stage-text-secondary)]" />
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">{label}</h4>
        {songs.length > 0 && (
          <span className="text-[10px] tabular-nums text-[var(--stage-text-tertiary)] ml-auto">{songs.length}</span>
        )}
      </div>

      {description && songs.length === 0 && (
        <p className="text-[10px] text-[var(--stage-text-tertiary)] -mt-1">{description}</p>
      )}

      {songs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {songs.map((song) => (
            <div key={song.id} className="flex items-center justify-between gap-2 text-sm group">
              <div className="flex items-center gap-2 min-w-0">
                {song.artwork_url ? (
                  <img src={song.artwork_url} alt="" className="size-6 rounded shrink-0 object-cover" />
                ) : null}
                <span className="text-[var(--stage-text-primary)] truncate">
                  {song.artist ? `${song.artist} — ${song.title}` : song.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onAssign && moments && tier !== 'do_not_play' && (
                  <button
                    onClick={() => onAssign(song.id)}
                    aria-label="Assign to moment"
                    title="Assign to a moment"
                    className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onRemove(song.id)}
                  aria-label="Remove"
                  className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SongSearch
        placeholder={`Search or type Artist — Song`}
        onSelect={onAdd}
      />
    </div>
  );
}

/* ── Mobile Assign Picker ───────────────────────────────────────── */

function MobileAssignPicker({
  songId,
  songPool,
  moments,
  onAssign,
  onCancel,
}: {
  songId: string;
  songPool: SongEntry[];
  moments: ProgramMoment[];
  onAssign: (songId: string, momentId: string | null) => void;
  onCancel: () => void;
}) {
  const song = songPool.find(s => s.id === songId);
  if (!song) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[oklch(0_0_0/0.6)]"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={STAGE_MEDIUM}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-[var(--stage-surface-elevated)] p-5 pb-8 safe-area-pb"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--stage-text-primary)]">
            Assign to moment
          </h3>
          <button onClick={onCancel} className="text-[var(--stage-text-tertiary)]">
            <X className="size-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--stage-text-secondary)] mb-3">
          {song.artist ? `${song.artist} — ${song.title}` : song.title}
        </p>

        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          {moments.map((moment) => (
            <button
              key={moment.id}
              onClick={() => onAssign(songId, moment.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[oklch(1_0_0/0.04)] transition-colors"
            >
              <span className="text-xs font-mono text-[var(--stage-text-tertiary)] w-16 shrink-0">
                {moment.time || '—'}
              </span>
              <span className="text-sm text-[var(--stage-text-primary)] truncate">
                {moment.label || 'Untitled'}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── M3U Export ─────────────────────────────────────────────────── */

function generateM3U(
  moments: ProgramMoment[],
  songPool: SongEntry[],
  eventTitle: string,
): string {
  const lines: string[] = ['#EXTM3U', `# ${eventTitle} — DJ Program Export`];

  // Cued songs grouped by moment
  for (const moment of moments) {
    const cuedSongs = songPool
      .filter(s => s.assigned_moment_id === moment.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (cuedSongs.length > 0) {
      lines.push('', `# --- ${moment.label}${moment.time ? ` (${moment.time})` : ''} ---`);
      for (const song of cuedSongs) {
        const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
        lines.push(`#EXTINF:-1,${display}`, display);
      }
    }
  }

  // Floating must-play
  const mustPlay = songPool.filter(s => s.tier === 'must_play' && !s.assigned_moment_id);
  if (mustPlay.length > 0) {
    lines.push('', '# --- Must Play (unassigned) ---');
    for (const song of mustPlay) {
      const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
      lines.push(`#EXTINF:-1,${display}`, display);
    }
  }

  // Floating play-if-possible
  const playIfPossible = songPool.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id);
  if (playIfPossible.length > 0) {
    lines.push('', '# --- Play If Possible ---');
    for (const song of playIfPossible) {
      const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
      lines.push(`#EXTINF:-1,${display}`, display);
    }
  }

  return lines.join('\n');
}

function downloadM3U(content: string, filename: string) {
  const blob = new Blob([content], { type: 'audio/x-mpegurl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

