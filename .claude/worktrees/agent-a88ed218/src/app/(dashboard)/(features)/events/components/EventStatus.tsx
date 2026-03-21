'use client';

import { useEffect, useState } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

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
        <h3 className="text-xs font-mono text-ink-muted uppercase tracking-widest">
          Production Schedule
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <LiquidPanel className="h-20 w-full animate-pulse !p-0" />
        ) : events.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-muted italic">
            No upcoming productions.
          </div>
        ) : (
          events.map((evt, i) => (
            <LiquidPanel
              key={evt.id}
              hoverEffect
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="!p-3 transition-all liquid-panel-nested"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-serif text-sm font-medium text-ink">
                    {evt.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-muted uppercase tracking-wider">
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
                <div className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                  <MapPin size={10} />
                  <span className="truncate">{evt.location_name}</span>
                </div>
              )}
            </LiquidPanel>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    booked: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    planned: 'bg-stone-100 text-stone-600 border-stone-200',
  };

  const activeStyle = styles[status as keyof typeof styles] || styles.planned;

  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${activeStyle}`}>
      {status}
    </span>
  );
}
