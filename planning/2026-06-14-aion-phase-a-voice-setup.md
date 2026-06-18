# Aion Phase A: Minimum path to voice setup + first draft

_Researched: 2026-06-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's description is substantially outdated. As of June 2026, the Phase A infrastructure is complete:

- **`aion_config` column** exists on `public.workspaces` — added by `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:6` and carried through `supabase/migrations/20260101000000_baseline_schema.sql:15058`.
- **`AionVoiceConfig` type** (`description`, `example_message`, `guardrails`) is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16`. These three fields map exactly to Daniel's 3-paragraph goal.
- **`saveAionVoiceConfig` server action** exists at `aion-config-actions.ts:178`. Merges into `workspaces.aion_config` via service-role client. `resetAionVoiceConfig` at line 214 clears it and re-opens the guided flow.
- **Voice onboarding state machine** is in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257`. States: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route injects step-specific instructions into the system prompt at `src/app/api/aion/chat/route/prompts.ts:275–282`.
- **`/api/aion/draft-follow-up` endpoint** is live at `src/app/api/aion/draft-follow-up/route.ts:1–73`. Authenticated, tier-gated, reads `aion_config.voice`, calls `generateFollowUpDraft`. Voice is injected verbatim into the prompt at `src/app/api/aion/lib/generate-draft.ts:63–74`.
- **`getDealContextForAion`** exists at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`.
- **"Tune Aion's voice"** is already in the AionSidebar overflow at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`, calling `resetAionVoiceConfig`.

**The one real blocker:** New workspaces get `voice_default_derived: true` automatically — `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name (`aion-config-helpers.ts`). `getOnboardingState` returns `'configured'` when this flag is set, so the 4-step forcing block never fires for first-time users. The guided onboarding only triggers after Daniel explicitly clicks "Tune Aion's voice" → starts a new session. That's non-obvious.

**The "Brain tab"** does not exist as a UI element in the current codebase. The only search match is a comment in `CadenceLearningToggle.tsx:14` — it was planned but never built as a standalone deal-page tab.

## Intended state

Daniel opens something, writes 3 paragraphs (style, example message, guardrails), immediately sees a follow-up draft tailored to his voice. The guided chat conversation is already built for this. The gap is discoverability: Daniel has no clear entry point, and the default derived voice means he would never hit the onboarding flow unless he already knows to click the sidebar overflow.

## The gap

- No dedicated voice setup form (direct 3-field path, no chat required).
- `voice_default_derived: true` masks the fact that voice hasn't been explicitly set — deal cards show as "configured" but the draft quality is generic.
- The "Brain tab" in the deal page was the intended entry point; it was never built.
- "Tune Aion's voice" in the sidebar is the current reset affordance but is buried in an overflow menu.

## Options

### Option A: Standalone voice setup form

- **What it is:** A 3-textarea form (description, example_message, guardrails) + "Generate test draft" button. Lives at `/aion?setup=voice` or as a panel in the AionSidebar. Calls `saveAionVoiceConfig` on submit, then calls `/api/aion/draft-follow-up` with the first item from the follow-up queue to show a live draft before navigating away.
- **Effort:** Small — new client component (~150 lines), no schema work, no new API routes. Both the save action and the draft endpoint already exist.
- **Main risk:** The test draft needs a real deal in the follow-up queue; if the queue is empty (new workspace) the draft step has nothing to work with.
- **Unlocks:** Daniel can set his voice in 5 minutes. All subsequent `draft-follow-up` calls immediately use it. The guided chat flow becomes a "retune" path, not the only path.

### Option B: Surface the guided chat onboarding

- **What it is:** On first visit to `/aion`, if `voice_default_derived === true`, show a one-time banner: "Aion is using a default voice. Teach it your style →" which calls `resetAionVoiceConfig` in one click, then opens a new chat. The existing 4-step guided conversation takes it from there.
- **Effort:** Small — a banner component + one server action call. The onboarding conversation is already complete.
- **Main risk:** Chat is a longer path than a form. Daniel has to trust the conversation to collect his 3 inputs rather than seeing explicit form fields. More back-and-forth.
- **Unlocks:** Surfaces the existing system without building new UI primitives. Also works for future new users if the banner is kept in the onboarding flow.

### Option C: Build the Brain tab as embedded deal-page chat

- **What it is:** A deal-scoped `ChatInterface` embedded as a "Brain" tab in the deal detail page, replacing or augmenting `AionDealCard`. This is the original "paused" vision.
- **Effort:** Large — requires the timeline engine dependency that blocked it originally, plus a full tab scaffold in the deal page routing.
- **Main risk:** Reintroduces the timeline engine dependency. Risk of scope creep.
- **Unlocks:** The full embedded Aion experience in deal context. Needed for the longer-term roadmap but not for the immediate goal.

## Recommendation

**Option A.** Build the voice setup form.

The guided chat onboarding (Option B) is elegant but indirect — Daniel has to trust a chat conversation to collect what a 3-field form can show explicitly. With a form, the fields are visible, editable, and saveable in one action. The "Generate test draft" button at the bottom closes the loop immediately: he writes his paragraphs, clicks the button, sees a real draft from his queue. That's the exact experience described in the queue item.

The timeline engine risk (Option C) is real — the original Brain tab was blocked precisely because it coupled voice setup to a feature that wasn't ready. Option A decouples them completely. Ship the form, add a link to it from the AionDealCard ("Voice not set — personalize Aion →"), and Daniel has his workflow within a day of implementation.

One edge case to handle: if the follow-up queue is empty when Daniel tries the test draft, fall back to generating a draft with a synthetic deal stub (same `generateFollowUpDraft` call, placeholder context). This prevents a dead end for workspaces that haven't run the cron yet.

## Next steps for Daniel

1. Create `src/app/(dashboard)/aion/settings/voice/VoiceSetupForm.tsx` — 3 labeled textareas for description, example_message, guardrails. Submit calls `saveAionVoiceConfig`.
2. Add a "Generate test draft" button that fetches `/api/aion/draft-follow-up` with the top item from `ops.follow_up_queue` (or a placeholder context if queue is empty). Render the draft inline.
3. Wire the route: add `src/app/(dashboard)/aion/settings/voice/page.tsx` or render the form as a drawer/panel inside AionSidebar — either works, sidebar panel is faster.
4. In `AionDealCard`, read `aion_config.voice_default_derived` (already fetched via `getAionConfig`): if true, show a low-key inline CTA — "Aion is using a generic voice. Set yours →" — linking to the voice setup route.
5. Once the form is wired, add a `VoiceSetupForm` e2e test that saves config + calls the draft endpoint and asserts the draft string is non-empty.
6. Strip `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22,102` and `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116` while in the area (small, one commit).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding system prompt injections
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" current affordance
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
