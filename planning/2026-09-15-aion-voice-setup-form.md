# Minimum path to voice setup + first real draft

_Researched: 2026-09-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is
currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum
path to unblock voice setup + first real draft? Context: the goal is to have Daniel open
the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an
Aion-generated follow-up draft that respects that voice.

**How this question was understood:** The queue item assumes two blockers — no
`aion_config` column and no Brain tab. Both are stale. The research addresses the actual
gap: there is no free-text form where an owner can write their voice directly. All setup
is currently chat-driven.

## Current state

**`aion_config` column exists.** Typed at `src/types/supabase.ts:7895` as `aion_config:
Json` on `workspaces.Row`. The planning primer's note saying it doesn't exist predates
the column being shipped.

**Voice config type and actions are fully wired:**

- `AionVoiceConfig` type at
  `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — three
  fields: `description`, `example_message`, `guardrails`.
- `saveAionVoiceConfig()` at the same file line 178 — reads current config, merges
  voice, writes via server client. `onboarding_state` field at line 54 tracks
  `no_voice / no_example / no_guardrails / needs_test_draft / configured`.
- `getAionConfigForWorkspace()` at line 106 — system-client read, used by API routes.
- `updateAionConfigForWorkspace()` at line 262 — deep-merge helper for API route use.
- Default voice synthesis at
  `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — auto-generates
  voice from workspace name so first-time users skip forced onboarding.

**Draft generation is wired to voice:**

- `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25` accepts
  `voice: AionVoiceConfig | null` and injects it into the system prompt.
- `POST /api/aion/draft-follow-up` at
  `src/app/api/aion/draft-follow-up/route.ts:60` loads `aionConfig.voice` and passes it
  through — auth-gated, tier-gated, kill-switch-checked.

**4-step chat-driven voice onboarding exists.** The Aion chat system prompt
(`src/app/api/aion/chat/route/prompts.ts:291`) drives Aion to collect voice fields
through conversation and save via `save_voice_config` tool call. `onboarding_state` is
read by `getOnboardingState()` in
`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:243`.

**The Brain tab does not exist as a route.** There is no `/brain` page. The primer's
description of "Brain tab is paused" referred to a planned UI surface that was never
built. The `/aion` page (`src/app/(dashboard)/aion/page.tsx`) backed by
`AionPageClient.tsx` is the live brain interface. The `settings/aion` page
(`src/app/(dashboard)/settings/aion/page.tsx`) handles consent and cadence-learning
opt-in but has no voice config form.

## Intended state

Daniel opens a voice setup form, writes free-text in three fields ("how I write to
clients", "example message", "off-limits rules"), hits save, and immediately sees an
Aion-generated follow-up draft that respects what he wrote. The form is the "3 paragraphs
about how I talk to clients" entry point — not a chat conversation.

## The gap

- No free-text form UI for `description`, `example_message`, `guardrails`.
- No "preview draft" button that calls `/api/aion/draft-follow-up` with a mock deal
  context against the just-typed (but not yet saved) voice.
- `settings/aion` page has no voice section — it shows beta consent and cadence toggle
  only.
- The only path to set `onboarding_state: 'complete'` is through the Aion chat tool
  call, not through a direct form submit.

## Options

### Option A: Form in settings/aion

- **What it is:** Add a `VoiceSetupForm` component to
  `src/app/(dashboard)/settings/aion/` — three textareas for `description`,
  `example_message`, `guardrails`, a save button, and a "preview draft" button that POSTs
  to `/api/aion/draft-follow-up` with a hardcoded mock `AionDealContext`.
  `saveAionVoiceConfig()` and `updateAionConfigForWorkspace()` already exist; load initial
  values via `getAionConfig()` in the page server component and pass as props.
- **Effort:** Small — 1 new component, 1 small addition to `AionSettingsView`, no schema
  or API changes.
- **Main risk:** The mock context for "preview draft" needs to be realistic enough to
  produce a useful-looking draft. A generic placeholder ("Deal with a venue, deposit
  pending, following up after 5 days") works for the demo but could produce a draft that
  doesn't reflect the owner's real work.
- **Unlocks:** Daniel can write voice, save, see a real AI-generated draft in under 2
  minutes. Settings page becomes the canonical voice home.

### Option B: Start a forced-onboarding Aion chat session from settings

- **What it is:** "Tune your voice" button in settings calls `resetAionVoiceConfig()` and
  routes to `/aion` with a `?voice=retune` search param. The chat route detects this param
  and injects the `no_voice` onboarding block, forcing the 4-step conversation.
- **Effort:** Small-medium — no new components, but requires param-aware session
  initialization in `AionPageClient` and a chat-route guard on the param.
- **Main risk:** The chat-driven flow asks questions one at a time rather than letting
  Daniel free-write. The "3 paragraphs" feel is lost; users get a questionnaire.
- **Unlocks:** Reuses existing onboarding infrastructure. Voice setup and test draft
  happen through the same Aion conversation interface.

### Option C: Inline voice editor in the /aion sidebar

- **What it is:** Expand the existing "Tune Aion's voice" overflow item in `AionSidebar`
  (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975`) to open a
  slide-over with the same three-field form instead of just resetting and returning to
  chat.
- **Effort:** Medium — modal/slide-over component inside an already complex sidebar, with
  portal handling needed (Rule §10 in CLAUDE.md).
- **Main risk:** The sidebar is already complex. Adding a modal there adds nesting and
  z-index surface context overhead. Discoverability is low — most people won't find the
  overflow menu.
- **Unlocks:** In-context voice tuning without leaving the chat page. Useful for power
  users who already live in `/aion`.

## Recommendation

**Option A.** Build `VoiceSetupForm` in `settings/aion`.

The entire server layer is done — `saveAionVoiceConfig()`, `generateFollowUpDraft()`, the
voice type, the config read. This is pure form UI work. The settings page is the right
home for a workspace-level configuration; it's where owners already go to manage Aion
consent and cadence preferences. A three-textarea form with a "preview draft" button maps
directly to Daniel's goal.

For the preview, hardcode a mock context: a generic follow-up reason, 7-day elapsed
contact gap, email channel. The preview is meant to demonstrate voice fidelity, not
produce a final message — a slightly generic context is fine. `onboarding_state` should
be set to `complete` on save (extend `saveAionVoiceConfig` to accept an optional
`onboarding_complete: boolean` arg, or call `updateAionConfigForWorkspace` with
`{ voice, onboarding_state: 'complete' }` from the form action).

The chat-driven onboarding remains for users who prefer it; this form is additive.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` — `'use client'`,
   three controlled textareas bound to `description`, `example_message`, `guardrails`,
   save button wired to `saveAionVoiceConfig()`.
2. Add a "Preview draft" button that calls `fetch('/api/aion/draft-follow-up', { method:
   'POST', body: JSON.stringify({ context: MOCK_CONTEXT, workspaceId }) })` and renders
   the returned `draft` inline — no save required.
3. Define `MOCK_CONTEXT` as a static `AionDealContext` object in the component:
   deal name "Preview", follow-up reason "following up after initial conversation",
   suggested channel `'email'`, 7 days elapsed. The type lives at
   `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`.
4. Load initial voice values: in `AionSettingsPage`
   (`src/app/(dashboard)/settings/aion/page.tsx`), call `getAionConfig()` and pass
   `state.voice` as a prop to `AionSettingsView`, which forwards it to `VoiceSetupForm`.
5. Place `<VoiceSetupForm />` in `AionSettingsView` below `<CadenceLearningToggle />`.
6. After verifying the preview draft works end-to-end, update the planning primer's
   "Current notable state" section to reflect that voice config and draft generation are
   already wired.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — all voice read/write server actions
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft()` implementation
- `src/app/api/aion/chat/route/prompts.ts:291` — existing chat-driven onboarding instructions
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — insertion point for the form
- `src/app/(dashboard)/settings/aion/page.tsx` — server component to add `getAionConfig()` call
