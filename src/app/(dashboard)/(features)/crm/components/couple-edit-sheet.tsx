'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody, SheetFooter } from '@/shared/ui/sheet';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { Button } from '@/shared/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateCoupleEntity } from '../actions/update-couple-entity';
import { cn } from '@/shared/lib/utils';

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
  onChangeType?: (newType: 'company' | 'person') => Promise<void>;
};

export function CoupleEditSheet({ open, onOpenChange, entityId, initialValues, onSaved, onChangeType }: CoupleEditSheetProps) {
  const [partnerAFirst, setPartnerAFirst] = useState(initialValues.partnerAFirst);
  const [partnerALast, setPartnerALast] = useState(initialValues.partnerALast);
  const [partnerAEmail, setPartnerAEmail] = useState(initialValues.partnerAEmail ?? '');
  const [partnerBFirst, setPartnerBFirst] = useState(initialValues.partnerBFirst);
  const [partnerBLast, setPartnerBLast] = useState(initialValues.partnerBLast);
  const [partnerBEmail, setPartnerBEmail] = useState(initialValues.partnerBEmail ?? '');
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [displayNameMode, setDisplayNameMode] = useState<'auto' | 'manual'>('auto');
  const [saving, setSaving] = useState(false);
  const [changingType, setChangingType] = useState<string | null>(null);

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
  }, [open]);  

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
      <SheetContent side="center" className="flex flex-col max-w-sm p-0">
        <SheetHeader>
          <SheetTitle>Edit couple</SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {/* Partner A */}
          <div>
            <p className="stage-label mb-3">Partner A</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput label="First name" value={partnerAFirst} onChange={(e) => setPartnerAFirst(e.target.value)} />
                <FloatingLabelInput label="Last name" value={partnerALast} onChange={(e) => setPartnerALast(e.target.value)} />
              </div>
              <FloatingLabelInput label="Email (optional)" type="email" value={partnerAEmail} onChange={(e) => setPartnerAEmail(e.target.value)} />
            </div>
          </div>

          {/* Partner B */}
          <div>
            <p className="stage-label mb-3">Partner B</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput label="First name" value={partnerBFirst} onChange={(e) => setPartnerBFirst(e.target.value)} />
                <FloatingLabelInput label="Last name" value={partnerBLast} onChange={(e) => setPartnerBLast(e.target.value)} />
              </div>
              <FloatingLabelInput label="Email (optional)" type="email" value={partnerBEmail} onChange={(e) => setPartnerBEmail(e.target.value)} />
            </div>
          </div>

          {/* Display name */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="stage-label">Display name</p>
              {displayNameMode === 'auto' && (
                <span className="rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-2 py-0.5 text-label text-[var(--stage-text-secondary)]">
                  auto
                </span>
              )}
              {displayNameMode === 'manual' && (
                <button
                  type="button"
                  onClick={() => setDisplayNameMode('auto')}
                  className="rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] px-2 py-0.5 text-label text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
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
            />
          </div>
          {onChangeType && (
            <div className="pt-4 border-t border-[oklch(1_0_0_/_0.10)] space-y-2">
              <p className="stage-label">Client type</p>
              <p className="text-xs text-[var(--stage-text-secondary)]/70">Switch if this client was entered as the wrong type.</p>
              <div className="flex gap-2">
                {([['company', 'Company'], ['person', 'Individual']] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    disabled={!!changingType || saving}
                    onClick={async () => {
                      setChangingType(type);
                      await onChangeType(type);
                      setChangingType(null);
                      onOpenChange(false);
                    }}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                      'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] disabled:opacity-45'
                    )}
                  >
                    {changingType === type ? <Loader2 className="size-3 animate-spin inline mr-1" /> : null}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="silk" onClick={handleSave} disabled={saving || !!changingType} className="h-11 w-full rounded-xl">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
