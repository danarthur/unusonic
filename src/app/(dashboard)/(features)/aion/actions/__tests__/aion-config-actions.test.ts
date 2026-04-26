/**
 * Wk 11 §3.8 — voice synthesis + onboarding short-circuit.
 *
 * Pure-function coverage on synthesizeDefaultVoice / applyVoiceDefaultIfEmpty
 * plus the getOnboardingState gate. Server-action behavior (read merge,
 * reset) is left to integration coverage; the on-read synthesis is the
 * load-bearing piece.
 */

import { describe, it, expect } from 'vitest';
import {
  synthesizeDefaultVoice,
  applyVoiceDefaultIfEmpty,
  type AionConfig,
} from '../aion-config-actions';
import { getOnboardingState } from '../../lib/aion-chat-types';

describe('synthesizeDefaultVoice', () => {
  it('inlines the workspace name into the description', () => {
    const v = synthesizeDefaultVoice('Invisible Touch Events');
    expect(v.description).toContain('Invisible Touch Events');
    expect(v.description).toContain('production vocabulary');
    expect(v.description).not.toContain('!');
  });

  it('falls back to a generic noun when name is empty', () => {
    const v = synthesizeDefaultVoice('');
    expect(v.description).toContain('this production company');
  });

  it('trims whitespace-only names to the generic fallback', () => {
    const v = synthesizeDefaultVoice('   ');
    expect(v.description).toContain('this production company');
  });

  it('always returns all three voice fields populated', () => {
    const v = synthesizeDefaultVoice('Acme Productions');
    expect(v.description.length).toBeGreaterThan(0);
    expect(v.example_message.length).toBeGreaterThan(0);
    expect(v.guardrails.length).toBeGreaterThan(0);
  });

  it('encodes the brand-voice rules in guardrails (no invented numbers)', () => {
    const v = synthesizeDefaultVoice('Acme Productions');
    expect(v.guardrails).toMatch(/never invent|verbatim/i);
  });
});

describe('applyVoiceDefaultIfEmpty', () => {
  it('injects synthesized voice + voice_default_derived flag when voice is missing', () => {
    const result = applyVoiceDefaultIfEmpty({}, 'Acme Productions');
    expect(result.voice?.description).toContain('Acme Productions');
    expect(result.voice_default_derived).toBe(true);
  });

  it('leaves an explicit voice untouched and does not set the derived flag', () => {
    const explicit: AionConfig = {
      voice: {
        description: 'Custom voice',
        example_message: 'Custom example',
        guardrails: 'Custom guardrails',
      },
    };
    const result = applyVoiceDefaultIfEmpty(explicit, 'Acme Productions');
    expect(result.voice?.description).toBe('Custom voice');
    expect(result.voice_default_derived).toBeUndefined();
  });

  it('treats a voice object missing description as empty (re-synthesizes)', () => {
    const partial: AionConfig = {
      voice: { description: '', example_message: 'x', guardrails: 'y' },
    };
    const result = applyVoiceDefaultIfEmpty(partial, 'Acme Productions');
    expect(result.voice?.description).toContain('Acme Productions');
    expect(result.voice_default_derived).toBe(true);
  });

  it('preserves other config keys (kill_switch, learned, follow_up_playbook) on synthesis', () => {
    const config: AionConfig = {
      kill_switch: true,
      learned: { vocabulary: [{ from: 'hi', to: 'hey', count: 1 }] },
    };
    const result = applyVoiceDefaultIfEmpty(config, 'Acme Productions');
    expect(result.kill_switch).toBe(true);
    expect(result.learned?.vocabulary?.[0].from).toBe('hi');
  });

  it('is a pure function — never mutates the input config', () => {
    const input: AionConfig = {};
    const result = applyVoiceDefaultIfEmpty(input, 'Acme Productions');
    expect(input.voice).toBeUndefined();
    expect(input.voice_default_derived).toBeUndefined();
    expect(result).not.toBe(input);
  });
});

describe('getOnboardingState (Wk 11 §3.8 gate)', () => {
  it('returns configured when voice_default_derived is true (skips 4-step forcing block)', () => {
    const config: AionConfig = {
      voice: synthesizeDefaultVoice('Acme'),
      voice_default_derived: true,
    };
    expect(getOnboardingState(config)).toBe('configured');
  });

  it('preserves no_voice when neither voice nor synthesis flag is set', () => {
    expect(getOnboardingState({})).toBe('no_voice');
  });

  it('preserves needs_test_draft for an explicit voice without onboarding_state=complete', () => {
    const config: AionConfig = {
      voice: {
        description: 'Custom',
        example_message: 'Custom',
        guardrails: 'Custom',
      },
    };
    expect(getOnboardingState(config)).toBe('needs_test_draft');
  });

  it('preserves configured for an explicit voice with onboarding_state=complete', () => {
    const config: AionConfig = {
      voice: {
        description: 'Custom',
        example_message: 'Custom',
        guardrails: 'Custom',
      },
      onboarding_state: 'complete',
    };
    expect(getOnboardingState(config)).toBe('configured');
  });

  it('reports per-step onboarding states correctly when no synthesis flag', () => {
    expect(getOnboardingState({ voice: { description: 'x', example_message: '', guardrails: '' } }))
      .toBe('no_example');
    expect(getOnboardingState({ voice: { description: 'x', example_message: 'y', guardrails: '' } }))
      .toBe('no_guardrails');
  });
});
