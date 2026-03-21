'use client';

import { useState } from 'react';
import { useTransition } from 'react';
import { Building2, Mail, User } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createGhostWithContact } from '@/features/network-data';
import { linkDealToClient } from '../actions/link-deal-client';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

type CreateClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  sourceOrgId: string;
  dealId: string;
  onSuccess: () => void;
};

/**
 * Minimal Ghost Forge for Deal Room: org name + main contact name/email.
 * Creates ghost org + optional contact, links to deal, then closes and refetches.
 */
export function CreateClientDialog({
  open,
  onOpenChange,
  initialName,
  sourceOrgId,
  dealId,
  onSuccess,
}: CreateClientDialogProps) {
  const [name, setName] = useState(initialName);
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();

  if (open && name !== initialName) setName(initialName);

  const handleSubmit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createGhostWithContact(sourceOrgId, {
        type: 'organization',
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const linkResult = await linkDealToClient(
        dealId,
        result.organizationId,
        result.mainContactId ?? null
      );
      if (!linkResult.success) {
        toast.error(linkResult.error);
        return;
      }
      toast.success(`Added ${name.trim()} and linked to this deal.`);
      onOpenChange(false);
      onSuccess();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        className={cn(
          'flex w-full max-w-md flex-col border-l border-[var(--color-mercury)]',
          'bg-[var(--color-glass-surface)] backdrop-blur-xl p-0'
        )}
      >
        <SheetHeader className="flex-col items-stretch gap-2 border-b border-[var(--color-mercury)] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="text-xl font-light tracking-tight text-[var(--color-ink)]">
              Create client
            </SheetTitle>
            <SheetClose />
          </div>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Add this organization to your Network and link it to this deal.
          </p>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5 px-6 py-6 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              Organization name
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Red Bull North America"
                className="h-12 rounded-xl border-[var(--color-mercury)] bg-white/5 pl-10 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              Main contact name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="h-11 rounded-xl border-[var(--color-mercury)] bg-white/5 pl-10 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
              Contact email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@example.com"
                className="h-11 rounded-xl border-[var(--color-mercury)] bg-white/5 pl-10 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]"
              />
            </div>
          </div>
        </SheetBody>

        <div className="shrink-0 border-t border-[var(--color-mercury)] bg-[var(--color-obsidian)]/20 px-6 py-5">
          <Button
            className="h-12 w-full rounded-xl bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/30"
            onClick={handleSubmit}
            disabled={!name.trim() || isPending}
          >
            {isPending ? 'Creating…' : `Create "${name.trim() || 'client'}" and link`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
