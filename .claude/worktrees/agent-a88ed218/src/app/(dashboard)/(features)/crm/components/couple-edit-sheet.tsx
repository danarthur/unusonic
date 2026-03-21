'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { Button } from '@/shared/ui/button';
import { toast } from 'sonner';
import { updateCoupleEntity } from '../actions/update-couple-entity';

type CoupleEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  initialValues: {
    partnerAFirst: string;
    partnerALast: string;
    partnerAEmail?: string | null;
    partnerBFirst: string;
    partnerBLast: string;
    partnerBEmail?: string | null;
    displayName: string;
  };
  onSaved?: () => void;
};

export function CoupleEditSheet({ open, onOpenChange, entityId, initialValues, onSaved }: CoupleEditSheetProps) {
  const [partnerAFirst, setPartnerAFirst] = useState(initialValues.partnerAFirst);
  const [partnerALast, setPartnerALast] = useState(initialValues.partnerALast);
  const [partnerAEmail, setPartnerAEmail] = useState(initialValues.partnerAEmail ?? '');
  const [partnerBFirst, setPartnerBFirst] = useState(initialValues.partnerBFirst);
  const [partnerBLast, setPartnerBLast] = useState(initialValues.partnerBLast);
  const [partnerBEmail, setPartnerBEmail] = useState(initialValues.partnerBEmail ?? '');
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [displayNameMode, setDisplayNameMode] = useState<'auto' | 'manual'>('auto');
  const [saving, setSaving] = useState(false);

  // Re-sync when initialValues change (sheet reopened with fresh data)
  useEffect(() => {
    if (open) {
      setPartnerAFirst(initialValues.partnerAFirst);
      setPartnerALast(initialValues.partnerALast);
      setPartnerAEmail(initialValues.partnerAEmail ?? '');
      setPartnerBFirst(initialValues.partnerBFirst);
      setPartnerBLast(initialValues.partnerBLast);
      setPartnerBEmail(initialValues.partnerBEmail ?? '');
      setDisplayName(initialValues.displayName);
      setDisplayNameMode('auto');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate display name
  useEffect(() => {
    if (displayNameMode !== 'auto') return;
    if (!partnerAFirst && !partnerBFirst) { setDisplayName(''); return; }
    const sameLast = partnerALast && partnerBLast && partnerALast.trim().toLowerCase() === partnerBLast.trim().toLowerCase();
    if (sameLast) {
      setDisplayName(`${partnerAFirst} & ${partnerBFirst} ${partnerALast}`.trim());
    } else {
      const a = [partnerAFirst, partnerALast].filter(Boolean).join(' ');
      const b = [partnerBFirst, partnerBLast].filter(Boolean).join(' ');
      setDisplayName([a, b].filter(Boolean).join(' & '));
    }
  }, [partnerAFirst, partnerALast, partnerBFirst, partnerBLast, displayNameMode]);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateCoupleEntity({
      entityId,
      partnerAFirst: partnerAFirst.trim(),
      partnerALast: partnerALast.trim(),
      partnerAEmail: partnerAEmail.trim() || null,
      partnerBFirst: partnerBFirst.trim(),
      partnerBLast: partnerBLast.trim(),
      partnerBEmail: partnerBEmail.trim() || null,
      displayName: displayName.trim() || `${partnerAFirst} & ${partnerBFirst}`.trim() || 'Couple',
    });
    setSaving(false);
    if (result.success) {
      toast.success('Couple details saved.');
      onSaved?.();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0">
        <SheetHeader className="border-b border-white/10 px-6 py-5">
          <SheetTitle className="text-ceramic font-medium tracking-tight">Edit couple</SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5 px-6 py-5 overflow-y-auto">
          {/* Partner A */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-3">Partner A</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput
                  label="First name"
                  value={partnerAFirst}
                  onChange={(e) => setPartnerAFirst(e.target.value)}
                  className="bg-white/5 border-[var(--color-mercury)]"
                />
                <FloatingLabelInput
                  label="Last name"
                  value={partnerALast}
                  onChange={(e) => setPartnerALast(e.target.value)}
                  className="bg-white/5 border-[var(--color-mercury)]"
                />
              </div>
              <FloatingLabelInput
                label="Email (optional)"
                type="email"
                value={partnerAEmail}
                onChange={(e) => setPartnerAEmail(e.target.value)}
                className="bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
          </div>

          {/* Partner B */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-3">Partner B</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput
                  label="First name"
                  value={partnerBFirst}
                  onChange={(e) => setPartnerBFirst(e.target.value)}
                  className="bg-white/5 border-[var(--color-mercury)]"
                />
                <FloatingLabelInput
                  label="Last name"
                  value={partnerBLast}
                  onChange={(e) => setPartnerBLast(e.target.value)}
                  className="bg-white/5 border-[var(--color-mercury)]"
                />
              </div>
              <FloatingLabelInput
                label="Email (optional)"
                type="email"
                value={partnerBEmail}
                onChange={(e) => setPartnerBEmail(e.target.value)}
                className="bg-white/5 border-[var(--color-mercury)]"
              />
            </div>
          </div>

          {/* Display name */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Display name</p>
              {displayNameMode === 'auto' && (
                <span className="rounded-full border border-[var(--color-mercury)] bg-white/5 px-2 py-0.5 text-[10px] text-ink-muted">
                  auto
                </span>
              )}
              {displayNameMode === 'manual' && (
                <button
                  type="button"
                  onClick={() => setDisplayNameMode('auto')}
                  className="rounded-full border border-[var(--color-mercury)] bg-white/5 px-2 py-0.5 text-[10px] text-ink-muted hover:text-ink transition-colors"
                >
                  reset to auto
                </button>
              )}
            </div>
            <FloatingLabelInput
              label="Display name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDisplayNameMode('manual');
              }}
              className="bg-white/5 border-[var(--color-mercury)]"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/30"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
