/**
 * PackageSelector — Add from Catalog (Deal-specific).
 * Fetches master packages; on select, parent does a deep copy into proposal line items.
 * Used in ProposalBuilder (Sales Lens).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { getPackages } from '../api/proposal-actions';
import type { Package } from '@/types/supabase';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';

export type PackageSelectorProps = {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (pkg: Package) => void;
};

export function PackageSelector({
  workspaceId,
  open,
  onClose,
  onSelect,
}: PackageSelectorProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    if (!workspaceId) {
      setPackages([]);
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
    if (open && workspaceId) loadPackages();
  }, [open, workspaceId, loadPackages]);

  const handleSelect = (pkg: Package) => {
    onSelect(pkg);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader>
          <SheetTitle>Add from catalog</SheetTitle>
          <SheetClose className="p-2 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/5" />
        </SheetHeader>
        <SheetBody>
          <p className="text-xs text-ink-muted mb-4">
            Select a master package. Its data is copied into this proposal (changes here do not affect the catalog).
          </p>
          {loading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : error ? (
            <p className="text-sm text-[var(--color-signal-error)]">{error}</p>
          ) : packages.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No packages yet. Add master packages in Catalog.
            </p>
          ) : (
            <ul className="space-y-2">
              {packages.map((pkg) => (
                <motion.li
                  key={pkg.id}
                  layout
                  transition={SIGNAL_PHYSICS}
                  className="flex items-center gap-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/40 p-4 hover:border-[var(--glass-border-hover)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ceramic truncate text-sm">{pkg.name}</p>
                    {pkg.description && (
                      <p className="text-xs text-ink-muted truncate mt-0.5">{pkg.description}</p>
                    )}
                    <p className="text-sm font-semibold text-ceramic mt-1">
                      ${Number(pkg.price).toLocaleString()}
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => handleSelect(pkg)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={SIGNAL_PHYSICS}
                    className="shrink-0 p-2.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    aria-label={`Add ${pkg.name} to proposal`}
                  >
                    <Plus size={18} />
                  </motion.button>
                </motion.li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
