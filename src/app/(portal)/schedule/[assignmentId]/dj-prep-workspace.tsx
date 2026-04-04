'use client';

import { useState, useTransition, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Music, ListMusic, FileText, Users, GripVertical, Save, Loader2 } from 'lucide-react';
import { saveDjPrep, type DjTimelineItem, type DjPrepData } from '@/features/ops/actions/save-dj-prep';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface DjPrepWorkspaceProps {
  eventId: string;
  initialData: Partial<DjPrepData>;
}

/* ── Section Header ──────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, label }: { icon: typeof Music; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-[var(--stage-text-tertiary)]" />
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        {label}
      </h3>
    </div>
  );
}

/* ── Main Workspace ──────────────────────────────────────────────── */

export function DjPrepWorkspace({ eventId, initialData }: DjPrepWorkspaceProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Timeline
  const [timeline, setTimeline] = useState<DjTimelineItem[]>(
    initialData.dj_timeline ?? getDefaultTimeline()
  );

  // Songs
  const [mustPlay, setMustPlay] = useState<string[]>(initialData.dj_must_play ?? []);
  const [doNotPlay, setDoNotPlay] = useState<string[]>(initialData.dj_do_not_play ?? []);
  const [newMustPlay, setNewMustPlay] = useState('');
  const [newDoNotPlay, setNewDoNotPlay] = useState('');

  // Client notes
  const [clientNotes, setClientNotes] = useState(initialData.dj_client_notes ?? '');

  // Client info
  const [clientInfo, setClientInfo] = useState(initialData.dj_client_info ?? {
    couple_names: '',
    pronunciation: '',
    wedding_party: '',
    special_requests: '',
  });

  // Dirty tracking — warn before navigating away with unsaved changes
  const isDirty = useRef(false);
  useEffect(() => { isDirty.current = true; }, [timeline, mustPlay, doNotPlay, clientNotes, clientInfo]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current && !saved) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saved]);

  const handleSave = useCallback(() => {
    setSaved(false);
    startTransition(async () => {
      const result = await saveDjPrep(eventId, {
        dj_timeline: timeline,
        dj_must_play: mustPlay,
        dj_do_not_play: doNotPlay,
        dj_client_notes: clientNotes,
        dj_client_info: clientInfo,
      });
      if (result.ok) { setSaved(true); isDirty.current = false; }
    });
  }, [eventId, timeline, mustPlay, doNotPlay, clientNotes, clientInfo]);

  // Timeline helpers
  const updateTimelineItem = (id: string, updates: Partial<DjTimelineItem>) => {
    setTimeline(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };
  const addTimelineItem = () => {
    setTimeline(prev => [...prev, { id: crypto.randomUUID(), label: '', time: '', songs: [] }]);
  };
  const removeTimelineItem = (id: string) => {
    setTimeline(prev => prev.filter(item => item.id !== id));
  };
  const addSongToMoment = (itemId: string, song: string) => {
    if (!song.trim()) return;
    setTimeline(prev => prev.map(item =>
      item.id === itemId ? { ...item, songs: [...item.songs, song.trim()] } : item
    ));
  };
  const removeSongFromMoment = (itemId: string, idx: number) => {
    setTimeline(prev => prev.map(item =>
      item.id === itemId ? { ...item, songs: item.songs.filter((_, i) => i !== idx) } : item
    ));
  };

  // Song list helpers
  const addMustPlay = () => {
    if (!newMustPlay.trim()) return;
    setMustPlay(prev => [...prev, newMustPlay.trim()]);
    setNewMustPlay('');
  };
  const addDoNotPlay = () => {
    if (!newDoNotPlay.trim()) return;
    setDoNotPlay(prev => [...prev, newDoNotPlay.trim()]);
    setNewDoNotPlay('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* ── Save Bar ─────────────────────────────────────────────── */}
      <div className="sticky top-14 z-20 flex items-center justify-between gap-3 py-3 px-4 -mx-4 bg-[var(--stage-void)]/90 backdrop-blur-md border-b border-[oklch(1_0_0/0.06)]">
        <h2 className="text-sm font-semibold text-[var(--stage-text-primary)]">Show prep</h2>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.15)] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <SectionHeader icon={ListMusic} label="Timeline" />
        <div className="flex flex-col gap-3">
          {timeline.map((item) => (
            <TimelineMoment
              key={item.id}
              item={item}
              onUpdate={(updates) => updateTimelineItem(item.id, updates)}
              onRemove={() => removeTimelineItem(item.id)}
              onAddSong={(song) => addSongToMoment(item.id, song)}
              onRemoveSong={(idx) => removeSongFromMoment(item.id, idx)}
            />
          ))}
        </div>
        <button
          onClick={addTimelineItem}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors mt-1 w-fit"
        >
          <Plus className="size-3.5" /> Add moment
        </button>
      </div>

      {/* ── Song Lists ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Must Play */}
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Music} label="Must play" />
          <div className="flex flex-col gap-1.5">
            {mustPlay.map((song, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm text-[var(--stage-text-primary)]">
                <span className="truncate">{song}</span>
                <button onClick={() => setMustPlay(prev => prev.filter((_, j) => j !== i))} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              value={newMustPlay}
              onChange={(e) => setNewMustPlay(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMustPlay()}
              placeholder="Artist — Song"
              className="flex-1 text-sm bg-[var(--stage-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)]"
            />
            <button onClick={addMustPlay} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Do Not Play */}
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
          <SectionHeader icon={Music} label="Do not play" />
          <div className="flex flex-col gap-1.5">
            {doNotPlay.map((song, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm text-[var(--stage-text-primary)]">
                <span className="truncate">{song}</span>
                <button onClick={() => setDoNotPlay(prev => prev.filter((_, j) => j !== i))} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              value={newDoNotPlay}
              onChange={(e) => setNewDoNotPlay(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDoNotPlay()}
              placeholder="Artist — Song"
              className="flex-1 text-sm bg-[var(--stage-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)]"
            />
            <button onClick={addDoNotPlay} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Client Info ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <SectionHeader icon={Users} label="Client info" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldInput label="Couple / client names" value={clientInfo.couple_names} onChange={(v) => setClientInfo(prev => ({ ...prev, couple_names: v }))} />
          <FieldInput label="Name pronunciation" value={clientInfo.pronunciation} onChange={(v) => setClientInfo(prev => ({ ...prev, pronunciation: v }))} />
          <FieldInput label="Wedding party / key people" value={clientInfo.wedding_party} onChange={(v) => setClientInfo(prev => ({ ...prev, wedding_party: v }))} />
          <FieldInput label="Special requests" value={clientInfo.special_requests} onChange={(v) => setClientInfo(prev => ({ ...prev, special_requests: v }))} />
        </div>
      </div>

      {/* ── Client Notes ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <SectionHeader icon={FileText} label="Notes" />
        <textarea
          value={clientNotes}
          onChange={(e) => setClientNotes(e.target.value)}
          rows={4}
          placeholder="Meeting notes, vibe preferences, dress code, genre expectations..."
          className="text-sm bg-[var(--stage-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)] resize-none"
        />
      </div>
    </motion.div>
  );
}

/* ── Timeline Moment ─────────────────────────────────────────────── */

function TimelineMoment({
  item,
  onUpdate,
  onRemove,
  onAddSong,
  onRemoveSong,
}: {
  item: DjTimelineItem;
  onUpdate: (updates: Partial<DjTimelineItem>) => void;
  onRemove: () => void;
  onAddSong: (song: string) => void;
  onRemoveSong: (idx: number) => void;
}) {
  const [newSong, setNewSong] = useState('');

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--stage-well)] border border-[oklch(1_0_0/0.04)]">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 text-[var(--stage-text-tertiary)] shrink-0 cursor-grab" />
        <input
          value={item.time}
          onChange={(e) => onUpdate({ time: e.target.value })}
          placeholder="6:00 PM"
          className="w-20 text-xs font-mono bg-transparent text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-tertiary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus:border-[oklch(1_0_0/0.15)] pb-0.5"
        />
        <input
          value={item.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g. First Dance, Cocktail Hour"
          className="flex-1 text-sm bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus:border-[oklch(1_0_0/0.15)] pb-0.5"
        />
        <button onClick={onRemove} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
          <X className="size-4" />
        </button>
      </div>

      {/* Songs for this moment */}
      {item.songs.length > 0 && (
        <div className="flex flex-col gap-1 ml-6">
          {item.songs.map((song, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)]">
              <Music className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" />
              <span className="truncate">{song}</span>
              <button onClick={() => onRemoveSong(i)} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0 ml-auto">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add song to moment */}
      <div className="flex items-center gap-2 ml-6">
        <input
          value={newSong}
          onChange={(e) => setNewSong(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newSong.trim()) {
              onAddSong(newSong.trim());
              setNewSong('');
            }
          }}
          placeholder="Add song..."
          className="flex-1 text-xs bg-transparent text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-tertiary)] outline-none"
        />
        {newSong.trim() && (
          <button
            onClick={() => { onAddSong(newSong.trim()); setNewSong(''); }}
            className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Field Input ─────────────────────────────────────────────────── */

function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-[var(--stage-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)]"
      />
    </div>
  );
}

/* ── Default Timeline ────────────────────────────────────────────── */

function getDefaultTimeline(): DjTimelineItem[] {
  return [
    { id: crypto.randomUUID(), label: 'Cocktail hour', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Guest seating', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Grand entrance', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'First dance', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Dinner', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Toasts', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Open dancing', time: '', songs: [] },
    { id: crypto.randomUUID(), label: 'Last dance', time: '', songs: [] },
  ];
}
