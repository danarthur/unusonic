'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Plus, X, Save, Loader2, Mic, Coffee } from 'lucide-react';
import { saveTechRider, saveHospitalityRider, type TechRiderItem, type HospitalityRiderItem } from '@/features/ops/actions/save-band-data';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface RidersViewProps {
  initialTechRider: TechRiderItem[];
  initialHospitalityRider: HospitalityRiderItem[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const TECH_CATEGORIES = ['audio', 'lighting', 'stage', 'backline'] as const;
const HOSPITALITY_CATEGORIES = ['food', 'beverage', 'green_room', 'travel', 'other'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  audio: 'Audio',
  lighting: 'Lighting',
  stage: 'Stage',
  backline: 'Backline',
  food: 'Food',
  beverage: 'Beverage',
  green_room: 'Green room',
  travel: 'Travel',
  other: 'Other',
};

/* ── Component ───────────────────────────────────────────────────── */

export function RidersView({ initialTechRider, initialHospitalityRider }: RidersViewProps) {
  const [techItems, setTechItems] = useState<TechRiderItem[]>(initialTechRider);
  const [hospItems, setHospItems] = useState<HospitalityRiderItem[]>(initialHospitalityRider);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      const [techResult, hospResult] = await Promise.all([
        saveTechRider(techItems),
        saveHospitalityRider(hospItems),
      ]);
      if (techResult.ok && hospResult.ok) setSaved(true);
    });
  };

  // Tech rider helpers
  const addTechItem = (category: string) => {
    setTechItems(prev => [...prev, { id: crypto.randomUUID(), category, item: '', quantity: 1, notes: '' }]);
  };
  const updateTechItem = (id: string, updates: Partial<TechRiderItem>) => {
    setTechItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const removeTechItem = (id: string) => {
    setTechItems(prev => prev.filter(i => i.id !== id));
  };

  // Hospitality rider helpers
  const addHospItem = (category: string) => {
    setHospItems(prev => [...prev, { id: crypto.randomUUID(), category, item: '', notes: '' }]);
  };
  const updateHospItem = (id: string, updates: Partial<HospitalityRiderItem>) => {
    setHospItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const removeHospItem = (id: string) => {
    setHospItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Header + Save */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-5 text-[var(--stage-text-tertiary)]" />
          <h1 className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">Riders</h1>
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

      {/* ── Tech Rider ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-[var(--stage-text-tertiary)]" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Technical rider</h2>
        </div>

        {TECH_CATEGORIES.map(category => {
          const items = techItems.filter(i => i.category === category);
          return (
            <div key={category} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--stage-text-secondary)]">{CATEGORY_LABELS[category]}</span>
                <button
                  onClick={() => addTechItem(category)}
                  className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 pl-2">
                  <input
                    value={item.item}
                    onChange={(e) => updateTechItem(item.id, { item: e.target.value })}
                    placeholder="Item description"
                    className="flex-1 text-sm bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none min-w-0"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateTechItem(item.id, { quantity: Number(e.target.value) || 1 })}
                    min={1}
                    className="w-12 text-sm text-center bg-[var(--stage-well)] rounded px-1 py-0.5 text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none"
                  />
                  <button onClick={() => removeTechItem(item.id)} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-[var(--stage-text-tertiary)] pl-2">No items</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Hospitality Rider ────────────────────────────────────── */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <div className="flex items-center gap-2">
          <Coffee className="size-4 text-[var(--stage-text-tertiary)]" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Hospitality rider</h2>
        </div>

        {HOSPITALITY_CATEGORIES.map(category => {
          const items = hospItems.filter(i => i.category === category);
          return (
            <div key={category} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--stage-text-secondary)]">{CATEGORY_LABELS[category]}</span>
                <button
                  onClick={() => addHospItem(category)}
                  className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 pl-2">
                  <input
                    value={item.item}
                    onChange={(e) => updateHospItem(item.id, { item: e.target.value })}
                    placeholder="Item"
                    className="flex-1 text-sm bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] outline-none min-w-0"
                  />
                  <input
                    value={item.notes}
                    onChange={(e) => updateHospItem(item.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="flex-1 text-sm bg-transparent text-[var(--stage-text-tertiary)] placeholder:text-[var(--stage-text-tertiary)] outline-none min-w-0"
                  />
                  <button onClick={() => removeHospItem(item.id)} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-[var(--stage-text-tertiary)] pl-2">No items</p>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
