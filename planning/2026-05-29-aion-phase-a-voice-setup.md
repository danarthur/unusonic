# Aion Phase A: Voice setup + first real draft

_Researched: 2026-05-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The planning primer is stale. The infrastructure the question assumes is missing was shipped.**

`public.workspaces.aion_config` exists — confirmed as a `Json` column in `src/types/supabase.ts:7689`. The `AionConfig` type (defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`) includes `voice?: AionVoiceConfig`, which is exactly `{ description, example_message, guardrails }` — the three fields Daniel would fill in.

The full chat API lives at `src/app/api/aion/chat/route.ts` (300+ lines: auth, rate-limit, kill-switch, streaming, tool loop). The 16-line GPT-4-turbo stub is gone.

`/api/aion/draft-follow-up/route.ts` exists with auth, tier gating, and kill-switch enforcement. It calls `generateFollowUpDraft()` (`src/app/api/aion/lib/generate-draft.ts:25`), which injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly into the system prompt (`generate-draft.ts:63–75`).

`getDealContextForAion` exists at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` and is used in multiple places including the draft tool.

A full 5-state onboarding machine is implemented: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads `getOnboardingState(aionConfig)` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) and injects state-specific system prompt blocks (`src/app/api/aion/chat/route/prompts.ts:275–283`). `buildGreeting()` sends the right opener for each state. The `save_voice_config` chat tool (`src/app/api/aion/chat/tools/core.ts:118`) saves to DB mid-conversation. The `draft_follow_up` tool falls back to the top of the follow-up queue when no deal is in scope (`core.ts:332–336`).

**The onboarding flow is completely built. It just has one problem.**

## Intended state

Daniel opens Aion, describes his style in conversation, and immediately sees a draft that sounds like him. The system should:

1. Recognize that no real voice has been set yet
2. Ask about style, then example message, then guardrails (3 natural turns)
3. Generate a test draft from the queue
4. On approval, mark onboarding complete and proceed to the normal queue surface

This is the exact `no_voice → no_example → no_guardrails → needs_test_draft → configured` flow that already exists.

## The gap

- `applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a generic voice from the workspace name and sets `voice_default_derived: true` on every read when no voice is stored
- `getOnboardingState` short-circuits to `'configured'` when `voice_default_derived === true` (`aion-chat-types.ts:248`)
- Result: a new workspace never sees the 4-step onboarding. The greeting fires as if voice is already set. Daniel would have to find the hidden "Tune Aion's voice" overflow item in the sidebar settings menu to trigger it
- There is no "Brain tab" as a separate surface — Aion is a single `/aion` chat page. The question's framing references something that doesn't exist as a named route or component

The gap is purely discoverability. Every line of the onboarding flow is live and tested.

## Options

### Option A: Soft nudge chip on first Aion open
- **What it is:** When `voice_default_derived === true` and no prior messages exist in the session, add a suggestion chip to the initial greeting: "Teach Aion your voice." Tapping it calls `resetAionVoiceConfig()` then starts a new chat — the `no_voice` greeting fires naturally from there. One conditional render in `ChatInterface.tsx`, no new components, no DB changes.
- **Effort:** Small (2–3 hours)
- **Main risk:** Low discoverability — chips can be missed; users may dismiss them without understanding the value
- **Unlocks:** Daniel can trigger full onboarding any time with one tap, and the draft at the end respects his voice

### Option B: Treat first-session as no_voice by default
- **What it is:** Remove or narrow `applyVoiceDefaultIfEmpty` — instead of synthesizing a voice on every cold read, only apply the synthesized default if `onboarding_state === 'complete'` is explicitly set. All new workspaces would start at `no_voice` and walk through the 4-step flow before the normal chat is accessible. The "Tune Aion's voice" overflow item becomes the reset path (already built).
- **Effort:** Small-medium (half a day + regression check on the derived-voice path)
- **Main risk:** Forces onboarding on every new workspace, including ones where a team member — not the owner — opens Aion first. Could feel abrupt.
- **Unlocks:** Voice is always intentionally set before Aion is used. Drafts are better from day one.

### Option C: Inline voice capture at the Follow-Up Card draft button
- **What it is:** In `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx`, when `voice_default_derived === true`, intercept the "Draft" button tap with a 3-field inline form (description, example, guardrails). On save, call `saveAionVoiceConfig`, then immediately generate the draft with the new voice. Sets up voice at the exact moment of first real use.
- **Effort:** Medium (2–3 days: inline form component, conditional routing, form action)
- **Main risk:** More surface area. Interrupts the draft flow on the deal page. Harder to discover than a nudge on the Aion page itself.
- **Unlocks:** Voice is always set before any draft is generated, from the most-used entry point

## Recommendation

**Ship Option B.** Narrow the synthesized-default short-circuit.

The current behavior — silently setting `voice_default_derived` and skipping onboarding — was the right call when onboarding wasn't built yet. Now that it is, the short-circuit is actively harmful. The fix is small: change `applyVoiceDefaultIfEmpty` (or the `getOnboardingState` check at `aion-chat-types.ts:248`) so that `voice_default_derived` no longer bypasses the 4-step flow. A workspace in this state returns `no_voice` until the owner explicitly completes or skips setup.

The tradeoff to accept: any workspace that already has `voice_default_derived: true` in production will enter the onboarding flow on the next Aion open. That's the right behavior — they were never set up, they just didn't know it.

Pair Option B with a soft skip: in the `no_voice` greeting, add a "Skip for now" chip that calls `save_voice_config` with `onboarding_complete: true` and the synthesized default as the voice data. This gives impatient users an exit without trapping them.

Do NOT build Option C yet — the follow-up card's draft button is a secondary surface and this complexity isn't needed for Phase A.

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`, change `applyVoiceDefaultIfEmpty` so it still synthesizes the voice object for use in the API (to avoid null-guards downstream), but does NOT set `voice_default_derived: true`
2. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`, remove the `voice_default_derived` short-circuit so `getOnboardingState` evaluates the voice fields directly
3. Run `npm run test` — the `__tests__/aion-config-actions.test.ts` suite covers this path and will tell you exactly what breaks
4. In `src/app/api/aion/chat/route/prompts.ts:301–311` (the `no_voice` greeting), add a "Skip — use defaults" chip that sends `save_voice_config` with `onboarding_complete: true`; verify it fires with `voice_default_derived` cleared
5. Open the Aion page in the dev server with a workspace that has no explicit voice — confirm "How would you describe your style?" appears as the first message
6. Type 3 sentences about your style, paste an example, add a guardrail, approve the test draft — confirm the whole flow runs in one chat session

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the short-circuit)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` (the gate)
- `src/app/api/aion/chat/route/prompts.ts:275–311` — onboarding system prompts + greetings
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (queue fallback)
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into system prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975` — "Tune Aion's voice" overflow (existing reset path)
