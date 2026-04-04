'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListMusic, Plus, X, Save, Loader2, Music, GripVertical, ChevronRight } from 'lucide-react';
import { saveSetlists, type Setlist, type SetlistSong } from '@/features/ops/actions/save-band-data';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Component ───────────────────────────────────────────────────── */

interface SetlistsViewProps {
  initialSetlists: Setlist[];
}

export function SetlistsView({ initialSetlists }: SetlistsViewProps) {
  const [setlists, setSetlists] = useState<Setlist[]>(initialSetlists);
  const [activeId, setActiveId] = useState<string | null>(setlists[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const activeSetlist = setlists.find(s => s.id === activeId) ?? null;

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      const result = await saveSetlists(setlists);
      if (result.ok) setSaved(true);
    });
  };

  const addSetlist = () => {
    const newSetlist: Setlist = {
      id: crypto.randomUUID(),
      name: 'New setlist',
      songs: [],
      createdAt: new Date().toISOString(),
    };
    setSetlists(prev => [...prev, newSetlist]);
    setActiveId(newSetlist.id);
  };

  const removeSetlist = (id: string) => {
    setSetlists(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId(setlists.find(s => s.id !== id)?.id ?? null);
  };

  const updateSetlistName = (id: string, name: string) => {
    setSetlists(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const addSong = (setlistId: string) => {
    const song: SetlistSong = { id: crypto.randomUUID(), title: '', artist: '', notes: '' };
    setSetlists(prev => prev.map(s =>
      s.id === setlistId ? { ...s, songs: [...s.songs, song] } : s
    ));
  };

  const updateSong = (setlistId: string, songId: string, updates: Partial<SetlistSong>) => {
    setSetlists(prev => prev.map(s =>
      s.id === setlistId
        ? { ...s, songs: s.songs.map(song => song.id === songId ? { ...song, ...updates } : song) }
        : s
    ));
  };

  const removeSong = (setlistId: string, songId: string) => {
    setSetlists(prev => prev.map(s =>
      s.id === setlistId
        ? { ...s, songs: s.songs.filter(song => song.id !== songId) }
        : s
    ));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-4"
    >
      {/* Header + Save */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic className="size-5 text-[var(--stage-text-tertiary)]" />
          <h1 className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">Setlists</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.15)] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Setlist tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {setlists.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg shrink-0 transition-colors
              ${activeId === s.id
                ? 'bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)]'
              }
            `}
          >
            {s.name || 'Untitled'}
            <span className="text-[10px] text-[var(--stage-text-tertiary)]">{s.songs.length}</span>
          </button>
        ))}
        <button
          onClick={addSetlist}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors shrink-0"
        >
          <Plus className="size-3.5" /> New
        </button>
      </div>

      {/* Active setlist editor */}
      <AnimatePresence mode="wait">
        {activeSetlist ? (
          <motion.div
            key={activeSetlist.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_MEDIUM}
            className="flex flex-col gap-3"
          >
            {/* Setlist name + delete */}
            <div className="flex items-center gap-2">
              <input
                value={activeSetlist.name}
                onChange={(e) => updateSetlistName(activeSetlist.id, e.target.value)}
                className="flex-1 text-sm font-medium bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus:border-[oklch(1_0_0/0.15)] pb-1"
                placeholder="Setlist name"
              />
              <button
                onClick={() => removeSetlist(activeSetlist.id)}
                className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
              >
                Delete
              </button>
            </div>

            {/* Songs */}
            <div className="flex flex-col gap-1.5">
              {activeSetlist.songs.map((song, i) => (
                <div key={song.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--stage-surface)] border border-[oklch(1_0_0/0.06)]">
                  <span className="text-xs font-mono text-[var(--stage-text-tertiary)] w-5 text-right shrink-0">{i + 1}</span>
                  <GripVertical className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0 cursor-grab" />
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      value={song.title}
                      onChange={(e) => updateSong(activeSetlist.id, song.id, { title: e.target.value })}
                      placeholder="Song title"
                      className="flex-1 text-sm bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none min-w-0"
                    />
                    <span className="text-[var(--stage-text-tertiary)]">—</span>
                    <input
                      value={song.artist}
                      onChange={(e) => updateSong(activeSetlist.id, song.id, { artist: e.target.value })}
                      placeholder="Artist"
                      className="flex-1 text-sm bg-transparent text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-tertiary)] outline-none min-w-0"
                    />
                  </div>
                  <button
                    onClick={() => removeSong(activeSetlist.id, song.id)}
                    className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => addSong(activeSetlist.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors w-fit"
            >
              <Plus className="size-3.5" /> Add song
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 gap-3 text-center"
          >
            <Music className="size-8 text-[var(--stage-text-tertiary)]" />
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Create your first setlist to get started.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
