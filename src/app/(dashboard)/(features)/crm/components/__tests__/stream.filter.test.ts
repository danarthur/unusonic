/**
 * Unit tests for Stream tab filter logic (Phase 3h).
 *
 * Goals:
 *   1. Regression: stock-seeded workspaces (initial_contact → 'inquiry',
 *      proposal_sent → 'proposal', etc.) produce the same deal set as the
 *      pre-3h literal-slug filter. Every stock deal ends up in the same tab.
 *   2. Rename-resilience: a workspace that renamed "Proposal" to "Pitch" and
 *      swapped the slug still sees the deal in the Inquiry tab, because the
 *      stage carries the proposal_sent tag.
 *   3. Fallback: a deal whose stage_id doesn't resolve (stage was hard-deleted
 *      or pipelineStages empty) falls back to legacy slug checks and stays
 *      in the expected tab.
 *
 * These tests exercise the pure filterByMode function from stream-filter.ts —
 * no React rendering, no Supabase, no DOM.
 */

import { describe, it, expect } from 'vitest';
import { filterByMode } from '../stream-filter';
import type { StreamCardItem } from '../stream-card';
import type { WorkspacePipelineStage } from '../../actions/get-workspace-pipeline-stages';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOW_ISO = '2026-04-17';
const FUTURE_DATE = '2026-06-01';
const PAST_DATE = '2026-01-01';

/** Stock-seeded 7-stage Sales pipeline matching the Phase 1 seed migration. */
const STOCK_STAGES: WorkspacePipelineStage[] = [
  {
    id: 'stage-inquiry', slug: 'inquiry', label: 'Inquiry', kind: 'working',
    sort_order: 1, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['initial_contact'], color_token: null, triggers: [],
  },
  {
    id: 'stage-proposal', slug: 'proposal', label: 'Proposal Sent', kind: 'working',
    sort_order: 2, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['proposal_sent'], color_token: null, triggers: [],
  },
  {
    id: 'stage-contract-sent', slug: 'contract_sent', label: 'Contract Sent', kind: 'working',
    sort_order: 3, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['contract_out'], color_token: null, triggers: [],
  },
  {
    id: 'stage-contract-signed', slug: 'contract_signed', label: 'Contract Signed', kind: 'working',
    sort_order: 4, requires_confirmation: true, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['contract_signed'], color_token: null, triggers: [],
  },
  {
    id: 'stage-deposit', slug: 'deposit_received', label: 'Deposit Received', kind: 'working',
    sort_order: 5, requires_confirmation: true, opens_handoff_wizard: true,
    hide_from_portal: false, tags: ['deposit_received', 'ready_for_handoff'], color_token: null, triggers: [],
  },
  {
    id: 'stage-won', slug: 'won', label: 'Won', kind: 'won',
    sort_order: 6, requires_confirmation: true, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['won'], color_token: null, triggers: [],
  },
  {
    id: 'stage-lost', slug: 'lost', label: 'Lost', kind: 'lost',
    sort_order: 7, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['lost'], color_token: null, triggers: [],
  },
];

/** A custom-renamed pipeline: "Lead" / "Pitch" / "Paperwork" / "Booked" / "Lost"
 *  with different slugs, preserving the semantic tags. */
const CUSTOM_STAGES: WorkspacePipelineStage[] = [
  {
    id: 'custom-lead', slug: 'first_touch', label: 'First touch', kind: 'working',
    sort_order: 1, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['initial_contact'], color_token: null, triggers: [],
  },
  {
    id: 'custom-pitch', slug: 'pitch', label: 'Pitch', kind: 'working',
    sort_order: 2, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['proposal_sent'], color_token: null, triggers: [],
  },
  {
    id: 'custom-paperwork', slug: 'paperwork', label: 'Paperwork', kind: 'working',
    sort_order: 3, requires_confirmation: false, opens_handoff_wizard: true,
    hide_from_portal: false, tags: ['contract_out', 'contract_signed', 'deposit_received', 'ready_for_handoff'], color_token: null, triggers: [],
  },
  {
    id: 'custom-booked', slug: 'booked', label: 'Booked', kind: 'won',
    sort_order: 4, requires_confirmation: true, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['won'], color_token: null, triggers: [],
  },
  {
    id: 'custom-passed', slug: 'passed', label: 'Passed', kind: 'lost',
    sort_order: 5, requires_confirmation: false, opens_handoff_wizard: false,
    hide_from_portal: false, tags: ['lost'], color_token: null, triggers: [],
  },
];

function dealItem(overrides: Partial<StreamCardItem>): StreamCardItem {
  return {
    id: 'deal-1',
    title: 'Test deal',
    status: 'inquiry',
    event_date: FUTURE_DATE,
    location: null,
    client_name: null,
    source: 'deal',
    stage_id: 'stage-inquiry',
    ...overrides,
  };
}

function eventItem(overrides: Partial<StreamCardItem>): StreamCardItem {
  return {
    id: 'event-1',
    title: 'Test event',
    status: null,
    event_date: FUTURE_DATE,
    location: null,
    client_name: null,
    source: 'event',
    lifecycle_status: 'confirmed',
    archived_at: null,
    ...overrides,
  };
}

// ── Regression: stock workspace produces same buckets as pre-3h filter ───────

describe('filterByMode — stock workspace regression', () => {
  const d = {
    inquiry: dealItem({ id: 'd-inq', status: 'inquiry', stage_id: 'stage-inquiry', event_date: FUTURE_DATE }),
    proposal: dealItem({ id: 'd-prop', status: 'proposal', stage_id: 'stage-proposal', event_date: FUTURE_DATE }),
    contract_sent: dealItem({ id: 'd-cs', status: 'contract_sent', stage_id: 'stage-contract-sent', event_date: FUTURE_DATE }),
    contract_signed: dealItem({ id: 'd-csi', status: 'contract_signed', stage_id: 'stage-contract-signed', event_date: FUTURE_DATE }),
    deposit: dealItem({ id: 'd-dep', status: 'deposit_received', stage_id: 'stage-deposit', event_date: FUTURE_DATE }),
    wonFuture: dealItem({ id: 'd-won-f', status: 'won', stage_id: 'stage-won', event_date: FUTURE_DATE }),
    wonPast: dealItem({ id: 'd-won-p', status: 'won', stage_id: 'stage-won', event_date: PAST_DATE }),
    lost: dealItem({ id: 'd-lost', status: 'lost', stage_id: 'stage-lost', event_date: FUTURE_DATE }),
    inquiryPast: dealItem({ id: 'd-inq-p', status: 'inquiry', stage_id: 'stage-inquiry', event_date: PAST_DATE }),
    eventFuture: eventItem({ id: 'e-f', event_date: FUTURE_DATE }),
    eventPast: eventItem({ id: 'e-p', event_date: PAST_DATE }),
    eventCancelled: eventItem({ id: 'e-c', event_date: FUTURE_DATE, lifecycle_status: 'cancelled' }),
  };

  const all = Object.values(d);

  it('Inquiry tab: future-dated inquiry + proposal deals only', () => {
    const got = filterByMode(all, 'inquiry', STOCK_STAGES, NOW_ISO).map((i) => i.id).sort();
    expect(got).toEqual(['d-inq', 'd-prop'].sort());
  });

  it('Active tab: future events + future contract_sent/signed/deposit/won deals', () => {
    const got = filterByMode(all, 'active', STOCK_STAGES, NOW_ISO).map((i) => i.id).sort();
    expect(got).toEqual(['d-cs', 'd-csi', 'd-dep', 'd-won-f', 'e-f'].sort());
  });

  it('Past tab: past events + cancelled events + lost + won-past + past-dated pre-handover deals', () => {
    const got = filterByMode(all, 'past', STOCK_STAGES, NOW_ISO).map((i) => i.id).sort();
    expect(got).toEqual(['d-inq-p', 'd-lost', 'd-won-p', 'e-c', 'e-p'].sort());
  });

  it('every stock deal lands in exactly one tab (no duplication, no drop)', () => {
    const inq = new Set(filterByMode(all, 'inquiry', STOCK_STAGES, NOW_ISO).map((i) => i.id));
    const act = new Set(filterByMode(all, 'active', STOCK_STAGES, NOW_ISO).map((i) => i.id));
    const past = new Set(filterByMode(all, 'past', STOCK_STAGES, NOW_ISO).map((i) => i.id));
    for (const item of all) {
      const count = (inq.has(item.id) ? 1 : 0) + (act.has(item.id) ? 1 : 0) + (past.has(item.id) ? 1 : 0);
      // Every item is in exactly one tab. (Cancelled future event goes to Past
      // only, NOT Active — the filter dedups that case.)
      expect(count, `item ${item.id}`).toBe(1);
    }
  });
});

// ── Custom-renamed workspace: tag-based resolution ──────────────────────────

describe('filterByMode — custom-renamed pipeline', () => {
  it('Inquiry tab: deal on custom "first_touch" stage (initial_contact tag) appears', () => {
    const deal = dealItem({
      id: 'd-custom-inq',
      status: 'custom_inquiry_slug',
      stage_id: 'custom-lead',
      event_date: FUTURE_DATE,
    });
    const got = filterByMode([deal], 'inquiry', CUSTOM_STAGES, NOW_ISO);
    expect(got.map((i) => i.id)).toEqual(['d-custom-inq']);
  });

  it('Inquiry tab: deal on custom "pitch" stage (proposal_sent tag) appears', () => {
    const deal = dealItem({
      id: 'd-custom-pitch',
      status: 'pitch',
      stage_id: 'custom-pitch',
      event_date: FUTURE_DATE,
    });
    const got = filterByMode([deal], 'inquiry', CUSTOM_STAGES, NOW_ISO);
    expect(got.map((i) => i.id)).toEqual(['d-custom-pitch']);
  });

  it('Active tab: deal on custom "paperwork" stage (contract_out tag, NOT inquiry tags) appears', () => {
    const deal = dealItem({
      id: 'd-custom-paperwork',
      status: 'paperwork',
      stage_id: 'custom-paperwork',
      event_date: FUTURE_DATE,
    });
    const got = filterByMode([deal], 'active', CUSTOM_STAGES, NOW_ISO);
    expect(got.map((i) => i.id)).toEqual(['d-custom-paperwork']);
  });

  it('Past tab: deal on custom "passed" stage (lost kind) appears', () => {
    const deal = dealItem({
      id: 'd-custom-passed',
      status: 'passed',
      stage_id: 'custom-passed',
      event_date: FUTURE_DATE,
    });
    const got = filterByMode([deal], 'past', CUSTOM_STAGES, NOW_ISO);
    expect(got.map((i) => i.id)).toEqual(['d-custom-passed']);
  });

  it('Active tab: deal on custom "booked" stage (won kind) with future date appears', () => {
    const deal = dealItem({
      id: 'd-custom-booked-f',
      status: 'booked',
      stage_id: 'custom-booked',
      event_date: FUTURE_DATE,
    });
    expect(filterByMode([deal], 'active', CUSTOM_STAGES, NOW_ISO).map((i) => i.id)).toEqual(['d-custom-booked-f']);
  });

  it('Past tab: deal on custom "booked" stage (won kind) with past date appears', () => {
    const deal = dealItem({
      id: 'd-custom-booked-p',
      status: 'booked',
      stage_id: 'custom-booked',
      event_date: PAST_DATE,
    });
    expect(filterByMode([deal], 'past', CUSTOM_STAGES, NOW_ISO).map((i) => i.id)).toEqual(['d-custom-booked-p']);
  });
});

// ── Fallback: missing / stale stage_id uses legacy slug check ───────────────

describe('filterByMode — fallback to legacy slugs', () => {
  it('deal with stage_id=null but legacy status=inquiry still appears in Inquiry tab', () => {
    const deal = dealItem({
      id: 'd-nostage-inq',
      status: 'inquiry',
      stage_id: null,
      event_date: FUTURE_DATE,
    });
    expect(filterByMode([deal], 'inquiry', STOCK_STAGES, NOW_ISO).map((i) => i.id)).toEqual(['d-nostage-inq']);
  });

  it('deal with stage_id that does not resolve still classified by legacy slug', () => {
    const deal = dealItem({
      id: 'd-deleted-stage',
      status: 'contract_sent',
      stage_id: 'stage-that-no-longer-exists',
      event_date: FUTURE_DATE,
    });
    // stage_id doesn't resolve against STOCK_STAGES → falls back to status slug.
    expect(filterByMode([deal], 'active', STOCK_STAGES, NOW_ISO).map((i) => i.id)).toEqual(['d-deleted-stage']);
  });

  it('empty pipelineStages (complete lookup failure) uses legacy slugs end-to-end', () => {
    const deals = [
      dealItem({ id: 'd-inq', status: 'inquiry', stage_id: 'any', event_date: FUTURE_DATE }),
      dealItem({ id: 'd-prop', status: 'proposal', stage_id: 'any', event_date: FUTURE_DATE }),
      dealItem({ id: 'd-cs', status: 'contract_sent', stage_id: 'any', event_date: FUTURE_DATE }),
      dealItem({ id: 'd-won-f', status: 'won', stage_id: 'any', event_date: FUTURE_DATE }),
      dealItem({ id: 'd-lost', status: 'lost', stage_id: 'any', event_date: FUTURE_DATE }),
    ];
    const inq = filterByMode(deals, 'inquiry', [], NOW_ISO).map((i) => i.id).sort();
    expect(inq).toEqual(['d-inq', 'd-prop'].sort());
    const act = filterByMode(deals, 'active', [], NOW_ISO).map((i) => i.id).sort();
    expect(act).toEqual(['d-cs', 'd-won-f'].sort());
    const past = filterByMode(deals, 'past', [], NOW_ISO).map((i) => i.id).sort();
    expect(past).toEqual(['d-lost'].sort());
  });
});
