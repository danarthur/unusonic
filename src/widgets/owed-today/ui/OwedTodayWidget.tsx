'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, ListChecks, Phone, MessageSquare, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import { dismissFollowUp } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getOwedToday, type OwedTodayItem } from '../api/get-owed-today';
import { LogOutcomeSheet } from './LogOutcomeSheet';
import { SnoozeMenu } from './SnoozeMenu';

const META = METRICS['lobby.owed_today'];

function formatValue(value: number | null): string | null {
  if (value === null || value === 0) return null;
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${value.toLocaleString()}`;
}

function ChannelButton({ icon: Icon, href, label }: { icon: typeof Phone; href: string; label: string }) {
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.16)] transition-colors"
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </a>
  );
}

interface RowProps {
  item: OwedTodayItem;
  onChanged: () => void;
}

function OwedRow({ item, onChanged }: RowProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const value = formatValue(item.dealValue);
  const displayName = item.clientName ?? item.dealTitle;

  const handleDismiss = () => {
    startTransition(async () => {
      const result = await dismissFollowUp(item.queueItemId);
      if (result.success) {
        toast.success('Dismissed');
        onChanged();
      } else {
        toast.error(result.error ?? 'Failed to dismiss');
      }
    });
  };

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
        transition={STAGE_LIGHT}
        className="flex flex-col gap-2 py-3 border-b border-[oklch(1_0_0_/_0.06)] last:border-0"
      >
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={item.dealHref}
            className="stage-readout-md truncate text-[var(--stage-text-primary)] hover:opacity-70 transition-opacity"
          >
            {displayName}
          </Link>
          {value ? (
            <span className="shrink-0 stage-label tabular-nums text-[var(--stage-text-secondary)]">
              {value}
            </span>
          ) : null}
        </div>

        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">{item.reasonString}</p>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {item.contactPhone ? (
            <ChannelButton icon={Phone} href={`tel:${item.contactPhone}`} label="Call" />
          ) : null}
          {item.contactPhone ? (
            <ChannelButton icon={MessageSquare} href={`sms:${item.contactPhone}`} label="Text" />
          ) : null}
          {item.contactEmail ? (
            <ChannelButton icon={Mail} href={`mailto:${item.contactEmail}`} label="Email" />
          ) : null}

          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors"
          >
            Log
          </button>

          <SnoozeMenu item={item} onSnoozed={onChanged} onDecisionRequired={() => setLogOpen(true)} />

          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center justify-center w-11 h-11 ml-auto rounded-lg text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </motion.div>

      <LogOutcomeSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        item={item}
        onLogged={onChanged}
      />
    </>
  );
}

export function OwedTodayWidget() {
  const [items, setItems] = useState<OwedTodayItem[] | null>(null);

  const refresh = useCallback(() => {
    void getOwedToday()
      .then((rows) => setItems(rows))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    let active = true;
    void getOwedToday()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = items === null;
  const data = items ?? [];

  return (
    <WidgetShell
      icon={ListChecks}
      label={META?.title ?? 'Owed today'}
      loading={loading}
      empty={!loading && data.length === 0}
      emptyMessage={META?.emptyState?.body ?? 'Nothing owed today.'}
      emptyIcon={CheckCircle2}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {data.map((item) => (
            <OwedRow key={item.queueItemId} item={item} onChanged={refresh} />
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
