# Aion Phase A: voice setup form + first real draft

_Researched: 2026-11-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I read this question:** The queue entry is from an early snapshot (primer dated 2026-04-10). The codebase has since moved well past that state. I re-scoped the question to: given what actually exists today, what is the minimum work to close the loop between "user describes their voice" and "user sees a live draft"?

## Current state

**`aion_config` exists and is in production.** `public.workspaces.aion_config` is a live JSONB column, read via `getAionConfig()` and `getAionConfigForWorkspace()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–120`. The column holds `AionVoiceConfig` (`description`, `example_message`, `guardrails`) alongside learned patterns, follow-up playbook, and kill switch.

**The Brain tab is live.** `/aion` renders `AionPageClient` → `ChatInterface` (`src/app/(dashboard)/aion/AionPageClient.tsx:66`). It is not paused.

**Draft generation is fully wired.** `POST /api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` authenticates, tier-gates, reads `aion_config.voice`, and calls `generateFollowUpDraft()`. `generate-draft.ts` injects voice description, example message, and guardrails verbatim into the system prompt (`src/app/api/aion/lib/generate-draft.ts:52–86`).

**A voice onboarding state machine exists.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives a five-state sequence: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route uses this to force setup conversationally.

**Wk 11 §3.8 changed the default.** New workspaces now auto-synthesize a voice from the workspace name via `synthesizeDefaultVoice()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20`). `voice_default_derived: true` skips the 4-step forcing block entirely. Users who want to tune manually use "Tune Aion's voice" in the AionSidebar overflow (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`), which calls `resetAionVoiceConfig()` and re-enters the conversational flow.

**Saving voice works.** `saveAionVoiceConfig(voice: AionVoiceConfig)` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` merges and writes via system client, revalidates `/aion`.

**What is missing.** There is no direct form where a user writes `description`, `example_message`, and `guardrails` as free text and then immediately sees a draft. The current path is: sidebar overflow → reset voice → new chat → Aion asks 3 questions conversationally → voice saved → user navigates to a deal → presses "Draft follow-up" on the deal card. The two moments (voice input, draft preview) are separated across pages and sessions.

## Intended state

A user opens the Brain tab (/aion), clicks "Tune Aion's voice" in the sidebar, and sees a panel with three labeled text areas — one for style description, one for an example message, one for guardrails. After saving, a sample draft appears immediately in the same panel using a real active deal from the workspace as context. The user adjusts, saves again, sees the draft update. No separate navigation required.

This is an explicitly opt-in experience (the synthesized default means no one is forced through it), and it replaces the conversational 4-step sequence for users who prefer to write rather than be interviewed.

## The gap

- No form-based voice input surface (all current input is conversational or auto-synthesized).
- No inline draft preview after voice setup.
- The "Tune Aion's voice" affordance exists but only resets and restarts the chat flow — it does not expose the fields directly.
- No mechanism to pick an active deal to use as the preview context from the Brain tab.

## Options

### Option A: Voice form + preview in `/settings/aion`

- **What it is:** Add a `VoiceSetupForm` component to `src/app/(dashboard)/settings/aion/` with the three fields and a "Preview" button that calls `/api/aion/draft-follow-up` using the workspace's most-recently-updated active deal. No changes to the chat interface.
- **Effort:** Small — 1 new settings section, 1 server action to fetch the preview deal, 1 API call.
- **Main risk:** Settings is two nav clicks away from the Brain tab, so the UX doesn't match "open Brain tab → tune voice → see draft." It solves the capability gap but not the experience gap.
- **Unlocks:** Direct form-based voice input at all; sets the foundation for a future Brain-tab panel.

### Option B: Voice panel inside AionSidebar (the "Tune Aion's voice" affordance)

- **What it is:** Replace the `resetAionVoiceConfig()` trigger in the sidebar overflow with a slide-out panel that exposes the three `AionVoiceConfig` fields as textareas and a "Preview a draft" button. Preview fetches the active deal with the nearest upcoming date and calls `draft-follow-up`. Saving calls `saveAionVoiceConfig()` and clears `voice_default_derived`.
- **Effort:** Medium — panel UI in a large file (`AionSidebar.tsx` is already complex), one new server action to pick a preview deal from `ops.events`, one client-side fetch.
- **Main risk:** `AionSidebar.tsx` is long and high-traffic. The preview needs a real deal — empty workspaces get nothing useful without fallback copy.
- **Unlocks:** Exactly the "open Brain tab → tune → see draft" loop the question describes. No page navigation needed. Fallback to conversational flow is preserved for users who prefer it.

### Option C: Standalone `/aion/voice-setup` page

- **What it is:** A dedicated route with the three-field form, a live draft preview card, and a "Done" link back to `/aion`. Entry via a banner on `/aion` for `voice_default_derived` workspaces ("Review and tune your voice") and from the sidebar overflow.
- **Effort:** Large — new page, new route, new layout, banner logic.
- **Main risk:** Adds a third Aion surface to maintain. The sidebar panel (Option B) achieves the same loop without a new page.
- **Unlocks:** A dedicated, shareable URL for the tuning experience. Useful if you want to deep-link from onboarding or email.

## Recommendation

Ship Option B. The "Tune Aion's voice" overflow affordance already exists and already points at this problem — extending it to a panel rather than a reset is the minimal delta. The three `AionVoiceConfig` fields map directly to what the question describes as "3 paragraphs." The preview draft closes the loop in the same panel.

The one work item to spec before building: what deal does the preview use? The simplest rule is: take the most recent deal with status `active` or `negotiation` from the workspace (a single query on `public.deals` ordered by `updated_at`). If none, show placeholder copy ("Add a deal to preview a real draft") rather than blocking the form.

Tradeoff accepted: `AionSidebar.tsx` gets longer. That is the only real cost; the data layer is entirely in place.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — this is the `SidebarSettingsMenu` that currently calls `resetAionVoiceConfig`. Replace the button with one that opens a local `voicePanelOpen` state.
2. Build `VoiceTuningPanel` as a local component in the same file (or extract to `components/VoiceTuningPanel.tsx`). Fields: `description` textarea, `example_message` textarea, `guardrails` textarea. Seed from `useAionConfig()` or prop-drill from wherever the sidebar receives the config.
3. Add a server action `getPreviewDealForVoice(workspaceId): Promise<AionDealContext | null>` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts`. Query `public.deals` for the most recent active deal and return an `AionDealContext` shape.
4. Wire "Preview a draft" button: calls `/api/aion/draft-follow-up` with the preview context and the form's current voice values, displays the returned draft text in the panel.
5. Wire "Save voice" button: calls `saveAionVoiceConfig()` with form values, updates local state, re-runs the preview.
6. Write a test for `getPreviewDealForVoice` in `src/app/(dashboard)/(features)/aion/actions/__tests__/aion-config-actions.test.ts` covering the empty-workspace case.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config types, save/reset actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/draft-follow-up/route.ts` — the draft generation API (fully wired)
- `src/app/api/aion/lib/generate-draft.ts` — how voice is injected into the system prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973` — current "Tune Aion's voice" affordance
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
