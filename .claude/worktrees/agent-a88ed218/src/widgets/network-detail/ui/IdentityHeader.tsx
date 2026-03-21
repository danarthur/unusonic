'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  Send,
  FileEdit,
  ShieldCheck,
  Building2,
  User,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SummonPartnerModal } from './SummonPartnerModal';
import type { NodeDetail } from '@/features/network-data';

interface IdentityHeaderProps {
  details: NodeDetail;
  sourceOrgId: string;
  onSummonSuccess?: () => void;
}

const directionConfig = {
  vendor: {
    icon: ArrowDownRight,
    label: 'Vendor',
    sub: 'Out',
    className: 'bg-[var(--color-signal-warning)]/15 text-[var(--color-signal-warning)] border-[var(--color-signal-warning)]/30',
  },
  client: {
    icon: ArrowUpRight,
    label: 'Client',
    sub: 'In',
    className: 'bg-[var(--color-signal-success)]/15 text-[var(--color-signal-success)] border-[var(--color-signal-success)]/30',
  },
  partner: {
    icon: ArrowLeftRight,
    label: 'Partner',
    sub: 'Both',
    className: 'bg-[var(--color-signal-info)]/15 text-[var(--color-signal-info)] border-[var(--color-signal-info)]/30',
  },
} as const;

/** Compact identity block: avatar, badge, meta, direction, invite. Name lives in sheet header. */
export function IdentityHeader({
  details,
  sourceOrgId,
  onSummonSuccess,
}: IdentityHeaderProps) {
  const [summonOpen, setSummonOpen] = React.useState(false);
  const isPartner = details.kind === 'external_partner';
  const isGhost = details.isGhost && details.targetOrgId;
  const dir = details.direction ? directionConfig[details.direction] : null;
  const Icon = dir?.icon ?? (isPartner ? Building2 : User);

  const avatarUrl =
    (isPartner && (details.orgLogoUrl ?? details.identity.avatarUrl)) ||
    details.identity.avatarUrl ||
    null;
  const initial = (details.identity.name?.[0] ?? '?').toUpperCase();
  const slug = isPartner ? details.orgSlug : null;
  const brandColor = isPartner ? details.orgBrandColor : null;

  return (
    <div className="relative px-4 py-4 md:px-5 md:py-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            brandColor && typeof brandColor === 'string'
              ? `linear-gradient(to bottom, ${brandColor}12, transparent 50%)`
              : `linear-gradient(to bottom, var(--color-silk) 0.04, transparent 50%)`,
        }}
      />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <motion.div
            layoutId={`node-${details.id}-avatar`}
            className={cn(
              'relative size-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden',
              'border border-[var(--color-mercury)] bg-[var(--color-glass-surface)]'
            )}
          >
            {avatarUrl ? (
              <>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(248,250,252,0.7) 0%, rgba(226,232,240,0.4) 50%, transparent 100%)',
                  }}
                  aria-hidden
                />
                <img
                  src={avatarUrl}
                  alt=""
                  className="relative z-10 size-full object-contain p-1.5"
                />
              </>
            ) : (
              <span className="text-2xl font-light text-[var(--color-ink-muted)]">{initial}</span>
            )}
          </motion.div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isPartner && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest',
                    isGhost
                      ? 'border-[var(--color-silk)]/40 bg-[var(--color-silk)]/10 text-[var(--color-silk)]'
                      : 'border-[var(--color-signal-success)]/40 bg-[var(--color-signal-success)]/10 text-[var(--color-signal-success)]'
                  )}
                >
                  {isGhost ? <FileEdit className="size-2.5" /> : <ShieldCheck className="size-2.5" />}
                  {isGhost ? 'Internal' : 'Verified'}
                </span>
              )}
              {details.identity.label && (
                <span className="text-xs text-[var(--color-ink-muted)]">{details.identity.label}</span>
              )}
            </div>
            {slug && (
              <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">signal.com/{slug}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dir && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                dir.className
              )}
            >
              <dir.icon className="size-3" />
              {dir.label} · {dir.sub}
            </span>
          )}
          {isPartner && isGhost && details.targetOrgId && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSummonOpen(true)}
                className="h-8 gap-1.5 border-[var(--color-silk)]/40 bg-[var(--color-silk)]/10 text-[var(--color-silk)] hover:bg-[var(--color-silk)]/20"
              >
                <Send className="size-3.5" />
                Invite to Signal
              </Button>
              <SummonPartnerModal
                open={summonOpen}
                onOpenChange={setSummonOpen}
                partnerName={details.identity.name}
                originOrgId={sourceOrgId}
                ghostOrgId={details.targetOrgId}
                onSuccess={onSummonSuccess}
              />
            </>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--color-mercury)]" />
    </div>
  );
}
