'use client';

/**
 * DJ Program tab — main orchestrator.
 *
 * Slim shell that owns:
 *   - All program / song-pool / client-info state and the autosave loop.
 *   - Timeline + moment + song mutation helpers passed to siblings.
 *   - Spotify OAuth return handling, polling for couple song requests,
 *     show-mode + edit-mode top-level rendering.
 *
 * Render-only sub-components and pure helpers live under ./program-tab/:
 *   - shared            — parseAndFormatTime, energyLightness, TIMELINE_TEMPLATES,
 *                         STARTER_TEMPLATES, templateToTimeline, MomentTemplate
 *   - timeline-tabs     — TimelineTabBar, TemplatePicker
 *   - client-strip      — ClientStrip, DynamicField
 *   - moment-card       — MomentCard
 *   - song-lists        — SongListSection, MobileAssignPicker
 *   - show-mode         — ShowModeView (live performance view)
 *   - export-actions    — ExportActions (Serato / Rekordbox / M3U buttons)
 *   - exports           — generateM3U, downloadM3U
 *
 * Phase 0.5-style split (2026-04-29).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import {
  Plus, Music, ListMusic, Layers, Copy, Ban, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveDjPrep } from '@/features/ops/actions/save-dj-prep';
import { getClientSongRequestsForEvent } from '@/features/ops/actions/get-client-song-requests';
import type { ProgramMoment, ProgramTimeline, SongEntry, SongTier, DjClientInfo, DjProgramDataV3, DjTimelineTemplate, ClientDetails } from '@/features/ops/lib/dj-prep-schema';
import { saveDjTemplate, deleteDjTemplate } from '@/features/ops/actions/save-dj-templates';
import { generateClientEventLink } from '@/features/ops/actions/generate-client-event-link';
import { FromCoupleSection } from '@/features/ops/ui/from-couple-section';
import type { SearchResult } from '@/app/api/music/search/route';
import { SpotifyPlaylistSection } from './spotify-playlist-section';
import { TIMELINE_TEMPLATES, STARTER_TEMPLATES } from './program-tab/shared';
import { TimelineTabBar, TemplatePicker } from './program-tab/timeline-tabs';
import { ClientStrip } from './program-tab/client-strip';
import { MomentCard } from './program-tab/moment-card';
import { SongListSection, MobileAssignPicker } from './program-tab/song-lists';
import { ShowModeView } from './program-tab/show-mode';
import { ExportActions } from './program-tab/export-actions';

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
        <ShowModeView
          timelines={timelines}
          activeMomentId={activeMomentId}
          songsForMoment={songsForMoment}
          onActivate={handleActivateMoment}
        />
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
              <ExportActions
                eventId={eventId}
                eventArchetype={eventArchetype}
                allMoments={allMoments}
                songPool={songPool}
              />
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

