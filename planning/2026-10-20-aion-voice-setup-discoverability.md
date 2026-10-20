# Aion Phase A: voice setup discoverability and the missing settings form

_Researched: 2026-10-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`).
Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist,
what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel
open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an
Aion-generated follow-up draft that respects that voice.

_Note: the premises of this question are 6 months stale. The codebase has moved on significantly.
This doc re-scopes to the one real remaining gap._

## Current state

**The Brain tab is live.** `AionPageClient.tsx:66` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly — no pause gate.

**`aion_config` has been in `public.workspaces` since April 7, 2026** (`supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`). The column stores a JSONB object with `voice` (description, example_message, guardrails), `learned` (vocabulary swaps, patterns), `follow_up_playbook`, `kill_switch`, and two state flags. Full CRUD is in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-316`.

**The chat route is a real streaming agent.** `src/app/api/aion/chat/route.ts` (464 lines) has auth, rate limiting, tier gate, model tier selection, onboarding state machine, workspace snapshot, tool-calling loop, rolling conversation summarization, and session scope.

**A 5-state onboarding machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` drives `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat greeting for each state (`src/app/api/aion/chat/route/prompts.ts:310-346`) walks the user through voice setup conversationally. The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118-144`) persists the result.

**Draft generation is wired to voice config.** `/api/aion/draft-follow-up/route.ts` calls `generateFollowUpDraft` which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the generation prompt (`src/app/api/aion/lib/generate-draft.ts:63-75`).

**The onboarding bypass prevents the flow from being reached.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `configured` whenever that flag is set (`aion-chat-types.ts:248`). Result: every workspace opens Aion as `configured` from day one, and the conversational voice-setup flow never fires.

**The only path to the guided flow is hidden.** The AionSidebar has a header overflow with "Tune Aion's voice" that calls `resetAionVoiceConfig`. That clears the stored voice and flag, making the next chat open in `no_voice` state. This is not surfaced anywhere visible to a new user.

**There is no voice configuration form in `/settings/aion`.** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` covers card beta consent, cadence opt-in, pending requests, and memory backfill — no voice fields.

## Intended state

The original goal: Daniel opens Aion, writes a few sentences (or paragraphs) describing how he communicates, and immediately sees a draft that uses that voice. The system as designed should handle this. What's missing is discoverability — the mechanism exists but only activates for users who reset it, and the reset is buried.

A form in `/settings/aion` that directly saves description, example_message, and guardrails via `saveAionVoiceConfig` would give Daniel a stable, plain-English place to configure voice without needing the conversational flow. Adjacent pattern: how all other workflow configuration in Unusonic works (settings page → server action → toast).

## The gap

- No voice config form in `/settings/aion`. The only way to set voice is via conversational onboarding, which is itself gated behind a hidden sidebar reset.
- `voice_default_derived` shortcut means fresh workspaces never see the onboarding flow that would prompt them to set voice — so the "write your style and see a draft" moment never happens organically.
- The `needs_test_draft` greeting chip ("try one") calls `draft_follow_up` in chat, which requires an active deal in the queue. On a truly empty workspace it would return no-data gracefully, but the intent to demo Aion on first use goes unmet.

## Options

### Option A: Voice config form in `/settings/aion`

- **What it is:** Add a collapsible `StagePanel` to `AionSettingsView.tsx` with three fields — communication style, example message, guardrails. Saves via `saveAionVoiceConfig` server action. Clears `voice_default_derived`. Takes 2–3 hours.
- **Effort:** Small
- **Main risk:** None significant; the server action already exists and handles the merge correctly.
- **Unlocks:** Daniel can paste his 3 paragraphs directly into a form, save, and then use `/aion` chat to immediately draft against that voice. The flow the question described works as soon as the form exists.

### Option B: First-open banner in the Aion chat

- **What it is:** When `voice_default_derived === true` (synthesized default), show a dismissable banner at the top of `ChatInterface` with "Aion is using a default voice — tune it to match yours" and a CTA that either (a) navigates to a settings form (if Option A exists) or (b) calls `resetAionVoiceConfig` and reloads the chat into the 4-step onboarding flow.
- **Effort:** Small-medium
- **Main risk:** Adds UI complexity to the chat shell. Banners can feel nagging if not dismissed cleanly.
- **Unlocks:** Discovery without requiring settings navigation. Good complement to Option A, not a standalone alternative.

### Option C: Parse 3-paragraph voice input in a single chat turn

- **What it is:** Add a system-prompt instruction that when a user writes a multi-paragraph block about their communication style in the very first message, Aion extracts all three fields (description, example, guardrails) from the blob in one LLM call and saves them. No guided back-and-forth.
- **Effort:** Medium (prompt engineering + testing edge cases)
- **Main risk:** LLM extraction is imprecise; users writing "I keep it professional" won't produce a good `guardrails` field. The 3-field model doesn't map cleanly to freeform prose.
- **Unlocks:** The literal "write 3 paragraphs and get a draft" experience, but fragile.

## Recommendation

Option A now, Option B as a follow-up. Ship the settings form first.

The infrastructure is complete. The bottleneck is a missing 30-line form in a page that already exists. Option A unblocks the exact flow the question describes without any architectural risk: Daniel goes to Settings → Aion, fills in three fields, and the next chat uses his voice. The `saveAionVoiceConfig` server action handles the DB write, clears the synthesized flag, and calls `revalidatePath('/aion')` — no new logic needed.

Option C is tempting but wrong. The 3-field voice model is structurally sound; trying to extract it from unstructured prose in one turn will produce mediocre results. The settings form is more honest about what it's collecting.

After the form ships, Option B (the first-open banner pointing to the settings form) makes it discoverable without any extra work to discover settings.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a `StagePanel` section after the card beta section, before the cadence toggle.
2. Add three `<textarea>` fields: "How you communicate" (`description`), "Example message" (`example_message`), "Hard rules" (`guardrails`). Pre-populate from props.
3. Wire a save button to `saveAionVoiceConfig` from `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178`.
4. Pass the current `aion_config.voice` from the page's server component into `AionSettingsView` as a prop (alongside existing props).
5. Test: fill in the form, save, open `/aion`, ask "draft a follow-up for [any deal]" — confirm the voice appears in the draft.
6. Optional follow-up: add the discovery banner to `ChatInterface` when `voice_default_derived === true` pointing to `/settings/aion`.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page (no voice form today)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig` server action
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` / the bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` / 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284-295` — onboarding state → system prompt injection
- `src/app/api/aion/chat/route/prompts.ts:310-346` — state-aware greeting builder
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` / voice injection into drafts
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
