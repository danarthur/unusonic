# Aion Phase A: Minimum Path from Voice Setup to First Draft

_Researched: 2026-08-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood this question:** I interpreted "Brain tab" as the Aion chat surface at `/aion`. The primer's claim that `aion_config` doesn't exist and the API is a 16-line stub is outdated. The codebase is substantially further along than the primer describes. I've reframed the question accordingly.

## Current state

**Schema — already exists.** `public.workspaces.aion_config` is in the baseline migration at `supabase/migrations/20260101000000_baseline_schema.sql:15058`. The column is `jsonb NOT NULL DEFAULT '{}'`. The primer's claim that it doesn't exist is wrong.

**Voice config types and server actions — complete.** `AionVoiceConfig` has exactly three fields — `description`, `example_message`, `guardrails` — defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`. `saveAionVoiceConfig()` (line 178), `resetAionVoiceConfig()` (line 214), and `getAionConfig()` (line 84) are all implemented. `saveAionVoiceConfig` deep-merges into `aion_config` and writes via the server session client (RLS applies).

**Auto-synthesis bypasses explicit setup.** New workspaces get `voice_default_derived = true` via `synthesizeDefaultVoice()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27`. `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` short-circuits to `configured` when this flag is set, so the 4-step conversational onboarding never fires for Daniel's workspace.

**Chat route — fully wired.** `/api/aion/chat/route.ts` has auth (line 59), rate limiting (line 67), kill-switch (line 108), model routing, and a tool-calling architecture across a dozen tool modules. It is not a 16-line stub.

**Draft-follow-up API — fully wired.** `src/app/api/aion/draft-follow-up/route.ts:21-73` has auth, tier gate, kill-switch, fetches `aion_config`, and calls `generateFollowUpDraft()`. That function at `src/app/api/aion/lib/generate-draft.ts:63-74` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt. The route is complete and would work today if called with valid context.

**Follow-up card — uses hardcoded templates.** `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:89-100` uses `draftSmsByReason()` — a switch/case over reason types — rather than calling `/api/aion/draft-follow-up`. The Aion draft path is never invoked from the deal UI.

**Voice setup form — does not exist.** No `AionVoiceForm.tsx` or equivalent. There is no UI component that surfaces the 3-field form and calls `saveAionVoiceConfig`. The `settings/aion` page covers consent and cadence settings but has no voice section.

**"Tune Aion's voice" entry point — referenced but not wired.** The comment at `aion-config-actions.ts:209` says this should appear in the "AionSidebar header overflow." That affordance does not exist — `resetAionVoiceConfig` has no caller outside tests.

## Intended state

Daniel opens the Aion chat surface, triggers voice setup, fills in three things (communication style, example message, what not to do), and immediately sees a draft follow-up for a real deal that reflects his voice. The 4-step onboarding state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) in `aion-chat-types.ts:225` models exactly this flow. The `needs_test_draft` state is designed to auto-generate a proof draft so Daniel sees voice in action before leaving setup.

## The gap

- `voice_default_derived = true` silently bypasses setup for all existing workspaces; no UI to clear it and enter explicit setup.
- No "Tune Aion's voice" entry point wired in the Aion sidebar or settings.
- `needs_test_draft` state handling in the chat route is unverified — the route may not yet auto-offer a draft at step 4 of onboarding.
- `follow-up-card.tsx` calls hardcoded templates, not `/api/aion/draft-follow-up`.

## Options

### Option A: Settings page voice form + deal-page draft button

- **What it is:** Add a 3-textarea form to `AionSettingsView.tsx` calling `saveAionVoiceConfig`. Separately, add a "Generate Aion draft" button to `follow-up-card.tsx` that POSTs to `/api/aion/draft-follow-up` and renders the result inline.
- **Effort:** Small — two independent UI additions, both call existing server-side infrastructure.
- **Main risk:** Two-page experience — write voice in settings, see draft on deal page. Does not match the "write → immediately see" goal.
- **Unlocks:** Full path works end-to-end; voice is editable from a permanent settings location.

### Option B: Activate the existing 4-step chat onboarding

- **What it is:** Wire a "Set up my voice" affordance in the Aion sidebar that calls `resetAionVoiceConfig()`, clears `voice_default_derived`, and sends a synthetic first message that enters `no_voice` state. The existing chat route already handles the 4-step onboarding conversation. Verify (and implement if needed) the `needs_test_draft` → auto-draft step. Also wire `follow-up-card.tsx` to use the Aion draft API.
- **Effort:** Small-medium — the state machine and chat route exist; main work is the sidebar entry point, verifying `needs_test_draft` handling, and the draft button in the follow-up card.
- **Main risk:** `needs_test_draft` handling in the chat route may need to be implemented (not verified). The "3 paragraphs" experience is conversational (one question at a time), which is correct product behavior but takes more turns.
- **Unlocks:** The connected write-voice → see-draft flow Daniel described, native to the chat surface.

### Option C: Inline voice + draft panel on the Aion page

- **What it is:** When `getOnboardingState` returns `no_voice` or `voice_default_derived`, render a three-field form above the chat on the `/aion` page. On submit, call `saveAionVoiceConfig`, fetch the top follow-up queue item's deal context, POST to `/api/aion/draft-follow-up`, and show the result inline before the user types anything.
- **Effort:** Medium — new `AionVoiceSetupPanel` component, deal context fetch on the `/aion` page, state management for the draft result.
- **Main risk:** Requires deal context on a non-deal page; the panel adds UI complexity that may conflict with the existing greeting/suggestion flow.
- **Unlocks:** The exact experience described in the question in the shortest number of clicks.

## Recommendation

**Option B.** The 4-step conversational onboarding already exists and is the right native experience for this product — voice setup as a conversation, not a settings form, fits Unusonic's design philosophy. The activation work is minimal: wire `resetAionVoiceConfig()` to a sidebar overflow item (the comment at `aion-config-actions.ts:209` already names it "Tune Aion's voice"), verify the `needs_test_draft` step in the chat route, and replace the hardcoded `draftSmsByReason()` call in `follow-up-card.tsx` with a POST to `/api/aion/draft-follow-up`.

Option C is the right long-term UX but adds component complexity before the path is even verified working. Option A works but splits the experience across two pages and does not deliver the "immediately see a draft" goal from within voice setup itself.

## Next steps for Daniel

1. **Verify `needs_test_draft` chat handling.** Read `src/app/api/aion/chat/route/prompts.ts` — check if the `needs_test_draft` onboarding state triggers a draft offer or is a no-op. If it's a no-op, add a branch: when state is `needs_test_draft`, call `getDealContextForAion` on the top queue item and pass the result to the draft-follow-up tool.

2. **Wire "Tune Aion's voice" in the Aion sidebar.** Find the sidebar overflow menu component (likely near `src/app/(dashboard)/aion/`). Add a menu item that calls `resetAionVoiceConfig()` and sends a synthetic "Let's set up my voice" chat turn to re-enter the onboarding flow.

3. **Replace `draftSmsByReason` in `follow-up-card.tsx`.** In `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx`, add an "Aion draft" button variant that POSTs `{ context: dealContext, workspaceId }` to `/api/aion/draft-follow-up` and renders the `draft` string in the existing draft textarea. The `getDealContextForAion` call at line 22 already imports everything needed.

4. **Add voice preview to settings.** After Option B is working, add a read-only voice display to `settings/aion/AionSettingsView.tsx` showing the three current voice fields and a "Retune" link that points to the chat with `?setup=voice`. This gives Daniel a persistent place to inspect and re-enter setup.

5. **Test the full path.** Call `resetAionVoiceConfig()` via the sidebar overflow, step through the 4 chat turns, verify the `needs_test_draft` draft appears, then check that the same draft is reproducible from the follow-up card on a real deal.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice save/reset actions, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts:63-74` — voice injection into system prompt
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:89` — hardcoded `draftSmsByReason` (replace with Aion call)
- `src/app/api/aion/chat/route.ts` — chat route (fully wired, not a stub)
- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column confirmation
