import { describe, it, expect } from 'vitest';
import {
  isReasonTypeStaleForStage,
  isTerminalStatus,
  stageOrdinalFromTags,
} from '../stage-gate';

describe('stageOrdinalFromTags', () => {
  it('maps initial_contact to ordinal 0 (inquiry)', () => {
    expect(stageOrdinalFromTags(['initial_contact'])).toEqual({
      ordinal: 0,
      slug: 'inquiry',
    });
  });

  it('maps proposal_sent to ordinal 1 (proposal)', () => {
    expect(stageOrdinalFromTags(['proposal_sent'])).toEqual({
      ordinal: 1,
      slug: 'proposal',
    });
  });

  it('maps contract_out to ordinal 2 (contract_sent)', () => {
    expect(stageOrdinalFromTags(['contract_out'])).toEqual({
      ordinal: 2,
      slug: 'contract_sent',
    });
  });

  it('returns null for terminal stages (won, lost, deposit_received)', () => {
    expect(stageOrdinalFromTags(['won'])).toBeNull();
    expect(stageOrdinalFromTags(['lost'])).toBeNull();
    expect(stageOrdinalFromTags(['deposit_received'])).toBeNull();
  });

  it('returns null for empty/missing tags', () => {
    expect(stageOrdinalFromTags(null)).toBeNull();
    expect(stageOrdinalFromTags(undefined)).toBeNull();
    expect(stageOrdinalFromTags([])).toBeNull();
  });

  it('contract_out wins over proposal_sent when both present (most-advanced rule)', () => {
    expect(stageOrdinalFromTags(['proposal_sent', 'contract_out'])).toEqual({
      ordinal: 2,
      slug: 'contract_sent',
    });
  });
});

describe('isTerminalStatus', () => {
  it('treats won and lost as terminal', () => {
    expect(isTerminalStatus('won')).toBe(true);
    expect(isTerminalStatus('lost')).toBe(true);
  });

  it('treats working and unknown as not terminal', () => {
    expect(isTerminalStatus('working')).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
    expect(isTerminalStatus('')).toBe(false);
  });
});

describe('isReasonTypeStaleForStage', () => {
  // Audit Round 3 finding 1: "Deal has been in Inquiry for 21 days" on a
  // deal that has progressed to Contract Sent.
  it('drops a stall row when the deal is at contract_out (advanced past inquiry/proposal)', () => {
    expect(isReasonTypeStaleForStage('stall', 'working', ['contract_out'])).toBe(false);
    // ^ stall stays valid at contract_out — the cron rebuilds with correct stage label.
    // What's stale: a stall on terminal status.
    expect(isReasonTypeStaleForStage('stall', 'won', ['won'])).toBe(true);
    expect(isReasonTypeStaleForStage('stall', 'lost', ['lost'])).toBe(true);
  });

  // Audit Round 3 finding 2: "Status: Proposal sent — follow up if no response"
  // on Bryan & Jessica (status=won).
  it('drops proposal-stage signals on won/lost deals', () => {
    expect(isReasonTypeStaleForStage('proposal_sent', 'won', ['won'])).toBe(true);
    expect(isReasonTypeStaleForStage('proposal_sent', 'lost', ['lost'])).toBe(true);
    expect(isReasonTypeStaleForStage('proposal_unseen', 'won', ['won'])).toBe(true);
    expect(isReasonTypeStaleForStage('proposal_bounced', 'won', ['won'])).toBe(true);
    expect(isReasonTypeStaleForStage('engagement_hot', 'won', ['won'])).toBe(true);
  });

  it('drops proposal-stage signals when the deal advances past proposal_sent', () => {
    // Working deal at contract_out — proposal_sent reason is now stale.
    expect(isReasonTypeStaleForStage('proposal_sent', 'working', ['contract_out'])).toBe(true);
    expect(isReasonTypeStaleForStage('proposal_unseen', 'working', ['contract_out'])).toBe(true);
    expect(isReasonTypeStaleForStage('proposal_bounced', 'working', ['contract_out'])).toBe(true);
    expect(isReasonTypeStaleForStage('engagement_hot', 'working', ['contract_out'])).toBe(true);
  });

  it('keeps proposal-stage signals at proposal_sent (the current stage)', () => {
    expect(isReasonTypeStaleForStage('proposal_sent', 'working', ['proposal_sent'])).toBe(false);
    expect(isReasonTypeStaleForStage('proposal_unseen', 'working', ['proposal_sent'])).toBe(false);
    expect(isReasonTypeStaleForStage('proposal_bounced', 'working', ['proposal_sent'])).toBe(false);
    expect(isReasonTypeStaleForStage('engagement_hot', 'working', ['proposal_sent'])).toBe(false);
  });

  it('drops draft_aging once a proposal has been sent', () => {
    expect(isReasonTypeStaleForStage('draft_aging', 'working', ['initial_contact'])).toBe(false);
    expect(isReasonTypeStaleForStage('draft_aging', 'working', ['proposal_sent'])).toBe(true);
    expect(isReasonTypeStaleForStage('draft_aging', 'working', ['contract_out'])).toBe(true);
  });

  it('drops unsigned outside contract_out', () => {
    expect(isReasonTypeStaleForStage('unsigned', 'working', ['contract_out'])).toBe(false);
    expect(isReasonTypeStaleForStage('unsigned', 'working', ['proposal_sent'])).toBe(true);
    expect(isReasonTypeStaleForStage('unsigned', 'won', ['won'])).toBe(true);
  });

  it('keeps deposit_overdue at contract_out and deposit_received', () => {
    expect(isReasonTypeStaleForStage('deposit_overdue', 'working', ['contract_out'])).toBe(false);
    expect(isReasonTypeStaleForStage('deposit_overdue', 'working', ['deposit_received'])).toBe(false);
    expect(isReasonTypeStaleForStage('deposit_overdue', 'working', ['proposal_sent'])).toBe(true);
    expect(isReasonTypeStaleForStage('deposit_overdue', 'won', ['won'])).toBe(true);
  });

  it('keeps stage-agnostic reasons on working deals at any stage', () => {
    const stages = [['initial_contact'], ['proposal_sent'], ['contract_out']];
    const stageless: string[] = [
      'deadline_proximity',
      'no_owner',
      'no_activity',
      'nudge_client',
      'check_in',
      'gone_quiet',
      'date_hold_pressure',
    ];
    for (const reason of stageless) {
      for (const tags of stages) {
        expect(
          isReasonTypeStaleForStage(reason, 'working', tags),
        ).toBe(false);
      }
    }
  });

  it('drops stage-agnostic reasons on won/lost deals', () => {
    expect(isReasonTypeStaleForStage('deadline_proximity', 'won', ['won'])).toBe(true);
    expect(isReasonTypeStaleForStage('no_owner', 'lost', ['lost'])).toBe(true);
    expect(isReasonTypeStaleForStage('gone_quiet', 'won', ['won'])).toBe(true);
  });

  it('thank_you only fires on won deals', () => {
    expect(isReasonTypeStaleForStage('thank_you', 'won', ['won'])).toBe(false);
    expect(isReasonTypeStaleForStage('thank_you', 'working', ['contract_out'])).toBe(true);
    expect(isReasonTypeStaleForStage('thank_you', 'lost', ['lost'])).toBe(true);
  });

  it('passes through when stage tags are unknown (cron-rebuild fallback)', () => {
    // When we can't resolve the stage tags, prefer letting the row
    // through; the cron rebuilds an accurate row on its next run.
    expect(isReasonTypeStaleForStage('proposal_sent', 'working', null)).toBe(false);
    expect(isReasonTypeStaleForStage('stall', 'working', [])).toBe(false);
  });
});
