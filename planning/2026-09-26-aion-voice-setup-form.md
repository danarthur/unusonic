# Aion voice setup form — minimum path to "write your style, see a draft"

_Researched: 2026-09-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the queue entry's premise is partially outdated. `public.workspaces.aion_config` exists and is live. The voice data model, draft-follow-up route, and chat-based onboarding are all shipped. The actual gap is narrower than described — see below._

## Current state

**`aion_config` column is live** — `getAionConfig()` and `getAionConfigForWorkspace()` read `public.workspaces.aion_config` on every call (`aion-config-actions.ts:88`). The column is typed as JSONB and holds an `AionConfig` object.

**Voice type is defined and consumed** — `AionVoiceConfig` at `aion-config-actions.ts:12` has `description`, `example_message`, and `guardrails`. `saveAionVoiceConfig()` at `aion-config-actions.ts:178` is a live server action that writes it. `generateFollowUpDraft()` at `generate-draft.ts:52` injects all three fields into the LLM system prompt when present.

**Auto-derived default silences the onboarding flow** — `synthesizeDefaultVoice()` at `aion-config-helpers.ts:20` generates a sensible default from the workspace name on every read when no explicit voice is stored. `getOnboardingState()` at `aion-chat-types.ts:247` short-circuits to `'configured'` when `voice_default_derived === true`, so the 5-state onboarding Q&A (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) never fires for new users. It only triggers after the owner calls `resetAionVoiceConfig()` via the sidebar overflow "Tune Aion's voice" (`AionSidebar.tsx:975`).

**draft-follow-up is live** — `POST /api/aion/draft-follow-up` at `draft-follow-up/route.ts:1` is fully wired: auth guard, tier gate, kill-switch check, voice injection, `generateFollowUpDraft`. It accepts `{ context: AionDealContext, workspaceId }`.

**learn-from-edit is live** — `POST /api/aion/learn-from-edit` at `learn-from-edit/route.ts:1` captures vocabulary from edited drafts and writes to `aion_config.learned`.

**No standalone voice form exists** — `/settings/aion` (rendered by `AionSettingsView.tsx`) shows only the deal-card beta consent and cadence toggle. There is no form exposing `description`, `example_message`, or `guardrails` fields. There is no "Brain tab" UI component.

## Intended state

Daniel opens a voice setup section, writes freely about his communication style (description), pastes an example message he's proud of (example_message), and lists any hard rules (guardrails). He presses "Generate test draft" — the system calls `draft-follow-up` against his most recent active deal and renders the result inline. He edits the draft if needed; an edit fires `learn-from-edit` and updates `aion_config.learned`. After that, every draft Aion generates respects what he wrote.

## The gap

- No UI exposes `description`, `example_message`, `guardrails` as editable fields.
- The only path to explicit voice setup today is: sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig()` → chat Q&A (4 conversational turns). Daniel writes 3 paragraphs across 4 turns instead of one form.
- No "test draft immediately" feedback loop outside the chat's `needs_test_draft` state.
- `/settings/aion` has no voice section.

## Options

### Option A: Voice section in `/settings/aion`

- **What it is:** Add a `VoiceSetupSection` component to `AionSettingsView`. Three textareas + "Generate test draft" button. Calls `saveAionVoiceConfig`, then `draft-follow-up` with the most recent active deal (or a prompt to pick one if the workspace has no deals). Renders the draft inline. If Daniel edits and approves, fire `learn-from-edit` with the delta.
- **Effort:** Small — ~120 LOC, reuses existing server actions and the draft-follow-up API. No migration or new route.
- **Main risk:** The test draft needs a real deal context (`AionDealContext`). A workspace with zero active deals can't generate a meaningful draft — need a graceful fallback message ("Add a deal first to see a personalized test draft").
- **Unlocks:** Daniel writes voice in one place, sees output immediately, without touching chat. Settings is discoverable. The inline draft loop closes within one page.

### Option B: Surface the existing chat onboarding with a CTA

- **What it is:** Add a "Set up your voice" banner or card to the lobby or `/aion` landing that calls `resetAionVoiceConfig()` then navigates Daniel into the chat. The 5-state Q&A already exists and offers a test draft at `needs_test_draft`.
- **Effort:** Small — ~40 LOC for the CTA, zero new API work. The chat flow already produces a test draft at step 4.
- **Main risk:** The experience is 4 conversational turns, not a form. Daniel cannot see all three voice fields at once. Editing previously set values requires re-running the Q&A or navigating back to restate them. Less transparent than a form.
- **Unlocks:** A clear entry point to the flow that already exists.

### Option C: Dedicated `/aion/setup` page

- **What it is:** A new route with a full voice setup wizard: multi-paragraph free-text input, real-time word count, a deal picker for the test draft, inline draft rendering, and an edit/approve loop. More design work but the most explicit "Brain tab" experience.
- **Effort:** Medium — new route, layout, form, deal-picker component, ~300 LOC.
- **Main risk:** Scope creep for a "minimum path." The data layer is identical to Option A; the extra effort buys UX polish, not capability.
- **Unlocks:** A dedicated, link-able setup experience for onboarding new workspace owners.

## Recommendation

**Option A.** The data layer is done. The only missing piece is a form that surfaces it. Adding `VoiceSetupSection` to `/settings/aion` is ~120 LOC against fully wired server actions and requires no migration, no new route, and no schema change.

The one implementation decision: the test draft needs a deal. The right call is to load the most recent active deal's context using the existing `getDealContextForFollowUp` or equivalent and pass it to `draft-follow-up`. If the workspace has no deals, render a static notice instead of a disabled button — "Add a deal to generate a personalized test draft."

Option B is tempting because it costs less code, but the conversational Q&A is a worse experience for this specific task — it forces Daniel to describe his voice in response to Aion's prompts rather than on his own terms, and gives him no single place to review or update what he wrote. Option C is the right long-term shape but overkill for "minimum path."

Accept the tradeoff: `/settings/aion` is a slightly odd home for a voice setup form (settings implies configuration, which this is, but the page is currently about consent). If the form feels misplaced after shipping, it can move to a dedicated section without API work.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a `VoiceSetupSection` component below the cadence toggle section (visible to all workspace members with the card enabled, not just admins).
2. The component reads current voice via `getAionConfig()` (server action, already exists) and renders three textareas pre-filled with existing values.
3. On submit, call `saveAionVoiceConfig(voice)` — the server action is at `aion-config-actions.ts:178`. Strip `voice_default_derived` so this explicit save replaces the auto-derived default.
4. After save, fetch the most recent active deal's context (you need a server action that returns a minimal `AionDealContext` for the top active deal in the workspace — look at `getDealContextForFollowUp` or the follow-up queue logic for the shape). Pass it to `POST /api/aion/draft-follow-up` and render the result below the form.
5. Wire the "Edit and approve" loop: if the user edits the draft, fire `POST /api/aion/learn-from-edit` with `{ original, edited, workspaceId, ... }` before confirming. The payload shape is in `learn-from-edit/route.ts:44`.
6. Run `npm run lint && npm run build` to confirm no FSD violations — `VoiceSetupSection` lives at the `app` layer (inside the settings page), so it can import from `features` and below without issue.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` + 5-state machine
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — where the new section goes
- `src/app/api/aion/draft-follow-up/route.ts` — live draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/learn-from-edit/route.ts` — edit-pattern learning endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:975` — existing "Tune Aion's voice" reset entry point
