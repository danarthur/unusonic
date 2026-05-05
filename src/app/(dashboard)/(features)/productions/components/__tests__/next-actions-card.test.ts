import { describe, it, expect } from 'vitest';
import { computeActions } from '../next-actions-card';
import type { DealDetail } from '../../actions/get-deal';
import type { ProposalWithItems } from '@/features/sales/model/types';
import type { DealStakeholderDisplay } from '../../actions/deal-stakeholders';
import type { WorkspacePipelineStage } from '../../actions/get-workspace-pipeline-stages';

// ─ Test fixtures ────────────────────────────────────────────────────────────

function makeDeal(partial: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    workspace_id: 'ws-1',
    title: 'Test deal',
    status: 'working',
    stage_id: null,
    created_at: '2026-01-01T00:00:00Z',
    proposed_date: null,
    event_archetype: null,
    notes: null,
    budget_estimated: null,
    event_id: null,
    organization_id: null,
    main_contact_id: null,
    venue_id: null,
    owner_user_id: null,
    owner_entity_id: null,
    lead_source: null,
    lead_source_id: null,
    lead_source_detail: null,
    referrer_entity_id: null,
    event_start_time: null,
    event_end_time: null,
    lost_reason: null,
    lost_to_competitor_name: null,
    won_at: null,
    lost_at: null,
    show_health: null,
    ...partial,
  };
}

function makeStage(partial: Partial<WorkspacePipelineStage>): WorkspacePipelineStage {
  return {
    id: 'stage-x',
    slug: 'stage-x',
    label: 'Stage X',
    kind: 'working',
    sort_order: 1,
    requires_confirmation: false,
    opens_handoff_wizard: false,
    hide_from_portal: false,
    tags: [],
    color_token: null,
    triggers: [],
    ...partial,
  };
}

const EMPTY_STAKEHOLDERS: DealStakeholderDisplay[] = [];
const NO_PROPOSAL: ProposalWithItems | null = null;

const actionIds = (actions: ReturnType<typeof computeActions>) => actions.map((a) => a.id);

// ─ Tests ────────────────────────────────────────────────────────────────────

describe('computeActions — stage-tag-driven checklist (Phase 3i)', () => {
  it('always emits client + date items, regardless of stage', () => {
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, null);
    expect(actionIds(actions)).toEqual(['client', 'date']);
  });

  it('tag=initial_contact → Inquiry checklist (budget + build proposal)', () => {
    const stage = makeStage({ tags: ['initial_contact'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'budget', 'proposal']);
  });

  it('tag=proposal_sent → Proposal checklist (line items + send)', () => {
    const stage = makeStage({ tags: ['proposal_sent'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'items', 'send']);
  });

  it('tag=contract_out → Contract sent checklist (opened + deposit_terms + signed)', () => {
    const stage = makeStage({ tags: ['contract_out'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'opened', 'deposit_terms', 'signed']);
  });

  it('tag=contract_signed → Contract-signed checklist (crew + venue + handover)', () => {
    const stage = makeStage({ tags: ['contract_signed'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'crew', 'venue', 'handover']);
  });

  it('tag=deposit_received → same as contract_signed branch', () => {
    const stage = makeStage({ tags: ['deposit_received', 'ready_for_handoff'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'crew', 'venue', 'handover']);
  });

  it('tag=ready_for_handoff alone → same as contract_signed branch', () => {
    const stage = makeStage({ tags: ['ready_for_handoff'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'crew', 'venue', 'handover']);
  });

  it('kind=won → post-handover checklist (handed_over)', () => {
    const stage = makeStage({ kind: 'won', tags: ['won'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'handed_over']);
  });

  it('kind=lost → only the always-relevant items (no dead-end checklist)', () => {
    const stage = makeStage({ kind: 'lost', tags: ['lost'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date']);
  });

  it('deposit required + paid marks deposit done (on contract_signed branch)', () => {
    const stage = makeStage({ tags: ['contract_signed'] });
    const proposal = { deposit_percent: 50, deposit_paid_at: '2026-04-10T00:00:00Z' } as ProposalWithItems;
    const actions = computeActions(makeDeal(), proposal, EMPTY_STAKEHOLDERS, 0, stage);
    const deposit = actions.find((a) => a.id === 'deposit');
    expect(deposit).toBeDefined();
    expect(deposit?.done).toBe(true);
  });

  it('no deposit percent → deposit item is omitted (contract_signed branch)', () => {
    const stage = makeStage({ tags: ['contract_signed'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).not.toContain('deposit');
  });

  it('custom-labeled stage with canonical tag still routes correctly', () => {
    // Workspace renamed "Inquiry" to "First ask" — tag remains.
    const stage = makeStage({ slug: 'first_ask', label: 'First ask', tags: ['initial_contact'] });
    const actions = computeActions(makeDeal(), NO_PROPOSAL, EMPTY_STAKEHOLDERS, 0, stage);
    expect(actionIds(actions)).toEqual(['client', 'date', 'budget', 'proposal']);
  });

  it('client linked via bill_to stakeholder marks client item done', () => {
    const stakeholders: DealStakeholderDisplay[] = [
      { role: 'bill_to', name: 'Amanda Smith' } as DealStakeholderDisplay,
    ];
    const actions = computeActions(makeDeal(), NO_PROPOSAL, stakeholders, 0, null);
    const client = actions.find((a) => a.id === 'client');
    expect(client?.done).toBe(true);
    expect(client?.detail).toBe('Amanda Smith');
  });
});
