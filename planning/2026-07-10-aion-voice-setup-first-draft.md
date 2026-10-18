# Aion voice setup + first real draft — minimum path

_Researched: 2026-07-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** The queue item was written against a much earlier state. Both `aion_config` and the full follow-up draft pipeline are now live. This doc reports the actual current state and reframes the gap accordingly.

---

## Current state

**`aion_config` is live.** `public.workspaces.aion_config` is a `Json` column (`src/types/supabase.ts:7782`), typed as `AionConfig` in `aion-config-actions.ts:50–74`. It holds `voice` (three text fields: `description`, `example_message`, `guardrails`), `onboarding_state`, `kill_switch`, `learn_owner_cadence`, and `voice_default_derived`.

**The 4-step conversational voice tuning flow is implemented** in the chat route. `getOnboardingState` (`aion-chat-types.ts:247–256`) returns one of `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state produces a tailored greeting (`prompts.ts:292–338`) and injects step-specific instructions into the system prompt (`prompts.ts:275–283`). `saveAionVoiceConfig` at `aion-config-actions.ts:178` persists each step's answer.

**The draft endpoint is live.** `POST /api/aion/draft-follow-up` (`draft-follow-up/route.ts:1–73`) authenticates the caller, runs the tier gate, reads `aion_config.voice`, calls `generateFollowUpDraft` (`lib/generate-draft.ts:25–46`), and returns `{ draft, channel }`. The follow-up card UI (`follow-up-card.tsx:341`) already calls it in production.

**The Brain tab = `/aion`.** `AionPageClient.tsx:66–76` renders `ChatInterface` directly. The components are fully wired — the primer's "Brain tab is paused" note is stale.

**New workspaces skip onboarding automatically.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:11–14`) synthesizes a generic voice from the workspace name on every `getAionConfig` read when `voice` is empty, sets `voice_default_derived: true`, and `getOnboardingState` treats that as `configured`. The 4-step flow never fires unless the owner explicitly triggers "Tune Aion's voice" from the `AionSidebar` header overflow (`AionSidebar.tsx:975`), which calls `resetAionVoiceConfig`.

## Intended state

Daniel opens the `/aion` page (or `/settings/aion`), writes three paragraphs describing how he communicates with clients, and immediately sees a real follow-up draft generated using that voice — without knowing about sidebar overflow menus or needing to step through 4 separate conversational turns.

## The gap

- No discoverable entry point to voice setup. The only way in is the `AionSidebar` header overflow → "Tune Aion's voice," which is invisible unless you know to look.
- The `/settings/aion` page (`AionSettingsView.tsx`) covers only card-beta consent and cadence toggle. There is no voice input form there.
- The in-chat onboarding (4 conversational steps) is one step at a time — writing "3 paragraphs" in one pass is not supported. There is no form.
- `AionLandingStarters.tsx` has `NEW_WORKSPACE_STARTERS` but no "set up my voice" entry for `voice_default_derived` workspaces.
- Draft preview requires a real deal context. `generateFollowUpDraft` takes `AionDealContext` — there is no synthetic/demo path.

## Options

### Option A: Voice setup section in /settings/aion

- **What it is:** Add a "Aion voice" section to `AionSettingsView.tsx` with three `<textarea>` fields (`description`, `example_message`, `guardrails`) and a "Preview draft" button. On submit, call `saveAionVoiceConfig`. The preview button calls `POST /api/aion/draft-follow-up` server-side using the top item in `ops.follow_up_queue` (or the first open deal if the queue is empty) as context, and renders the draft inline.
- **Effort:** Medium — new form UI in an existing settings page, one new server action for the preview, RLS-safe because `draft-follow-up` already handles auth.
- **Main risk:** Draft preview needs at least one open deal to produce a meaningful example. New accounts with no deals would see an empty preview or a placeholder message.
- **Unlocks:** The literal "3 paragraphs → draft" experience at a stable URL (`/settings/aion`). No sidebar knowledge required.

### Option B: Landing chip pointing to voice setup

- **What it is:** Add a `"Set up my communication style"` entry to `AionLandingStarters.tsx` for workspaces where `voice_default_derived === true`. Tapping it sends a synthetic `[reset-voice]` message (or directly navigates to `/settings/aion#voice`) to enter the tuning flow.
- **Effort:** Small — one new starter entry and a check of `voice_default_derived` when rendering the landing starters.
- **Main risk:** Still routes into the existing 4-step conversational flow — not the "3 paragraphs at once" form. Addresses discoverability but not the UX shape Daniel described.
- **Unlocks:** Users who open `/aion` see a clear path to voice tuning without learning about sidebar overflow.

### Option C: Single-message voice intake in chat

- **What it is:** When `onboarding_state === no_voice`, accept a free-form multi-paragraph description and run it through a fast LLM parser that extracts `description`, `example_message`, and `guardrails` in one shot, saves all three, then immediately generates a draft.
- **Effort:** Medium-large — new parse route (or extend `chat/tools`), acceptance UI (show parsed fields for confirmation), error recovery.
- **Main risk:** Field extraction quality is non-deterministic. The most natural UX has the highest implementation risk.
- **Unlocks:** The genuinely conversational "tell me how you work" entry point; mirrors how high-end AI tools handle freeform configuration.

## Recommendation

Ship **Option A**, then add **Option B** as a 30-minute companion.

Option A is the exact match to the stated goal: a form at `/settings/aion` where Daniel writes his communication style and sees a draft. All the backend work is already done — `saveAionVoiceConfig`, `draft-follow-up`, and `generateFollowUpDraft` are live. The form is the only missing piece. The deal-context dependency (Option A's main risk) can be handled with a single fallback: if the follow-up queue is empty, show a brief note ("Add a deal to preview a draft against a real context") instead of a broken preview.

Option B is free discoverability from the main chat landing — add it once Option A is live so the chip routes to `/settings/aion#voice` directly.

Defer Option C. The value of a free-form parser is real, but it should be informed by what parts of the voice form Daniel actually fills in and how he phrases them. Let Option A ship first and generate real voice text. Option C can parse that text retroactively or refine it in a future sprint.

## Next steps for Daniel

1. Read `AionSettingsView.tsx` (full file, 313 lines) to understand where to add the voice section — after the cadence toggle, before the pending-requests block.
2. Reuse `AionVoiceConfig` type (`aion-config-actions.ts:12–16`) for the three form fields: `description`, `example_message`, `guardrails`.
3. Call `saveAionVoiceConfig(voice)` (already a server action at `aion-config-actions.ts:178`) on form submit. No new server action needed.
4. For the preview: create a new server action that fetches the top item from `ops.follow_up_queue` for the workspace, calls `getDealContextForAion`, then `generateFollowUpDraft` — and returns the draft text. Call it from a "Preview" button on the form.
5. Add `"Set up my communication style"` to `AionLandingStarters.tsx:NEW_WORKSPACE_STARTERS` pointing to `/settings/aion` for workspaces where `voice_default_derived === true`.
6. Test the flow: reset voice via `resetAionVoiceConfig`, fill in the form at `/settings/aion`, click preview, confirm a real draft appears.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — voice form goes here
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16, 178` — voice type + save action
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (why new workspaces skip onboarding)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–256` — `getOnboardingState` logic
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint already live
- `src/app/api/aion/lib/generate-draft.ts:25–46` — `generateFollowUpDraft`
- `src/app/api/aion/chat/route/prompts.ts:275–338` — onboarding system prompt injections + greetings
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:48–50` — starter CTAs
