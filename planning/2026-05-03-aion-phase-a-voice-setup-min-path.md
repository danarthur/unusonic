# Aion Phase A: Minimum path to voice setup + first draft

_Researched: 2026-05-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The queue premise is partially stale.** `aion_config` already exists as a `Json` column on `public.workspaces` (`src/types/supabase.ts:7689`). The primer says "as of 2026-04-10" — this landed before that.

The voice-config infrastructure is complete end-to-end:

- `AionVoiceConfig` type (fields: `description`, `example_message`, `guardrails`) — `aion-config-actions.ts:12-16`
- `saveAionVoiceConfig` server action reads the current config, merges, and updates via `system` client — `aion-config-actions.ts:178`
- `getAionConfigForWorkspace` reads config per workspace — `aion-config-actions.ts:106`
- `/api/aion/draft-follow-up` route: auth + tier gate + kill-switch check → `generateFollowUpDraft` — `draft-follow-up/route.ts:1`
- `generateFollowUpDraft` builds a system prompt that injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly — `generate-draft.ts:52-86`
- `getDealContextForAion` assembles deal + client + proposal + follow-up-log context — `follow-up-actions.ts:545`

A 5-state onboarding machine already drives the Aion chat:
`no_voice → no_example → no_guardrails → needs_test_draft → configured` — `aion-chat-types.ts:225-257`

`buildGreeting` steps through these states conversationally — at `no_voice` it asks "How would you describe your style?", at `needs_test_draft` it offers "Want me to draft a test message?" — `prompts.ts:300-337`. The chat route calls `getOnboardingState` on every cold open — `chat/route.ts:122`.

**What is not there:** a dedicated form-based UI for voice setup. There is no Brain tab as a standalone page — the ChatInterface has a "Thinking" model mode (Brain icon at `ChatInterface.tsx:783`), and `/settings/aion` (`AionSettingsView.tsx`) covers consent/deal-card beta, not voice. "Brain tab paused" in the primer refers to a planned but unbuilt voice-strategy tab.

## Intended state

Daniel opens a voice setup surface, writes his communication style in plain language across three fields (or a single rich block), saves, and immediately sees a draft follow-up for his top-priority deal that reads like him. All the backend pieces to do this exist — what's missing is the entry point and the instant-preview moment that closes the loop.

## The gap

- No standalone form UI for voice setup (textarea for description, example message, guardrails)
- No "generate test draft" CTA wired to the voice-setup flow that immediately shows a real draft using an active deal
- The chat-native path exists but distributes the 3 inputs across 3+ conversation turns — the "3 paragraphs in one shot" UX is not there
- No clear route or tab where Daniel lands to do initial configuration

## Options

### Option A: Use the existing chat-native onboarding as-is

- **What it is:** The 5-state onboarding flow in `buildGreeting` already walks Daniel through style → example → guardrails → test draft. He opens `/aion`, the chat prompts him through it, and at `needs_test_draft` he can click "Yes, try one" to get a real draft.
- **Effort:** Zero new code. Just use it.
- **Main risk:** The UX is spread across 3+ separate chat turns; there's no form to paste 3 paragraphs at once, and the test-draft step requires clicking a chip, which easy to miss.
- **Unlocks:** Nothing new — this works today. The gap it does not close is the "one-shot form" experience the queue item describes.

### Option B: VoiceSetupForm in /settings/aion

- **What it is:** Add a `VoiceSetupForm` component inside the existing `AionSettingsView` at `/settings/aion`. Three labeled textareas (communication style, example message, rules). On save, calls `saveAionVoiceConfig`. Below the form, a "Generate test draft" section: picks the highest-priority item from `ops.follow_up_queue` for the workspace, calls `getDealContextForAion`, then POSTs to `/api/aion/draft-follow-up` and renders the result inline.
- **Effort:** Small — 1 new component (~200 lines), 1 new server action to fetch the top queue item, wire to existing API. No changes to ChatInterface or the chat route.
- **Main risk:** Settings is not the most natural place for this. Daniel might not find it, or might not think to go to settings first. The form also lives outside the deal context, so the "immediately see a draft" moment is slightly artificial (top-of-queue deal, not one Daniel consciously picks).
- **Unlocks:** All 3 fields saveable in one shot. Instant draft preview using real data. No changes to the critical chat path.

### Option C: VoiceSetupPanel as a pre-chat interstitial

- **What it is:** In `ChatInterface`, when `onboardingState === 'no_voice'`, render a `VoiceSetupPanel` instead of the normal chat input — a compact 3-field form (style, example, guardrails) with a single "Save and see a draft" button. On submit: save voice via `saveAionVoiceConfig`, fetch top-queue deal, call `draft-follow-up`, show the draft inline as the first Aion message, then transition to normal chat.
- **Effort:** Medium — new component, state routing in `ChatInterface`, needs a client-side action sequence (save → fetch deal → POST → render). About 300–400 lines across 2–3 files, plus tests.
- **Main risk:** Adds routing logic to `ChatInterface`, which is already complex. If voice config is later reset (via sidebar overflow "Tune Aion's voice"), the interstitial re-appears — need to handle re-setup gracefully. Also must not regress the existing chip-based onboarding path.
- **Unlocks:** Exactly the target flow: open `/aion`, fill 3 fields, see a real draft. No navigation to a separate settings page required.

## Recommendation

**Build Option B first, ship it, then decide if Option C is worth it.**

The full-stack path (aion_config column, saveAionVoiceConfig, draft-follow-up, generateFollowUpDraft, getDealContextForAion) is already working. The only missing piece is a form surface and the instant-preview moment. Option B delivers both in a few hours of focused work, carries zero risk to the chat path, and lets Daniel validate the voice → draft loop before anyone touches ChatInterface.

Option C is the better long-term UX, but it should be built on the back of data: if Daniel uses Option B and says "I wish this was in the chat itself," that's the signal to build C. Option A works today but leaves the "3 paragraphs in one shot" UX unaddressed and relies on Daniel remembering to complete the multi-turn flow.

The tradeoff being accepted with Option B: settings is not the ideal entry point. Accept that for now — a settings-page link in the Aion sidebar ("Configure your voice") makes it findable without adding complexity to the chat.

## Next steps for Daniel

1. Add a `VoiceSetupForm` component at `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` — three `<textarea>` fields mapping to `AionVoiceConfig.description`, `.example_message`, `.guardrails`. On submit call `saveAionVoiceConfig`.
2. Add a server action at `src/app/(dashboard)/settings/aion/draft-preview-action.ts` that: fetches the top `ops.follow_up_queue` item for the workspace, calls `getDealContextForAion`, POSTs to `/api/aion/draft-follow-up`, returns `{ draft, channel, dealTitle }`.
3. Wire both into `AionSettingsView.tsx` — show the form when voice is not configured; show draft preview card after save.
4. Add a "Configure your voice" link in `AionSidebar.tsx` (the sidebar overflow already has "Tune Aion's voice" via `resetAionVoiceConfig` — add a parallel "Set up voice" entry pointing to `/settings/aion` when onboarding state is `no_voice`).
5. Run `npm run test` — `aion-config-actions.test.ts` already covers `getOnboardingState`; add a test for the new draft-preview action.
6. Confirm `kill_switch` is not set on the workspace (check `aion_config` in Supabase dashboard) — if it is, toggle it off via `toggleAionKillSwitch(false)`.

## References

- `src/types/supabase.ts:7689` — `aion_config` column on workspaces
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16, 106, 178` — `AionVoiceConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts:52-86` — voice injection into system prompt
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:300-337` — `buildGreeting` onboarding flow
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — where to add the form
