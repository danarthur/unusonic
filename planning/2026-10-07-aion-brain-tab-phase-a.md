# Aion Phase A: Brain Tab and First Voice-Driven Draft

_Researched: 2026-10-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the primer's claim that `aion_config` doesn't exist is outdated. The column is live and has been since the baseline migration. The actual gap is narrower._

## Current state

**`aion_config` is live.** `public.workspaces.aion_config jsonb DEFAULT '{}'` exists at `supabase/migrations/20260101000000_baseline_schema.sql:15058`.

**Voice type is defined.** `AionVoiceConfig` at `aion-config-actions.ts:12` has three fields: `description`, `example_message`, `guardrails`. `AionConfig` at `aion-config-actions.ts:50` wraps it under `voice?`.

**Server actions exist.** `saveAionVoiceConfig(voice)` writes to the DB at `aion-config-actions.ts:178`. `resetAionVoiceConfig()` clears it at line 214. Both are `'use server'` actions, ready to wire into a form.

**Voice fallback exists.** `synthesizeDefaultVoice(workspaceName)` at `aion-config-helpers.ts:20` auto-generates a default voice from the workspace name so new workspaces skip the forcing block. `applyVoiceDefaultIfEmpty` applies it on every read at line 35.

**Onboarding state machine exists.** `getOnboardingState(config)` at `aion-chat-types.ts:247` maps the config to: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route uses this to prompt the user through voice setup in-chat.

**Draft endpoint is functional.** `POST /api/aion/draft-follow-up` at `draft-follow-up/route.ts:21` is fully wired: auth check, tier gate, kill-switch check, reads `aion_config.voice`, calls `generateFollowUpDraft({ context, voice })`, records usage.

**`getDealContextForAion` exists.** Defined at `follow-up-actions.ts:545`, called by `follow-up-card.tsx:341` and the chat tools. Builds a rich deal context object for the draft API.

**What doesn't exist:** There is no Brain tab. `grep` for any route segment, page file, or component named `brain` returns only two comment references: `CadenceLearningToggle.tsx:14` (says it _can_ live inside the Brain tab) and `ChatInterface.tsx:783` (uses the lucide `Brain` icon for the Thinking mode picker — unrelated). The existing `/settings/aion` page (`AionSettingsView.tsx`) handles consent and cadence toggles only — no voice tuning UI.

## Intended state

A dedicated `/aion/brain` page (or tab within the Aion layout) where an owner can:
1. Write their communication style, an example message, and guardrails into three text areas.
2. Save, which calls `saveAionVoiceConfig` and sets `onboarding_state: 'complete'`.
3. Immediately generate a test draft using a real or synthetic deal context.
4. Optionally enable cadence learning (`CadenceLearningToggle`).

The test draft should call `POST /api/aion/draft-follow-up` with the saved voice and either the most-recent open deal or a synthetic stub. Once saved, every follow-up draft generated anywhere in the app — from `FollowUpCard`, from the chat — respects the stored voice.

## The gap

- No `/aion/brain` route or page component exists.
- No voice setup form UI — the three-field form (`description`, `example_message`, `guardrails`) that calls `saveAionVoiceConfig` has never been built.
- No test draft preview surface outside of `FollowUpCard` (which requires an actual deal queue item to trigger).
- The in-chat onboarding flow (the 4-step forcing block) handles voice setup via chat messages, but it requires an existing chat session and is conversational, not a form.

## Options

### Option A: Dedicated `/aion/brain` route
- **What it is:** New page at `src/app/(dashboard)/aion/brain/page.tsx`. Server component reads `getAionConfig()` and passes `onboardingState` + current voice values as props. Client component renders three textarea fields, a save button wired to `saveAionVoiceConfig`, and a "Generate test draft" button that calls `POST /api/aion/draft-follow-up` with a synthetic context (or the workspace's most-recent open deal via `getDealContextForAion`). Add a "Brain" nav entry in `AionSidebar.tsx`. Drop in `CadenceLearningToggle`.
- **Effort:** Medium — 2 days. New route + two components + one synthetic-context helper. All server-side plumbing exists.
- **Main risk:** The test draft needs a deal context. If the workspace has no open deals, a synthetic stub must be written carefully or the draft will be generic enough to be useless.
- **Unlocks:** Daniel can tune voice at any time, not just during in-chat onboarding. Every future draft — follow-up card, chat, daily brief — respects the saved config. `CadenceLearningToggle` gets a home.

### Option B: Voice section in `/settings/aion`
- **What it is:** Add a "Voice" accordion section to the existing `AionSettingsView.tsx`, below consent/cadence. Same three-field form and save action, but no test draft preview (awkward in a settings page).
- **Effort:** Small — less than a day. Extends an existing page, no new route.
- **Main risk:** No test draft preview means the loop "write voice → see Aion respect it" is broken. Daniel would have to navigate to a deal and trigger a draft manually to verify. The "Brain tab" mental model also doesn't match a settings accordion.
- **Unlocks:** Voice can be set and updated. Does not deliver the "immediately see a draft" goal.

### Option C: Surface the existing in-chat onboarding
- **What it is:** The chat route already has a 4-step voice-onboarding forcing block driven by `getOnboardingState`. The block is bypassed for workspaces that already have `voice_default_derived: true` (which is every existing workspace). The fix: add a "Tune Aion's voice" entry point in the Brain tab (or sidebar) that calls `resetAionVoiceConfig()` then routes to `/aion`. The chat then walks Daniel through the 4 steps conversationally and generates a test draft at the end.
- **Effort:** Small — half a day. Reset action + nav entry. No new form.
- **Main risk:** The chat-based flow feels like a conversation, not a form. It's good for first-time setup but bad for editing just one field later. There's also no standalone "Brain" surface; the tab is just a launcher.
- **Unlocks:** Re-exposes the in-chat onboarding that already works end-to-end.

## Recommendation

**Option A.** The question asks for a Brain tab, and the infrastructure to build it is entirely in place. Options B and C are shortcuts that sacrifice the "write → see draft" loop Daniel described. That loop is the north-star interaction — it's what makes voice setup feel real rather than abstract form-filling.

The only non-trivial decision in Option A is how to supply a deal context for the test draft. The cleanest approach: in the page's server component, after reading `getAionConfig`, also fetch the workspace's most-recent open deal and call `getDealContextForAion` on it. If none exists, fall back to a hardcoded synthetic stub (`{ deal_name: 'Sample show', client_name: 'Test Client', ... }`). The draft quality will be lower with the stub, but the interaction still demonstrates the voice is being applied.

Accept this tradeoff: the initial Brain tab won't have per-tab navigation polish or a full settings hierarchy — it's a single page with three text areas, a save button, and a draft preview. That's enough to validate the voice loop and unblock the rest of the follow-up system.

## Next steps for Daniel

1. Create `src/app/(dashboard)/aion/brain/page.tsx` — server component that calls `getAionConfig()` and (if the workspace has an open deal) `getDealContextForAion` on the most-recent one. Pass both as props.
2. Create `src/features/aion-voice/ui/VoiceSetupForm.tsx` — three `<textarea>` fields bound to `description`, `example_message`, `guardrails`; submit calls `saveAionVoiceConfig(voice)` via `useTransition`.
3. Create `src/features/aion-voice/ui/TestDraftPreview.tsx` — button that POSTs to `/api/aion/draft-follow-up` with `{ context, workspaceId }`; renders the returned draft string in a read-only card.
4. Add "Brain" to the Aion sidebar nav in `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` (look for the existing nav link list around line 30–60 of that file).
5. Drop `CadenceLearningToggle` below the form on the Brain page — it already reads and writes `aion_config.learn_owner_cadence` and needs no wiring.
6. Test the loop: save voice config, click "Generate test draft", verify the draft reflects the stored `description` and `example_message` phrasing.

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column definition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12,50,178,214` — types + save/reset actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20,35` — voice synthesis fallback
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/draft-follow-up/route.ts:21` — draft generation endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — drop-in toggle (Brain tab comment)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing consent/cadence settings page (not the voice home)
