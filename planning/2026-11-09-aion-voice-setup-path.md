# Aion voice setup: minimum path from description to draft

_Researched: 2026-11-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How the agent understood this:** The two premises in the queue entry are both outdated (the primer is dated 2026-04-10; today is 2026-11-09). The research below reflects the actual codebase state. The real question is: given a nearly-complete infrastructure, what's the minimum UX addition to get "3 paragraphs → immediate draft" working?

---

## Current state

**`aion_config` exists and is in production.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` queries `public.workspaces.select('name, aion_config')`. The column is a live JSONB field with a typed `AionConfig` shape including `voice: { description, example_message, guardrails }`.

**The /aion page (formerly Brain tab) is fully functional.** `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` unconditionally. No paused state.

**A 5-state voice onboarding machine is implemented and wired:**
- State derivation: `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` returns `no_voice | no_example | no_guardrails | needs_test_draft | configured`
- Greeting per state: `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting()` returns specific prompts for each state, including chips
- System prompt injection: `prompts.ts:284-292` — `=== ONBOARDING ===` block fires for each unconfigured state
- Save tool: `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool writes `description`, `example_message`, `guardrails`, and an `onboarding_complete` flag to `aion_config`
- Draft tool: `core.ts:318` — `draft_follow_up` pulls the top-queue deal, calls `getDealContextForAion`, and passes `aionConfig.voice` to `generateFollowUpDraft`
- Draft route: `src/app/api/aion/draft-follow-up/route.ts` — authenticated, tier-gated, respects `kill_switch`, calls `generateFollowUpDraft` which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt

**The bypass: `voice_default_derived`.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()` synthesizes a default voice from the workspace name on every config read. `getOnboardingState()` returns `configured` immediately when `voice_default_derived === true` (line 248). This means every workspace skips the 4-step voice setup flow by default.

**"Tune Aion's voice" exists but is buried.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — the affordance is in the header overflow menu, hidden behind 3 clicks. It calls `resetAionVoiceConfig()`, which drops the stored voice + `voice_default_derived` flag; the next chat re-enters `no_voice` state.

**No voice form in Settings.** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` contains consent management and cadence learning toggles only — no textarea inputs for voice description, example, or guardrails.

---

## Intended state

Daniel opens the Aion page (or Settings > Aion), writes freely about how he talks to clients — tone, example message, any rules — in a single input, and within seconds sees a follow-up draft for a real deal that reflects that voice. No multi-turn conversation required. After approving, the voice is live for all future draft generation.

---

## The gap

- No single-shot form to capture voice (description + example + guardrails) in one submission
- The existing 4-step chat onboarding requires 4+ back-and-forth turns to reach a test draft
- "Tune Aion's voice" is buried in a sidebar overflow, not a visible landing affordance
- The `/settings/aion` page has no voice input fields
- After reset + re-enter `no_voice`, the chat flow still collects description → example → guardrails → draft across separate turns (by design), not in one shot

---

## Options

### Option A: Voice setup form in `/settings/aion`

- **What it is:** Add a "Voice" section to `AionSettingsView` with 3 textareas (description, example message, guardrails). A save button calls `saveAionVoiceConfig`. A "Test a draft" button POSTs to `/api/aion/draft-follow-up` with the top queue deal and renders the result inline.
- **Effort:** Small — 80–120 lines of UI, no new infrastructure. Uses `saveAionVoiceConfig` (line 178, exists), the draft route (exists), and `useFollowUpQueue` or a simple `fetch` to get the top deal.
- **Main risk:** The test draft requires a deal in the queue. If the queue is empty, the test preview is a no-op. Needs a graceful fallback ("No follow-up due right now — voice is saved and will apply when one comes in").
- **Unlocks:** Voice configured in one screen visit. Immediately testable. Settings is the right mental model for this ("configure how I work").

### Option B: Onboarding card in the `/aion` chat page

- **What it is:** When `voice_default_derived === true`, render a dismissible setup card in the chat area (above the input) with a single large textarea: "Tell me how you write to clients — style, what to avoid, an example if you have one." On submit: parse the blob into `description`/`example_message`/`guardrails` with a quick LLM parse, save via `saveAionVoiceConfig`, call the draft route, show the draft inline in the card.
- **Effort:** Medium — new component + LLM parse step + inline draft render + onboarding state check in `ChatInterface`. 4–6 hours.
- **Main risk:** The LLM parse step adds latency and a potential quality failure (the user's blob may not decompose cleanly). The 3-field decomposition may need a guided fallback.
- **Unlocks:** The goal scenario exactly: open the Aion page → write freely → see a draft. Highest-fidelity match to the queue item's intent.

### Option C: Surface the existing chat flow more prominently

- **What it is:** Move "Tune Aion's voice" from the sidebar overflow to a visible chip or banner on the Aion landing page. When clicked: `resetAionVoiceConfig()` → reload → chat opens in `no_voice` state → existing guided 4-turn flow.
- **Effort:** Tiny — change one affordance placement (< 30 min).
- **Main risk:** Doesn't achieve "3 paragraphs → immediate draft." Still 4 turns across 2 minutes of back-and-forth. Good for discoverability, bad for the specific UX goal.
- **Unlocks:** Removes the discoverability block but not the multi-turn friction.

---

## Recommendation

**Option A: Settings voice form.** It's the minimum path that actually delivers the stated goal ("write about your style → see a draft"). The backend is 100% ready; this is purely UI work. The Settings page is the right mental model for voice configuration — it's a workspace setting, not a conversational exchange. Build this first.

Option B is the right eventual UX for the Aion page and should follow once A proves the voice config works end-to-end. Keep Option C as a 30-minute complement to both: surfacing "Tune Aion's voice" as a visible link costs nothing and reduces discovery friction in the meantime.

Tradeoff accepted: Option A puts voice setup in Settings rather than in the Aion page itself. The queue item says "Brain tab" but the actual value is "writes → sees draft" — the specific surface matters less than the feedback loop. Settings is a more discoverable and less surprising location for workspace configuration.

---

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a `VoiceSetupSection` component in the existing `space-y-6` layout, below the cadence section.
2. The section: a `<StagePanel>` with 3 `<textarea>` / `<input>` fields bound to `description`, `example_message`, and `guardrails`. Save button calls `saveAionVoiceConfig(voice)`.
3. After save, show a "Test a draft" button. On click: `fetch('/api/aion/draft-follow-up', { method: 'POST', body: { context: topDealContext, workspaceId } })`. To get the top deal context, add a small server action that calls `getFollowUpQueue()` and `getDealContextForAion()` for the first result.
4. Render the draft in a `<StagePanel stripe="highlight">` with a copy button. No editing needed — this is a preview.
5. After confirming the draft looks right, the voice is already saved from step 2. Done.
6. As a parallel quick win (< 30 min): move `"Tune Aion's voice"` in `AionSidebar.tsx:1043` from the overflow to a visible link in the sidebar header so existing users can find it.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `getAionConfigForWorkspace`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`, `voice_default_derived` bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:284-292, 301-347` — onboarding system prompt + greeting messages
- `src/app/api/aion/chat/tools/core.ts:118, 318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt` (voice injection at line 63)
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for Option A
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1045` — "Tune Aion's voice" affordance
