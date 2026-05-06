import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeFollowUpPriority } from '../follow-up-priority';

const NOW = new Date('2026-05-05T12:00:00Z');

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('computeFollowUpPriority — stage-tag derivation (audit Round 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The pre-fix code indexed STALL_STAGE_META[deal.status]; with the
  // collapsed status enum ('working' | 'won' | 'lost'), the lookup always
  // returned undefined and fell back to ordinal 0 (Inquiry). Result: a
  // contract-stage deal would be evaluated as if it were in Inquiry, and
  // the follow-up reason text said "Deal has been in Inquiry for X days".
  it('uses stage tags to pick the correct stall-stage ordinal for working deals', () => {
    // Inquiry-stage deal sitting 14 days — should report "Inquiry" stage.
    const inquiry = computeFollowUpPriority({
      deal: {
        status: 'working',
        createdAt: daysAgo(14),
        proposedDate: null,
        budgetEstimated: null,
        ownerUserId: 'u1',
        stageTags: ['initial_contact'],
      },
      proposal: null,
      daysSinceActivity: null,
      hasContestedDate: false,
    });
    expect(inquiry?.reasonContext.stall?.stageName).toBe('Inquiry');

    // Contract-stage deal sitting 14 days — should report "Contract sent"
    // stage, NOT "Inquiry". This is the audit-finding regression test.
    const contract = computeFollowUpPriority({
      deal: {
        status: 'working',
        createdAt: daysAgo(60),
        proposedDate: null,
        budgetEstimated: null,
        ownerUserId: 'u1',
        stageTags: ['contract_out'],
      },
      proposal: {
        createdAt: daysAgo(30),
        updatedAt: daysAgo(14),
        status: 'sent',
        viewCount: 0,
        lastViewedAt: null,
        emailBouncedAt: null,
      },
      daysSinceActivity: null,
      hasContestedDate: false,
    });
    expect(contract?.reasonContext.stall?.stageName).toBe('Contract sent');
  });

  it('proposal-stage deal evaluates against Proposal threshold, not Inquiry', () => {
    const result = computeFollowUpPriority({
      deal: {
        status: 'working',
        createdAt: daysAgo(60),
        proposedDate: null,
        budgetEstimated: null,
        ownerUserId: 'u1',
        stageTags: ['proposal_sent'],
      },
      proposal: {
        createdAt: daysAgo(10),
        updatedAt: null,
        status: 'sent',
        viewCount: 0,
        lastViewedAt: null,
        emailBouncedAt: null,
      },
      daysSinceActivity: null,
      hasContestedDate: false,
    });
    expect(result?.reasonContext.stall?.stageName).toBe('Proposal');
    // Default proposal threshold is 14 days; 10 days in shouldn't be
    // stalled.
    expect(result?.reasonContext.stall?.threshold).toBe(14);
    expect(result?.reasonContext.stall?.daysInStage).toBe(10);
    expect(result?.reasonContext.stall?.stalled).toBe(false);
  });

  it('falls back to ordinal 0 when stageTags are missing (preserves pre-fix behavior)', () => {
    // Don't break workspaces that haven't migrated tags yet — without
    // tags, the helper falls through to ordinal 0 (Inquiry) which matches
    // the pre-fix behavior, just without the bug-prone branch.
    const result = computeFollowUpPriority({
      deal: {
        status: 'working',
        createdAt: daysAgo(10),
        proposedDate: null,
        budgetEstimated: null,
        ownerUserId: 'u1',
        // no stageTags
      },
      proposal: null,
      daysSinceActivity: null,
      hasContestedDate: false,
    });
    expect(result?.reasonContext.stall?.stageName).toBe('Inquiry');
  });
});
