# Aion Phase A: Minimum path to voice setup + first real draft

_Researched: 2026-08-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Two of the three premises in this question are out of date. The server-side pipeline is more complete than the primer implies.

**`workspaces.aion_config` exists.** Added via `supabase/migrations/20260101000000_baseline_schema.sql:15058` (`aion_config jsonb DEFAULT '{}'::jsonb NOT NULL`). The column holds `AionVoiceConfig: { description, example_message, guardrails }` plus learned vocabulary, playbook rules, and kill-switch flags (`aion-config-actions.ts:12-74`).

**Read/write actions are complete.**
- `getAionConfigForWorkspace(workspaceId)` — system-client read, called by every API route (`aion-config-actions.ts:106`).
- `saveAionVoiceConfig(voice)` — authenticated server action, merges and writes the three voice fields (`aion-config-actions.ts:178`).
- `applyVoiceDefaultIfEmpty(config, name)` — synthesizes a voice from workspace name on every read so new workspaces get a working (if generic) Aion immediately (`aion-config-helpers.ts:35`). Sets `voice_default_derived: true`.

**Draft pipeline is complete.** `/api/aion/draft-follow-up/route.ts` handles auth, tier gate, kill-switch check, voice load, and streams to `generateFollowUpDraft({ context, voice })`. That function injects all three voice fields into the LLM system prompt (`generate-draft.ts:63-76`). Tone anchoring from actual sent messages runs as a parallel signal (`lib/tone-anchoring.ts`).

**The 4-step chat onboarding exists but is permanently bypassed.** `getOnboardingState` in `aion-chat-types.ts:247` maps empty voice fields to states like `no_voice` / `no_example` / `no_guardrails`. However, `getAionConfigForWorkspace` always calls `applyVoiceDefaultIfEmpty` first, so the config presented to the chat route always has `voice_default_derived: true`, which short-circuits to `'configured'`. The 4-step flow cannot be entered organically.

**No voice setup form exists.** The `src/app/(dashboard)/(features)/aion/components/` directory has 34 components — none of them is a form or flow for writing `description`, `example_message`, and `guardrails`. The AionSidebar exposes "Tune Aion's voice" via `resetAionVoiceConfig` (`AionSidebar.tsx:31`), but resetting the DB then triggers re-synthesis on next read, so the 4-step flow is still never entered.

**The Brain tab does not exist.** No deal-page tab or panel embeds `ChatInterface`, `AionVoice`, or `AionInput`. Those components live exclusively on the `/aion` route. The Brain tab was planned but not built.

## Intended state

Daniel opens a voice setup surface, writes three paragraphs — their tone, an example message, and their guardrails — and sees a real follow-up draft immediately. The draft uses their actual voice, not the synthesized default. The underlying pipeline (schema column, write action, draft route, voice injection) is already in place. The only missing piece is the UI that exposes it.

## The gap

- No form component calls `saveAionVoiceConfig` — the write path has no entry point.
- The synthesized default (`voice_default_derived: true`) means Daniel never encounters the 4-step chat flow.
- The "Brain tab" entry point on the deal page does not exist and is not an immediate prerequisite — the follow-up draft can be surfaced from the Aion landing page instead.

## Options

### Option A: VoiceSetupCard on the Aion landing page
- **What it is:** A new component rendered above `AionLandingStarters` when `voice_default_derived === true`. Three text areas (description, example, guardrails) pre-filled with the synthesized defaults so Daniel sees "this is what Aion assumes" and only adjusts what's wrong. On submit: `saveAionVoiceConfig` → fetch the top `follow_up_queue` item → call `draft-follow-up` → render a `DraftPreviewCard` inline. A "Skip for now" link dismisses via localStorage for 7 days.
- **Effort:** Small — ~150 lines, no routing changes, all server actions and the draft route are done.
- **Main risk:** The Aion page is not where Daniel's attention is when he's on a deal. Discovery depends on him visiting `/aion`.
- **Unlocks:** Voice collection and first draft validation in one session. Can be promoted to a deal-page Brain panel later without changing the form component.

### Option B: Structured voice-setup card injected into the first chat greeting
- **What it is:** When the greeting fires and `voice_default_derived === true`, the chat route injects a message of type `voice_setup` into the response alongside the greeting. `AionMessageRenderer` renders it as a compact form card (new content type). On submit, it calls `saveAionVoiceConfig`, then immediately triggers a draft for the deal in scope.
- **Effort:** Medium — requires a new message content type, renderer branch, and changes to the greeting path in `route.ts`.
- **Main risk:** The message renderer already branches on many types; adding another increases surface for regressions. The form state lives in a chat message, which is awkward.
- **Unlocks:** Voice setup happens inside the chat flow that already exists, with no extra navigation.

### Option C: Voice gate on the Follow-Up Card draft button
- **What it is:** When Daniel clicks "Draft with Aion" on the Follow-Up Card and `voice_default_derived === true`, open a sheet or dialog collecting the three voice fields before generating the draft. After save, the draft renders immediately with the new voice. Never shown again once voice is explicitly saved.
- **Effort:** Small — new bottom-sheet component, conditional check before the existing draft fetch.
- **Main risk:** Gating an action Daniel already clicked with a setup form is friction at the worst moment. They clicked Draft, not Setup.
- **Unlocks:** Voice collection tied to the moment of highest motivation (wanting a draft), but at the cost of interrupting that moment.

## Recommendation

**Build Option A.** It is the minimum surface that gives Daniel the full loop — write voice, see draft — without touching the deal page or the chat message renderer. The pre-filled defaults are a key usability decision: showing Daniel what Aion assumed they'd say means they can review three paragraphs in 60 seconds rather than writing from scratch. The synthesized text also sets the right quality bar ("here is what a generic version sounds like — now tell me how you actually write").

The skip mechanism (7-day localStorage dismissal) keeps it non-blocking for sessions where Daniel just wants to ask Aion a question. After a voice is explicitly saved, the card never appears again.

This unblocks the "writes 3 paragraphs, immediately sees a draft" loop in a single PR. The Brain tab in the deal page is a separate project — it isn't needed for this milestone, and building it before voice works would mean a Brain tab with a generic draft.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupCard.tsx` — three `<textarea>` fields, pre-fill from `getAionConfig()` on mount, `saveAionVoiceConfig(voice)` on submit, 7-day localStorage skip.
2. In the Aion page layout or `ChatInterface.tsx`, call `getAionConfig()` server-side and pass `voice_default_derived` as a prop. Conditionally render `<VoiceSetupCard>` above `<AionLandingStarters>`.
3. On `VoiceSetupCard` submit success: call `supabase.schema('ops').from('follow_up_queue').select(...)` for the workspace's top pending item, then POST to `/api/aion/draft-follow-up` with the result of `getDealContextForAion`. Render the response in a `<DraftPreviewCard>`.
4. Wire the AionSidebar "Tune Aion's voice" overflow to do the same: `resetAionVoiceConfig()` then navigate to `/aion` with a `?tune=1` flag that forces `VoiceSetupCard` open even if the 7-day skip is active.
5. Delete `ArthurInput.tsx` if it still exists (confirmed absent; safe to skip if not found).
6. Rename `ION_SYSTEM`/`ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` and `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts` — flagged legacy, quick cleanup while touching Aion files.

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-74` — `AionVoiceConfig` type, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` / synthesis bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/lib/generate-draft.ts:26-76` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — fully wired draft route
- `src/app/api/aion/lib/tone-anchoring.ts` — parallel tone system (from sent messages, distinct from `voice_config`)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — `resetAionVoiceConfig` call site
