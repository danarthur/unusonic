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
  MapPin,
  Circle,
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
    className: 'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)] border-[var(--color-unusonic-warning)]/30',
  },
  client: {
    icon: ArrowUpRight,
    label: 'Client',
    sub: 'In',
    className: 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border-[var(--color-unusonic-success)]/30',
  },
  partner: {
    icon: ArrowLeftRight,
    label: 'Partner',
    sub: 'Both',
    className: 'bg-[var(--color-unusonic-info)]/15 text-[var(--color-unusonic-info)] border-[var(--color-unusonic-info)]/30',
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
  const isPersonOrCouple = details.entityDirectoryType === 'person' || details.entityDirectoryType === 'couple';
  const Icon = dir?.icon ?? (isPartner && !isPersonOrCouple ? Building2 : User);

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
        style={
          brandColor && typeof brandColor === 'string'
            ? {
                '--brand-color': brandColor,
                background: `linear-gradient(to bottom, color-mix(in oklch, var(--brand-color) 7%, transparent), transparent 50%)`,
              } as React.CSSProperties
            : {
                background: `linear-gradient(to bottom, color-mix(in oklch, var(--stage-accent) 4%, transparent), transparent 50%)`,
              }
        }
      />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <motion.div
            layoutId={`node-${details.id}-avatar`}
            className={cn(
              'relative size-14 shrink-0 flex items-center justify-center overflow-hidden',
              isPersonOrCouple ? 'rounded-full' : 'rounded-[var(--stage-radius-nested)]',
              'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)]'
            )}
          >
            {avatarUrl ? (
              <>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: 'radial-gradient(ellipse 80% 80% at 50% 50%, oklch(0.98 0 0 / 0.7) 0%, oklch(0.90 0 0 / 0.4) 50%, transparent 100%)',
                  }}
                  aria-hidden
                />
                <img
                  src={avatarUrl}
                  alt=""
                  className="relative z-10 size-full object-contain p-1.5"
                />
              </>
            ) : details.entityDirectoryType === 'venue' ? (
              <MapPin className="size-6 text-[var(--stage-text-secondary)]" />
            ) : (
              <span className="text-2xl font-light text-[var(--stage-text-secondary)]">{initial}</span>
            )}
          </motion.div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isPartner && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium uppercase tracking-widest',
                    isGhost
                      ? 'border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 text-[var(--stage-accent)]'
                      : 'border-[var(--color-unusonic-success)]/40 bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)]'
                  )}
                >
                  {isGhost ? <FileEdit className="size-2.5" /> : <ShieldCheck className="size-2.5" />}
                  {isGhost ? 'Internal' : 'Verified'}
                </span>
              )}
              {!isPartner && details.isGhost && (
                <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium uppercase tracking-widest border-[var(--stage-text-secondary)]/20 bg-[var(--stage-text-secondary)]/5 text-[var(--stage-text-secondary)]">
                  <Circle className="size-2.5" />
                  Unclaimed
                </span>
              )}
              {details.identity.label && (
                <span className="text-xs text-[var(--stage-text-secondary)]">{details.identity.label}</span>
              )}
            </div>
            {slug && (
              <p className="font-mono text-xs text-[var(--stage-text-secondary)]">unusonic.com/{slug}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dir && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                dir.className
              )}
            >
              <dir.icon className="size-3" />
              {dir.label} · {dir.sub}
            </span>
          )}
          {details.lifecycleStatus && details.lifecycleStatus !== 'active' && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize
              border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/10 text-[var(--color-unusonic-warning)]">
              {details.lifecycleStatus}
            </span>
          )}
          {Array.isArray(details.relationshipTags) && details.relationshipTags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium
              border-[var(--stage-accent)]/20 bg-[var(--stage-accent)]/10 text-[var(--stage-accent)]">
              {tag}
            </span>
          ))}
          {isPartner && isGhost && details.targetOrgId
            && details.entityDirectoryType !== 'person'
            && details.entityDirectoryType !== 'couple'
            && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSummonOpen(true)}
                className="h-8 gap-1.5 border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/20"
              >
                <Send className="size-3.5" />
                Invite to Unusonic
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
      <div className="absolute bottom-0 left-0 right-0 border-b border-[var(--stage-edge-subtle)]" />
    </div>
  );
}
