'use server';

import { createClient } from '@/shared/api/supabase/server';
import { fetchCues, fetchSections } from './ros';
import type { Cue, Section } from '../model/run-of-show-types';

interface EventMeta {
  title: string;
  date: string;
  venue: string;
  client: string;
}

function groupCues(cues: Cue[], sections: Section[]) {
  const sectionMap = new Map<string, Section>();
  for (const s of sections) sectionMap.set(s.id, s);

  const groups = new Map<string, { section: Section | null; cues: Cue[] }>();
  for (const s of sections) groups.set(s.id, { section: s, cues: [] });
  groups.set('__unsectioned__', { section: null, cues: [] });

  for (const cue of cues) {
    const key = cue.section_id && sectionMap.has(cue.section_id) ? cue.section_id : '__unsectioned__';
    groups.get(key)!.cues.push(cue);
  }

  const result: { section: Section | null; cues: Cue[] }[] = [];
  const unsectioned = groups.get('__unsectioned__')!;
  if (unsectioned.cues.length > 0) result.push(unsectioned);
  for (const s of sections) {
    const g = groups.get(s.id)!;
    if (g.cues.length > 0) result.push(g);
  }
  return result;
}

function computeTimes(cues: Cue[]) {
  const map = new Map<string, string>();
  if (cues.length === 0) return map;
  const [h, m] = (cues[0]?.start_time ?? '18:00').split(':').map(Number);
  let current = h * 60 + m;
  for (const cue of cues) {
    if (cue === cues[0] && cue.start_time) {
      const [ch, cm] = cue.start_time.split(':').map(Number);
      current = ch * 60 + cm;
    }
    const safe = ((current % 1440) + 1440) % 1440;
    map.set(cue.id, `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`);
    current += cue.duration_minutes ?? 0;
  }
  return map;
}

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Generate print-optimized HTML for a run of show. */
export async function generateRosPrintHtml(eventId: string): Promise<string> {
  const supabase = await createClient();

  // Fetch event metadata
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('title, starts_at, venue_name, location_name')
    .eq('id', eventId)
    .single();

  // Fetch client name via deal
  const { data: deal } = await supabase
    .from('deals')
    .select('title, client_name')
    .eq('event_id', eventId)
    .maybeSingle();

  const meta: EventMeta = {
    title: event?.title ?? 'Untitled Show',
    date: event?.starts_at
      ? new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD',
    venue: event?.venue_name ?? event?.location_name ?? '—',
    client: deal?.client_name ?? '—',
  };

  const [cues, sections] = await Promise.all([fetchCues(eventId), fetchSections(eventId)]);

  // Build flat list for time computation
  const grouped = groupCues(cues, sections);
  const flat: Cue[] = [];
  for (const g of grouped) flat.push(...g.cues);
  const times = computeTimes(flat);

  const totalMin = flat.reduce((s, c) => s + (c.duration_minutes ?? 0), 0);
  const totalLabel = totalMin >= 60
    ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
    : `${totalMin}m`;

  // Build HTML
  let cueRows = '';
  for (const group of grouped) {
    if (group.section) {
      cueRows += `<tr><td colspan="5" style="padding:12px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#666;border-bottom:2px solid ${esc(group.section.color) || '#999'}">${esc(group.section.title)}</td></tr>`;
    }
    for (const cue of group.cues) {
      const time = times.get(cue.id) ?? '';
      const crew = (cue.assigned_crew ?? []).map((c) => esc(c.display_name)).join(', ');
      cueRows += `<tr>
        <td style="padding:6px 8px;font-family:monospace;font-size:13px;white-space:nowrap;vertical-align:top">${esc(time)}</td>
        <td style="padding:6px 8px;font-size:13px;font-weight:500;vertical-align:top">${esc(cue.title)}</td>
        <td style="padding:6px 8px;font-size:11px;text-transform:uppercase;color:#888;vertical-align:top">${esc(cue.type)}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:12px;white-space:nowrap;vertical-align:top">${cue.duration_minutes}m</td>
        <td style="padding:6px 8px;font-size:11px;color:#666;vertical-align:top">${crew || '—'}</td>
      </tr>`;
      if (cue.notes) {
        cueRows += `<tr><td></td><td colspan="4" style="padding:0 8px 8px;font-size:11px;color:#888;font-style:italic">${esc(cue.notes)}</td></tr>`;
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Run of Show — ${esc(meta.title)}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #666; margin-bottom: 24px; }
    .meta span { margin-right: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #999; border-bottom: 1px solid #ddd; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; padding: 10px 20px; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>${esc(meta.title)}</h1>
  <div class="meta">
    <span>${esc(meta.date)}</span>
    <span>${esc(meta.venue)}</span>
    <span>${esc(meta.client)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Cue</th>
        <th>Type</th>
        <th>Dur.</th>
        <th>Crew</th>
      </tr>
    </thead>
    <tbody>
      ${cueRows}
    </tbody>
  </table>
  <div class="footer">
    <span>Total: ${flat.length} cues · ${totalLabel}</span>
    <span>Generated ${new Date().toLocaleDateString('en-US')}</span>
  </div>
  <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>
</body>
</html>`;
}
