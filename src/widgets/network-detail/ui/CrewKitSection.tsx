'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, Plus, X, ChevronDown, Link2, CheckCircle2, Clock, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  getCrewEquipmentForEntity,
  addCrewEquipment,
  removeCrewEquipment,
  uploadEquipmentPhoto,
} from '@/features/talent-management/api/crew-equipment-actions';
import { searchCatalogForEquipment, type CatalogEquipmentMatch } from '@/features/talent-management/api/search-catalog-for-equipment';
import { createClient } from '@/shared/api/supabase/client';
import type { CrewEquipmentDTO, EquipmentCategory } from '@/entities/talent';

// =============================================================================
// Constants
// =============================================================================

const CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: 'audio', label: 'Audio' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'video', label: 'Video' },
  { value: 'staging', label: 'Staging' },
  { value: 'power', label: 'Power' },
  { value: 'misc', label: 'Misc' },
];

const VERIFICATION_ICONS = {
  approved: { icon: CheckCircle2, color: 'text-[var(--color-unusonic-success)]', label: 'Verified' },
  pending: { icon: Clock, color: 'text-[var(--stage-text-tertiary)]', label: 'Pending review' },
  rejected: { icon: AlertCircle, color: 'text-[var(--color-unusonic-error)]', label: 'Rejected' },
  expired: { icon: Clock, color: 'text-[var(--color-unusonic-warning)]', label: 'Verification expired' },
} as const;

// =============================================================================
// CrewKitSection — equipment profile card for a person entity
// =============================================================================

export function CrewKitSection({ entityId }: { entityId: string }) {
  const [items, setItems] = useState<CrewEquipmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<EquipmentCategory>('audio');
  const [adding, setAdding] = useState(false);
  // Catalog search state
  const [catalogResults, setCatalogResults] = useState<CatalogEquipmentMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    const data = await getCrewEquipmentForEntity(entityId);
    setItems(data);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Debounced catalog search
  const handleNameChange = (value: string) => {
    setAddName(value);
    setSelectedCatalogId(null);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (value.trim().length < 2) {
      setCatalogResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchCatalogForEquipment(value.trim());
      setCatalogResults(results);
      setShowDropdown(results.length > 0 || value.trim().length >= 2);
      setSearching(false);
    }, 250);
  };

  const selectCatalogItem = (match: CatalogEquipmentMatch) => {
    setAddName(match.name);
    setSelectedCatalogId(match.id);
    setShowDropdown(false);
  };

  const selectCustom = () => {
    setSelectedCatalogId(null);
    setShowDropdown(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const handleAdd = async () => {
    const trimmed = addName.trim();
    if (!trimmed) return;
    setAdding(true);
    const result = await addCrewEquipment({
      entity_id: entityId,
      category: addCategory,
      name: trimmed,
      catalog_item_id: selectedCatalogId ?? undefined,
    });
    setAdding(false);
    if (result.ok) {
      setAddName('');
      setSelectedCatalogId(null);
      setCatalogResults([]);
      setAddOpen(false);
      await fetchItems();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const result = await removeCrewEquipment({ crew_equipment_id: id });
    if (!result.ok) {
      toast.error(result.error);
      await fetchItems();
    }
  };

  // Photo upload handler
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // Resolve signed URLs for items with photo_url
  useEffect(() => {
    const itemsWithPhotos = items.filter((i) => i.photo_url && !photoUrls[i.id]);
    if (itemsWithPhotos.length === 0) return;

    const supabase = createClient();
    Promise.all(
      itemsWithPhotos.map(async (item) => {
        const { data } = await supabase.storage
          .from('workspace-files')
          .createSignedUrl(item.photo_url!, 60 * 30); // 30 min
        return { id: item.id, url: data?.signedUrl ?? null };
      })
    ).then((results) => {
      setPhotoUrls((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.url) next[r.id] = r.url;
        }
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handlePhotoUpload = useCallback(
    async (equipmentId: string, file: File) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        toast.error('Only PNG, JPEG, and WebP images are supported.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be under 5 MB.');
        return;
      }
      setUploadingPhotoId(equipmentId);
      const formData = new FormData();
      formData.set('crew_equipment_id', equipmentId);
      formData.set('file', file);
      const result = await uploadEquipmentPhoto(formData);
      setUploadingPhotoId(null);
      if (result.ok) {
        toast.success('Photo uploaded');
        // Create a temporary object URL for immediate preview
        const objectUrl = URL.createObjectURL(file);
        setPhotoUrls((prev) => ({ ...prev, [equipmentId]: objectUrl }));
        // Update local items to reflect photo_url
        setItems((prev) =>
          prev.map((i) => (i.id === equipmentId ? { ...i, photo_url: result.photoUrl } : i))
        );
      } else {
        toast.error(result.error);
      }
    },
    []
  );

  // Group by category
  const grouped = React.useMemo(() => {
    const map = new Map<EquipmentCategory, CrewEquipmentDTO[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return CATEGORIES
      .filter((c) => map.has(c.value))
      .map((c) => ({ category: c.value, label: c.label, items: map.get(c.value)! }));
  }, [items]);

  if (loading) return null;

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-3.5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
          <h3 className="stage-label text-[var(--stage-text-secondary)]">
            Kit
          </h3>
          {items.length > 0 && (
            <span className="stage-label tabular-nums text-[var(--stage-text-tertiary)]">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="flex items-center gap-1 stage-label text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
        >
          <Plus className="size-3" strokeWidth={1.5} />
          <span>Add</span>
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && !addOpen && (
        <p className="text-xs text-[var(--stage-text-tertiary)]">
          No equipment on file
        </p>
      )}

      {/* Category groups */}
      {grouped.map((group) => (
        <div key={group.category} className="mb-3 last:mb-0">
          <p className="stage-label font-medium text-[var(--stage-text-tertiary)] uppercase tracking-wider mb-1.5">
            {group.label}
          </p>
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {group.items.map((item) => {
                const verif = VERIFICATION_ICONS[item.verification_status];
                const VerifIcon = verif.icon;
                const thumbnailUrl = photoUrls[item.id];
                const isUploading = uploadingPhotoId === item.id;
                return (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={STAGE_LIGHT}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-[oklch(1_0_0/0.08)] group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Photo thumbnail */}
                      {thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="size-5 rounded object-cover shrink-0 border border-[var(--stage-edge-subtle)]"
                        />
                      ) : null}
                      <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] tracking-tight truncate">
                        {item.name}
                      </span>
                      {item.quantity > 1 && (
                        <span className="stage-label tabular-nums text-[var(--stage-text-tertiary)]">
                          x{item.quantity}
                        </span>
                      )}
                      {/* Catalog link indicator */}
                      {item.catalog_item_id && (
                        <Link2 className="size-2.5 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} aria-label="Linked to catalog" />
                      )}
                      {/* Verification badge (only shown when not auto-approved) */}
                      {item.verification_status !== 'approved' && (
                        <VerifIcon className={`size-3 ${verif.color}`} strokeWidth={1.5} aria-label={verif.label} />
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Photo upload button */}
                      {isUploading ? (
                        <Loader2 className="size-3 text-[var(--stage-text-tertiary)] animate-spin" strokeWidth={1.5} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/png,image/jpeg,image/webp';
                            input.onchange = (e) => {
                              const f = (e.target as HTMLInputElement).files?.[0];
                              if (f) handlePhotoUpload(item.id, f);
                            };
                            input.click();
                          }}
                          className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-[opacity,color] focus:outline-none"
                          aria-label={`Upload photo for ${item.name}`}
                        >
                          <Camera className="size-3" strokeWidth={1.5} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-[opacity,color] focus:outline-none"
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="size-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      ))}

      {/* Add form with catalog typeahead */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--stage-edge-subtle)]">
              <div className="flex gap-2">
                {/* Category selector */}
                <div className="relative shrink-0">
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value as EquipmentCategory)}
                    className="appearance-none text-xs bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)] pl-2.5 pr-6 py-1.5 text-[var(--stage-text-primary)] outline-none focus-visible:border-[oklch(1_0_0/0.15)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-[var(--stage-text-tertiary)] pointer-events-none" strokeWidth={1.5} />
                </div>
                {/* Hybrid search input */}
                <div className="relative flex-1" ref={dropdownRef}>
                  <input
                    autoFocus
                    type="text"
                    value={addName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => { if (catalogResults.length > 0) setShowDropdown(true); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { setShowDropdown(false); handleAdd(); }
                      if (e.key === 'Escape') { setAddOpen(false); setAddName(''); setSelectedCatalogId(null); setCatalogResults([]); }
                    }}
                    placeholder="Search catalog or type name"
                    className="w-full text-xs bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)] px-2.5 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[oklch(1_0_0/0.15)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  />
                  {/* Catalog linked indicator */}
                  {selectedCatalogId && (
                    <Link2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-[var(--color-unusonic-success)]" strokeWidth={1.5} />
                  )}

                  {/* Typeahead dropdown */}
                  {showDropdown && (
                    <div
                      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-[var(--stage-edge-subtle)] shadow-lg overflow-hidden"
                      style={{ background: 'var(--ctx-dropdown, var(--stage-surface-raised))' }}
                    >
                      <div className="max-h-[160px] overflow-y-auto">
                        {catalogResults.map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            onClick={() => selectCatalogItem(match)}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                          >
                            <Link2 className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
                            <span className="text-[var(--stage-text-primary)] truncate">{match.name}</span>
                            {match.category && (
                              <span className="stage-label text-[var(--stage-text-tertiary)] shrink-0 ml-auto">{match.category}</span>
                            )}
                          </button>
                        ))}
                        {/* Custom entry option */}
                        {addName.trim().length >= 2 && (
                          <button
                            type="button"
                            onClick={selectCustom}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-[oklch(1_0_0/0.08)] transition-colors border-t border-[var(--stage-edge-subtle)]"
                          >
                            <Plus className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
                            <span className="text-[var(--stage-text-secondary)]">
                              Add as custom: <span className="text-[var(--stage-text-primary)] font-medium">{addName.trim()}</span>
                            </span>
                          </button>
                        )}
                        {searching && (
                          <p className="px-3 py-2 text-xs text-[var(--stage-text-tertiary)]">Searching catalog...</p>
                        )}
                        {!searching && catalogResults.length === 0 && addName.trim().length >= 2 && (
                          <p className="px-3 py-2 text-xs text-[var(--stage-text-tertiary)]">No catalog matches</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setAddOpen(false); setAddName(''); setSelectedCatalogId(null); setCatalogResults([]); }}
                  className="stage-label text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!addName.trim() || adding}
                  className="stage-label font-medium text-[var(--stage-text-primary)] hover:text-[var(--stage-accent)] transition-colors focus:outline-none disabled:opacity-45"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
