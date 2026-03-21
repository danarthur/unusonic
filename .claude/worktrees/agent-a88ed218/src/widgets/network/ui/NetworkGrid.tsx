'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { NetworkCard } from './NetworkCard';
import { EntitySheet } from './EntitySheet';
import { OrgDashboardSheet } from '@/widgets/org-dashboard';
import { MemberDetailSheet } from '@/features/talent-management';
import type { NetworkGraph, NetworkOrganization, NetworkEntity } from '@/features/network/model/types';
import type { NetworkBadgeKind } from '@/features/network/model/types';

type EntityWithMeta = NetworkEntity & { organization_names?: string[]; org_member_id?: string | null };

interface NetworkGridProps {
  graph: NetworkGraph | null;
  /** Optional: map org id -> badge for display (e.g. vendor, client, coordinator). */
  orgBadges?: Record<string, NetworkBadgeKind>;
}

export function NetworkGrid({ graph, orgBadges = {} }: NetworkGridProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [dashboardOpen, setDashboardOpen] = React.useState(false);
  const [selectedOrg, setSelectedOrg] = React.useState<NetworkOrganization | null>(null);
  const [memberSheetOpen, setMemberSheetOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<
    | { type: 'org'; data: NetworkOrganization }
    | { type: 'entity'; data: EntityWithMeta }
    | null
  >(null);

  const openSheet = React.useCallback(
    (subject: { type: 'org'; data: NetworkOrganization } | { type: 'entity'; data: EntityWithMeta }) => {
      if (subject.type === 'org') {
        setSelectedOrg(subject.data);
        setDashboardOpen(true);
      } else if (subject.type === 'entity' && subject.data.org_member_id) {
        setSelectedMemberId(subject.data.org_member_id);
        setMemberSheetOpen(true);
      } else {
        setSelected(subject);
        setSheetOpen(true);
      }
    },
    []
  );

  if (!graph) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)]/30 p-8">
        <p className="text-sm text-[var(--color-ink-muted)]">
          No network data. Ensure you belong to an organization.
        </p>
      </div>
    );
  }

  const { organizations, entities } = graph;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(140px,auto)]">
        {organizations.map((org) => (
          <motion.div
            key={org.id}
            role="button"
            tabIndex={0}
            onClick={() => openSheet({ type: 'org', data: org })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openSheet({ type: 'org', data: org });
              }
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="cursor-pointer"
          >
            <NetworkCard
              item={{ type: 'org', data: org }}
              badge={orgBadges[org.id]}
              onClick={() => openSheet({ type: 'org', data: org })}
            />
          </motion.div>
        ))}
        {entities.map((entity) => (
          <motion.div
            key={entity.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <NetworkCard
              item={{
                type: 'entity',
                data: {
                  ...entity,
                  organization_names: entity.organization_names ?? [],
                },
              }}
              onClick={() =>
                openSheet({
                  type: 'entity',
                  data: { ...entity, organization_names: entity.organization_names ?? [] },
                })
              }
            />
          </motion.div>
        ))}
      </div>
      <EntitySheet
        subject={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <OrgDashboardSheet
        org={selectedOrg}
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
      />
      <MemberDetailSheet
        orgMemberId={selectedMemberId}
        open={memberSheetOpen}
        onOpenChange={setMemberSheetOpen}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
