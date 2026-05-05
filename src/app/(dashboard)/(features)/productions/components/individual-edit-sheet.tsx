'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody, SheetFooter } from '@/shared/ui/sheet';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { Button } from '@/shared/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateIndividualEntity } from '../actions/update-individual-entity';
import { cn } from '@/shared/lib/utils';

type IndividualEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  initialValues: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    displayName: string;
  };
  onSaved?: () => void;
  onChangeType?: (newType: 'company' | 'couple') => Promise<void>;
};

export function IndividualEditSheet({ open, onOpenChange, entityId, initialValues, onSaved, onChangeType }: IndividualEditSheetProps) {
  const [firstName, setFirstName] = useState(initialValues.firstName);
  const [lastName, setLastName] = useState(initialValues.lastName);
  const [email, setEmail] = useState(initialValues.email ?? '');
  const [phone, setPhone] = useState(initialValues.phone ?? '');
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [saving, setSaving] = useState(false);
  const [changingType, setChangingType] = useState<string | null>(null);

  // Sync state when sheet opens with new values
  useEffect(() => {
    if (open) {
      setFirstName(initialValues.firstName);
      setLastName(initialValues.lastName);
      setEmail(initialValues.email ?? '');
      setPhone(initialValues.phone ?? '');
      setDisplayName(initialValues.displayName);
    }
  }, [open]);  

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error('Display name is required.');
      return;
    }
    setSaving(true);
    const result = await updateIndividualEntity({
      entityId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      displayName: displayName.trim(),
    });
    setSaving(false);
    if (result.success) {
      toast.success('Client updated.');
      onOpenChange(false);
      onSaved?.();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="flex flex-col w-full max-w-md p-0">
        <SheetHeader>
          <SheetTitle>Edit client</SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          <div className="space-y-3">
            <p className="stage-label">Name</p>
            <div className="grid grid-cols-2 gap-3">
              <FloatingLabelInput label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <FloatingLabelInput label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-3">
            <p className="stage-label">Contact</p>
            <FloatingLabelInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FloatingLabelInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-3">
            <p className="stage-label">Display name</p>
            <FloatingLabelInput
              label="How they appear in the app"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {onChangeType && (
            <div className="pt-4 border-t border-[oklch(1_0_0_/_0.10)] space-y-2">
              <p className="stage-label">Client type</p>
              <p className="text-xs text-[var(--stage-text-secondary)]/70">Switch if this client was entered as the wrong type.</p>
              <div className="flex gap-2">
                {([['company', 'Company'], ['couple', 'Pair']] as const).map(([type, label]) => (
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
