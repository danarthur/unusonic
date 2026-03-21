'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody, SheetFooter } from '@/shared/ui/sheet';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { Button } from '@/shared/ui/button';
import { toast } from 'sonner';
import { updateIndividualEntity } from '../actions/update-individual-entity';

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
};

export function IndividualEditSheet({ open, onOpenChange, entityId, initialValues, onSaved }: IndividualEditSheetProps) {
  const [firstName, setFirstName] = useState(initialValues.firstName);
  const [lastName, setLastName] = useState(initialValues.lastName);
  const [email, setEmail] = useState(initialValues.email ?? '');
  const [phone, setPhone] = useState(initialValues.phone ?? '');
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [saving, setSaving] = useState(false);

  // Sync state when sheet opens with new values
  useEffect(() => {
    if (open) {
      setFirstName(initialValues.firstName);
      setLastName(initialValues.lastName);
      setEmail(initialValues.email ?? '');
      setPhone(initialValues.phone ?? '');
      setDisplayName(initialValues.displayName);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <p className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">Name</p>
            <div className="grid grid-cols-2 gap-3">
              <FloatingLabelInput label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <FloatingLabelInput label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">Contact</p>
            <FloatingLabelInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FloatingLabelInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">Display name</p>
            <FloatingLabelInput
              label="How they appear in the app"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="silk" onClick={handleSave} disabled={saving} className="h-11 w-full rounded-xl">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
