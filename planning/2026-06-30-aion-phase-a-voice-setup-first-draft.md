# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The two premises in the question are outdated.** The codebase has moved substantially since the primer was written.

**`aion_config` exists.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` added `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. It is also confirmed in the baseline snapshot (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). The column is live.

**There is no "Brain tab."** The primer's "Brain tab is paused — waiting for timeline engine" message does not appear anywhere in the codebase. `ChatInterface.tsx` (the full chat UI), `AionInput.tsx`, and `AionVoice.tsx` are all production-ready and deployed. The label "Brain" in `ChatInterface.tsx:783` refers only to the Lucide icon for the "Thinking" model mode picker.

**The 4-step voice onboarding flow is fully built and wired.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives a five-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). The chat route injects per-state directives into the system prompt at `src/app/api/aion/chat/route/prompts.ts:275-283`, and the `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves the result via `updateAionConfigForWorkspace`.

**But the 4-step flow is bypassed for new workspaces (Wk 11 §3.8).** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` auto-generates a placeholder voice from the workspace name. `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` sets `voice_default_derived: true` on every read where no real voice is stored. `getOnboardingState()` short-circuits to `'configured'` when that flag is set (`aion-chat-types.ts:248`). So a new workspace opens `/aion`, gets a synthesized voice, and the 4-step setup never fires. The re-entry path exists (sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig`) but it is invisible.

**Draft generation is complete.** `/api/aion/draft-follow-up/route.ts` is auth-guarded, tier-gated, kill-switch aware, and calls `generateFollowUpDraft()` from `src/app/api/aion/lib/generate-draft.ts`. Voice config is injected via `buildFollowUpPrompt()` at `generate-draft.ts:52`.

**No free-form "paste 3 paragraphs" extraction path exists.** The 4-step flow asks one structured question at a time. There is no UX or tool path that accepts raw narrative prose and extracts `{description, example_message, guardrails}` from it.

## Intended state

Daniel opens Aion, sees a clear prompt to teach it his voice, writes 3 paragraphs of free-form communication philosophy, and Aion immediately responds with a follow-up draft for a real deal that mirrors that style. After approval, that voice persists for all future drafts. This flow should require zero configuration UI — everything happens in the chat.

## The gap

- The 4-step onboarding is invisible because `voice_default_derived` bypasses it for all new workspaces.
- No free-form "paste prose → extract voice" path. The current tools save voice field-by-field, not from raw narrative.
- The `needs_test_draft` state requires an active deal in `AionPageContext` (entity ID) to produce a targeted draft; without page context the chat can't call `draft_follow_up` with real data.
- The "Tune Aion's voice" affordance in the sidebar overflow is discoverable only if you know to look for it.

## Options

### Option A: Re-enable the 4-step flow with a landing CTA

Remove (or make opt-out) the `voice_default_derived` bypass for the first session. On the Aion landing page empty state, add a single CTA — "Teach Aion how you write" — that calls `resetAionVoiceConfig` and starts a fresh chat. Aion then walks through the existing `no_voice → no_example → no_guardrails → needs_test_draft` flow.

- **Effort:** Small — one landing CTA, one call to `resetAionVoiceConfig` on first render.
- **Main risk:** The 4-step flow is one question per turn; getting to a draft takes 4+ exchanges. The "3 paragraphs" vision doesn't match the structured Q&A experience.
- **Unlocks:** Makes the existing flow discoverable with zero new backend work.

### Option B: Add a `setup_voice_from_narrative` chat tool

Add a new tool to the chat toolset that accepts `raw: string` (up to ~600 words of free-form prose), calls Claude internally with a structured extraction prompt, and saves the extracted `{description, example_message, guardrails}` in one shot. Surface it with a landing CTA: "Tell Aion how you write — paste a paragraph or two." After save, Aion immediately fires a test draft for the first queued follow-up. This is the literal "3 paragraphs → draft" path.

- **Effort:** Medium — one new tool call (~30 lines), an internal `generateText` call for extraction, a landing CTA component.
- **Main risk:** A nested LLM call adds ~1-2s latency to the setup step and a small token cost. Edge case: sparse input (one sentence) may produce weak extractions.
- **Unlocks:** Exactly the described scenario. After this ships, the chat handles everything with no form UI needed.

### Option C: Build a standalone voice setup form at `/aion/settings`

A dedicated settings surface with three labeled textareas (Description / Example message / Guardrails) pre-filled from `synthesizeDefaultVoice`, plus a "Test draft" button that calls `/api/aion/draft-follow-up` against the first pending follow-up deal. Save calls `saveAionVoiceConfig` directly.

- **Effort:** Medium — new page route, form component, draft preview inline.
- **Main risk:** This is a form, not AI-native. It makes voice setup feel like account configuration rather than a conversation. Abandonment is higher for blank-field forms than guided chat.
- **Unlocks:** Fastest path for Daniel specifically since he can paste prose directly into Description and iterate quickly. Does not scale well to future onboarding.

## Recommendation

Ship Option B. It is the only option that directly matches the described goal ("3 paragraphs → draft") without introducing form UI. The nested LLM call is cheap (a single `generateText` with `maxOutputTokens: 80` to fill three fields), and the latency is acceptable for a one-time setup step.

The implementation is contained: one new tool definition in `src/app/api/aion/chat/tools/core.ts` (alongside `save_voice_config`), a small extraction prompt, and a landing CTA that checks `voice_default_derived === true` and surfaces the "Tell Aion how you write" prompt instead of immediately entering the standard chat. The CTA calls `resetAionVoiceConfig` under the hood, then starts the chat with a priming user message so Aion immediately runs the tool and fires a test draft in the same turn.

Option A is a valid interim step if B slips — it costs almost nothing to add the landing CTA that makes the existing 4-step flow discoverable.

## Next steps for Daniel

1. **Confirm the scenario source.** Section 26 of the follow-up engine design doc may spec the extraction tool differently. Read it and check if it defines a `setup_voice_from_narrative` tool explicitly or if the "3 paragraphs" flow is your interpretation of the goal.
2. **Add the extraction tool.** In `src/app/api/aion/chat/tools/core.ts`, after `save_voice_config` (~line 145), add `setup_voice_from_narrative` — accepts `raw: string`, calls `generateText({ model: getModel('fast'), maxOutputTokens: 100, ... })` to extract the three fields, then calls `updateAionConfigForWorkspace` and sets `onboarding_state: 'complete'`.
3. **Update the landing CTA.** In `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`, check if `voice_default_derived === true` (passed as a prop from the server component). If so, surface a single "Tell Aion how you write" chip that fires `resetAionVoiceConfig` then sends a priming message like "I want to teach you my voice" to start the extraction flow.
4. **Wire page context for the test draft.** The `needs_test_draft` → `draft_follow_up` step requires a deal entity ID. Ensure the priming message in step 3 triggers Aion to call `get_follow_up_queue` first so it has a real deal ID to draft for.
5. **Test end-to-end.** Open `/aion` as a fresh workspace (or after `resetAionVoiceConfig`), paste 3 paragraphs, confirm extraction round-trips to DB, confirm draft reflects the extracted voice, confirm subsequent drafts from the Follow-Up Card also respect it.
6. **Gate under a feature flag if needed.** The extraction tool adds an outbound LLM call. If the tier gate should block it for free-tier users, add a `canExecuteAionAction` check before the extraction `generateText` call.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — aion_config column birth
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — OnboardingState machine + getOnboardingState
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-45` — synthesizeDefaultVoice + applyVoiceDefaultIfEmpty (the bypass)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178-206` — saveAionVoiceConfig / resetAionVoiceConfig
- `src/app/api/aion/chat/tools/core.ts:118-144` — save_voice_config tool
- `src/app/api/aion/chat/route/prompts.ts:275-283` — onboarding system-prompt injection
- `src/app/api/aion/lib/generate-draft.ts` — generateFollowUpDraft (already complete)
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (auth, tier gate, kill switch all wired)
