# Aion Phase A: Voice Setup + First Draft Unblock

_Researched: 2026-09-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** Both stated blockers no longer exist. `public.workspaces.aion_config` is a live JSONB column (see below), and the Brain tab shipped as the `/aion` page with a full chat interface. The research reframes to: what friction remains between the current state and Daniel's described goal?

## Current state

**`aion_config` column exists.** `getAionConfig()` reads `workspaces.aion_config` via PostgREST at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:90`. Writes go through the system client at `aion-config-actions.ts:160`.

**Onboarding state machine is live.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives a 5-step sequence: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads this at `chat/route.ts:124` and the greeting builder at `chat/route/prompts.ts:309` responds with the appropriate prompt for each step.

**Voice is saved via the `save_voice_config` chat tool**, defined at `src/app/api/aion/chat/tools/core.ts:118`. It accepts `description`, `example_message`, and `guardrails` and writes them to `aion_config.voice` via `updateAionConfigForWorkspace`.

**Draft generation injects voice.** `buildFollowUpPrompt` at `src/app/api/aion/lib/generate-draft.ts:57` inserts `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt when any of them are set.

**The flow is bypassed for new workspaces.** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:36` synthesizes a generic voice from the workspace name on every read when `voice.description` is absent, sets `voice_default_derived: true`, and `getOnboardingState()` treats that flag as `configured` (line 248). First-time users never see the `no_voice` greeting; they land in `configured` with a synthesized voice.

**Re-entry is buried.** The "Tune Aion's voice" affordance is in the AionSidebar overflow menu at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998`. It calls `resetAionVoiceConfig()`, which clears `voice + voice_default_derived + onboarding_state` so the next chat re-enters `no_voice`. Not discoverable without knowing to look there.

**Test draft step can fail silently.** `draft_follow_up` returns `{ error: 'No deals in the follow-up queue.' }` at `core.ts:334` when the queue is empty. The `needs_test_draft` onboarding instruction in the system prompt (`prompts.ts:291`) says only "Offer a test draft. Use draft_follow_up." — no fallback guidance. For a workspace with no queued deals, the Aion response becomes an error card at the moment the user most wants to see value.

## Intended state

Daniel opens `/aion`, sees an invitation to describe his communication style, writes 3 paragraphs, and within the same session sees a follow-up draft for a real deal that sounds like him — not a generic template. The voice config is persisted and all subsequent drafts use it.

## The gap

- New workspaces skip voice onboarding entirely due to `voice_default_derived` bypass
- The re-entry affordance ("Tune Aion's voice") is in a 3-dot overflow — not visible without knowing to look
- `needs_test_draft` step has no fallback when the follow-up queue is empty (returns an error instead of trying any active deal)
- No structural path from the `/aion` landing to "let me set up my voice" without already knowing the overflow exists

## Options

### Option A: Promote the re-entry affordance

- **What it is:** Add a small persistent "Set up your voice" button or banner inside the Aion chat UI — visible when `voice_default_derived === true`. Tapping it calls `resetAionVoiceConfig()` and starts a new chat, exactly what the overflow does today, just discoverable. Remove the redundant overflow item or keep both.
- **Effort:** Small — one conditional UI block in `ChatInterface.tsx` or `AionSidebar.tsx` header row; no new routes or server actions.
- **Main risk:** The banner becomes noise for established workspaces who tuned their voice. Needs a clear dismiss or auto-hides once `voice_default_derived` is cleared.
- **Unlocks:** Daniel sees the invitation on his first `/aion` visit without hunting through menus.

### Option B: Fix the `needs_test_draft` empty-queue fallback

- **What it is:** Update the `needs_test_draft` system-prompt instruction in `prompts.ts:291` to tell the model: "If the queue is empty, ask the user which deal to draft for and use that deal's ID." The `draft_follow_up` tool already supports a `dealId` param and can draft for any deal without a queue item (line 337–343). One sentence of system-prompt copy, no code changes.
- **Effort:** Tiny — edit one string in `chat/route/prompts.ts`.
- **Main risk:** None — pure system-prompt improvement, no schema or API surface changes.
- **Unlocks:** The test draft step completes for workspaces with deals but no active queue items.

### Option C: Dedicated voice form in `/settings/aion`

- **What it is:** Add a textarea-based form under the existing `AionSettingsView` — three fields (description, example, guardrails) that call `saveAionVoiceConfig`. Also add an in-settings "Test draft" button that calls `/api/aion/draft-follow-up` with the top active deal. The sidebar overflow links to `/settings/aion` instead of resetting in place.
- **Effort:** Medium — new React component, one additional API call from settings, route guard for non-admin users.
- **Main risk:** Two paths to the same config (chat + form) can diverge if the form doesn't also clear `voice_default_derived`. Must call `resetAionVoiceConfig` before `saveAionVoiceConfig` or merge the flag logic.
- **Unlocks:** "Write 3 paragraphs" as a literal form experience; voice setup no longer requires the conversational flow.

## Recommendation

**Do Option B first (30 minutes), then Option A (2 hours). Defer Option C.**

Option B is zero-risk and unblocks the test draft step for any workspace — a single line of system-prompt copy. Do it immediately.

Option A (visible entry point) is the actual UX gap. Daniel has the code working; he just can't find it. A banner in the chat header that appears when `voice_default_derived === true` — "Your voice is a placeholder. Set it up to get better drafts." with a single CTA — is the minimum surface change that closes the discoverability gap. It disappears the moment he completes setup.

Option C (form in settings) is the right long-term home for voice config but adds complexity (two write paths, form validation, consistent flag handling) without adding capability. The conversational flow already collects exactly what the form would. Build it when there's a clear signal the chat-based setup is too slow for the average user.

Daniel's specific goal — open the tab, write his style, see a draft — is achievable today in under 10 minutes once he knows about the overflow. Option A makes it discoverable without prior knowledge.

## Next steps for Daniel

1. **Today, verify the flow works end-to-end:** in `/aion`, open the sidebar 3-dot menu → "Tune Aion's voice" → start a new chat → write your style. You should see the no_voice greeting. Takes 5 minutes.
2. **Fix the empty-queue fallback:** in `src/app/api/aion/chat/route/prompts.ts:291`, change the `needs_test_draft` instruction to: `'Offer a test draft. Use draft_follow_up. If the queue is empty, ask which deal to draft for and pass its ID.'`
3. **Add the banner:** in `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` (or `AionSidebar.tsx` header), render a dismissable strip when `aionConfig.voice_default_derived === true`. Strip calls `resetAionVoiceConfig()` and `router.refresh()`.
4. **Test the full path:** banner → click → new chat → 3 paragraphs of style → example → guardrails → test draft for an active deal.
5. **Confirm draft quality:** compare a draft using the synthesized default voice vs. one using explicit voice config. This is the acceptance signal that Phase A is done.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-step machine
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding instructions injected into system prompt
- `src/app/api/aion/chat/route/prompts.ts:309` — `buildGreeting` per-state greetings
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (empty queue = error at line 334)
- `src/app/api/aion/lib/generate-draft.ts:57` — `buildFollowUpPrompt` voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — "Tune Aion's voice" overflow affordance
