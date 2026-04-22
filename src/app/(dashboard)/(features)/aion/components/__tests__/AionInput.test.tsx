/**
 * Regression test for Phase 2 Sprint 3 §3.3 mobile voice gating.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.3
 *   "Desktop chat input mic: no. Ship only mobile /aion at viewport <768px."
 *
 * Tailwind's `md:` prefix activates at ≥768px. Wrapping the voice mount in
 * `md:hidden` collapses it on desktop — the rendered class is the contract,
 * so this test asserts the class string rather than simulating viewport math
 * (jsdom doesn't evaluate CSS media queries).
 *
 * If someone removes `md:hidden` to "make voice work on desktop too," this
 * test fails and forces a design conversation before re-shipping the 2020
 * Einstein Voice anti-pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// SessionContext uses browser APIs (fetch streams, etc.) that don't need
// real wiring for this render test. Stub the hook so the input mounts.
vi.mock('@/shared/ui/providers/SessionContext', () => ({
  useSession: () => ({
    sendMessage: vi.fn(),
    sendChatMessage: vi.fn(),
    addMessage: vi.fn(),
    messages: [],
    isLoading: false,
  }),
}));

// AionVoice touches MediaRecorder / getUserMedia — swap for a trivial stub so
// the render tree is stable.
vi.mock('@/app/(dashboard)/(features)/aion/components/AionVoice', () => ({
  __esModule: true,
  default: () => <button type="button" data-testid="voice-stub">voice</button>,
}));

import { AionInput } from '../AionInput';

describe('<AionInput /> mobile voice gating', () => {
  it('wraps the voice button in md:hidden so desktop never shows it', () => {
    const { container } = render(
      <AionInput
        value=""
        onChange={() => { /* noop */ }}
        onSubmit={() => { /* noop */ }}
      />,
    );
    const voiceStub = container.querySelector('[data-testid="voice-stub"]');
    expect(voiceStub).not.toBeNull();
    // Walk up to the mount wrapper — the parent carries the responsive class.
    const wrapper = voiceStub!.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain('md:hidden');
  });

  it('omits the voice wrapper entirely when showVoice=false', () => {
    const { container } = render(
      <AionInput
        value=""
        onChange={() => { /* noop */ }}
        showVoice={false}
      />,
    );
    expect(container.querySelector('[data-testid="voice-stub"]')).toBeNull();
  });
});
