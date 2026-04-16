'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { UserX, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import { dismissFollowUp } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getGoneQuiet, type GoneQuietItem } from '../api/get-gone-quiet';
import { LogOutcomeSheet } from '@/widgets/owed-today/ui/LogOutcomeSheet';

const META = METRICS['lobby.gone_quiet'];

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatValue(val: number | null): string | null {
  if (!val) return null;
  return val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`;
}

function QuietRow({ item, onChanged }: { item: GoneQuietItem; onChanged: () => void }) {
  const [logOpen, setLogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleMarkDormant = () => {
    if (!item.dealId || item.kind !== 'stalled_deal') return;
    const queueItemId = item.id.replace('stall-', '');
    startTransition(async () => {
      const result = await dismissFollowUp(queueItemId);
      if (result.success) {
        toast.success('Marked dormant');
        onChanged();
      } else {
        toast.error(result.error ?? 'Failed');
      }
    });
  };

  const value = formatValue(item.lastDealValue);

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
        transition={STAGE_LIGHT}
        className="flex items-center gap-3 py-2 border-b border-[oklch(1_0_0_/_0.06)] last:border-0"
      >
        <div className="flex-1 min-w-0">
          <Link href={item.href} className="stage-readout-sm truncate block hover:opacity-70 transition-opacity">
            {item.name}
          </Link>
          <p className="stage-label truncate">
            {formatRelative(item.lastContactDate)}
            {value ? ` · ${value}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {item.dealId ? (
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors px-2 py-1 rounded-md"
            >
              Log
            </button>
          ) : null}
          {item.kind === 'stalled_deal' ? (
            <button
              type="button"
              onClick={handleMarkDormant}
              className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors px-2 py-1 rounded-md"
            >
              Dormant
            </button>
          ) : null}
        </div>
      </motion.div>

      {item.dealId ? (
        <LogOutcomeSheet
          open={logOpen}
          onOpenChange={setLogOpen}
          item={{
            queueItemId: item.id,
            dealId: item.dealId,
            dealTitle: item.name,
            clientName: item.name,
            dealValue: item.lastDealValue,
            reasonType: 'dormant_client',
            reasonString: '',
            suggestedChannel: 'sms',
            contactName: null,
            contactPhone: null,
            contactEmail: null,
            snoozeCount: 0,
            isSnoozed: false,
            snoozedUntil: null,
            dealHref: item.href,
          }}
          onLogged={onChanged}
        />
      ) : null}
    </>
  );
}

export function GoneQuietWidget() {
  const [items, setItems] = useState<GoneQuietItem[] | null>(null);

  const refresh = () => {
    void getGoneQuiet()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    let active = true;
    void getGoneQuiet()
      .then((d) => { if (active) setItems(d); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  const loading = items === null;
  const data = items ?? [];

  return (
    <WidgetShell
      icon={UserX}
      label={META?.title ?? 'Gone quiet'}
      loading={loading}
      empty={!loading && data.length === 0}
      emptyMessage={META?.emptyState?.body ?? "No one's fallen off — you're on top of it."}
      emptyIcon={CheckCircle2}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {data.map((item) => (
            <QuietRow key={item.id} item={item} onChanged={refresh} />
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
