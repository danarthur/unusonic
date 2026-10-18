# Aion Phase A: Voice Setup + First Draft — Current State and Gap

_Researched: 2026-07-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's premise is three months stale. Almost all of Phase A has shipped.

**Infrastructure confirmed present:**

- `public.workspaces.aion_config` EXISTS — `getAionConfig()` reads `workspaces.select('name, aion_config')` (`aion-config-actions.ts:94`). Typed as `AionConfig` with `voice`, `learned`, `follow_up_playbook`, and `onboarding_state` fields.
- Brain tab is live — `/aion` renders `ChatInterface` directly via `AionPageClient.tsx:66`. Not paused.
- `/api/aion/draft-follow-up` is fully implemented (`draft-follow-up/route.ts:1`) — auth guard, tier gate, kill switch, voice injection, `generateFollowUpDraft` call.
- `generateFollowUpDraft` (`lib/generate-draft.ts:25`) injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt before every draft.
- `save_voice_config` chat tool EXISTS (`core.ts:118`) — description says "Call this whenever the user describes how they talk to clients." Accepts `description`, `example_message`, `guardrails` individually, all optional.
- 4-step onboarding state machine is wired in the system prompt (`prompts.ts:275-283`) — when `onboardingState` is `no_voice` / `no_example` / `no_guardrails` / `needs_test_draft`, the prompt tells Aion what to ask and which tool to call.
- Follow-up card on deal pages already has a live "Draft a message" button (`follow-up-card.tsx:529`) that calls `/api/aion/draft-follow-up` and shows an editable result.
- `learn-from-edit` route (`learn-from-edit/route.ts:1`) exists — vocabulary learning from edited drafts back into `aion_config.learned`.
- Tone anchoring (`lib/tone-anchoring.ts:60`) extracts style from sent messages as a separate signal.

**The 4-step flow is bypassed by default:**

New workspaces hit `synthesizeDefaultVoice()` (`aion-config-helpers.ts:21`), which generates a generic placeholder from the workspace name. `applyVoiceDefaultIfEmpty` stamps `voice_default_derived: true`. `getOnboardingState` short-circuits: `if (config.voice_default_derived === true) return 'configured'` (`aion-chat-types.ts:248`). Result: the 4-step onboarding never fires for new workspaces.

## Intended state

Daniel opens `/aion`, sees a clear invitation to teach Aion his communication style, writes 3 paragraphs (or pastes an example message), and Aion immediately shows a draft for a real deal using that voice. The draft should feel like something Daniel would actually send.

## The gap

- **Discoverability**: `voice_default_derived: true` silently skips onboarding. The only reset path is the sidebar overflow "Tune Aion's voice" (`AionSidebar.tsx`, calls `resetAionVoiceConfig()`). No user will find this on first visit.
- **Empty-queue dead end**: `draft_follow_up` returns `{ error: 'No deals in the follow-up queue.' }` (`core.ts:334`) when used as the `needs_test_draft` test. If Daniel's queue is empty, the final onboarding step silently fails.
- **No voice-setup CTA on the landing screen**: `AionLandingStarters.tsx` renders deal-scoped quick actions. There is no "set up my voice" starter for new or default-voice workspaces.

## Options

### Option A: Add a first-run voice banner to the Aion landing

- **What it is:** When `voice_default_derived` is true, show a subtle inline card above the landing starters: "Aion is drafting in default voice. Tell it how you communicate to unlock voice-matched drafts." with a "Set up now" button that calls `resetAionVoiceConfig()` client-side and fires a `sendChatMessage` that starts the 4-step flow.
- **Effort:** Small — one conditional block in `ChatInterface.tsx` or `AionLandingStarters.tsx`, one button calling existing server action + session hook.
- **Main risk:** The test-draft step (`needs_test_draft`) still dead-ends if no queue items. The banner starts the flow but doesn't fix the finish line.
- **Unlocks:** Daniel can discover voice setup without finding the sidebar overflow.

### Option B: Fix the test-draft fallback + add landing CTA

- **What it is:** Two targeted changes. (1) Same landing CTA as Option A. (2) In the `draft_follow_up` tool (`core.ts:324`), when the queue is empty, fall back to the highest-value active deal from `public.deals` (`status IN ('active', 'proposal_sent')`, ordered by `total_value desc`). This gives the `needs_test_draft` state a real target even for empty queues.
- **Effort:** Small-medium — landing CTA + one fallback query in the tool.
- **Main risk:** Querying an active deal without a queue item means the drafted message may not feel urgent (there's no "reason" for follow-up). The draft prompt should say "this is a demonstration of your new voice" so Daniel's expectations are set.
- **Unlocks:** The full 4-step flow completes end-to-end: voice → example → guardrails → real draft → Daniel uses it or edits it → `learn-from-edit` fires.

### Option C: Standalone freeform voice intake (paste paragraphs → LLM extracts → save)

- **What it is:** A settings page or modal where Daniel pastes whatever he wants — three paragraphs, an example email, bullet rules — and a new server action sends it through an LLM extraction call that produces `{description, example_message, guardrails}` and saves via `saveAionVoiceConfig`. Then immediately shows a draft for the top queue deal.
- **Effort:** Medium — new server action, extraction prompt, settings page UI, draft preview wiring.
- **Main risk:** LLM extraction quality is variable. A wrong extraction silently degrades all future drafts. Needs a review step ("here's what I extracted — confirm before saving").
- **Unlocks:** The literal "write 3 paragraphs → see draft" UX the question describes. Cleaner than chat-based onboarding for people who don't want to answer 4 questions.

## Recommendation

Ship Option B. The infrastructure for the goal is already complete — the last mile is discoverability and one dead-end fix. Adding a CTA on the Aion landing page for `voice_default_derived` workspaces takes 20 minutes. Fixing the `draft_follow_up` fallback to query an active deal takes another 30 minutes. Together they complete the loop: Daniel opens `/aion`, sees the banner, clicks it, chats for two minutes, and walks away with a real draft sitting in the follow-up card.

Option C (freeform form) is better UX long-term but adds a new LLM call, a new review step, and a new page — none of which exist yet. It's the right v2 when there's evidence that the chat-based onboarding has conversion problems. Don't build it before shipping the simpler fix first.

Accept the tradeoff: the draft produced during the `needs_test_draft` step may feel low-urgency since the deal has no queue signal. A one-line note from Aion ("this is a sample draft — the voice match matters more than the timing reason here") handles the expectation without requiring additional infrastructure.

## Next steps for Daniel

1. In `AionLandingStarters.tsx` (or `ChatInterface.tsx` landing section), add a conditional: if `voiceDefaultDerived` is true (pass from server as a prop), render a "Set up your voice" invite card.
2. The card's CTA calls `resetAionVoiceConfig()` (already exported from `aion-config-actions.ts:214`) then dispatches `sendChatMessage({ text: 'Help me set up my communication style', workspaceId })` via the `SessionContext` hook.
3. In `core.ts:332-334`, extend the empty-queue fallback: query `public.deals` for the highest-value active deal (filter `status IN ('active', 'proposal_sent', 'quote_sent')`) and use its ID as `targetDealId` instead of returning an error.
4. In the `needs_test_draft` system prompt line (`prompts.ts:282`), add: "Note this is a demonstration — tell the user the draft shows their voice but may not reflect a real urgent signal."
5. Test end-to-end: `resetAionVoiceConfig()` → chat flow → 3 turns → draft renders in a `DraftPreviewCard`.
6. Confirm `voice_default_derived` is cleared by `saveAionVoiceConfig` (it is — `aion-config-actions.ts:191` strips the flag on explicit save) so the banner doesn't reappear after setup.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool and empty-queue dead-end at `:334`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding state injection in system prompt
- `src/app/api/aion/draft-follow-up/route.ts` — voice-aware draft generation
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` with voice injection
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:529` — live "Draft a message" button
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab renders `ChatInterface` directly
