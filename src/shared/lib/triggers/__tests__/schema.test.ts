/**
 * Zod schema tests for stage triggers (P0 follow-up engine).
 *
 * Focus is on the write-path validation rules that the `/settings/pipeline`
 * editor depends on: primitive-type enum, event enum with default, dwell_sla
 * requires dwell_days, total config size cap, max triggers per stage.
 */

import { describe, it, expect } from 'vitest';

import {
  StageTriggerSchema,
  StageTriggersSchema,
  FollowUpReasonTypeSchema,
  DismissalReasonSchema,
} from '../schema';

describe('StageTriggerSchema', () => {
  it('defaults missing event to on_enter', () => {
    const parsed = StageTriggerSchema.parse({
      type: 'enroll_in_follow_up',
      config: { reason_type: 'nudge_client' },
    });
    expect(parsed.event).toBe('on_enter');
  });

  it('accepts dwell_sla triggers with dwell_days', () => {
    const parsed = StageTriggerSchema.parse({
      type: 'enroll_in_follow_up',
      event: 'dwell_sla',
      dwell_days: 14,
      config: { reason_type: 'gone_quiet' },
    });
    expect(parsed.event).toBe('dwell_sla');
    expect(parsed.dwell_days).toBe(14);
  });

  it('rejects dwell_sla without dwell_days', () => {
    const result = StageTriggerSchema.safeParse({
      type: 'enroll_in_follow_up',
      event: 'dwell_sla',
      config: { reason_type: 'gone_quiet' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects dwell_sla with dwell_days <= 0', () => {
    const result = StageTriggerSchema.safeParse({
      type: 'enroll_in_follow_up',
      event: 'dwell_sla',
      dwell_days: 0,
      config: { reason_type: 'gone_quiet' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown primitive types', () => {
    const result = StageTriggerSchema.safeParse({
      type: 'send_telegram_to_competitor',
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it('preserves unknown config keys via passthrough', () => {
    const parsed = StageTriggerSchema.parse({
      type: 'create_task',
      config: { title: 'x', some_future_field: 42 },
    });
    expect((parsed.config as Record<string, unknown>).some_future_field).toBe(42);
  });
});

describe('StageTriggersSchema — per-stage caps', () => {
  it('accepts arrays up to 10 triggers', () => {
    const ten = Array.from({ length: 10 }, () => ({
      type: 'create_task' as const,
      event: 'on_enter' as const,
      config: { title: 't', assignee_rule: 'owner' as const },
    }));
    expect(() => StageTriggersSchema.parse(ten)).not.toThrow();
  });

  it('rejects 11+ triggers on a stage', () => {
    const eleven = Array.from({ length: 11 }, () => ({
      type: 'create_task' as const,
      event: 'on_enter' as const,
      config: { title: 't', assignee_rule: 'owner' as const },
    }));
    const result = StageTriggersSchema.safeParse(eleven);
    expect(result.success).toBe(false);
  });

  it('rejects arrays whose serialized size exceeds 4KB', () => {
    // One large label that pushes a single trigger over the 4KB threshold.
    // The trigger has a 120-char label cap, so we fan the weight across
    // several triggers.
    const oversize = Array.from({ length: 10 }, () => ({
      type: 'create_task' as const,
      event: 'on_enter' as const,
      config: {
        title: 'x'.repeat(119),
        label: 'y'.repeat(119),
        assignee_rule: 'owner' as const,
        // Giant passthrough payload
        custom_spec: 'z'.repeat(350),
      },
    }));
    const result = StageTriggersSchema.safeParse(oversize);
    expect(result.success).toBe(false);
  });
});

describe('FollowUpReasonTypeSchema', () => {
  it('includes the P0 reason types', () => {
    expect(FollowUpReasonTypeSchema.safeParse('nudge_client').success).toBe(true);
    expect(FollowUpReasonTypeSchema.safeParse('check_in').success).toBe(true);
    expect(FollowUpReasonTypeSchema.safeParse('gone_quiet').success).toBe(true);
    expect(FollowUpReasonTypeSchema.safeParse('thank_you').success).toBe(true);
  });

  it('rejects unknown reason types', () => {
    expect(FollowUpReasonTypeSchema.safeParse('please_ping_client').success).toBe(false);
  });
});

describe('DismissalReasonSchema', () => {
  it('accepts the 5 enum values', () => {
    for (const v of ['tire_kicker', 'wrong_timing', 'manual_nudge_sent', 'not_ready', 'other']) {
      expect(DismissalReasonSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(DismissalReasonSchema.safeParse('maybe_later').success).toBe(false);
  });
});
