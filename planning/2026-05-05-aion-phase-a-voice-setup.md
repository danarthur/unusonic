# Aion Phase A: Minimum path to voice setup + first real draft

_Researched: 2026-05-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premises in the queue item are out of date.** Both blockers have been resolved since the primer was written (2026-04-10).

`aion_config` column EXISTS on `public.workspaces` as a typed `Json` column:
`src/types/supabase.ts:7689`. It holds `{ voice?, learned?, follow_up_playbook?, onboarding_state?, kill_switch?, learn_owner_cadence?, voice_default_derived? }`. The write path via `saveAionVoiceConfig` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` is functional; it deep-merges into the stored JSONB and calls `revalidatePath`.

The Aion chat route at `src/app/api/aion/chat/route.ts` is a full, authenticated, 300-line orchestrator — not the 16-line stub the primer describes. It includes:
- Onboarding state detection via `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`
- A 4-step conversational setup flow (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) wired into `buildGreeting()` and `buildSystemPrompt()` at `src/app/api/aion/chat/route/prompts.ts:275-338`
- `save_voice_config` chat tool at `src/app/api/aion/chat/tools/core.ts:118` that saves all three voice fields and marks onboarding complete
- `draft_follow_up` chat tool at `core.ts:318` that calls `/api/aion/draft-follow-up`, which uses `aion_config.voice` in the generation prompt

**The actual blockers are:**

1. **Default-voice bypass.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` synthesizes a voice from the workspace name on first read. `getOnboardingState()` returns `'configured'` when `voice_default_derived === true` (`aion-chat-types.ts:248`), so the 4-step chat flow never fires. Daniel will land on the pull-mode greeting, not the setup flow.

2. **No form-based voice entry.** The voice setup is entirely conversational (multi-turn chat). `/settings/aion/` at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` has beta consent + cadence toggle only — no textarea fields for `description`, `example_message`, `guardrails`. Pasting 3 paragraphs and getting an immediate draft is not possible without going through Aion chat step-by-step.

3. **Test draft needs a real deal.** The `needs_test_draft` step uses `draft_follow_up` which calls `POST /api/aion/draft-follow-up` with a full `AionDealContext`. If there are no active deals in the follow-up queue, the test draft can't run.

4. **"Tune Aion's voice" is buried.** `resetAionVoiceConfig()` is wired to a sidebar overflow item at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — easy to miss for a new user.

## Intended state

Daniel opens `/settings/aion/` (or a dedicated `/aion/setup` page), types 3 paragraphs about his communication style, example message, and guardrails, saves, and is immediately shown a draft for a real deal. Voice is stored in `aion_config.voice` and applied to every subsequent draft. No chat conversation required.

## The gap

- No form with fields for `voice.description`, `voice.example_message`, `voice.guardrails` in `/settings/aion/`
- Default-voice synthesis (`voice_default_derived`) silently skips onboarding for new workspaces
- Test-draft step in chat fails gracefully but doesn't explain why when no deals exist
- "Tune Aion's voice" reset is only surfaced in the sidebar overflow (low discoverability)

## Options

### Option A: Voice setup form in `/settings/aion/`

- **What it is:** Add a `VoiceSetupForm` component to `AionSettingsView.tsx` with three textareas (description, example, guardrails) wired to `saveAionVoiceConfig`. After save, show an inline test draft using the top-priority queue item or the most recent active deal. A "reset to defaults" link calls `resetAionVoiceConfig`.
- **Effort:** Small — `saveAionVoiceConfig` already exists; form is ~80 lines. Test draft call is a direct POST to `/api/aion/draft-follow-up` from a server action.
- **Main risk:** Still requires at least one active deal to generate a meaningful test draft. Empty workspace gets a useful form but no draft preview.
- **Unlocks:** Direct paste-and-save path. Matches the stated goal without requiring chat.

### Option B: Single-turn chat fast-path

- **What it is:** When Aion detects a long user message (>150 words) in `no_voice` state, it extracts all three fields in a single `save_voice_config` tool call instead of prompting step-by-step, then immediately calls `draft_follow_up`. The LLM infers structure from the free-text paragraphs.
- **Effort:** Small — add a system-prompt instruction for the `no_voice` branch in `prompts.ts:276`. No new components. The chat route already handles this tool sequence.
- **Main risk:** LLM accuracy on field extraction is probabilistic. If the extraction misfires (guardrails confused with example), Daniel sees a wrong draft and doesn't know why. Harder to correct than a form.
- **Unlocks:** The chat page itself becomes the fast-path; no settings navigation required.

### Option C: Surface the reset + fix empty-state for test draft

- **What it is:** Two targeted fixes. (1) When `voice_default_derived === true`, add a `configured` greeting variant that surfaces an inline "Customize your voice" CTA (renders as a `suggestions` chip leading to the reset flow). (2) Make the `needs_test_draft` step synthesize a minimal fake `AionDealContext` from the workspace name + workspace snapshot when no queue item exists, so it can still generate a plausible demo draft.
- **Effort:** Small — greeting variant is ~15 lines in `prompts.ts`; fake-context synthesizer is ~20 lines in a helper.
- **Main risk:** Fake-context draft is less useful feedback than a real deal draft. It shows voice application but not real content.
- **Unlocks:** The chat path becomes end-to-end for all workspaces regardless of deal count.

## Recommendation

**Ship Option A first, add Option C as a same-PR pass.**

Option A is the direct answer to the stated goal — form-based voice entry is the only way to guarantee "write 3 paragraphs, immediately see a draft" without multi-turn chat. It maps exactly to Daniel's mental model.

Option B is tempting but fragile. LLM-extracted structure from free text is non-deterministic. When it misfires, Daniel sees a confusing draft and has no way to know what Aion captured. A form with explicit labels eliminates that ambiguity. Keep Option B as a future teaching-moment layer (detect when voice gets updated via form, offer chat-based refinement afterward).

Option C is low-effort insurance: (1) stops the default voice silently swallowing the onboarding for new workspaces, and (2) allows the test draft to run even on empty workspaces. Both fixes belong in this pass.

Accepting tradeoff: the test draft for an empty workspace will be illustrative rather than real — but it unblocks the setup feedback loop entirely.

## Next steps for Daniel

1. Add a `VoiceSetupForm` component to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — three `<textarea>` fields, submit calls `saveAionVoiceConfig` server action, show a success state with the saved values.
2. After save, fetch the top-priority `ops.follow_up_queue` item for the workspace and POST to `/api/aion/draft-follow-up` with its context. Render the draft inline as a `ReplyPreviewCard`-style block (the component already exists at `src/app/(dashboard)/(features)/aion/components/ReplyPreviewCard.tsx`).
3. In `src/app/api/aion/chat/route/prompts.ts:340`, add a `configured` + `voice_default_derived` greeting variant that pushes a "Your voice is auto-configured from your workspace name — want to customize it?" chip leading to `/settings/aion`.
4. In the `needs_test_draft` greeting at `prompts.ts:329`, if no queue item is available, synthesize a minimal context from workspace name + archetype (`corporate_event`) and generate anyway — flag as "example draft, not from a real deal."
5. Delete `src/features/onboarding/ui/ArthurInput.tsx` if it still exists — it's an empty legacy file per the primer.
6. Run `npm run test` after changes — `src/app/(dashboard)/(features)/aion/actions/__tests__/aion-config-actions.test.ts` covers the onboarding state machine; verify it still passes.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` state machine
- `src/app/api/aion/chat/route/prompts.ts:275-338` — 4-step forcing block + `buildGreeting()` per state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool; `core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (no voice form)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — "Tune Aion's voice" reset affordance
