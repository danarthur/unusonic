'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import { getPackages } from '../api/proposal-actions';
import { createPackage, updatePackage } from '../api/package-actions';
import type { Package } from '@/types/supabase';
import type { PackageCategory } from '../api/package-actions';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

const CATEGORIES: { value: PackageCategory; label: string }[] = [
  { value: 'package', label: 'Package (Bundle of items)' },
  { value: 'service', label: 'Service (Labor/Time)' },
  { value: 'rental', label: 'Rental (Hard goods that return)' },
  { value: 'talent', label: 'Talent (Specific people)' },
  { value: 'retail_sale', label: 'Retail/Sale (Items that don\'t return)' },
  { value: 'fee', label: 'Fee (Admin/Travel/Taxes)' },
];

export type PackageManagerProps = {
  workspaceId: string;
  onPackagesUpdated?: () => void;
  className?: string;
};

export function PackageManager({
  workspaceId,
  onPackagesUpdated,
  className,
}: PackageManagerProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PackageCategory>('package');
  const [price, setPrice] = useState('');
  const [floorPrice, setFloorPrice] = useState('');
  const [targetCost, setTargetCost] = useState('');

  const loadPackages = useCallback(async () => {
    if (!workspaceId) {
      setPackages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getPackages(workspaceId);
    setPackages(result.packages ?? []);
    setError(result.error ?? null);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCategory('package');
    setPrice('');
    setFloorPrice('');
    setTargetCost('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setName(pkg.name);
    setDescription(pkg.description ?? '');
    setCategory((pkg.category as PackageCategory) ?? 'package');
    setPrice(String(Number(pkg.price)));
    setFloorPrice(pkg.floor_price != null ? String(Number(pkg.floor_price)) : '');
    setTargetCost(pkg.target_cost != null ? String(Number(pkg.target_cost)) : '');
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nameTrim = name.trim();
    if (!nameTrim) {
      setFormError('Name is required.');
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFormError('Price must be a non-negative number.');
      return;
    }
    setSaving(true);
    const isPackage = category === 'package';
    const floorPriceValue = isPackage ? null : (floorPrice.trim() ? (Number(floorPrice) || null) : null);
    const targetCostValue = isPackage ? null : (targetCost.trim() ? (Number(targetCost) || null) : null);
    if (editingId) {
      const result = await updatePackage(editingId, {
        name: nameTrim,
        description: description.trim() || null,
        category,
        price: priceNum,
        floor_price: floorPriceValue,
        target_cost: targetCostValue,
      });
      if (result.error) {
        setFormError(result.error);
        setSaving(false);
        return;
      }
    } else {
      const result = await createPackage(workspaceId, {
        name: nameTrim,
        description: description.trim() || null,
        category,
        price: priceNum,
        floor_price: floorPriceValue,
        target_cost: targetCostValue,
      });
      if (result.error) {
        setFormError(result.error);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    closeModal();
    await loadPackages();
    onPackagesUpdated?.();
  };

  return (
    <>
      <LiquidPanel className={cn('p-6 rounded-[28px]', className)}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Packages
          </h2>
          <motion.button
            type="button"
            onClick={openCreate}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={SIGNAL_PHYSICS}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-border)] text-sm font-medium text-ceramic hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Plus size={16} aria-hidden />
            Add package
          </motion.button>
        </div>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-[var(--color-signal-error)]">{error}</p>
        ) : packages.length === 0 ? (
          <p className="text-sm text-ink-muted">No packages yet. Add one to use in proposals.</p>
        ) : (
          <ul className="space-y-2">
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-[var(--glass-border)] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ceramic truncate">{pkg.name}</p>
                  <p className="text-xs text-ink-muted">
                    {pkg.category} · ${Number(pkg.price).toLocaleString()}
                  </p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => openEdit(pkg)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SIGNAL_PHYSICS}
                  className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  aria-label={`Edit ${pkg.name}`}
                >
                  <Pencil size={16} aria-hidden />
                </motion.button>
              </li>
            ))}
          </ul>
        )}
      </LiquidPanel>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit package' : 'New package'}</DialogTitle>
            <DialogClose className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5" />
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pb-6">
            {formError && (
              <p className="text-sm text-[var(--color-signal-error)]">{formError}</p>
            )}
            <div>
              <label htmlFor="pkg-name" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Name
              </label>
              <input
                id="pkg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="e.g. Full Production Package"
                required
              />
            </div>
            <div>
              <label htmlFor="pkg-desc" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Description (optional)
              </label>
              <textarea
                id="pkg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                placeholder="Brief description"
              />
            </div>
            <div>
              <label htmlFor="pkg-category" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                Category
              </label>
              <select
                id="pkg-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PackageCategory)}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ceramic text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={cn('grid gap-4', category === 'package' ? 'grid-cols-1' : 'grid-cols-2')}>
              <div className={cn(category === 'package' && 'col-span-2')}>
                <label htmlFor="pkg-price" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                  Price
                </label>
                <CurrencyInput
                  id="pkg-price"
                  value={price}
                  onChange={setPrice}
                  placeholder="0.00"
                  required
                />
              </div>
              {category !== 'package' && (
                <>
                  <div>
                    <label htmlFor="pkg-floor-price" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                      Floor price (optional)
                    </label>
                    <CurrencyInput
                      id="pkg-floor-price"
                      value={floorPrice}
                      onChange={setFloorPrice}
                      placeholder="Lowest acceptable"
                    />
                  </div>
                  <div>
                    <label htmlFor="pkg-target-cost" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
                      Target cost (optional)
                    </label>
                    <CurrencyInput
                      id="pkg-target-cost"
                      value={targetCost}
                      onChange={setTargetCost}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:bg-[var(--color-neon-amber)]/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
