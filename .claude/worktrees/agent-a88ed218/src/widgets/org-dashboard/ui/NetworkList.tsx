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

/** Rolodex: connected companies (Ghost = Private Contact, Real = Verified Signal). */
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
      <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">Loading connections…</p>
    );
  }
  if (connections.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">
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
              'flex flex-wrap items-center gap-3 rounded-xl border border-white/10 px-4 py-3',
              'bg-white/5 transition-colors',
              isGhost && 'opacity-90'
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Building2 className="size-5 text-[var(--color-ink-muted)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium tracking-tight text-[var(--color-ink)]">
                  {target_org.name}
                </p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    isGhost
                      ? 'bg-white/10 text-[var(--color-ink-muted)]'
                      : 'bg-[var(--color-signal-success)]/20 text-[var(--color-signal-success)]'
                  )}
                  title={isGhost ? 'Private contact (Ghost)' : 'Verified Signal'}
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
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium">
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
