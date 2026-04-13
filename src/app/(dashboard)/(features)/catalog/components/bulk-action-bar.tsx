'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, ArchiveRestore, Percent, X, Check, Receipt, ReceiptText } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

export interface BulkActionBarProps {
  selectedCount: number;
  onArchive: () => void;
  onRestore: () => void;
  onAdjustPrice: (percent: number) => void;
  onSetTaxable: (taxable: boolean) => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onArchive,
  onRestore,
  onAdjustPrice,
  onSetTaxable,
  onClearSelection,
}: BulkActionBarProps) {
  const [priceMode, setPriceMode] = useState(false);
  const [priceInput, setPriceInput] = useState('');

  const handlePriceConfirm = () => {
    const val = Number(priceInput);
    if (Number.isFinite(val) && val !== 0) {
      onAdjustPrice(val);
    }
    setPriceMode(false);
    setPriceInput('');
  };

  const handlePriceCancel = () => {
    setPriceMode(false);
    setPriceInput('');
  };

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={STAGE_MEDIUM}
          className="stage-panel bg-[var(--stage-surface-elevated)] rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.12)] px-4 py-2.5 flex items-center gap-3 flex-wrap"
        >
          {/* Count */}
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums whitespace-nowrap">
            {selectedCount} selected
          </span>

          <div className="w-px h-5 bg-[oklch(1_0_0_/_0.10)]" />

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <ActionButton icon={Archive} label="Archive" onClick={onArchive} />
            <ActionButton icon={ArchiveRestore} label="Restore" onClick={onRestore} />

            {/* Adjust price */}
            {priceMode ? (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="text"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="+10 or -5"
                  className="w-20 px-2 py-1.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] text-xs tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePriceConfirm();
                    if (e.key === 'Escape') handlePriceCancel();
                  }}
                />
                <span className="text-xs text-[var(--stage-text-secondary)]">%</span>
                <button
                  type="button"
                  onClick={handlePriceConfirm}
                  className="p-1.5 rounded-[var(--stage-radius-nested)] text-[var(--color-unusonic-success)] hover:bg-[oklch(1_0_0_/_0.05)]"
                  aria-label="Confirm price adjustment"
                >
                  <Check size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={handlePriceCancel}
                  className="p-1.5 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)]"
                  aria-label="Cancel"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <ActionButton icon={Percent} label="Adjust price" onClick={() => setPriceMode(true)} />
            )}

            <ActionButton icon={Receipt} label="Set taxable" onClick={() => onSetTaxable(true)} />
            <ActionButton icon={ReceiptText} label="Set non-taxable" onClick={() => onSetTaxable(false)} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Clear */}
          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
          >
            <X size={14} strokeWidth={1.5} />
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Shared action button ─── */

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
        'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
      )}
    >
      <Icon size={14} strokeWidth={1.5} />
      {label}
    </button>
  );
}
