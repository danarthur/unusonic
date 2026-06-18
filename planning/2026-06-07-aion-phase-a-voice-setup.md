# Aion Phase A: voice setup + first real draft

_Researched: 2026-06-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of the question is largely outdated — significant ground has been covered since April 10.

**`aion_config` exists.** The column lives on `public.workspaces` and is read/written by `getAionConfig` at `aion-config-actions.ts:84` and `getAionConfigForWorkspace` at `aion-config-actions.ts:106`. The stored shape is `AionConfig` (`aion-config-actions.ts:50–74`): `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`.

**Voice config infrastructure is complete.** `AionVoiceConfig` has three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:12–16`). `saveAionVoiceConfig` saves all three (`aion-config-actions.ts:178`). `resetAionVoiceConfig` clears the voice to re-enter onboarding (`aion-config-actions.ts:214`). `synthesizeDefaultVoice` generates a generic voice from the workspace name (`aion-config-helpers.ts:20`), and `applyVoiceDefaultIfEmpty` injects it on every config read (`aion-config-helpers.ts:35`), marking `voice_default_derived: true`.

**New workspaces skip voice onboarding automatically.** `getOnboardingState` returns `'configured'` when `voice_default_derived === true` (`aion-chat-types.ts:248`). A brand-new workspace never sees the 4-step forcing block — Aion synthesizes a placeholder voice and treats it as done. The owner must explicitly click "Tune Aion's voice" in the sidebar (which calls `resetAionVoiceConfig`) to enter real voice collection.

**Draft generation is wired to voice.** `generateFollowUpDraft` in `generate-draft.ts:25` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt when they are set (`generate-draft.ts:63–74`). The `/api/aion/draft-follow-up` endpoint calls it after auth + tier gate (`draft-follow-up/route.ts`). `getDealContextForAion` exists at `follow-up-actions.ts:545` and builds the deal context the endpoint needs.

**The Aion chat is fully functional.** `/api/aion/chat/route.ts` is a real tool-calling orchestrator with auth, rate limiting, tier gating, session scope, model routing, and a rolling summarizer — not a stub. The "Brain tab paused" state described in the primer has been resolved.

**What does NOT exist:** a form-based voice setup flow. When Daniel clears his default-derived voice and re-enters onboarding, the system guides him through the 4-step process conversationally — Aion asks one question per turn (description → example → guardrails → test draft). There is no component where Daniel writes 3 paragraphs at once and sees a draft instantly.

## Intended state

Daniel opens the Aion chat, sees a voice setup panel (or a clear prompt), fills in three free-text fields about how he communicates with clients, submits once, and immediately receives an Aion-drafted follow-up message for a real open deal — all without multiple chat turns.

## The gap

- `synthesizeDefaultVoice` silently marks new workspaces as `configured`, bypassing real voice capture. Daniel's actual voice is never collected unless he manually resets.
- Onboarding is conversational (4 back-and-forth turns), not form-based. Each field requires a separate turn.
- No component collects all three voice fields simultaneously and triggers a draft in one round-trip.
- "Tune Aion's voice" is buried in a sidebar overflow menu — discovery requires Daniel to know it exists.

## Options

### Option A: Voice setup panel in the Aion sidebar

- **What it is:** A new `VoiceSetupPanel` component that renders inside `AionSidebar` when `onboarding_state !== 'configured'`. Shows three labeled textareas (voice description, example message, guardrails), a submit button calling `saveAionVoiceConfig`, and then a follow-up draft fetched from `/api/aion/draft-follow-up` using the top item from `follow_up_queue`. The draft renders via the existing `DraftPreviewCard` component.
- **Effort:** Small. No migrations. `saveAionVoiceConfig` exists. The draft endpoint exists. The preview component exists. This is a new UI component + wiring the submit → draft fetch.
- **Main risk:** The draft fetch needs a real queue item. If the workspace has no open deals in `follow_up_queue`, the draft falls back to a placeholder. This needs a graceful empty state.
- **Unlocks:** The core loop — write voice, see draft — in one session. Foundation for future few-shot learning (when Daniel edits the draft, `learn-from-edit` already exists at `/api/aion/learn-from-edit`).

### Option B: Fix the default-derived bypass and use the existing chat flow

- **What it is:** Remove `voice_default_derived: true` from `applyVoiceDefaultIfEmpty` (or move it to a lower-priority state), so new workspaces actually enter the 4-step conversational onboarding on first chat open. Aion collects voice naturally through conversation.
- **Effort:** Small in code, but the experience is slower — Daniel still needs 4+ turns before seeing a draft. The "immediately see a draft" goal is not met in one session.
- **Main risk:** Regressive for all new workspaces. The current bypass exists specifically to avoid blocking the chat on a mandatory onboarding wall. Removing it reintroduces that wall.
- **Unlocks:** Nothing new — this is the mechanism that already exists, just un-bypassed.

### Option C: Standalone `/aion/setup` wizard page

- **What it is:** A dedicated page route outside the chat (`/aion/setup`) with a three-step wizard — voice paragraph, example, guardrails — ending on a draft preview panel. Linked from the chat's empty state and from onboarding.
- **Effort:** Large. New route, new layout, new wizard component, separate draft preview page. No new data layer work, but significant UI surface.
- **Main risk:** Over-engineering Phase A. The same outcome can be achieved with Option A in a fraction of the effort.
- **Unlocks:** A cleaner narrative for onboarding in a future marketing/product context, but adds nothing functionally over Option A right now.

## Recommendation

**Ship Option A.** The data layer is entirely in place. The only missing piece is a `VoiceSetupPanel` component that lives inside the existing sidebar, collects all three voice fields at once, calls `saveAionVoiceConfig`, and then hits `/api/aion/draft-follow-up` with the workspace's top queue item. If no queue item exists, render a brief empty state ("Add a deal to see a draft here"). The panel should surface automatically when `onboarding_state !== 'configured'` — visible without requiring the owner to hunt for "Tune Aion's voice" in the overflow.

The one structural issue to fix alongside: `synthesizeDefaultVoice` currently marks every new workspace as `configured`, so the panel would never appear for new accounts. The fix is to set `voice_default_derived: true` in the synthesized config but NOT return `'configured'` from `getOnboardingState` for `voice_default_derived` — instead return `'no_voice'` and let the panel do its job. The synthesized voice becomes the placeholder text pre-filled in the form fields, not a signal that setup is done.

This approach accepts that the draft quality will be imperfect until Daniel edits it (the `learn-from-edit` loop), but the goal of Phase A is the first closed loop, not perfection.

## Next steps for Daniel

1. **Read `AionSidebar.tsx`** to find the right insertion point for a `VoiceSetupPanel`. The "Tune Aion's voice" overflow item is the current entry point — the panel replaces that with an always-visible affordance when onboarding is incomplete.
2. **Change `getOnboardingState`** (`aion-chat-types.ts:248`) so `voice_default_derived === true` returns `'no_voice'` instead of `'configured'`. The synthesized voice becomes the pre-fill, not the completion signal.
3. **Build `VoiceSetupPanel`** — three textareas, submit → `saveAionVoiceConfig`, then `fetch('/api/aion/draft-follow-up', ...)` with the first pending queue item.
4. **Wire the panel into `AionSidebar`** — show when `onboarding_state !== 'configured'`, hide once `saveAionVoiceConfig` returns success.
5. **Add an empty-state fallback** in the panel for workspaces with no queue items (show a sample draft with a placeholder client name instead of a real deal).
6. **Test end-to-end**: reset voice via `resetAionVoiceConfig`, open `/aion`, submit voice form, confirm draft uses the new voice values.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–74` — `AionVoiceConfig`, `AionConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20, 35` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/lib/generate-draft.ts:25, 63–74` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — reusable draft preview
