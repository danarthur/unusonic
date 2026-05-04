# Minimum path to voice setup + first draft (Aion Phase A)

_Researched: 2026-05-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Note: the queue item's premises are outdated.** The codebase has advanced significantly past the primer's 2026-04-10 snapshot.

**Column exists.** `workspaces.aion_config: Json` is live and typed in `src/types/supabase.ts:7689`. The `AionConfig` type in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` includes `voice?: AionVoiceConfig`, `kill_switch`, `onboarding_state`, and more.

**Voice type and save action exist.** `AionVoiceConfig = { description, example_message, guardrails }` (`aion-config-actions.ts:12`). `saveAionVoiceConfig(voice)` is a live Server Action (line 178). `resetAionVoiceConfig()` also exists and is wired to the AionSidebar overflow "Tune Aion's voice" entry point (`AionSidebar.tsx:1002`).

**Chat onboarding is built.** `getOnboardingState()` drives a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`aion-chat-types.ts:247`). When the chat route detects state != 'configured', it greets with targeted questions and saves answers via the `save_voice_config` tool (`chat/route/prompts.ts:275–282`).

**Default bypass is in place.** `synthesizeDefaultVoice()` in `aion-config-helpers.ts:20` auto-generates a voice from the workspace name on every `getAionConfig()` read and sets `voice_default_derived: true`. `getOnboardingState()` checks that flag first and immediately returns `'configured'` (line 248). New workspaces never encounter the 4-step onboarding forcing block.

**Draft pipeline is functional.** `/api/aion/draft-follow-up/route.ts` is live. `generateFollowUpDraft()` in `src/app/api/aion/lib/generate-draft.ts:25` accepts `voice: AionVoiceConfig | null` and injects it into the system prompt when set (line 63). The FollowUpCard's "Draft" button calls this endpoint directly (`follow-up-card.tsx:338`). An explicitly saved voice reaches all future drafts.

**No dedicated voice setup form exists.** The only paths to defining voice today are: (a) AionSidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig()` → start a new chat (where the 4-step forcing block fires), or (b) typing something in chat that triggers the `save_voice_config` tool. Neither path matches "fill three fields, see a draft."

**No "Brain tab" in the Prism.** The deal Prism has three tabs: Deal, Plan, Ledger (`prism.tsx:694`). The Aion chat lives at `/aion` as a standalone page.

## Intended state

Daniel opens a dedicated voice setup surface, fills three fields (communication style, an example message, guardrails), saves, and immediately sees a test follow-up draft for one of his open deals that uses that voice. This confirms the voice is working before Aion drafts anything real.

## The gap

- No form-based voice setup UI. The only path is sidebar overflow → reset → new chat → conversational 4-step flow.
- The chat onboarding asks one question at a time; the goal is writing everything at once.
- `synthesizeDefaultVoice()` means new workspaces never see the chat onboarding organically.
- After setting voice, there is no automatic "now see how it drafts" moment unless a follow-up queue item already exists.
- `/settings/aion` exists but only has card-beta and cadence-learning controls — no voice section.

## Options

### Option A: Surface the existing chat onboarding via a settings CTA
- **What it is:** Add a "Tell Aion how you write" panel to `AionSettingsView.tsx` with a single button that calls `resetAionVoiceConfig()` and navigates to `/aion`. The existing 4-step chat onboarding handles the rest.
- **Effort:** Small — ~30–60 lines in `AionSettingsView.tsx`, no new Server Action.
- **Main risk:** The conversational format is one question at a time; Daniel wants to write everything at once. The first draft is delayed until the full onboarding completes.
- **Unlocks:** The existing onboarding becomes reachable without knowing about the sidebar overflow.

### Option B: Build a VoiceSetupForm in settings with inline draft preview
- **What it is:** A new `VoiceSetupForm` component with three textareas (`description`, `example_message`, `guardrails`) added to `/settings/aion`. On save, calls `saveAionVoiceConfig()`. Then `POST /api/aion/draft-follow-up` for the top queued deal and renders the draft text inline.
- **Effort:** Medium — new component (~150 lines), a client-side fetch for the draft, an inline preview block.
- **Main risk:** Draft preview requires an item in `ops.follow_up_queue`. If the queue is empty the preview fails; needs a graceful empty state.
- **Unlocks:** Exactly the flow Daniel described. Saved voice feeds into `generateFollowUpDraft()` for all future FollowUpCard "Draft" clicks.

### Option C: Remove the synthesized-default bypass
- **What it is:** Gate or remove the `voice_default_derived` logic so new workspaces encounter the 4-step chat onboarding on their first visit to `/aion`.
- **Effort:** Small code change — modify `applyVoiceDefaultIfEmpty()` or `getOnboardingState()`.
- **Main risk:** The bypass was added intentionally at Wk 11 §3.8 to avoid forcing first-time chat visitors through an onboarding wall. Removing it degrades the first-chat experience for users who just want to ask a question.
- **Unlocks:** Organic voice setup for all new workspaces, no new UI needed.

## Recommendation

**Option B.** The form-then-draft flow Daniel described is a tight self-contained feature that belongs in `/settings/aion`, not buried in a chat sidebar overflow or smeared across a multi-turn chat. The data layer is complete: `AionVoiceConfig`, `saveAionVoiceConfig()`, `/api/aion/draft-follow-up`, and `generateFollowUpDraft()` with voice injection all exist today. The only missing piece is the form UI and the inline draft trigger.

Accept one tradeoff: if `ops.follow_up_queue` has no pending items, the draft preview is absent. That is fine — the voice is saved and shapes all future drafts. The settings page should say so plainly rather than pretending the feature failed.

Option A is tempting for effort, but one-at-a-time chat onboarding is the wrong shape for someone who knows what they want to say. Option C would regress the first-chat experience — the Wk 11 decision was deliberate and should not be undone without a stronger reason.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` — `'use client'` component with three `<textarea>` fields, a save button calling `saveAionVoiceConfig()` from `aion-config-actions.ts`.
2. In `src/app/(dashboard)/settings/aion/page.tsx`, call `getAionConfig()` (server component) and pass the current voice as `initialVoice` props into `VoiceSetupForm`.
3. After `saveAionVoiceConfig()` resolves in the form, `POST /api/aion/draft-follow-up` with the first pending item from `ops.follow_up_queue` — fetch it via a lightweight Server Action wrapper.
4. Render the draft in a `StagePanel` block inline on the settings page with a "Copy" button and a note about which deal it came from.
5. Insert a "Voice" section at the top of `AionSettingsView.tsx` (above the card-beta panel) — title: "Voice", subtitle: "How Aion writes on your behalf."
6. Smoke test: fill all three fields, save, confirm the draft renders and reflects the guardrail you set.

## References

- `src/types/supabase.ts:7689` — `workspaces.aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice()` bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` machine + `getOnboardingState()`
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft()` with voice injection at line 63
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint, tier-gated + kill-switch-checked
- `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:338` — existing "Draft" button flow
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — insert `VoiceSetupForm` section here
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — existing "Tune Aion's voice" (currently the only path to explicit voice setup)
