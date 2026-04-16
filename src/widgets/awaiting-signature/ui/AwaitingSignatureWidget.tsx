'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileSignature, CheckCircle2, Receipt } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import { getAwaitingSignature, type AwaitingSignatureData, type AwaitingItem } from '../api/get-awaiting-signature';

const META = METRICS['lobby.awaiting_signature'];

function ItemRow({ item }: { item: AwaitingItem }) {
  const label = item.kind === 'unsigned'
    ? `Accepted ${item.daysWaiting}d ago`
    : `Deposit ${item.daysWaiting}d overdue`;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      transition={STAGE_LIGHT}
      className="flex items-center gap-3 py-2"
    >
      {item.kind === 'unsigned' ? (
        <FileSignature className="w-4 h-4 shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
      ) : (
        <Receipt className="w-4 h-4 shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
      )}
      <div className="flex-1 min-w-0">
        <p className="stage-readout-sm truncate">{item.dealTitle}</p>
        <p className="stage-label truncate">{label}</p>
      </div>
      <Link
        href={item.dealHref}
        className="shrink-0 text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
      >
        View
      </Link>
    </motion.div>
  );
}

function Section({ title, items }: { title: string; items: AwaitingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="stage-label mb-1">{title}</p>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

const EMPTY: AwaitingSignatureData = { unsigned: [], depositOverdue: [] };

function useAwaitingData() {
  const [data, setData] = useState<AwaitingSignatureData | null>(null);
  useEffect(() => {
    let active = true;
    void getAwaitingSignature()
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData(EMPTY); });
    return () => { active = false; };
  }, []);
  return data;
}

export function AwaitingSignatureWidget() {
  const data = useAwaitingData();
  const loading = data === null;
  const resolved = data ?? EMPTY;
  const totalItems = resolved.unsigned.length + resolved.depositOverdue.length;

  return (
    <WidgetShell
      icon={FileSignature}
      label={META?.title ?? 'Awaiting signature'}
      loading={loading}
      empty={!loading && totalItems === 0}
      emptyMessage={META?.emptyState?.body ?? 'All signatures and deposits are current.'}
      emptyIcon={CheckCircle2}
    >
      <div className="flex flex-col gap-3 h-full">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <Section title="Awaiting signature" items={resolved.unsigned} />
          <Section title="Deposit overdue" items={resolved.depositOverdue} />
        </div>
      </div>
    </WidgetShell>
  );
}
