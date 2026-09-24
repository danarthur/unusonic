# Aion voice setup: minimum path from 3 paragraphs to first draft

_Researched: 2026-09-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the queue item was written in April 2026. The codebase as of September 2026 is significantly more advanced than the premise assumes — see Current state below._

## Current state

Phase A is substantially shipped. The Brain tab is live (not paused): `AionPageClient.tsx` renders `ChatInterface` directly with no paused-state guard.

`aion_config` exists as a JSONB column on `public.workspaces`, typed as `AionConfig` in `aion-config-actions.ts:50–74`. The voice sub-object (`description`, `example_message`, `guardrails`) is fully wired:

- `saveAionVoiceConfig()` at `aion-config-actions.ts:178` persists all three fields.
- `generateFollowUpDraft()` at `generate-draft.ts:52–76` injects them into the system prompt.
- `/api/aion/draft-follow-up` at `draft-follow-up/route.ts:1` is live, authenticated, and tier-gated.

A 4-step conversational onboarding state machine exists at `aion-chat-types.ts:247` (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). The chat route uses it to guide Aion's system prompt at `chat/route/prompts.ts:284–291`.

However, new workspaces never reach `no_voice` in practice: `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` synthesizes a default voice from the workspace name on every read and marks `voice_default_derived: true`, which `getOnboardingState()` returns as `configured` immediately.

The only path to customize voice today is: AionSidebar overflow menu → "Tune Aion's voice" (`AionSidebar.tsx:1043`) → `resetAionVoiceConfig()` drops the stored voice and derived flag → toast says "start a new chat to retune Aion" → new chat triggers the `no_voice` greeting → 4-turn conversational setup.

The `save_voice_config` tool at `core.ts:118` accepts `description`, `example_message`, and `guardrails` in a single call, so Aion can technically extract all three from one message — but the onboarding system prompt prompts it to ask one question at a time.

The `/settings/aion` page (`AionSettingsView.tsx:33`) covers only the consent/beta controls and cadence learning toggle. There is no voice form there.

## Intended state

Daniel opens Aion, pastes three paragraphs describing his communication style, and within that same conversation thread sees a real draft that reflects his voice. No multi-step back-and-forth required for the initial setup. Voice is visible and editable somewhere obvious — not buried in a sidebar overflow.

The `draft-follow-up` route and `generate-draft.ts` already honor `aionConfig.voice` — the delivery mechanism is complete. The gap is entirely in the setup UX: discoverability and reducing the friction from "I want to teach Aion my voice" to "here is a draft that sounds like me."

## The gap

- No voice form anywhere in the UI — the only editable surface is the conversational chat, reached by resetting via a hidden sidebar menu item.
- "Tune Aion's voice" is buried two levels deep (sidebar toggle → overflow menu).
- After resetting, Daniel must start a new chat to trigger the onboarding — the reset and the conversation are disconnected.
- The onboarding system prompt forces one-question-at-a-time even though `save_voice_config` can accept all three fields at once.
- The `needs_test_draft` step calls the `draft_follow_up` tool, which needs an active deal. Behavior in empty workspaces is untested.

## Options

### Option A: Voice form in `/settings/aion`

- **What it is:** Add a three-field form (description, example, guardrails) to `AionSettingsView.tsx`, wired to `saveAionVoiceConfig()`. Add a "Generate a sample draft" button that calls `/api/aion/draft-follow-up` with a synthetic deal context (or the most recent real deal). Show the draft inline.
- **Effort:** Medium. New form section in the settings view, one API call for the preview.
- **Main risk:** Settings is not where users think about voice; discoverability moves but doesn't improve much. The synthetic deal context for the preview draft will feel less real than an actual deal.
- **Unlocks:** A persistent, editable surface for voice config. Users can update voice without triggering a full chat reset.

### Option B: Surface voice setup on the Aion landing screen

- **What it is:** When `voice_default_derived === true`, `AionLandingStarters.tsx` shows a prominent CTA — "Aion is using a default voice. Tell it how you actually write." Clicking it auto-sends a seed message that opens the all-at-once onboarding flow (single turn: Daniel pastes style + example + rules, Aion extracts all three via `save_voice_config`, then generates a draft). The sidebar "Tune Aion's voice" still works as a secondary path.
- **Effort:** Small. Modify `AionLandingStarters.tsx` to read `voice_default_derived` from server state and render a CTA chip. Update the onboarding system prompt to accept all-at-once input.
- **Main risk:** Relies on Aion correctly extracting all three fields from a free-form paste. If the model misses `guardrails` or splits awkwardly, the first impression is broken.
- **Unlocks:** The "3 paragraphs → immediate draft" flow the question describes, without adding a new UI surface. Discoverability improves significantly.

### Option C: Update the onboarding system prompt to accept all-at-once input

- **What it is:** Change the `no_voice` system prompt block (currently "Ask about communication style") to instruct Aion to accept a free-form dump — all three fields in one message — before asking for anything else. If Daniel pastes everything, extract and save all three in one `save_voice_config` call and jump straight to the draft. If he provides only style, ask for example and rules conversationally as today.
- **Effort:** Small. One-line change to `prompts.ts:285` plus an addition to the greeting at `prompts.ts:313`.
- **Main risk:** Doesn't fix discoverability — Daniel still needs to find and click "Tune Aion's voice" first. The 3-paragraphs flow works, but only if Daniel knows to try it.
- **Unlocks:** Faster onboarding once triggered; removes the 4-turn requirement for users who write a long first message.

## Recommendation

**Start with Option B**, then apply Option C as a 30-minute follow-on.

Option B directly closes the discoverability gap for new-workspace owners. The `AionLandingStarters` component already reads workspace state server-side — adding a `voice_default_derived` prop and a CTA chip is one small addition. The onboarding system-prompt change (Option C) makes the conversational path accept a single-message paste, so after clicking the CTA, Daniel writes once and gets a draft.

Option A (settings form) can be added later as a persistence/editing surface, but it shouldn't be the primary onboarding path — voice setup should happen where the voice is used (Aion chat), not in settings.

The one risk to manage: the `needs_test_draft` draft call needs a real deal to feel genuine. Before shipping, verify that `draft_follow_up` in chat handles an empty `dealId` gracefully (falls back to a generic example context rather than throwing). If it throws, add a short-circuit in the system prompt: "if no deals exist, tell the user you'll generate a real draft on their first deal instead of a fake one."

## Next steps for Daniel

1. Read `AionLandingStarters.tsx` and the server component that mounts it to find where to pass `voice_default_derived`. Confirm it's available from the page's `getAionConfig()` call.
2. Add a CTA chip to `AionLandingStarters` when `voice_default_derived === true`: label "Tell Aion how you write" — clicking dispatches `"I want to set up my voice"` as the opening message.
3. Update `chat/route/prompts.ts:285` (the `no_voice` onboarding block) to say: "Accept a free-form style description — all at once or per field. If the user pastes everything in one message, extract description, example_message, and guardrails in a single `save_voice_config` call, then offer a test draft immediately."
4. Update the `no_voice` greeting in `prompts.ts:313` to say explicitly: "You can paste your whole style in one go — how you write, an example message, and any rules."
5. Test `draft_follow_up` in chat with an empty workspace (no deals). If it fails, gate the test-draft step: only offer it if `wsSnapshot.activeDealCount > 0`, otherwise confirm the config and say "I'll draft against your first real deal."
6. Manual test: new workspace → landing page → CTA → paste 3 paragraphs → confirm draft appears and sounds right.

## References

- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — landing CTAs
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — AionConfig type + getAionConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — applyVoiceDefaultIfEmpty
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — getOnboardingState
- `src/app/api/aion/chat/route/prompts.ts:284–291` — onboarding system prompt blocks
- `src/app/api/aion/chat/tools/core.ts:118` — save_voice_config tool
- `src/app/api/aion/lib/generate-draft.ts:52–76` — voice injection into draft prompt
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
