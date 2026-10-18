# Aion voice setup: what's the minimum path to voice-informed drafts?

_Researched: 2026-08-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain
tab is currently paused and `public.workspaces.aion_config` doesn't exist,
what's the minimum path to unblock voice setup + first real draft? Context:
the goal is to have Daniel open the Brain tab, write 3 paragraphs about how
he talks to clients, and immediately see an Aion-generated follow-up draft
that respects that voice.

---

**Note on premise:** The queue entry was written against the April 2026
primer. Both stated blockers are resolved — see Current State below. The
research reframes the question as: is the existing voice-setup path
discoverable and complete enough for the stated goal?

---

## Current state

**`aion_config` exists.** `public.workspaces.aion_config` is a `jsonb NOT
NULL DEFAULT '{}'` column added in
`supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:6`.
It is fully typed in `src/types/supabase.ts:7782` and read via
`getAionConfig()` and `getAionConfigForWorkspace()` in
`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,106`.

**`AionVoiceConfig` type is defined** at `aion-config-actions.ts:12-16`:
three fields — `description`, `example_message`, `guardrails`. These map
directly to the "3 paragraphs" the question describes.

**The 4-step onboarding flow exists.** `getOnboardingState()` at
`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` returns
one of five states: `no_voice → no_example → no_guardrails →
needs_test_draft → configured`. The chat route
(`src/app/api/aion/chat/route.ts:122,174`) reads this state and passes it
to `buildSystemPrompt` / `buildGreeting` — the Aion chat walks the user
through voice setup conversationally when not configured.

**The draft flow is wired end-to-end.** The Follow-Up Card's "Draft a
message" button (`follow-up-card.tsx:338-365`) calls
`getDealContextForAion()` (`follow-up-actions.ts:545`) and POSTs to
`/api/aion/draft-follow-up/route.ts`, which calls `generateFollowUpDraft({
context, voice })` (`api/aion/lib/generate-draft.ts`) — voice config is
injected into the prompt at generation time.

**But:** `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) silently
synthesizes a voice from the workspace name when the stored voice is empty,
and marks `voice_default_derived: true`. `getOnboardingState()` treats that
flag as `'configured'` (`aion-chat-types.ts:248`), bypassing the 4-step
flow entirely. A new workspace goes straight to drafting — with a
fabricated voice, never with Daniel's.

**"Tune Aion's voice"** is accessible from the Aion sidebar overflow menu
(`AionSidebar.tsx:1043`) and calls `resetAionVoiceConfig()`
(`aion-config-actions.ts:214`). That clears `voice_default_derived` and
re-enters the 4-step onboarding on next chat open. It is the only surface
that exposes voice tuning.

## Intended state

Daniel opens Aion, writes 3 paragraphs about how he talks to clients, and
the next "Draft a message" click on any Follow-Up Card reflects that voice.

The infrastructure supports this: the 4-step chat flow, the draft route, the
voice schema. The gap is that new workspaces never encounter the setup —
they get a synthesized default and the 4-step flow is permanently skipped
unless the owner actively hunts for "Tune Aion's voice" in an overflow menu.

## The gap

- New workspaces get `voice_default_derived: true` silently; the voice setup
  conversation never fires.
- The only way to trigger voice setup is the sidebar overflow menu item
  "Tune Aion's voice" — no first-run prompt, no settings form, no CTA.
- `/settings/aion` (`AionSettingsView.tsx`) handles consent and cadence but
  has no voice configuration UI.
- Until `resetAionVoiceConfig()` is called, drafts use the synthesized
  voice, not the owner's.

## Options

### Option A: Add voice form to `/settings/aion`

- **What it is:** Three textareas (description, example message, guardrails)
  in `AionSettingsView.tsx`, wired to the existing `saveAionVoiceConfig()`
  server action. Visible to admins/owners. Reads the current stored voice
  (including derived default) on mount.
- **Effort:** Small — one component section, one existing server action,
  no schema changes.
- **Main risk:** Settings pages have lower traffic than the chat interface;
  owners may still miss it without a nudge.
- **Unlocks:** A persistent, editable voice form that survives the chat
  session. Daniel can iterate on his voice outside of the chat flow.

### Option B: First-run prompt in the Aion chat

- **What it is:** When `voice_default_derived === true` and the session is
  the workspace owner's first or second chat open, inject a dismissible
  "Your voice is a placeholder — personalize it" banner or starter chip
  above the input in `ChatInterface.tsx`. Clicking it calls
  `resetAionVoiceConfig()` and triggers the existing 4-step conversational
  flow.
- **Effort:** Small-medium — new UI state in ChatInterface, one action
  call, one localStorage/DB flag for "prompted already."
- **Main risk:** The conversational 4-step flow is invisible to users who
  want to edit their voice later without resetting it; no persistent read
  path.
- **Unlocks:** The voice setup happens in the context where drafts are
  produced — same screen, immediate feedback loop.

### Option C: Remove the synthesized-default bypass

- **What it is:** Stop setting `voice_default_derived: true` in
  `applyVoiceDefaultIfEmpty`. Let new workspaces hit the `no_voice` state
  and enter the 4-step chat flow organically on first open. Keep the
  synthesized voice as the fallback only for draft generation (not for
  onboarding gating).
- **Effort:** Small — 2-line change to `aion-config-helpers.ts` plus a
  test update in `aion-config-actions.test.ts`.
- **Main risk:** Every new workspace now sees the 4-step forcing block
  before they can use Aion for anything else — higher onboarding friction
  for all users, not just owners.
- **Unlocks:** The voice setup path becomes the default, not optional.

## Recommendation

**Option A, then B.** Add the settings form first (small, low-risk, gives
Daniel an immediate place to enter his voice today), then add the first-run
chat prompt to catch owners who never visit settings.

Option C is too blunt — the 4-step forcing block applies to all members, not
just owners, so it penalizes crew members who never need to configure voice.
Option A alone has the discovery problem. Option B alone has no persistent
edit surface.

Start with A: add three labelled textareas to `AionSettingsView.tsx`,
pre-filled from `getAionConfig()`, saved via `saveAionVoiceConfig()`. That
file already imports the right server actions and has the right structural
shape. The whole change is contained to `AionSettingsView.tsx` and its
parent `page.tsx` (to pass the config as a prop).

This unblocks the stated goal immediately: Daniel visits `/settings/aion`,
fills in the three fields, saves — the next "Draft a message" click on any
Follow-Up Card uses his real voice.

## Next steps for Daniel

1. Read `AionSettingsView.tsx` (250 lines) and `aion-config-actions.ts:84-250` to understand prop flow and the `saveAionVoiceConfig` signature.
2. In `AionSettingsView.tsx`, add a `voice: AionVoiceConfig | null` prop and a new `<StagePanel>` section below cadence learning with three `<textarea>` fields.
3. Pass the current voice from `getAionConfig()` via the server component at `src/app/(dashboard)/settings/aion/page.tsx` — that file already calls `getWorkspaceFeatureState()`, so add `getAionConfig()` to the same `Promise.all`.
4. Wire save to `saveAionVoiceConfig({ description, example_message, guardrails })` via `useTransition` — same pattern as the consent toggle already in `AionSettingsView`.
5. Confirm: visit `/settings/aion`, fill the form, open a deal's Follow-Up Card, click "Draft a message" — the draft should reflect your tone.
6. (Later) Add the first-run chat banner in `ChatInterface.tsx` — chip label "Personalize Aion's voice", on click call `resetAionVoiceConfig()` then re-open chat.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page, no voice form yet
- `src/app/(dashboard)/settings/aion/page.tsx` — server component, props source
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16,84,178,214` — types, read, save, reset
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — synthesized default
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/app/api/aion/draft-follow-up/route.ts` — draft route (already uses voice)
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338` — "Draft a message" trigger
