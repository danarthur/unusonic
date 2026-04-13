'use client';

import * as React from 'react';
import { Building2, MapPin, Shield, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { listOrgRelationships } from '@/entities/network';
import type { OrgConnectionItem, RelationshipType } from '@/entities/network';

const TYPE_LABELS: Record<RelationshipType, string> = {
  vendor: 'Vendor',
  venue: 'Venue',
  client_company: 'Client',
  partner: 'Partner',
};

interface NetworkListProps {
  sourceOrgId: string;
  emptyMessage?: string;
}

/** Rolodex: connected companies (Ghost = Private Contact, Real = Verified Unusonic). */
export function NetworkList({ sourceOrgId, emptyMessage }: NetworkListProps) {
  const [connections, setConnections] = React.useState<OrgConnectionItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!sourceOrgId) {
      setConnections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listOrgRelationships(sourceOrgId)
      .then(setConnections)
      .finally(() => setLoading(false));
  }, [sourceOrgId]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">Loading connections…</p>
    );
  }
  if (connections.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">
        {emptyMessage ?? 'No connected companies yet. Add vendors, venues, or partners.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {connections.map((conn) => {
        const { target_org } = conn;
        const isGhost = target_org.is_ghost;
        const location = [target_org.address?.city, target_org.address?.state]
          .filter(Boolean)
          .join(', ');
        return (
          <li
            key={conn.id}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-xl border border-[oklch(1_0_0/0.1)] px-4 py-3',
              'bg-[oklch(1_0_0/0.05)] transition-colors',
              isGhost && 'opacity-90'
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0/0.1)]">
              <Building2 className="size-5 text-[var(--stage-text-secondary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium tracking-tight text-[var(--stage-text-primary)]">
                  {target_org.name}
                </p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 stage-badge-text',
                    isGhost
                      ? 'bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-secondary)]'
                      : 'bg-[var(--color-unusonic-success)]/20 text-[var(--color-unusonic-success)]'
                  )}
                  title={isGhost ? 'Private contact (Ghost)' : 'Verified Unusonic'}
                >
                  {isGhost ? (
                    <>
                      <Shield className="size-3" />
                      Private
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3" />
                      Verified
                    </>
                  )}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--stage-text-secondary)]">
                <span className="rounded bg-[oklch(1_0_0/0.1)] px-1.5 py-0.5 font-medium">
                  {TYPE_LABELS[conn.type]}
                </span>
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {location}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
