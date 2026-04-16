'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { METRICS } from '@/shared/lib/metrics/registry';
import { getWeeklyTally, type WeeklyTallyData } from '../api/get-weekly-tally';

const META = METRICS['lobby.weekly_tally'];

const STATS: { key: keyof WeeklyTallyData; label: string }[] = [
  { key: 'proposalsSent', label: 'Proposals sent' },
  { key: 'depositsReceived', label: 'Deposits in' },
  { key: 'followUpsLogged', label: 'Follow-ups' },
  { key: 'dealsWon', label: 'Deals won' },
];

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="text-2xl tabular-nums font-medium text-[var(--stage-text-primary)]">
        {value}
      </span>
      <span className="text-[10px] text-[var(--stage-text-tertiary)] uppercase tracking-wider text-center leading-tight break-words">
        {label}
      </span>
    </div>
  );
}

export function WeeklyTallyWidget() {
  const [data, setData] = useState<WeeklyTallyData | null>(null);

  useEffect(() => {
    let active = true;
    void getWeeklyTally()
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData({ proposalsSent: 0, depositsReceived: 0, followUpsLogged: 0, dealsWon: 0 }); });
    return () => { active = false; };
  }, []);

  const loading = data === null;

  return (
    <WidgetShell
      icon={TrendingUp}
      label={META?.title ?? 'This week'}
      loading={loading}
      empty={false}
    >
      <div className="grid grid-cols-4 gap-2 py-2">
        {STATS.map((s) => (
          <Stat key={s.key} value={data?.[s.key] ?? 0} label={s.label} />
        ))}
      </div>
    </WidgetShell>
  );
}
