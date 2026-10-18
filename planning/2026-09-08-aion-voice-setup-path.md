# Aion Phase A: Voice Setup + First Draft

_Researched: 2026-09-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The question is based on the planning primer's snapshot from ~April 2026. The current codebase (September 2026) has advanced significantly — key assumptions no longer hold. This doc restates what actually exists, where the real friction is, and the minimum path forward.

## Current state

`aion_config` exists as a JSONB column on `public.workspaces` and is fully in active use. `getAionConfigForWorkspace()` at `aion-config-actions.ts:106` reads it via system client. `saveAionVoiceConfig()` at line 178, `resetAionVoiceConfig()` at line 214, and `updateAionConfigForWorkspace()` at line 262 write to it.

The `/api/aion/chat/route.ts` is a 465-line production system with auth, tier gating, model routing, session management, and streaming tool-calling. Not a stub.

The voice onboarding state machine is fully implemented. `getOnboardingState()` at `aion-chat-types.ts:247` derives one of five states from the stored config: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `prompts.ts:301` returns a distinct greeting for each state — `no_voice` opens with "How would you describe your style?" plus three chips. The system prompt at `prompts.ts:284` injects per-state onboarding instructions.

The `save_voice_config` tool at `core.ts:118` writes `{ description, example_message, guardrails }` to `aion_config.voice` and advances `onboarding_state` to `complete` when `onboarding_complete: true`. The `draft_follow_up` tool at `core.ts:318` generates a voice-matched draft via `generateFollowUpDraft()` at `generate-draft.ts:26`, which injects all three voice fields into the system prompt.

The "Tune Aion's voice" affordance in the `AionSidebar` header overflow (wired at `AionSidebar.tsx:1002`) calls `resetAionVoiceConfig()` to clear the stored voice and re-enter the onboarding flow.

The Aion page at `/aion` renders `ChatInterface` — this is the "Brain tab" equivalent. No separate Brain tab or paused component exists in the current codebase.

## Intended state

Daniel opens the Aion chat, writes freely about how he communicates with clients, and within minutes sees an Aion-generated follow-up draft that sounds like him. The whole journey: open → prompted for voice description → write 3 paragraphs → save → prompted for example message → paste one → save → prompted for guardrails → skip or add → offered a test draft → draft appears.

## The gap

- **Discoverability:** For any workspace where `voice_default_derived: true` (Aion synthesized a default voice from the workspace name), `getOnboardingState()` returns `configured` immediately, bypassing the entire voice setup conversation. The owner lands on the pull-mode greeting — no prompt, no nudge to set up a real voice. The only path to the onboarding flow is the sidebar overflow → "Tune Aion's voice" — a tertiary control most users will never notice.
- **Flow shape mismatch:** The stated goal is "write 3 paragraphs" in one go. The onboarding flow is conversational (one question per turn). A user who pastes 3 paragraphs of context in the first message gets a better-than-nothing result (the tool will extract the voice description), but the flow isn't optimized for that input shape.
- **Draft requires a deal in queue:** `draft_follow_up` pulls from `getFollowUpQueue`. A workspace with no active follow-up queue items can't complete the `needs_test_draft` step meaningfully.

## Options

### Option A: Document + redirect

- **What it is:** No code changes. Document the existing "Tune Aion's voice" path in the sidebar for Daniel to use today. The onboarding flow already works once entered.
- **Effort:** Small (zero eng, one Loom or note)
- **Main risk:** The affordance is too buried. Daniel has to know it exists, and new workspaces with `voice_default_derived: true` will never discover it.
- **Unlocks:** Daniel can set up his voice today. Does nothing for future users or discoverability.

### Option B: Surface the entry point in the Aion chat empty state

- **What it is:** When the Aion chat opens and `voice_default_derived: true` (synthesized voice, user never intentionally configured it), render a visible banner or prompt in the chat empty state: "You're using a default voice. Teach Aion how you actually write." A single CTA calls `resetAionVoiceConfig()` and reloads. The rest is the existing onboarding flow.
- **Effort:** Small. One new conditional block in `AionLandingStarters.tsx` or the empty-state section of `ChatInterface.tsx`. The server action exists. Requires one new prop (`voiceIsDefault: boolean`) passed from the page server component via `getAionConfig()`.
- **Main risk:** Low. `voice_default_derived` is already read correctly in `getOnboardingState()`. Risk is only if the prop doesn't reach the component cleanly.
- **Unlocks:** The existing 5-step onboarding flow becomes reachable for all workspaces. Every new Unusonic customer hits it on first visit.

### Option C: Build a dedicated voice setup form

- **What it is:** A 3-field form (description, example, guardrails) surfaced as a modal or settings section, separate from chat. On submit, calls `saveAionVoiceConfig()` directly. Optionally shows a preview draft using an inline call to `generateFollowUpDraft()` with the freshly saved voice.
- **Effort:** Medium. New modal component, server action call, optional draft preview. Roughly 2–4 hours.
- **Main risk:** Duplicates existing `save_voice_config` logic and side-steps the conversational onboarding that captures nuance. The chat flow teaches Aion vocabulary and patterns alongside the voice fields; a form does not.
- **Unlocks:** A faster, more intentional first-run experience for power users who want to write 3 paragraphs rather than answer questions one at a time.

## Recommendation

**Option B.** The infrastructure for Daniel's stated goal is already built and working — the voice onboarding flow, `save_voice_config` tool, and `draft_follow_up` tool all exist and are wired together. The only real problem is that established workspaces with a synthesized voice default never see the onboarding prompts. Option B fixes that with a small, targeted addition: one conditional check in the chat empty state that surfaces a visible CTA when `voice_default_derived: true`.

Option A is too passive — it does nothing for discoverability and requires Daniel to already know about a tertiary UI control. Option C adds build time and duplicates logic that the chat flow handles better (the conversational onboarding captures nuance that a 3-field form loses).

The tradeoff to accept with B: the "3 paragraphs in one message" shape. The onboarding is conversational. If Daniel writes everything at once, the `save_voice_config` tool should still extract the voice description correctly on the first turn. The multi-turn structure is a UX nice-to-have, not a technical requirement.

## Next steps for Daniel

1. **Verify the existing flow works end-to-end** in a workspace where `aion_config.voice_default_derived` is not set. Open Aion, check that the `no_voice` greeting ("How would you describe your style?") appears.
2. **Check your workspace's current config** by running `getAionConfig()` or looking at the `workspaces.aion_config` column in Supabase for your workspace row. Confirm whether `voice_default_derived: true` is what's causing you to land on the pull-mode greeting.
3. **If yes:** Use sidebar overflow → "Tune Aion's voice" to reset and test the flow manually today. This confirms Option B is the right fix.
4. **Implement Option B:** In `AionLandingStarters.tsx` (or the empty-state block in `ChatInterface.tsx`), add a conditional block when `voiceIsDefault === true`. Pass the flag from the page server component via `getAionConfig()`.
5. **Confirm the draft step works with a real deal.** Open Aion in the context of an active deal with a pending follow-up. The `draft_follow_up` tool needs an item in the follow-up queue to function. If your test workspace has no queued deals, trigger one manually before testing the `needs_test_draft` step.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, read/write actions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` state machine
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding prompt injection per state; `buildGreeting()` at 301
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:26` — `generateFollowUpDraft()` with voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — "Tune Aion's voice" reset affordance
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — candidate location for Option B entry point
