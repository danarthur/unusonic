import { describe, it, expect } from 'vitest';
import {
  composeAionVoice,
  composeCadenceTooltipLine,
  type ComposeInput,
} from '../compose-aion-voice';
import type { DealUrgency } from '../deal-urgency';
import type { OwnerCadenceProfile } from '../owner-cadence';

function makeUrgency(daysOut: number | null): DealUrgency {
  return {
    date: daysOut !== null ? new Date().toISOString() : null,
    source: daysOut !== null ? 'event_next' : null,
    isSeries: false,
    totalShows: daysOut !== null ? 1 : 0,
    daysOut,
    multiplier:
      daysOut === null ? 1.0
      : daysOut > 90 ? 0.8
      : daysOut >= 30 ? 1.0
      : daysOut >= 14 ? 1.2
      : daysOut >= 7 ? 1.5
      : 2.0,
    suppress: false,
  };
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function sufficientCadence(typical: number): OwnerCadenceProfile {
  return {
    userId: 'u1',
    workspaceId: 'w1',
    archetype: 'wedding',
    sampleSize: 25,
    sampleQuality: 'sufficient',
    typicalDaysProposalToFirstFollowup: typical,
    typicalDaysBetweenFollowups: null,
    preferredChannelByStageTag: null,
    oldestSampleAgeDays: 90,
    computedAt: new Date().toISOString(),
    gateReasons: [],
  };
}

function insufficientCadence(): OwnerCadenceProfile {
  return {
    userId: 'u1',
    workspaceId: 'w1',
    archetype: 'wedding',
    sampleSize: 3,
    sampleQuality: 'insufficient',
    typicalDaysProposalToFirstFollowup: null,
    typicalDaysBetweenFollowups: null,
    preferredChannelByStageTag: null,
    oldestSampleAgeDays: 40,
    computedAt: new Date().toISOString(),
    gateReasons: ['sample_size<20'],
  };
}

describe('composeAionVoice — variants', () => {
  it('collapsed variant returns empty voice', () => {
    const input: ComposeInput = {
      variant: 'collapsed',
      urgency: makeUrgency(null),
      stall: null,
      proposal: null,
      client: { firstName: null },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toBe('');
    expect(result.contributingSignals).toEqual([]);
  });

  it('pipeline_only returns empty voice (collapsed-line variant handled by card)', () => {
    const input: ComposeInput = {
      variant: 'pipeline_only',
      urgency: makeUrgency(18),
      stall: null,
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: null,
    };
    expect(composeAionVoice(input).voice).toBe('');
  });
});

describe('composeAionVoice — days-out surfacing', () => {
  it('surfaces "{N} days out" when daysOut ≤ 30', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(25),
      stall: null,
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/25 days out/);
    expect(result.contributingSignals).toContain('days_out');
  });

  it('does NOT surface days-out when >30 (becomes filler)', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(60),
      stall: null,
      proposal: { sentAt: isoDaysAgo(5), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/60 days out/);
    expect(result.contributingSignals).not.toContain('days_out');
  });
});

describe('composeAionVoice — hot-opens override', () => {
  it('leads with hot-opens when viewCount >= 2 and recent', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(45),
      stall: null,
      proposal: {
        sentAt: isoDaysAgo(3),
        viewCount: 3,
        lastViewedAt: new Date().toISOString(),
        recentHotOpens: true,
      },
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/Emily opened the proposal 3×/);
    expect(result.contributingSignals).toContain('hot_opens');
    // Should NOT also include the stall-y "proposal sent" clause — hot-opens subsumes
    expect(result.voice).not.toMatch(/Proposal sent/);
  });

  it('hot-opens + near-term days-out prepends the days-out clause', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(14),
      stall: null,
      proposal: {
        sentAt: isoDaysAgo(2),
        viewCount: 4,
        lastViewedAt: new Date().toISOString(),
        recentHotOpens: true,
      },
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/^14 days out\./);
    expect(result.voice).toMatch(/Emily opened the proposal 4×/);
  });
});

describe('composeAionVoice — cadence personalization (User Advocate binding rules)', () => {
  it('renders "Past your typical check-in window" when sample quality sufficient AND exceeded', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(null),
      stall: null,
      proposal: { sentAt: isoDaysAgo(9), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: sufficientCadence(4),   // typical 4d, it's been 9d → exceeded
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/Past your typical check-in window/);
    expect(result.contributingSignals).toContain('cadence_exceeded');
    // Banned phrasing: should never say "you usually wait X days"
    expect(result.voice).not.toMatch(/you usually/i);
  });

  it('does NOT render cadence clause when gate fails (User Advocate: no "Aion is still learning")', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(null),
      stall: null,
      proposal: { sentAt: isoDaysAgo(9), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: insufficientCadence(),
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/typical check-in/i);
    expect(result.contributingSignals).not.toContain('cadence_exceeded');
    // Should NOT leak sample-size or "learning" language
    expect(result.voice).not.toMatch(/learning/i);
    expect(result.voice).not.toMatch(/observations/i);
  });

  it('does NOT render cadence clause when threshold not yet crossed', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(null),
      stall: null,
      proposal: { sentAt: isoDaysAgo(2), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: sufficientCadence(5),   // typical 5d, only 2d elapsed → within window
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/typical check-in window/);
  });
});

describe('composeAionVoice — stall fallback', () => {
  it('uses stall dwell vs rotting_days when cadence does not speak', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(null),
      stall: { daysInStage: 21, stageLabel: 'Inquiry', stageRottingDays: 7 },
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/21 days in Inquiry\./);
    expect(result.contributingSignals).toContain('stall_vs_rotting');
  });

  it('does NOT render stall clause when under rotting threshold', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(null),
      stall: { daysInStage: 4, stageLabel: 'Inquiry', stageRottingDays: 7 },
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/days in Inquiry/);
  });

  it('cadence-exceeded preempts stall fallback (one measuring stick wins)', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(null),
      stall: { daysInStage: 21, stageLabel: 'Inquiry', stageRottingDays: 7 },
      proposal: { sentAt: isoDaysAgo(10), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: sufficientCadence(4),
    };
    const result = composeAionVoice(input);
    expect(result.contributingSignals).toContain('cadence_exceeded');
    expect(result.contributingSignals).not.toContain('stall_vs_rotting');
  });
});

describe('composeAionVoice — banned phrasing (User Advocate binding rules)', () => {
  it('never says "you usually" (use possessive framing instead)', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(25),
      stall: { daysInStage: 15, stageLabel: 'Inquiry', stageRottingDays: 7 },
      proposal: { sentAt: isoDaysAgo(10), viewCount: 0, lastViewedAt: null, recentHotOpens: false },
      client: { firstName: 'Emily' },
      cadence: sufficientCadence(4),
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/you usually/i);
  });

  it('never announces AI learning status', () => {
    const input: ComposeInput = {
      variant: 'both',
      urgency: makeUrgency(25),
      stall: null,
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: insufficientCadence(),
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/learning your habits/i);
    expect(result.voice).not.toMatch(/still learning/i);
  });

  it('never uses exclamation marks', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(3),    // urgent
      stall: { daysInStage: 40, stageLabel: 'Inquiry', stageRottingDays: 7 },
      proposal: { sentAt: isoDaysAgo(15), viewCount: 10, lastViewedAt: new Date().toISOString(), recentHotOpens: true },
      client: { firstName: 'Emily' },
      cadence: sufficientCadence(4),
    };
    const result = composeAionVoice(input);
    expect(result.voice).not.toMatch(/!/);
  });
});

describe('composeAionVoice — fallback floor', () => {
  it('at minimum acknowledges silence when nothing else speaks', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(null),
      stall: null,
      proposal: null,
      client: { firstName: 'Emily' },
      cadence: null,
    };
    const result = composeAionVoice(input);
    expect(result.voice).toMatch(/No reply from Emily/);
  });

  it('returns empty string when no client name and no signals', () => {
    const input: ComposeInput = {
      variant: 'outbound_only',
      urgency: makeUrgency(null),
      stall: null,
      proposal: null,
      client: { firstName: null },
      cadence: null,
    };
    expect(composeAionVoice(input).voice).toBe('');
  });
});

describe('composeCadenceTooltipLine', () => {
  it('uses owner data when gate sufficient', () => {
    const line = composeCadenceTooltipLine(sufficientCadence(4), 'wedding');
    expect(line).toMatch(/Your typical check-in: 4 days/);
  });

  it('falls back to archetype default framed as "typical for weddings" (not "yours")', () => {
    const line = composeCadenceTooltipLine(insufficientCadence(), 'wedding');
    expect(line).toMatch(/weddings/);
    expect(line).toMatch(/5 days/);
    // Must NOT claim personalization
    expect(line).not.toMatch(/Your typical/);
  });

  it('falls back for null cadence + unknown archetype', () => {
    const line = composeCadenceTooltipLine(null, 'private_party');
    expect(line).toMatch(/shows like this/);
    expect(line).toMatch(/4 days/);
  });
});
