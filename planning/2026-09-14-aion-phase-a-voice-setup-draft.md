# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-09-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer (last updated 2026-04-10) describes a stub state that no longer exists. The infrastructure is substantially further along:

**What is already shipped:**
- `aion_config jsonb` column on `public.workspaces` — exists since the baseline migration (`supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`)
- `AionConfig` type (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`) with `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`
- Server actions: `getAionConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace` — all in `aion-config-actions.ts:84`
- `/api/aion/draft-follow-up/route.ts` — fully wired (auth, tier gate, kill switch, voice injection, `recordAionAction`)
- `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:25` — `buildFollowUpPrompt` already injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the LLM system prompt
- `getDealContextForAion` at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`
- `save_voice_config` tool in chat (`src/app/api/aion/chat/tools/core.ts:118`) — saves to `aion_config` and refreshes in-context config
- `draft_follow_up` tool in chat (`core.ts:318`) — uses top-priority queue deal, enriches with semantic memory, applies playbook channel rules
- 4-step chat onboarding flow in `src/app/api/aion/chat/route/prompts.ts:284` — `no_voice → no_example → no_guardrails → needs_test_draft`
- `getOnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — derives state from stored config

**There is no "Brain tab."** `AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" />` with no tab layout. The tab was never built.

**The one critical bypass:** `getAionConfig()` calls `applyVoiceDefaultIfEmpty(stored, row.name)` (`aion-config-helpers.ts:35`), which synthesizes a default voice from the workspace name and returns `voice_default_derived: true` for any workspace with an empty voice field. `getOnboardingState` (`aion-chat-types.ts:248`) returns `'configured'` when `voice_default_derived === true`, skipping the entire 4-step forcing block. Intended to avoid blocking new users, but it makes voice setup invisible: a brand-new workspace opens Aion chat, gets a generic synthesized voice, and the onboarding sequence never fires unprompted.

## Intended state

Daniel opens Aion, writes 3 paragraphs about how he communicates, and sees a follow-up draft for a real deal that sounds like him — not a synthesized-from-workspace-name default. The onboarding should be explicit enough that he knows his voice was captured and is being used, not implicit.

The 4-step chat onboarding (`no_voice → no_example → no_guardrails → needs_test_draft`) is the right mechanism — it already exists. It just needs to fire.

## The gap

- The `voice_default_derived` bypass means the 4-step onboarding never fires for new workspaces.
- The "Tune Aion's voice" trigger exists (sidebar overflow → `resetAionVoiceConfig`) but is hidden from first-time users.
- The test draft at `needs_test_draft` calls `draft_follow_up` which returns `{ error: 'No deals in the follow-up queue.' }` if the workspace has no active deals. A first-run workspace with no deals cannot complete the final step.
- No Brain tab exists to host a dedicated voice-entry surface.

## Options

### Option A: Surface "tune your voice" in the first Aion greeting

**What it is:** When `voice_default_derived === true` (new workspace), change the `'configured'` greeting in `prompts.ts:buildGreeting` to include a brief line: "I've started with a default voice — want to tune it to how you actually sound?" with two chips: `Tune now | tune now` and `Later | later`. Clicking "tune now" sends a user message that triggers the `save_voice_config` flow. Also add synthetic-deal fallback in `draft_follow_up`: if the queue is empty, use a constructed example client context (name = "a client", deal stage = "proposal sent", no actual IDs) to illustrate the draft. Two surgical edits: `prompts.ts` and `core.ts`.

- **Effort:** Small (2 files, ~30 lines each)
- **Main risk:** Synthetic draft example is less convincing than a real deal draft; user learns from a hypothetical, not their data
- **Unlocks:** Full onboarding loop works for a fresh workspace with no existing deals

### Option B: Explicit voice setup as the Aion landing state

**What it is:** Replace the `voice_default_derived` bypass entirely. When `aion_config.voice` is empty and `voice_default_derived` is not set, show a pre-chat "Set up your voice" modal or inlined prompt in the Aion page before opening the chat thread. A three-field form (description, example message, guardrails) saved via `saveAionVoiceConfig`. After save, auto-open a new session and immediately call `draft_follow_up` to show a test draft. More explicit than chat-driven, matches the "write 3 paragraphs" framing exactly.

- **Effort:** Medium (new UI component, server action call, post-save redirect into chat, synthetic deal fallback still needed)
- **Main risk:** Adds friction before first message; some users will click through without filling it in carefully
- **Unlocks:** Clear "your voice was saved" moment, testable draft in one flow

### Option C: Do nothing — document the existing path

**What it is:** The flow already works for workspaces that have at least one active deal: sidebar overflow → "Tune Aion's voice" → 4-step onboarding → test draft. Document this path in the settings page and ship a small copy change making the overflow button more prominent.

- **Effort:** Very small (copy change, maybe a tooltip)
- **Main risk:** Does not address empty-queue failure; does not address discoverability for a first-time user
- **Unlocks:** Nothing new — works only for existing workspaces with deals

## Recommendation

**Ship Option A.** It is two targeted edits to files that already own these behaviors, requires no new components, and closes the loop for a first-run workspace.

The change to `buildGreeting` is one additional case arm in an existing switch: when `state === 'configured' && config.voice_default_derived`, emit the "want to tune it?" greeting with chips instead of the normal pull-mode greeting. This doesn't touch the synthesized-voice fallback for workspaces that skip onboarding intentionally; it just makes the invite visible.

The change to `draft_follow_up` is a guard: when `getFollowUpQueue()` returns empty and no deal is in page context, fall back to a synthetic `AionDealContext` (`client: { contact_first_name: 'your client', past_deals_count: 1, name: 'their company' }`, `deal: { title: 'a recent event', status: 'proposal_sent' }`, `followUp: { reason: 'Proposal sent 3 days ago, no reply', suggested_channel: 'sms' }`) and annotate the returned draft: `"Here's an example — I'll personalize these once you have active deals."` This matches what a new user needs: a demonstration of what Aion sounds like with their voice, not a failure state.

Option B's explicit form is aesthetically cleaner but adds a pre-chat blocking step that creates drop-off risk. Option C requires deals to already exist and doesn't address discoverability — it's not a Phase A solution.

Tradeoff accepted: the test draft for an empty-queue workspace uses a synthetic context. That's a known limitation visible to the user in the response copy, not a silent degradation.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts:buildGreeting`. In the `'configured'` case, add an early return when `config.voice_default_derived === true` that emits the "tune your voice" greeting with chips.
2. Open `src/app/api/aion/chat/tools/core.ts:draft_follow_up (line 332)`. Replace `return { error: 'No deals in the follow-up queue.' }` with a synthetic-context fallback that still calls `buildDraftPrompt` and generates a real model response.
3. The `buildGreeting` function currently receives only `state` and `userName` — it needs the `AionConfig` object to read `voice_default_derived`. Check `prompts.ts` call site in `route.ts` and pass `aionConfig` (already in scope at `route.ts:124`).
4. Confirm the `'configured'` greeting path has a test: `src/app/api/aion/lib/__tests__/greeting-catalog.test.ts` covers `pickGreeting`, but check `buildGreeting` has coverage for the new arm.
5. Test the full flow: new session → "tune" chip → describe voice in 3 messages → guardrails → "Yes, try one" chip → draft appears.
6. Verify `resetAionVoiceConfig` still clears `voice_default_derived` correctly and re-enters the same flow (already implemented at `aion-config-actions.ts:214`).

## References

- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding block injection
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` switch
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` — `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/aion/AionPageClient.tsx:66` — confirms no Brain tab exists
