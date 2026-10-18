# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-07-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The question's two premises are no longer true.** Both blockers named in the queue entry have shipped since it was written (primer notes "as of 2026-04-10"; today is 2026-07-11).

`aion_config` is a live JSONB column on `public.workspaces`, with full read/write actions at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. The Brain tab (`/aion`) is wired and renders `ChatInterface` backed by a real, authenticated, tool-calling chat route at `src/app/api/aion/chat/route.ts`.

The voice onboarding state machine is complete with five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`), defined in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225`. Each state drives a distinct greeting and a set of system-prompt instructions telling Aion what to ask next (`src/app/api/aion/chat/route/prompts.ts:275`). The `save_voice_config` tool at `core.ts:118` writes voice updates through `updateAionConfigForWorkspace`. The `draft_follow_up` tool at `core.ts:318` calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts`, which injects the stored voice into the generation prompt.

However, the 4-step onboarding is currently bypassed by default:
- `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a voice from the workspace name on every read when `aion_config.voice` is empty, and stamps `voice_default_derived: true`
- `getOnboardingState` (`aion-chat-types.ts:248`) short-circuits to `'configured'` when it sees that flag, skipping the 4-step flow entirely
- The re-entry affordance — "Tune Aion's voice" — exists at `AionSidebar.tsx:1043` and calls `resetAionVoiceConfig()`, but it is buried inside a sidebar header overflow menu

A secondary gap: `draft_follow_up` returns `'No deals in the follow-up queue.'` when `ops.follow_up_queue` is empty (`core.ts:333`). A brand-new workspace would hit this wall at the `needs_test_draft` step.

## Intended state

Daniel opens the Brain tab for the first time, types how he communicates with clients, pastes an example message, states a guardrail, and sees Aion generate a follow-up draft for a real active deal — all within one chat session. The voice is then stored and shapes every subsequent Aion draft.

## The gap

- Voice onboarding is fully built but bypassed by the `voice_default_derived` synthetic fallback
- "Tune Aion's voice" re-entry exists but is invisible (overflow menu, no discovery path)
- `draft_follow_up` fails silently at the `needs_test_draft` step when the queue is empty; it should fall back to the newest active deal

## Options

### Option A: Use the existing "Tune Aion's voice" affordance today
- **What it is:** Click the settings overflow in the Aion sidebar → "Tune Aion's voice." Calls `resetAionVoiceConfig()`, which clears `voice`, `voice_default_derived`, and `onboarding_state`. On the next message, the chat route detects `no_voice` state and opens the 4-step flow. Zero code changes.
- **Effort:** None — already live
- **Main risk:** If the workspace has no deals in `ops.follow_up_queue`, the `needs_test_draft` draft step will error out ("No deals in the follow-up queue"). Unblocking that requires Option B.
- **Unlocks:** Daniel can experience the full flow within minutes, today

### Option B: Fix the two root causes
- **What it is:** (1) Gate `applyVoiceDefaultIfEmpty` on having at least one deal in the workspace — if `ops.deals` is empty, return the raw config and let the `no_voice` state fire naturally. (2) Patch `draft_follow_up` to fall back to the newest `public.deals` record when `ops.follow_up_queue` is empty, so the test-draft step never dead-ends. Two surgical changes, no schema migrations.
- **Effort:** Small — `aion-config-helpers.ts` (~10 lines), `core.ts` draft_follow_up execute handler (~15 lines). `getAionConfig` becomes async-only, so test fixtures need updating.
- **Main risk:** Existing workspaces that have active deals but `voice_default_derived: true` and a synthesized voice will stay in `configured` state — they won't be forced back through onboarding. That is correct behavior; only workspaces with no deals (and thus no reason to have chatted yet) get the fresh onboarding entry.
- **Unlocks:** Every new production-company workspace naturally hits the 4-step voice onboarding; `needs_test_draft` actually completes

### Option C: Add a voice setup form to /settings/aion
- **What it is:** Add a "Aion voice" section to `AionSettingsView.tsx` — three text areas for description, example, and guardrails, wired to `saveAionVoiceConfig`. No chat required for initial setup.
- **Effort:** Medium (~150 lines, new form section)
- **Main risk:** Splits the voice-setup surface across two places (chat + settings). The settings form could diverge from what Aion learns conversationally. Voice config is already writable from settings; this is ergonomics only.
- **Unlocks:** Owners who prefer forms over chat can configure voice without interacting with the conversational flow; useful for admins setting up on behalf of others

## Recommendation

**Do Option A immediately, then Option B this sprint.**

Option A costs nothing. Daniel can open the sidebar, click "Tune Aion's voice," and experience the full flow today against real deals. This validates that the end-to-end path (voice capture → draft generation → review) works before touching more code.

Option B is the correct long-term fix. The `voice_default_derived` bypass was added to reduce friction (Wk 11 §3.8), but it has the opposite effect: new owners never encounter the highest-value interaction Aion offers — teaching it their voice. A workspace with no deals has no history to synthesize from anyway, so the bypass buys nothing there. The queue fallback fix means `needs_test_draft` always completes.

Option C is lower priority. The settings form is useful once the conversational path is the natural entry point; right now it would just add surface area without fixing discovery.

## Next steps for Daniel

1. **Today — validate the path:** Open `/aion` → sidebar header overflow → "Tune Aion's voice" → type your three paragraphs, paste an example, state guardrails. Confirm you see a real draft for a deal.
2. **Gate the synthetic bypass on deal count:** In `aion-config-helpers.ts:35`, change `applyVoiceDefaultIfEmpty` to accept an optional `hasDeal: boolean` param; only synthesize + set `voice_default_derived` when `hasDeal` is true. Pass the deal count from `getAionConfig` (which can query `public.deals` in the same round-trip).
3. **Fix the draft fallback:** In `core.ts:333`, when `queue.length === 0` and no `targetDealId`, fall back to `supabase.from('deals').select('id').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(1)` with `reason: 'test draft'`. Surface a note to the user: "No queue items — using your most recent deal as a reference."
4. **Expose the re-entry affordance:** Move "Tune Aion's voice" out of the overflow into a visible button on the Aion sidebar (ideally near the top when `voice_default_derived === true`).
5. **Write a Vitest for the onboarding state machine:** `getOnboardingState` has a lot of branching; cover all five states including the `voice_default_derived` bypass in `src/app/(dashboard)/(features)/aion/lib/__tests__/aion-config.test.ts`.
6. **Verify end-to-end:** After steps 2–3, create a test workspace with no deals → open Brain tab → confirm you hit `no_voice` greeting → complete all four steps → confirm `onboarding_state: 'complete'` in the DB.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` + `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding branches in system prompt
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (queue fallback gap at `:333`)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" re-entry
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft route (already live, auth-gated, tier-gated)
