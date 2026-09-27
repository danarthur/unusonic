# Aion voice setup: minimum path to first real draft

_Researched: 2026-09-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: several premises in this question are outdated. The primer was last updated 2026-04-10. This doc describes actual current state as of 2026-09-27._

## Current state

**`aion_config` already exists.** `public.workspaces.aion_config` is a live JSONB column. It is read via `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` and written by `saveAionVoiceConfig()` at `:178` and `updateAionConfigForWorkspace()` at `:262`.

**Voice config shape is wired end-to-end.** `AionVoiceConfig` (`description`, `example_message`, `guardrails`) is defined at `aion-config-actions.ts:12`. The `draft-follow-up` endpoint reads it and injects it into `buildFollowUpPrompt()` at `src/app/api/aion/lib/generate-draft.ts:52`. The `learn-from-edit` endpoint (`src/app/api/aion/learn-from-edit/route.ts:62`) extracts vocabulary swaps from draft edits and writes them back into `aion_config.learned`.

**A 5-state conversational onboarding flow exists.** `OnboardingState` in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` drives a `no_voice → no_example → no_guardrails → needs_test_draft → configured` forcing block. Greeting copy is wired for each state at `src/app/api/aion/chat/route/prompts.ts:310`. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves config during chat.

**The forcing block is bypassed by default.** `getOnboardingState()` at `aion-chat-types.ts:247` returns `'configured'` immediately when `voice_default_derived === true`. `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` sets this flag on every read when no explicit voice is stored. So new workspaces skip the onboarding flow entirely and land in `configured` state.

**The forcing block is accessible but buried.** "Tune Aion's voice" at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` calls `resetAionVoiceConfig()`, which clears `voice` and `voice_default_derived`, dropping the workspace back to `no_voice`. Discovering this requires opening the Sidebar overflow menu.

**No standalone voice setup form exists.** `/settings/aion` covers consent and cadence learning — not voice. Voice config is exclusively accessible through the conversational forcing flow.

## Intended state

Daniel opens the Aion page, sees a clear "set up your voice" prompt, writes freely about how he talks to clients, and immediately sees a real draft that uses his words. The experience should feel like "I described myself → I see it working" in one screen, not "I answered three questions across six chat turns."

The design doc architecture (section 26) likely describes an onboarding funnel with a form-style entry in addition to the conversational path. The current code has the conversational path only, and the entry requires the Sidebar overflow — not prominent enough for first-run or for re-tuning.

## The gap

- New workspaces never see the conversational onboarding flow — `voice_default_derived` skips it immediately.
- Reaching the flow requires Sidebar overflow → "Tune Aion's voice" → then 3-4 chat turns.
- There is no one-screen path: describe yourself → see a draft. It's a multi-turn conversation, not a form.
- The `needs_test_draft` greeting assumes an active deal exists. Zero-deal workspaces get an offer with nothing to draft.
- No UI entry point signals to a new user that voice setup is something they should do.

## Options

### Option A: First-run banner → kick into conversational flow
- **What it is:** Detect `voice_default_derived === true` on page load (server component passes the flag). Render a dismissible card above the input: "Teach Aion how you write — it takes 3 minutes." with a "Get started" button that calls `resetAionVoiceConfig()` and focuses the chat. Chat then walks through the existing 3-turn flow.
- **Effort:** Small. Conditional in `AionPageClient.tsx`, a small banner component, no new API surface.
- **Main risk:** Still 3-4 conversational turns before seeing a draft. "Immediately" is not satisfied.
- **Unlocks:** First-run discovery without hunting the Sidebar overflow.

### Option B: Standalone voice setup form with immediate draft
- **What it is:** A `VoiceSetupPanel` component: three textareas (`description`, `example_message`, `guardrails`), pre-filled with synthesized defaults so the user edits rather than starts blank. On submit: call `saveAionVoiceConfig()`, then immediately POST to `/api/aion/draft-follow-up` using the new voice + the user's top active deal (or a synthetic context if no deals exist). Show the draft inline below the form. Render the panel on `AionPageClient` when `voice_default_derived === true`.
- **Effort:** Medium. One new component (`VoiceSetupPanel.tsx`), a small update to `AionPageClient.tsx` (pass `isVoiceDefault` from server), one new server action or inline API call to fetch top deal and hit `draft-follow-up`.
- **Main risk:** Adds a second voice setup surface to maintain alongside the conversational path. The zero-deal case needs a graceful fallback (synthetic context or skip draft, show "add a deal to see a real draft").
- **Unlocks:** The literal goal: write → see draft in one screen. Also re-tunable from the Sidebar overflow (same component, different trigger).

### Option C: Free-form text → LLM synthesis → save + draft (single-shot)
- **What it is:** A single large textarea: "Describe how you write to clients — voice, rules, example. Write as much or as little as you want." On submit: POST to a new `/api/aion/synthesize-voice` endpoint that uses `generateText` to extract `description`, `example_message`, `guardrails` from the free text. Save the result + immediately call `generateFollowUpDraft`. Return both to the client.
- **Effort:** Medium-large. New API endpoint, LLM extraction prompt, new UI. Adds a new code path that isn't covered by existing tests.
- **Main risk:** More moving parts; the LLM extraction adds latency (two LLM calls — synthesize + draft). Extraction quality is uncertain without real data.
- **Unlocks:** The "write 3 paragraphs" UX literally as described. More forgiving input — the user doesn't need to understand what "guardrails" means.

## Recommendation

**Build Option B.** It satisfies the goal (write → see draft, one screen) with the fewest new surfaces and zero new API endpoints. The key insight: the three textareas in `VoiceSetupPanel` can be pre-filled from `synthesizeDefaultVoice()` — the user is editing a starting draft of their voice, not staring at blank fields. That lowers the barrier to the same level as Option C without the extra LLM call.

The zero-deal fallback: if `getActiveDeals(workspaceId, limit=1)` returns nothing, show the form submission as a success ("Voice saved — add your first deal and I can show you a draft") rather than force a synthetic draft that would be unconvincing.

Option A is too weak — it just makes the existing conversational flow more discoverable, which is worth doing, but doesn't deliver the "immediately see it working" moment. Option C adds LLM synthesis complexity that isn't needed when three explicit textareas cover the same input space.

The conversational path (Sidebar overflow → "Tune Aion's voice") remains valid for refinement after initial setup. The form and the conversational path serve different modes: fast onboarding vs. iterative teaching.

## Next steps for Daniel

1. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` lines 178–205 to confirm `saveAionVoiceConfig` is the right write path (it is — no service-role bypass needed there).
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — three textareas pre-filled via `synthesizeDefaultVoice(workspaceName)`, a submit button, and a draft preview section.
3. Update `src/app/(dashboard)/aion/page.tsx` (the server component) to read `aion_config` and pass `isVoiceDefault: boolean` as a prop to `AionPageClient`.
4. In `AionPageClient.tsx`, conditionally render `<VoiceSetupPanel workspaceId={...} workspaceName={...} />` when `isVoiceDefault` is true; hide it once the user saves (optimistic dismiss on submit).
5. For the inline draft: after `saveAionVoiceConfig()` succeeds, fetch the top active deal via a server action, then POST to `/api/aion/draft-follow-up` with the new voice + deal context. Show the result in the panel.
6. Handle zero-deal case: show a success state with "Voice saved. Open a deal and click 'Draft follow-up' to see it in action."

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice read/write
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` machine
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint (auth-gated, tier-gated)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" existing entry
- `src/app/(dashboard)/aion/AionPageClient.tsx` — render site for the new panel
