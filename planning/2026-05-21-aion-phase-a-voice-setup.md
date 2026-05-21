# Aion Phase A: voice setup + first real draft

_Researched: 2026-05-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

## A note on current state vs. the question's premises

The question was written when the primer was current (2026-04-10). Almost all of the described blockers have since shipped. This doc maps what is actually present and then identifies the real remaining gap.

---

## Current state

**`public.workspaces.aion_config` exists.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` added the column. The baseline snapshot confirms it: `supabase/migrations/20260101000000_baseline_schema.sql:15058`. The column holds an `AionConfig` JSONB with `voice`, `kill_switch`, `onboarding_state`, `learned`, `follow_up_playbook`, and `voice_default_derived` fields. The type is declared at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`.

**The API stub is gone.** There is no `/api/aion/route.ts`. It has been replaced by `/api/aion/chat/route.ts` (451+ lines), which is a production route with auth, tier gating, kill-switch check, model routing, tool orchestration, and session summarization.

**A 5-state onboarding machine is live in the chat flow.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` defines the states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route calls `getOnboardingState()` on every cold open and builds a tailored greeting (`src/app/api/aion/chat/route/prompts.ts:300`). The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) writes `description`, `example_message`, and `guardrails` directly into `aion_config.voice` via `updateAionConfigForWorkspace`.

**`draft_follow_up` tool is live.** `src/app/api/aion/chat/tools/core.ts:318` drafts for the top-priority queue item or a specified deal, injects voice config and playbook rules, enriches with RAG memory, and returns a `draft_preview` card. `/api/aion/draft-follow-up/route.ts` also exists as a standalone POST endpoint for use outside chat.

**Voice is injected into drafts.** `src/app/api/aion/lib/generate-draft.ts:63` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the follow-up generation prompt when set.

**What does NOT exist:**
- No standalone voice setup form — settings page (`/settings/aion/AionSettingsView.tsx`) shows consent and cadence toggles only; no voice fields.
- No "Brain tab" as a separate navigation item. The Aion page (`/aion`) renders `ChatInterface viewState="chat"` directly.

---

## Intended state

Daniel opens `/aion`, writes three paragraphs (tone, example message, rules), clicks save, and immediately sees a follow-up draft that sounds like him. From the queue item: the experience should be direct and tactile, not a slow conversational extraction.

The current conversational flow achieves the same outcome — but across 4 back-and-forth turns, one field at a time. That is fine for discovery but poor for a founder who knows exactly what they want to write.

---

## The gap

- **No form surface.** Voice setup only happens via chat onboarding; there is no place to see all three fields together or edit them after the fact.
- **Test draft fails on empty queue.** `src/app/api/aion/chat/tools/core.ts:334` returns `{ error: 'No deals in the follow-up queue.' }` if the queue is empty. A first-time user with no queued deals hits a dead end at `needs_test_draft`.
- **`voice_default_derived` silently skips onboarding.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` returns `configured` immediately when `voice_default_derived === true` — which is set whenever `getAionConfig` synthesizes a default voice from the workspace name. Any workspace that has ever loaded the Aion page never sees the setup flow again.
- **The "Tune Aion's voice" sidebar item only resets.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` calls `resetAionVoiceConfig` (drops the voice + flag + onboarding_state), then the user returns to the conversational step-by-step. No direct edit path.

---

## Options

### Option A: Voice setup form in settings

- **What it is:** Add a `VoiceSetupForm` component to `/settings/aion/` with three textareas (tone description, example message, guardrails). On submit, calls `saveAionVoiceConfig`. Show a "Generate sample draft" button that calls `/api/aion/draft-follow-up` against the top deal (or a recent deal if queue is empty).
- **Effort:** Small — 1 new component, both server actions exist, draft endpoint exists.
- **Main risk:** Creates a second voice-config entry path that diverges from the chat onboarding. Users who configure via settings never experience the conversational flow, which teaches them what the fields mean. Settings UI needs its own field labels and help text.
- **Unlocks:** Daniel can write 3 paragraphs and save immediately; voice is visible and editable at any time.

### Option B: Voice edit panel from the Aion sidebar

- **What it is:** When "Tune Aion's voice" is tapped in the sidebar overflow, instead of resetting and going back to chat, open a slide-over panel inside `/aion` with all three fields pre-populated from `aion_config.voice`. Save calls `saveAionVoiceConfig` (without clearing `onboarding_state`). After save, auto-send a synthetic `draft_follow_up` message into the current chat so the draft appears immediately in context.
- **Effort:** Small-medium — slide-over panel, 1 server action call, 1 synthetic message dispatch.
- **Main risk:** "Tune Aion's voice" is buried in a sidebar overflow — discoverability is low for a new user who has never opened the sidebar. First-time users still hit the conversational flow.
- **Unlocks:** Edit-in-place of voice config with immediate draft preview inside the chat context.

### Option C: Fix the two silent failure modes, no new UI

- **What it is:** Two targeted code changes: (1) in `draft_follow_up`, fall back to the most recently created deal from `public.deals` when the queue is empty, so `needs_test_draft` never errors. (2) In `getOnboardingState`, treat `voice_default_derived` as `no_voice` on first onboarding (add a `onboarding_seen` flag to `aion_config` to distinguish "synthesized default on load" from "user explicitly said they're done"). The conversational flow then completes reliably.
- **Effort:** Small — changes confined to `aion-chat-types.ts`, `core.ts`, and `aion-config-helpers.ts`.
- **Main risk:** Doesn't give Daniel the "3 paragraphs at once" form UX. The conversational flow is still 4 turns. This is a fix, not a feature.
- **Unlocks:** The existing onboarding flow works reliably end-to-end for all new workspaces.

---

## Recommendation

**Ship Option A first, then Option C.** 

Option A (voice form in settings) delivers exactly what the question describes: a place to write three paragraphs and see a draft. The server actions are already built. The only work is a form component and a draft preview inside settings. It does not touch the chat route or the onboarding state machine at all — low risk.

Option C is a parallel two-line fix that should ship in the same PR: the `voice_default_derived` bypass and the empty-queue fallback are silent bugs that will frustrate any real user going through the conversational flow. Fix them regardless of which UI path you build.

Skip Option B for now. The sidebar overflow is the right long-term home for an edit-in-place voice panel, but it is low-discoverability and requires a slide-over component that doesn't exist yet. Build that in a second pass once the form in settings has validated the UX.

The only non-obvious tradeoff: Option A creates two paths to voice configuration. Accept that. The settings form is for intent-driven configuration ("I know what I want to write"). The conversational flow is for discovery ("I'm not sure what my voice is yet"). Both are valid.

---

## Next steps for Daniel

1. **Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx`** — three `<textarea>` fields wired to `saveAionVoiceConfig` from `aion-config-actions.ts`. Load initial values from the existing `aion_config.voice` (pass as a prop from the settings page server component).
2. **Add "Sample draft" button** — on click, POST to `/api/aion/draft-follow-up` with `workspaceId` and the top deal from `/api/aion/chat/tools/core.ts:324`'s fallback logic. Render the returned `draft` in a read-only preview block below the form.
3. **Mount `VoiceSetupForm` in `AionSettingsView.tsx`** — add a new section above the cadence toggle. Load `aion_config` in the settings page server component and pass `voice` down as a prop.
4. **Fix the empty-queue fallback in `core.ts:334`** — when `ops.follow_up_queue` is empty, fall back to `SELECT id FROM public.deals WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`. Pass a minimal mock queue item with `reason: 'Voice setup test'`.
5. **Fix the `voice_default_derived` bypass in `aion-config-helpers.ts`** — add a `onboarding_seen` boolean to `AionConfig`; set it in `applyVoiceDefaultIfEmpty` only after the user has explicitly completed or skipped setup. `getOnboardingState` should return `no_voice` when `voice_default_derived && !onboarding_seen`.
6. **Run `npm run test`** — existing tests in `aion-config-actions.test.ts` cover `getOnboardingState`; add a test case for `voice_default_derived` + `!onboarding_seen`.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `getAionConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route.ts` — production chat route, onboarding state wiring
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config`, `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft POST endpoint
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings UI (consent + cadence only)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column migration
