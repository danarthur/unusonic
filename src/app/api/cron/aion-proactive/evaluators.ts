/**
 * Proactive-line signal evaluators — Phase 2 Sprint 2 / Week 4b.
 *
 * Each evaluator takes a workspace and the service-role Supabase client, then
 * returns a list of *candidate* proactive lines to emit. The orchestrator
 * applies the throttle check + daily cap (via the DB unique index) and
 * filters for the single line actually emitted per deal per day.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.2.1 (signal types) +
 *       §3.2.2 (discipline rules).
 *
 * Signals:
 *   1. proposal_engagement — viewed 4+ times in 48h with no reply, OR
 *                             viewed then dormant 5+ days after active period.
 *   2. money_event         — deposit overdue today, OR payment just cleared.
 *   3. dead_silence        — event date <14 days out AND no client contact in 7+ days.
 *
 * Design constraints (from Critic):
 *   - Nothing is auto-sent. Evaluators emit lines only; users see + click.
 *   - Throttle and quiet-hours gates run OUTSIDE this module.
 *   - Kill-switch + per-deal toggle are enforced by the DB RPC layer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type SignalType = 'proposal_engagement' | 'money_event' | 'dead_silence';

export type ProactiveCandidate = {
  deal_id: string;
  signal_type: SignalType;
  headline: string;
  artifact_ref: { kind: string; id: string };
  payload: Record<string, unknown>;
};

// Service-role client — not the user-scoped client. The cron runs cross-
// workspace with RLS bypassed; every query here MUST filter by workspace_id
// explicitly.
type SystemClient = SupabaseClient;

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

// ---------------------------------------------------------------------------
// Quiet hours + weekend gate
// ---------------------------------------------------------------------------

/**
 * True when "now" in the workspace's timezone is inside the emission window.
 * Plan §3.2.2: "Quiet hours: 7pm–8am workspace-local + weekends. Evaluators
 * don't emit; batched for next morning."
 *
 * Exported so the tests can exercise the boundary without mocking Date.
 */
export function isWithinEmissionWindow(now: Date, timezone: string): boolean {
  // Use Intl.DateTimeFormat with the IANA tz to resolve local hour + weekday.
  // This is the only portable way in Node without a dep; it returns locale-
  // stable strings we can parse.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const weekdayPart = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = parseInt(hourPart, 10);
  const isWeekend = weekdayPart === 'Sat' || weekdayPart === 'Sun';
  if (isWeekend) return false;
  // Emit between 08:00 (inclusive) and 19:00 (exclusive).
  return hour >= 8 && hour < 19;
}

// ---------------------------------------------------------------------------
// Auto-disable gate — two layers as of Wk 10:
//   (1) Soft: dismiss-rate (not_useful only) > 35% over 7d on >=3 emissions.
//       In-memory per-cron-run; doesn't persist.
//   (2) Hard (D8): cortex.aion_workspace_signal_disables row with
//       disabled_until > now(). Persistent until owner Resurfaces or 30d.
// Both unioned — if either side flags a signal, the cron skips that type.
// ---------------------------------------------------------------------------

export async function fetchAutoDisabledSignals(
  client: SystemClient,
  workspaceId: string,
): Promise<Set<SignalType>> {
  const disabled = new Set<SignalType>();

  // (1) Soft gate — 35% over 7d (legacy, plan §3.2.4).
  const ratesPromise = client
    .schema('cortex')
    .rpc('get_proactive_line_dismiss_rates', {
      p_workspace_id: workspaceId,
      p_window_days: 7,
      p_min_sample: 3,
    });

  // (2) Hard gate — D8 workspace_signal_disables (Wk 10).
  const disablesPromise = client
    .schema('cortex')
    .from('aion_workspace_signal_disables')
    .select('signal_type')
    .eq('workspace_id', workspaceId)
    .gt('disabled_until', new Date().toISOString());

  const [{ data: rates }, { data: hardDisables }] = await Promise.all([ratesPromise, disablesPromise]);

  for (const row of (rates ?? []) as { signal_type: SignalType; above_threshold: boolean }[]) {
    if (row.above_threshold) disabled.add(row.signal_type);
  }
  for (const row of (hardDisables ?? []) as { signal_type: SignalType }[]) {
    disabled.add(row.signal_type);
  }
  return disabled;
}

// ---------------------------------------------------------------------------
// Throttle check — 2 dismisses of same signal_type in last 14 days → mute 7d.
// ---------------------------------------------------------------------------

export async function isSignalMuted(
  client: SystemClient,
  workspaceId: string,
  dealId: string,
  signalType: SignalType,
  now: Date = new Date(),
): Promise<boolean> {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAYS).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAYS).toISOString();

  // Fetch recent dismissals for this (workspace, deal, signal_type).
  // Index: aion_proactive_lines_throttle_idx.
  const { data } = await client
    .schema('cortex')
    .from('aion_proactive_lines')
    .select('dismissed_at, dismissed_by')
    .eq('workspace_id', workspaceId)
    .eq('deal_id', dealId)
    .eq('signal_type', signalType)
    .not('dismissed_at', 'is', null)
    .gte('dismissed_at', fourteenDaysAgo)
    .order('dismissed_at', { ascending: false })
    .limit(10);

  const rows = (data ?? []) as { dismissed_at: string; dismissed_by: string | null }[];
  if (rows.length < 2) return false;

  // Group by dismissed_by. Any single user with ≥2 dismisses in the window
  // triggers a 7-day mute for that type on that deal (user-scoped throttle).
  // Since we only hold one mute decision here (global to the deal), any user
  // hitting the bar mutes for everyone — matches the plan's (user, deal)
  // framing at workspace granularity. We can refine to per-user later.
  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.dismissed_by) continue;
    const list = byUser.get(r.dismissed_by) ?? [];
    list.push(r.dismissed_at);
    byUser.set(r.dismissed_by, list);
  }

  for (const [, ts] of byUser) {
    if (ts.length >= 2) {
      // Check that the most recent dismiss is within the 7-day mute window.
      // If it's >7 days ago, the mute has elapsed.
      if (ts[0] >= sevenDaysAgo) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Signal 1: proposal_engagement
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  deal_id: string;
  status: string;
  view_count: number | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  signed_at: string | null;
  accepted_at: string | null;
};

export async function evaluateProposalEngagement(
  client: SystemClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<ProactiveCandidate[]> {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAYS).toISOString();
  const { data } = await client
    .from('proposals')
    .select('id, deal_id, status, view_count, first_viewed_at, last_viewed_at, signed_at, accepted_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'viewed'])
    .is('signed_at', null)
    .is('accepted_at', null)
    .gte('last_viewed_at', ninetyDaysAgo)
    .not('last_viewed_at', 'is', null);

  const rows = (data ?? []) as ProposalRow[];
  if (rows.length === 0) return [];

  // Check "no reply" for each deal — no inbound message since first_viewed_at.
  const dealIds = [...new Set(rows.map((r) => r.deal_id))];
  const inboundByDeal = await fetchLatestInboundByDeal(client, workspaceId, dealIds);

  const out: ProactiveCandidate[] = [];
  for (const p of rows) {
    if ((p.view_count ?? 0) < 1 || !p.last_viewed_at) continue;

    const latestInbound = inboundByDeal.get(p.deal_id);
    const inboundAfterView =
      latestInbound && p.first_viewed_at && latestInbound >= p.first_viewed_at;
    if (inboundAfterView) continue;

    const lastView = new Date(p.last_viewed_at).getTime();
    const hotViews = (p.view_count ?? 0) >= 4 && now.getTime() - lastView <= 48 * HOURS;
    const dormant = now.getTime() - lastView >= 5 * DAYS && now.getTime() - lastView <= 14 * DAYS;

    if (hotViews) {
      out.push({
        deal_id: p.deal_id,
        signal_type: 'proposal_engagement',
        headline: `Client has opened your proposal ${p.view_count} times in 48h and hasn't replied.`,
        artifact_ref: { kind: 'proposal', id: p.id },
        payload: { mode: 'hot_views', view_count: p.view_count, last_viewed_at: p.last_viewed_at },
      });
    } else if (dormant) {
      const daysDormant = Math.floor((now.getTime() - lastView) / DAYS);
      out.push({
        deal_id: p.deal_id,
        signal_type: 'proposal_engagement',
        headline: `Client viewed the proposal ${daysDormant} days ago and has gone quiet.`,
        artifact_ref: { kind: 'proposal', id: p.id },
        payload: { mode: 'dormant', days_dormant: daysDormant, last_viewed_at: p.last_viewed_at },
      });
    }
  }
  return out;
}

async function fetchLatestInboundByDeal(
  client: SystemClient,
  workspaceId: string,
  dealIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (dealIds.length === 0) return out;

  const { data: threads } = await client
    .schema('ops')
    .from('message_threads')
    .select('id, deal_id')
    .eq('workspace_id', workspaceId)
    .in('deal_id', dealIds);

  const threadRows = ((threads ?? []) as { id: string; deal_id: string }[]);
  if (threadRows.length === 0) return out;

  const threadToDeal = new Map<string, string>();
  for (const t of threadRows) threadToDeal.set(t.id, t.deal_id);

  const { data: msgs } = await client
    .schema('ops')
    .from('messages')
    .select('thread_id, created_at')
    .eq('workspace_id', workspaceId)
    .eq('direction', 'inbound')
    .in('thread_id', [...threadToDeal.keys()])
    .order('created_at', { ascending: false });

  for (const m of (msgs ?? []) as { thread_id: string; created_at: string }[]) {
    const dealId = threadToDeal.get(m.thread_id);
    if (!dealId) continue;
    const prev = out.get(dealId);
    if (!prev || m.created_at > prev) out.set(dealId, m.created_at);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Signal 2: money_event — deposit overdue today OR payment just cleared.
// ---------------------------------------------------------------------------

export async function evaluateMoneyEvent(
  client: SystemClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<ProactiveCandidate[]> {
  const out: ProactiveCandidate[] = [];
  const todayIso = new Date(now.getTime() - now.getTime() % DAYS).toISOString();
  const dayAgoIso = new Date(now.getTime() - 24 * HOURS).toISOString();

  // Part A: deposit overdue today.
  // accepted proposal + deposit_deadline_days set + accepted_at + deposit_deadline_days < today
  // + deposit_paid_at IS NULL
  const { data: accepted } = await client
    .from('proposals')
    .select('id, deal_id, accepted_at, deposit_deadline_days, deposit_paid_at, deposit_percent')
    .eq('workspace_id', workspaceId)
    .not('accepted_at', 'is', null)
    .is('deposit_paid_at', null)
    .not('deposit_deadline_days', 'is', null)
    .gt('deposit_percent', 0);

  for (const p of ((accepted ?? []) as {
    id: string; deal_id: string; accepted_at: string; deposit_deadline_days: number;
    deposit_paid_at: string | null; deposit_percent: number | null;
  }[])) {
    const deadline = new Date(new Date(p.accepted_at).getTime() + p.deposit_deadline_days * DAYS);
    // Fire only on the day the deadline *crosses* — compares just the date.
    const deadlineDateIso = new Date(deadline.getTime() - deadline.getTime() % DAYS).toISOString();
    if (deadlineDateIso !== todayIso) continue;
    out.push({
      deal_id: p.deal_id,
      signal_type: 'money_event',
      headline: `Deposit is overdue today — ${p.deposit_percent}% not received.`,
      artifact_ref: { kind: 'proposal', id: p.id },
      payload: { mode: 'deposit_overdue', deadline: deadline.toISOString(), deposit_percent: p.deposit_percent },
    });
  }

  // Part B: payment cleared in the last 24h. finance.payments has succeeded_at
  // (or similar). This is the celebratory variant — one pill per deal per day,
  // which is exactly what the daily cap enforces.
  const { data: payments } = await (client as unknown as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            gte: (k: string, v: string) => {
              not: (k: string, op: string, v: null) => Promise<{ data: Array<{ id: string; deal_id: string | null; amount_cents: number | null; succeeded_at: string | null }> | null }>;
            };
          };
        };
      };
    };
  })
    .schema('finance')
    .from('payments')
    .select('id, deal_id, amount_cents, succeeded_at')
    .eq('workspace_id', workspaceId)
    .gte('succeeded_at', dayAgoIso)
    .not('succeeded_at', 'is', null);

  for (const pay of (payments ?? []) as { id: string; deal_id: string | null; amount_cents: number | null; succeeded_at: string | null }[]) {
    if (!pay.deal_id) continue;
    const dollars = Math.round((pay.amount_cents ?? 0) / 100).toLocaleString();
    out.push({
      deal_id: pay.deal_id,
      signal_type: 'money_event',
      headline: `Payment cleared: $${dollars} just came in.`,
      artifact_ref: { kind: 'payment', id: pay.id },
      payload: { mode: 'payment_cleared', amount_cents: pay.amount_cents, succeeded_at: pay.succeeded_at },
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Signal 3: dead_silence — event <14d out AND no contact in 7+d.
// ---------------------------------------------------------------------------

export async function evaluateDeadSilence(
  client: SystemClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<ProactiveCandidate[]> {
  const todayDate = new Date(now.getTime() - now.getTime() % DAYS);
  const fourteenDaysOut = new Date(todayDate.getTime() + 14 * DAYS);
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * DAYS).toISOString();

  // Deals with event proposed_date within the next 14 days, still open.
  const { data: deals } = await client
    .from('deals')
    .select('id, title, proposed_date, status')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .in('status', ['inquiry', 'proposal', 'contract_sent', 'won'])
    .gte('proposed_date', todayDate.toISOString().slice(0, 10))
    .lte('proposed_date', fourteenDaysOut.toISOString().slice(0, 10));

  const dealRows = ((deals ?? []) as { id: string; title: string | null; proposed_date: string; status: string }[]);
  if (dealRows.length === 0) return [];

  // Any message on the thread in the last 7 days — both directions.
  const dealIds = dealRows.map((d) => d.id);
  const recent = await fetchLatestMessageByDeal(client, workspaceId, dealIds);

  const out: ProactiveCandidate[] = [];
  for (const d of dealRows) {
    const lastMsg = recent.get(d.id);
    if (lastMsg && lastMsg >= sevenDaysAgoIso) continue;
    const daysOut = Math.floor(
      (new Date(d.proposed_date).getTime() - todayDate.getTime()) / DAYS,
    );
    out.push({
      deal_id: d.id,
      signal_type: 'dead_silence',
      headline:
        `Show is ${daysOut} day${daysOut === 1 ? '' : 's'} out and nobody has messaged this week.`,
      artifact_ref: { kind: 'deal', id: d.id },
      payload: { mode: 'pre_show_silence', days_out: daysOut, last_message_at: lastMsg ?? null },
    });
  }
  return out;
}

async function fetchLatestMessageByDeal(
  client: SystemClient,
  workspaceId: string,
  dealIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (dealIds.length === 0) return out;

  const { data: threads } = await client
    .schema('ops')
    .from('message_threads')
    .select('deal_id, last_message_at')
    .eq('workspace_id', workspaceId)
    .in('deal_id', dealIds);

  for (const t of (threads ?? []) as { deal_id: string; last_message_at: string }[]) {
    const prev = out.get(t.deal_id);
    if (!prev || t.last_message_at > prev) out.set(t.deal_id, t.last_message_at);
  }
  return out;
}
