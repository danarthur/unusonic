'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, User, Globe, Mail, Phone, MapPin } from 'lucide-react';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const formStagger = STAGE_MEDIUM;
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { createGhostWithContact, createConnectionFromScout } from '../api/ghost-actions';
import type { ScoutResult } from '@/features/intelligence';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

export interface ScoutInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnrich: (data: ScoutResult) => void;
}

export interface GhostForgeSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  sourceOrgId: string;
  /** Aion scout input (injected from widget layer to respect FSD). Required when using scout mode. */
  ScoutInputComponent: React.ComponentType<ScoutInputProps>;
}

type RelType = 'vendor' | 'client' | 'venue' | 'partner';

const REL_TYPE_OPTIONS: { value: RelType; label: string }[] = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'client', label: 'Client' },
  { value: 'venue', label: 'Venue' },
  { value: 'partner', label: 'Partner' },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'Net 15', label: 'Net 15' },
  { value: 'Net 30', label: 'Net 30' },
  { value: '50% deposit', label: '50% deposit' },
  { value: 'Immediate', label: 'Immediate' },
];

const inputCls = 'stage-input h-11 rounded-xl';
const labelCls = 'block stage-label mb-1';
const selectCls =
  'stage-input h-11 w-full rounded-xl px-3 text-sm appearance-none';

/**
 * Ghost Forge – slide-over to capture new connection: org or person + primary contact.
 * On submit: creates ghost org (+ optional contact), links to source org, redirects to node detail.
 */
export function GhostForgeSheet({
  isOpen,
  onOpenChange,
  initialName,
  sourceOrgId,
  ScoutInputComponent,
}: GhostForgeSheetProps) {
  const router = useRouter();
  const [type, setType] = React.useState<'organization' | 'person'>('organization');
  const [name, setName] = React.useState(initialName);

  // Shared
  const [email, setEmail] = React.useState('');

  // Organization fields
  const [website, setWebsite] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [relType, setRelType] = React.useState<RelType>('vendor');
  const [w9Status, setW9Status] = React.useState(false);
  const [coiExpiry, setCoiExpiry] = React.useState('');
  const [paymentTerms, setPaymentTerms] = React.useState('');

  // Venue-specific (subset of organization)
  const [dockAddress, setDockAddress] = React.useState('');
  const [venuePmName, setVenuePmName] = React.useState('');
  const [venuePmPhone, setVenuePmPhone] = React.useState('');

  // Person fields
  const [phone, setPhone] = React.useState('');
  const [market, setMarket] = React.useState('');
  const [unionStatus, setUnionStatus] = React.useState('');

  const [scoutUrl, setScoutUrl] = React.useState('');
  const [mode, setMode] = React.useState<'scout' | 'manual'>('scout');
  const [isPending, startTransition] = useTransition();
  const [isScoutPending, startScoutTransition] = useTransition();

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setEmail('');
      setWebsite('');
      setContactName('');
      setRelType('vendor');
      setW9Status(false);
      setCoiExpiry('');
      setPaymentTerms('');
      setDockAddress('');
      setVenuePmName('');
      setVenuePmPhone('');
      setPhone('');
      setMarket('');
      setUnionStatus('');
      setScoutUrl('');
    }
  }, [isOpen, initialName]);

  const handleScoutApply = React.useCallback(
    (data: ScoutResult) => {
      startScoutTransition(async () => {
        const result = await createConnectionFromScout(sourceOrgId, data);
        if (result.success) {
          toast.success('Connection added. Details pulled from website.');
          onOpenChange(false);
          router.push(`/network?nodeId=${encodeURIComponent(result.relationshipId)}&kind=external_partner`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [sourceOrgId, onOpenChange, router]
  );

  const isSubmitDisabled =
    isPending ||
    (type === 'person'
      ? !name.trim() && !phone.trim()
      : !name.trim());

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createGhostWithContact(sourceOrgId, {
        type,
        name,
        // Person fields
        phone: type === 'person' ? phone.trim() || undefined : undefined,
        market: type === 'person' ? market.trim() || undefined : undefined,
        unionStatus: type === 'person' ? unionStatus.trim() || undefined : undefined,
        // Organization fields
        contactName: type === 'organization' ? contactName : undefined,
        website: type === 'organization' ? website.trim() || undefined : undefined,
        relationshipType: type === 'organization' ? relType : undefined,
        w9Status: type === 'organization' ? w9Status : undefined,
        coiExpiry: type === 'organization' ? coiExpiry.trim() || undefined : undefined,
        paymentTerms: type === 'organization' ? paymentTerms || undefined : undefined,
        // Venue-specific
        dockAddress:
          type === 'organization' && relType === 'venue' ? dockAddress.trim() || undefined : undefined,
        venuePmName:
          type === 'organization' && relType === 'venue' ? venuePmName.trim() || undefined : undefined,
        venuePmPhone:
          type === 'organization' && relType === 'venue' ? venuePmPhone.trim() || undefined : undefined,
        // Shared
        email: email.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Added.');
      onOpenChange(false);
      if (result.relationshipId) {
        router.push(`/network?nodeId=${encodeURIComponent(result.relationshipId)}&kind=external_partner`);
      }
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        data-surface="raised"
        className="flex w-full max-w-md flex-col border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0"
      >
        <SheetHeader className="flex-col items-stretch gap-2 border-b border-[oklch(1_0_0_/_0.08)] px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle>Add connection</SheetTitle>
            <SheetClose />
          </div>
          <p className="text-sm text-[var(--stage-text-secondary)]">
            Ask Aion to scout a website for details, or add them manually.
          </p>

          <div className="mt-4 flex gap-1 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] p-1">
            <button
              type="button"
              onClick={() => setMode('scout')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                mode === 'scout'
                  ? 'bg-[oklch(1_0_0/0.12)] text-[var(--stage-text-primary)] shadow-sm'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              )}
            >
              Aion
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                mode === 'manual'
                  ? 'bg-[oklch(1_0_0/0.12)] text-[var(--stage-text-primary)] shadow-sm'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              )}
            >
              Add manually
            </button>
          </div>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-6 px-6 pt-6 overflow-y-auto">
          {mode === 'scout' && (
            <motion.section
              className="rounded-2xl border border-[oklch(1_0_0_/_0.08)]/80 bg-[var(--ctx-well)] p-5 space-y-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={formStagger}
            >
              <div>
                <h3 className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">
                  Ask Aion to scout
                </h3>
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                  Paste a company website — Aion will pull the name, logo, and team so you don&apos;t have to type it.
                </p>
              </div>
              <ScoutInputComponent
                value={scoutUrl}
                onChange={setScoutUrl}
                onEnrich={handleScoutApply}
              />
              {isScoutPending && (
                <p className="stage-label text-[var(--stage-accent)]/90">
                  Creating connection…
                </p>
              )}
            </motion.section>
          )}

          {mode === 'manual' && (
            <>
              {/* Type toggle */}
              <div className="flex gap-1 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] p-1">
                <button
                  type="button"
                  onClick={() => setType('organization')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                    type === 'organization'
                      ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] shadow-sm'
                      : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  <Building2 className="size-4" />
                  Organization
                </button>
                <button
                  type="button"
                  onClick={() => setType('person')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                    type === 'person'
                      ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] shadow-sm'
                      : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  <User className="size-4" />
                  Person
                </button>
              </div>

              {/* ── PERSON FORM ─────────────────────────────────────── */}
              {type === 'person' && (
                <>
                  {/* Name */}
                  <div className="space-y-2">
                    <label className={labelCls}>Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className={cn(inputCls, 'h-12')}
                    />
                  </div>

                  {/* Phone -- most time-critical field for crew */}
                  <div className="space-y-2">
                    <label className={labelCls}>Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className={cn(inputCls, 'pl-10')}
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className={labelCls}>Email <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@example.com"
                        className={cn(inputCls, 'pl-10')}
                      />
                    </div>
                  </div>

                  {/* Market */}
                  <div className="space-y-2">
                    <label className={labelCls}>Market <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                      <Input
                        value={market}
                        onChange={(e) => setMarket(e.target.value)}
                        placeholder="Home market"
                        className={cn(inputCls, 'pl-10')}
                      />
                    </div>
                  </div>

                  {/* Union status */}
                  <div className="space-y-2">
                    <label className={labelCls}>Union status <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                    <Input
                      value={unionStatus}
                      onChange={(e) => setUnionStatus(e.target.value)}
                      placeholder="e.g. IATSE Local 33 or Non-union"
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              {/* ── ORGANIZATION FORM ────────────────────────────────── */}
              {type === 'organization' && (
                <>
                  {/* Name */}
                  <div className="space-y-2">
                    <label className={labelCls}>Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Acme Corp"
                      className={cn(inputCls, 'h-12')}
                    />
                  </div>

                  {/* Relationship type -- required */}
                  <div className="space-y-2">
                    <label className={labelCls}>Relationship type</label>
                    <select
                      value={relType}
                      onChange={(e) => setRelType(e.target.value as RelType)}
                      className={selectCls}
                    >
                      {REL_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Website */}
                  <div className="space-y-2">
                    <label className={labelCls}>Website <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                      <Input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="example.com"
                        className={cn(inputCls, 'pl-10')}
                      />
                    </div>
                  </div>

                  {/* Primary contact */}
                  <div className="space-y-3 border-t border-[oklch(1_0_0_/_0.08)] pt-4">
                    <span className={cn(labelCls, 'block mb-2')}>Primary contact <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></span>
                    <Input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Contact name"
                      className={inputCls}
                    />
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@example.com"
                        className={cn(inputCls, 'pl-10')}
                      />
                    </div>
                  </div>

                  {/* Compliance fields */}
                  <div className="space-y-3 border-t border-[oklch(1_0_0_/_0.08)] pt-4">
                    <span className={cn(labelCls, 'block mb-2')}>Compliance</span>

                    {/* W-9 checkbox */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={w9Status}
                        onChange={(e) => setW9Status(e.target.checked)}
                        className="h-4 w-4 rounded border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.05)] accent-[var(--stage-accent)]"
                      />
                      <span className="text-sm text-[var(--stage-text-secondary)]">W-9 on file</span>
                    </label>

                    {/* COI expiry */}
                    <div className="space-y-1.5">
                      <label className={labelCls}>COI expires <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                      <input
                        type="date"
                        value={coiExpiry}
                        onChange={(e) => setCoiExpiry(e.target.value)}
                        className={cn(selectCls, 'text-sm')}
                      />
                    </div>

                    {/* Payment terms */}
                    <div className="space-y-1.5">
                      <label className={labelCls}>Payment terms <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className={selectCls}
                      >
                        {PAYMENT_TERMS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Venue-specific fields -- shown only when relType === 'venue' */}
                  <AnimatePresence>
                    {relType === 'venue' && (
                      <motion.div
                        key="venue-fields"
                        className="space-y-3 border-t border-[oklch(1_0_0_/_0.08)] pt-4"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                      >
                        <span className={cn(labelCls, 'block mb-2')}>Venue ops</span>

                        {/* Dock address */}
                        <div className="space-y-1.5">
                          <label className={labelCls}>Dock address <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                          <Input
                            value={dockAddress}
                            onChange={(e) => setDockAddress(e.target.value)}
                            placeholder="Truck entrance / loading dock address"
                            className={inputCls}
                          />
                        </div>

                        {/* House PM name */}
                        <div className="space-y-1.5">
                          <label className={labelCls}>House PM name <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                          <Input
                            value={venuePmName}
                            onChange={(e) => setVenuePmName(e.target.value)}
                            placeholder="House production manager"
                            className={inputCls}
                          />
                        </div>

                        {/* House PM phone */}
                        <div className="space-y-1.5">
                          <label className={labelCls}>House PM phone <span className="normal-case tracking-normal text-[var(--stage-text-secondary)]/60">(optional)</span></label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--stage-text-secondary)]" />
                            <Input
                              type="tel"
                              value={venuePmPhone}
                              onChange={(e) => setVenuePmPhone(e.target.value)}
                              placeholder="Direct cell"
                              className={cn(inputCls, 'pl-10')}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </>
          )}
        </SheetBody>

        {mode === 'manual' && (
          <div className="shrink-0 border-t border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)] px-6 py-5">
            <Button
              className="h-12 w-full rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/30"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {isPending ? 'Adding…' : 'Add & open'}
            </Button>
            <p className="mt-3 text-center stage-label">
              You can add notes and details next.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
