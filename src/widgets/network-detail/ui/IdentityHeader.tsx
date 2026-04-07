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
    className: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-primary)] border-[var(--stage-edge-top)]',
  },
  client: {
    icon: ArrowUpRight,
    label: 'Client',
    sub: 'In',
    className: 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-primary)] border-[oklch(1_0_0/0.10)]',
  },
  partner: {
    icon: ArrowLeftRight,
    label: 'Partner',
    sub: 'Both',
    className: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-secondary)] border-[var(--stage-edge-top)]',
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
              'border border-[var(--stage-edge-top)] bg-[var(--stage-surface-elevated)]'
            )}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="size-full object-contain p-1.5"
              />
            ) : details.entityDirectoryType === 'venue' ? (
              <MapPin className="size-6 text-[var(--stage-text-secondary)]" />
            ) : (
              <span className="text-2xl font-medium text-[var(--stage-text-secondary)]">{initial}</span>
            )}
          </motion.div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isPartner && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium uppercase tracking-widest',
                    isGhost
                      ? 'border-[oklch(1_0_0/0.12)] bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]'
                      : 'border-[var(--color-unusonic-success)]/40 bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)]'
                  )}
                >
                  {isGhost ? <FileEdit className="size-3" strokeWidth={1.5} /> : <ShieldCheck className="size-2.5" strokeWidth={1.5} />}
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
          {details.relationshipTier && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize border-[var(--stage-edge-top)] bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-primary)]">
              {details.relationshipTier}
            </span>
          )}
          {details.lifecycleStatus && details.lifecycleStatus !== 'active' && (() => {
            const status = details.lifecycleStatus!;
            const style =
              status === 'blacklisted'
                ? 'border-[var(--color-unusonic-error)]/30 bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)]'
                : status === 'dormant'
                ? 'border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/10 text-[var(--color-unusonic-warning)]'
                : 'border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-secondary)]';
            return (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${style}`}>
                {status}
              </span>
            );
          })()}
          {Array.isArray(details.relationshipTags) && details.relationshipTags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium
              border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-primary)]">
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
                className="h-8 gap-1.5"
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
