'use client';

import { useEffect, useState } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';

interface EventSnippet {
  id: string;
  title: string;
  status: 'planned' | 'booked' | 'confirmed';
  starts_at: string;
  location_name?: string;
}

export function EventStatus() {
  const [events, setEvents] = useState<EventSnippet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    async function fetchEvents() {
      try {
        const res = await fetch('/api/events', { signal: controller.signal });
        const data = await res.json();
        if (res.ok) {
          setEvents(Array.isArray(data) ? data : []);
        } else {
          console.error('[EventStatus] Events API error:', res.status, (data as { error?: string })?.error ?? data);
          setEvents([]);
        }
      } catch (error) {
        console.error('[EventStatus] Failed to fetch events', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-[var(--stage-text-secondary)] uppercase tracking-widest">
          Production Schedule
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <StagePanel className="h-20 w-full stage-skeleton !p-0" />
        ) : events.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--stage-text-secondary)] italic">
            No upcoming productions.
          </div>
        ) : (
          events.map((evt, i) => (
            <StagePanel
              key={evt.id}
              interactive
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="!p-3 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-medium text-[var(--stage-text-primary)]">
                    {evt.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--stage-text-secondary)] uppercase tracking-wider">
                    <Calendar size={10} />
                    {new Date(evt.starts_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <StatusBadge status={evt.status} />
              </div>

              {evt.location_name && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--stage-text-secondary)]">
                  <MapPin size={10} />
                  <span className="truncate">{evt.location_name}</span>
                </div>
              )}
            </StagePanel>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    booked: 'bg-[oklch(0.35_0.08_290_/_0.25)] text-[oklch(0.65_0.15_290)] border-[oklch(0.55_0.15_290_/_0.3)]',
    confirmed: 'bg-[oklch(0.45_0.08_145_/_0.25)] text-[var(--color-unusonic-success)] border-[oklch(0.65_0.18_145_/_0.2)]',
    planned: 'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] border-[var(--stage-edge-subtle)]',
  };

  const activeStyle = styles[status as keyof typeof styles] || styles.planned;

  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${activeStyle}`}>
      {status}
    </span>
  );
}
