# Aion Phase A: Voice Setup — Minimum Path to First Real Draft

_Researched: 2026-08-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **How I read this:** The primer's description of current state is stale. I'm treating this as: what's the minimum UI gap between the working backend and the "3 paragraphs → test draft" experience Daniel described?

## Current state

The primer says `aion_config` doesn't exist and the Brain tab is paused. Both are wrong as of today.

**What's already shipped:**

- `public.workspaces.aion_config` JSONB column is live and in use (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:89`). It holds `AionVoiceConfig` (description, example_message, guardrails), a learned vocabulary table, and a follow-up playbook.

- `/api/aion/draft-follow-up` is live (`src/app/api/aion/draft-follow-up/route.ts`). Auth-gated, tier-gated, reads voice config via `getAionConfigForWorkspace`, passes `voice` to `generateFollowUpDraft`. The full draft prompt is in `src/app/api/aion/lib/generate-draft.ts:52`.

- `/api/aion/learn-from-edit` is live (`src/app/api/aion/learn-from-edit/route.ts`). Extracts vocabulary swaps from user edits and writes back to `aion_config.learned`.

- The 4-step chat onboarding (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is implemented in the chat route. Greetings and system prompts branch per state (`src/app/api/aion/chat/route/prompts.ts:275`). The `save_voice_config` chat tool writes to the same `aion_config.voice` field (`src/app/api/aion/chat/tools/core.ts:118`).

- The Brain tab is a full `ChatInterface` component — not paused (`src/app/(dashboard)/aion/AionPageClient.tsx:73`).

**The bypass that creates the gap:**

`getOnboardingState` returns `'configured'` whenever `voice_default_derived: true` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`). `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name on every read and sets that flag (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`). This means every new workspace silently bypasses the 4-step onboarding and gets a generic default. The only reset path is "Tune Aion's voice" in the sidebar overflow → `resetAionVoiceConfig` → new chat → conversational 4-step flow.

**No standalone voice form exists.** `saveAionVoiceConfig` is defined as a Server Action but is never called from a form (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178`). The settings/aion page covers consent and cadence only.

## Intended state

Daniel opens the Brain tab (or a settings page), writes how he talks to clients, pastes a real example message, states any guardrails, clicks one button, and sees an Aion-generated draft against one of his live deals. The voice is then persisted and used by every subsequent `draft-follow-up` call. No Socratic multi-turn required.

## The gap

- No form UI for the 3-field voice config (description, example, guardrails).
- No "Test draft" button that calls `/api/aion/draft-follow-up` and renders the result inline.
- No entry point from the Brain tab / settings to reach explicit voice setup.
- The 4-step chat onboarding is bypassed for all workspaces that have a synthesized default.

## Options

### Option A: Voice setup page at `/settings/aion/voice`

- **What it is:** A standalone page with 3 textareas pre-populated from current config, a Save button (`saveAionVoiceConfig` — already exists), and a "Test draft" button that calls `/api/aion/draft-follow-up` with the workspace's top active deal and renders the draft inline. Link it from the existing `/settings/aion` page.
- **Effort:** Small (half-day). No new schema, no new API routes. Pure UI on top of existing actions.
- **Main risk:** Not discoverable from the primary surface. User has to navigate to Settings to find it.
- **Unlocks:** The exact "write 3 paragraphs → see draft" flow Daniel described. Also the authoritative place to edit voice config once the chat onboarding is bypassed.

### Option B: Voice setup card in the Brain tab

- **What it is:** When a workspace has `voice_default_derived: true`, render a dismissable banner or inline panel in the chat UI: "Aion is using a default voice — teach it your style." The CTA opens a side sheet with the same 3-field form + test button. On save, sets `voice_default_derived` to false.
- **Effort:** Medium (1–2 days). Adds state detection in the chat client, a side-sheet component, and the `voice_default_derived` clear-on-save logic.
- **Main risk:** Adds surface area to the chat client; has to co-exist with the existing chat onboarding state machine cleanly.
- **Unlocks:** Discoverable from the first place Daniel actually goes. Better long-term UX than a buried settings page.

### Option C: Collapse the 4-step chat onboarding into one turn

- **What it is:** Replace the 4-step Socratic flow with a single "paste your style below + example" free-form message that Aion parses and immediately saves. Remove or narrow the `voice_default_derived` bypass so new workspaces see this single-turn prompt on first chat.
- **Effort:** Medium (1–2 days). Changes the greeting logic, the onboarding state machine, and the system prompt instruction block for the synthesis step.
- **Main risk:** Changes the new-workspace first-run experience — risk of regression if the parse step fails or Aion misreads the input. Also requires removing the default-synthesis safety net.
- **Unlocks:** The chat IS the voice setup; no separate form or page needed.

## Recommendation

**Ship Option A first.** It unblocks the "write 3 paragraphs → see draft" goal today with the least risk. The backend is already complete — `saveAionVoiceConfig`, `/api/aion/draft-follow-up`, and the voice injection in `buildFollowUpPrompt` all work. A form page is the missing connector.

Option B is the right long-term answer (discoverability), but building the side-sheet entry point into the chat client carries more surface area and should wait until Option A proves out the voice → draft loop end-to-end. Option C (collapsing the chat onboarding) is a later UX refinement once we know what voice inputs actually produce good drafts.

The one tradeoff to accept: the settings URL requires Daniel to know where to look. Add a "Set up your voice" link to the existing `/settings/aion` page as a high-visibility pointer. That's a one-line addition.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/voice/page.tsx` — a server component that reads `getAionConfig()` and passes the current voice values to a client view.
2. Create `src/app/(dashboard)/settings/aion/voice/VoiceSetupView.tsx` — 3 textareas (description, example, guardrails), Save calls `saveAionVoiceConfig`, and a "Test draft" button that POSTs to `/api/aion/draft-follow-up` with the workspace's top active deal.
3. To get a deal for the test: add a `getTopActiveDeal(workspaceId)` helper in `src/app/(dashboard)/(features)/events/actions/deal-actions.ts` (or reuse existing query) that returns the most recent open deal's context.
4. Render the test draft inline below the form — a simple `<pre>` or markdown block, no new components needed.
5. Add "Configure voice" link in `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` pointing to `/settings/aion/voice`.
6. Manual test: fill in the 3 fields, hit "Test draft", confirm the draft reflects the voice. Then verify `aion_config.voice` updated in Supabase Studio.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — the draft API (live, tested)
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` (voice injection)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page to link from
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab (full ChatInterface, not paused)
