# Aion voice setup and first follow-up draft

_Researched: 2026-08-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The planning primer is significantly out of date.** The blockers named in the queue item are already resolved. Findings:

**`workspaces.aion_config` exists.** `src/types/supabase.ts:7782` shows the column typed as `Json` in `Row`, `Insert`, and `Update`. The runtime shape is `AionConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` — it has `voice?: AionVoiceConfig` (`description`, `example_message`, `guardrails`), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `learn_owner_cadence`.

**The chat route is fully wired.** The 16-line stub referenced in the primer is gone. `src/app/api/aion/chat/route.ts:57` is 450 lines with auth, rate limiting, tier gating, kill-switch check, intent routing, streaming, and 25+ tool calls.

**`/api/aion/draft-follow-up/route.ts` exists and is wired end-to-end.** `draft-follow-up/route.ts:53` calls `getAionConfigForWorkspace` then injects `aionConfig.voice` into `generateFollowUpDraft`. `generate-draft.ts:63` takes the voice config and folds `description`, `example_message`, and `guardrails` into the system prompt. Voice is already respected.

**The 4-step voice onboarding is implemented.** `aion-chat-types.ts:247` defines `getOnboardingState` — a 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). `prompts.ts:292` has a `buildGreeting` with distinct greeter text for each state. The chat route already forces this flow when a workspace has no stored voice.

**The "Brain tab" does not exist and never shipped.** The Aion page at `/aion` — which renders `ChatInterface` directly — is the successor. `AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />`.

**The FollowUpCard is wired.** `follow-up-card.tsx:338` calls `getDealContextForAion` then POSTs to `/api/aion/draft-follow-up`. The "Draft a message" button is live and production-clean.

**The blocker that is still real:** New workspaces never see the 4-step onboarding because `aion-config-helpers.ts:35` synthesizes a voice from the workspace name on every read and sets `voice_default_derived: true`. `getOnboardingState:248` treats `voice_default_derived === true` as `configured` and skips all four steps. Entry to the real onboarding is hidden in the sidebar header overflow as "Tune Aion's voice" (`AionSidebar.tsx:1043`) — non-obvious and easy to miss.

## Intended state

Daniel opens `/aion`, describes how he talks to clients in his own words, and immediately sees a follow-up draft that sounds like him. No sidebar diving, no 4+ conversational turns before anything generative happens.

The 4-step conversational flow is the right long-term UX for production company owners who don't know what "guardrails" means. But it is not the right UX for the founder testing the product or for a savvy user who already knows what they want to say.

## The gap

- No voice setup form anywhere in `/settings/aion` — only consent and cadence toggles.
- "Tune Aion's voice" is buried in a sidebar overflow menu, invisible on first visit.
- The 4-step chat flow requires 4–7 turns before a draft appears, not "immediately."
- Step 4 (`needs_test_draft`) requires an active deal in `ops.follow_up_queue` — if none exists, the offer to generate a test draft is anticlimactic.

## Options

### Option A: Voice setup form in `/settings/aion`

- **What it is:** A 3-field form (`description` textarea, `example_message` textarea, `guardrails` textarea) added to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Submit calls the existing `saveAionVoiceConfig` server action. After save, a "Generate test draft" CTA posts to `/api/aion/draft-follow-up` against the highest-priority pending follow-up and renders the result inline.
- **Effort:** Small (3–5 hours). All backend plumbing exists. This is a UI addition only.
- **Main risk:** Two paths to voice config (form + chat onboarding) that could drift in their fields or validation. Easily controlled by keeping the form labels identical to the chat questions.
- **Unlocks:** Daniel can paste 3 paragraphs in one submit and see a draft without entering the Aion chat at all.

### Option B: Surface voice setup as a prominent chip in the Aion greeting

- **What it is:** When `voice_default_derived === true` (synthetic voice, never manually configured), add a chip to the configured greeting: "Set up your voice". Tapping it calls `resetAionVoiceConfig` and reloads the page — the next greeting is `no_voice` and the 4-step flow begins. The sidebar overflow keeps its "Tune Aion's voice" for users who already set up once and want to retune.
- **Effort:** Small (1–2 hours). Chat route change only — add the chip to the `configured` branch of `buildGreeting` when `config.voice_default_derived === true`.
- **Main risk:** The 4-step flow still takes 4+ turns before a draft. "Immediately" is not achieved; it just becomes discoverable.
- **Unlocks:** Every new workspace owner naturally encounters voice setup on their first Aion chat. No sidebar hunting.

### Option C: One-shot voice brief in Aion chat

- **What it is:** A new `[voice-brief]` synthetic message handler (alongside existing `[arg-edit]`/`[open-pin]` in `synthetic-messages.ts`). When a message contains the marker, the route extracts the content, stores it as `voice.description`, and immediately calls `generateFollowUpDraft` on the top follow-up queue item. Returns both a confirmation and a rendered draft in one response. A UI shortcut in the Aion landing page triggers this pattern.
- **Effort:** Medium (6–10 hours). New intent classifier, synthetic handler, streaming from two sources in one turn.
- **Main risk:** Voice config from a single freetext blob is less structured — no `example_message`, no `guardrails`, lower draft quality on first run. The 4-step flow exists because those fields matter.
- **Unlocks:** The exact "3 paragraphs → draft" vision from the queue item in a single turn.

## Recommendation

Ship **Option A first**, then consider **Option B** as a follow-up.

Option A closes Daniel's immediate need — it is the fastest path to "paste 3 paragraphs and see a draft." The backend is already there (`saveAionVoiceConfig`, `/api/aion/draft-follow-up`). Adding a form to `/settings/aion/AionSettingsView.tsx` is a few hours of UI work. The "Generate test draft" CTA after save proves the full loop in one session.

Option B should follow within the same sprint: adding a "Set up your voice" chip to the configured greeting costs an hour and solves the discoverability problem for every new workspace going forward. It does not replace Option A — both paths coexist.

Option C is more ambitious and carries real quality risk. Skip it until there is evidence that the 4-step conversational flow is a real friction point for non-founder users. The founder use-case (Daniel testing the product) is fully served by Option A.

The tradeoff you are accepting: two paths to voice config. Mitigate by keeping the form's field labels verbatim identical to the chat's onboarding questions.

## Next steps for Daniel

1. Add a `VoiceSetupSection` component to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three `<textarea>` fields (description, example, guardrails). Wire submit to `saveAionVoiceConfig`.
2. After a successful save, call `/api/aion/draft-follow-up` with the top-priority item from `follow_up_queue` (add a server action to `follow-up-actions.ts` that fetches the highest-priority pending row, or reuse `getFollowUpQueue`).
3. Render the returned draft inline in the settings page — a `DraftPreviewCard`-style block with copy and edit affordances.
4. Add a "Set up your voice" chip to the `configured` branch of `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts`, gated on `config.voice_default_derived === true`. Chip calls `resetAionVoiceConfig` and reloads.
5. Rename `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` to `AION_SYSTEM` / `AION_FULL_SYSTEM` — pending brand cleanup.

## References

- `src/types/supabase.ts:7782` — `workspaces.aion_config` column definition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting` per onboarding state
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint (auth + tier gate + voice injection)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338` — "Draft a message" CTA in live UI
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for the voice form
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow action (current only entry point for re-tuning)
