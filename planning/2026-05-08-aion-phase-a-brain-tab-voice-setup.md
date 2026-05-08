# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-05-08 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note:** The premises in the queue item are stale. This doc reflects what actually exists as of 2026-05-08 and scopes the real gap.

---

## Current state

The infrastructure is substantially more complete than the primer suggests. The prior "16-line GPT-4-turbo stub" has been replaced by a full implementation.

**`aion_config` exists.** `public.workspaces.aion_config` is a JSONB column (default `{}`) that holds `voice`, `learned`, `follow_up_playbook`, `kill_switch`, and `voice_default_derived` flags (`supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`). Typed as `AionConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.

**Voice config shape.** `AionVoiceConfig` has three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:35-41`). These are the exact "3 paragraphs" Daniel wants to fill in.

**Voice onboarding flow exists in chat.** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) derives one of five states from `aion_config`. The chat route at `src/app/api/aion/chat/route.ts:122` calls it and injects state-appropriate system prompt directives at `src/app/api/aion/chat/route/prompts.ts:275-283`. The greeting builder at `prompts.ts:292` returns contextual openers per state (no_voice → asks about style, no_example → asks for sample, etc.).

**Draft generation is live.** `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) is a fully wired, authenticated endpoint that reads `aion_config.voice`, calls `generateFollowUpDraft()` (`src/app/api/aion/lib/generate-draft.ts:25`), and returns a draft + channel. `getDealContextForAion()` (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`) assembles deal/client/proposal context.

**The onboarding flow is being skipped for new workspaces.** `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`) synthesizes a generic voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` treats this as `'configured'`, bypassing the 4-step flow entirely (`aion-chat-types.ts:248`). The sidebar overflow exposes "Tune Aion's voice" which calls `resetAionVoiceConfig()` (`aion-config-actions.ts:211`) — but that affordance is buried.

**No "Brain tab" exists.** The CadenceLearningToggle mentions it as a concept ("could live inside the Brain tab" at `CadenceLearningToggle.tsx:14`) but no Brain tab page or component has been built.

---

## Intended state

Daniel opens a voice setup surface, writes his style description, an example message, and any guardrails in one sitting, then immediately sees a follow-up draft generated against his top-priority deal. The draft confirms the voice was captured correctly. This is a first-use ritual: it takes 5 minutes and makes every subsequent Aion output feel intentional.

The reference pattern for this UX is Linear's team intake form + Superhuman's writing style quiz — a short structured form gated before first use, not buried in settings.

---

## The gap

- No dedicated voice setup surface exists. Setup is conversational (4 separate chat turns) or hidden behind sidebar overflow.
- New workspaces get a synthesized default voice (`voice_default_derived: true`) which skips onboarding entirely. First Aion chat goes straight to "configured" state with a generic voice.
- No "see a draft immediately after setup" connection in the UI — the `needs_test_draft` step exists in the chat flow but requires the user to complete all 4 conversational steps to reach it.
- No entry point that says "set up your voice → see a draft now."

---

## Options

### Option A: Dedicated voice setup form page

- **What it is:** A settings page at `/settings/aion/voice` (or an inline modal) with three labeled textareas (description, example message, guardrails), a save action that calls `saveAionVoiceConfig()`, and an immediate draft preview loaded via `POST /api/aion/draft-follow-up` against the workspace's top-priority follow-up queue item. ~3 new files: page, form component, and a server action to fetch top queue item for preview.
- **Effort:** Medium (2–3 days). Backend is complete; this is entirely UI work.
- **Main risk:** If no pending follow-up queue item exists, the draft preview fails silently. Needs a graceful fallback ("no active deals to draft against — your voice is saved").
- **Unlocks:** A first-use ritual that closes the loop (write style → see output) in one page load. Works even for non-chat users.

### Option B: Explicit "Set up your voice" entry point into the existing chat flow

- **What it is:** On the Aion page, when `voice_default_derived === true`, show a banner or card above the input that says "Aion is using a default voice. Teach it how you write." Clicking it calls `resetAionVoiceConfig()` and opens the chat — which then presents the existing `no_voice` greeting. The 4-step chat onboarding finishes with a test draft offer.
- **Effort:** Small (half a day). No new pages; just a conditional banner in `ChatInterface.tsx` or the Aion page layout.
- **Main risk:** Still requires 4 chat turns before the draft. Users who don't read the `no_voice` prompt carefully may give shallow answers. The experience is slower than Daniel's described goal.
- **Unlocks:** Exposes the already-built flow with zero infrastructure change.

### Option C: Inline setup card in Aion empty state

- **What it is:** When `voice_default_derived === true`, replace the chat empty state with a structured card showing the three voice fields inline (not in a chat thread). User fills in the card, submits, and sees a draft appear below — all without navigating away from the Aion page. Uses `saveAionVoiceConfig()` + `draft-follow-up` directly from the card.
- **Effort:** Medium (1.5–2 days). Card component is new; API calls are straightforward.
- **Main risk:** Inline form inside the chat surface can feel incongruous. If Daniel later wants to retune, this flow only triggers on first setup; he still uses sidebar overflow for re-tuning.
- **Unlocks:** Best UX for Daniel's stated scenario — no navigation, no separate page, write → see draft in one surface.

---

## Recommendation

Ship Option A: the dedicated form page at `/settings/aion/voice`.

The conversational flow (Option B) already exists and can be kept as a secondary path — but it requires 4 turns and buries the "see a draft" moment behind a chip. Option C is elegant but fuses two distinct concerns (setup and chat) in a way that will feel odd once the workspace is configured.

A settings page is the right abstraction: it's where Daniel would look for "configure how Aion sounds," it can be linked from onboarding, from the sidebar overflow, and from the settings nav. The three labeled textareas match the three-field shape of `AionVoiceConfig` exactly — no mapping needed. The immediate draft preview at the bottom of the page gives the confirmation loop Daniel wants, and it reuses the live `draft-follow-up` endpoint without any new backend work.

Accept the tradeoff: if the workspace has no follow-up queue items, the draft preview won't render. Show a disabled state ("save your voice first to enable a preview") rather than a spinner that never resolves.

---

## Next steps for Daniel

1. Add a `/settings/aion/voice` page under `src/app/(dashboard)/settings/aion/voice/page.tsx`. Three labeled textareas for description, example_message, guardrails. Save button calls `saveAionVoiceConfig()` from `aion-config-actions.ts`.
2. Wire a server action on the page to call `POST /api/aion/draft-follow-up` using the top-priority item from `ops.follow_up_queue` for the workspace. Show the draft below the form after save.
3. Link the page from the Aion sidebar overflow ("Tune Aion's voice") instead of calling `resetAionVoiceConfig()` directly — clicking through to the form is more deliberate than resetting in-place.
4. Add a link to the page from `AionSettingsView.tsx` (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) in the existing Aion settings section.
5. When `voice_default_derived === true` after saving the form, show a one-time banner on the Aion chat page prompting the user to set their voice (links to the form). Remove banner once `voice_default_derived` is cleared.
6. Run `npm run test` — `aion-config-actions.test.ts` covers `getOnboardingState` and will catch any regressions if you touch the config actions.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275-339` — onboarding prompt injection + greeting builder
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint (fully wired)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing Aion settings surface
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975` — "Tune Aion's voice" entry point
