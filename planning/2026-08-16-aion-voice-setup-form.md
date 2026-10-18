# Aion voice setup: freeform intake form

_Researched: 2026-08-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** Neither precondition holds as of this research run. `workspaces.aion_config` is a live JSONB column; the chat route at `/api/aion/chat` is fully wired with auth, tier gating, tools, and a 5-state onboarding machine. The queue item reflects April 2026 state documented in the primer. This doc re-scopes to: what is the fastest path to the described experience given current state?

## Current state

**Voice config infrastructure is complete.** `workspaces.aion_config` stores an `AionVoiceConfig` with three fields: `description`, `example_message`, `guardrails` (`aion-config-actions.ts:13-17`). `saveAionVoiceConfig()` is a live server action (`aion-config-actions.ts:178`). `generateFollowUpDraft()` accepts a voice object and is voice-aware from day one (`generate-draft.ts:26-46`).

**Default voice bypasses onboarding.** When no voice is stored, `synthesizeDefaultVoice()` fabricates a description from the workspace name and sets `voice_default_derived: true` (`aion-config-helpers.ts:20-27`). `getOnboardingState()` treats `voice_default_derived` as `configured`, so the 4-step conversational flow never fires (`aion-chat-types.ts:247-248`). A new workspace silently lands in `configured` state with a generic voice.

**Conversational onboarding exists but is step-by-step.** When the flag is cleared via "Tune Aion's voice" in the sidebar overflow (`AionSidebar.tsx:1043`), the greeting cycles through `no_voice → no_example → no_guardrails → needs_test_draft`, one field per session open (`chat/route/prompts.ts:275-283`, `chat/route/prompts.ts:301-338`). There is no single-shot "write it all at once" path.

**Draft generation is wired end-to-end.** The `POST /api/aion/draft-follow-up` endpoint is auth-gated, tier-gated, kill-switch-aware, and voice-aware (`draft-follow-up/route.ts`). The `needs_test_draft` greeting offers to draft against the top active deal. Learn-from-edit captures vocabulary patterns when the user edits a draft (`learn-from-edit/route.ts`).

**Settings > Aion has no voice form.** `AionSettingsView.tsx` manages deal-card beta consent, cadence learning toggle, and pending member requests — no fields for the three voice inputs (`settings/aion/AionSettingsView.tsx:33-249`).

## Intended state

Daniel opens Settings > Aion (or the Brain tab), writes all three voice inputs at once — his style, a real example message, and his guardrails — hits save, and immediately sees an Aion draft for his top active deal in his own voice. No multi-turn loop. No sidebar hunting. One form, one draft.

## The gap

- No freeform multi-field entry point. The conversational path is one field per session; the synthesized default skips setup entirely.
- Settings > Aion has no voice config form.
- Test draft in `needs_test_draft` requires a deal in the follow-up queue — no graceful empty state.
- "Tune Aion's voice" sidebar affordance is not discoverable without prior knowledge.

## Options

### Option A: Voice setup form in Settings > Aion

- **What it is:** Add three labeled textareas (`description`, `example_message`, `guardrails`) to `AionSettingsView.tsx`. On submit: call `saveAionVoiceConfig()`, then fetch the top deal from the follow-up queue and POST to `/api/aion/draft-follow-up`. Render the draft inline in the page. If no deals exist, use a synthetic stand-in deal context so the draft step always runs.
- **Effort:** Small. All server infrastructure exists. Work is form UI + one fetch + inline draft display.
- **Main risk:** Settings are less discoverable than the Brain tab itself. Daniel may configure a voice that never connects to the real deal queue if synthetic contexts become the norm.
- **Unlocks:** Voice setup without chat; form is the canonical shape for structured config; draft is immediate.

### Option B: One-shot message intake in chat

- **What it is:** A "Set up my voice" chip on the Brain tab landing page → a single system-prompt mode where Aion says "Tell me your style, a message you have sent, and any rules — all at once." After Daniel's reply, the model extracts `description`, `example_message`, `guardrails` in one turn, calls `save_voice_config`, then calls `draft_follow_up` against the top deal.
- **Effort:** Medium. Requires a new synthetic message pattern or dedicated prompt mode. LLM extraction adds a parsing step.
- **Main risk:** Imperfect extraction from freeform text can silently produce a bad voice config. Harder to debug than a form with explicit fields.
- **Unlocks:** Best UX when it works — stays in the Brain tab, natural to the chat surface.

### Option C: Inline form card in ChatInterface

- **What it is:** When `no_voice`, render a 3-field form card inside the chat thread instead of a conversational message. On submit: save voice + automatically dispatch a test draft message.
- **Effort:** Large. Needs a new message render type, form component, and coordination with the chat message flow. ChatInterface is already complex.
- **Main risk:** Adds a rendering boundary the existing type system doesn't anticipate. Engineering cost is disproportionate to the improvement over Option A.
- **Unlocks:** Most cohesive if executed cleanly. Not worth the cost vs. the settings form.

## Recommendation

Build Option A. The Settings > Aion form is the right shape for structured configuration. Daniel can see all three fields at once, understand what each does, iterate before committing, and see a draft without a multi-turn loop. Every required piece — `saveAionVoiceConfig()`, `generateFollowUpDraft()`, the follow-up queue — is already live.

Handle the no-deals edge case by generating against a synthetic context ("a returning wedding client, proposal sent 5 days ago, no reply") when the queue is empty. This keeps the experience coherent on a fresh workspace. To address discoverability, add a soft banner in the Brain tab's `configured + voice_default_derived` greeting that says "Using a default voice — customize it" linking to `Settings > Aion`.

Option B is appealing but puts the outcome on LLM parsing accuracy, which is fragile for a one-time setup flow where a silent bad extraction causes long-tail confusion. Option C costs too much for what is a settings form.

## Next steps for Daniel

1. In `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, add a `VoiceConfigForm` section (three textareas prepopulated from `getAionConfig()`) that calls `saveAionVoiceConfig()` on submit.
2. After save: call `getFollowUpQueue()` from `follow-up-actions.ts` for the top deal — fall back to a synthetic context if empty.
3. POST that context to `/api/aion/draft-follow-up` and display the draft inline below the form.
4. Add a "Voice configured" status indicator (green dot, same pattern as the card-beta status row at `AionSettingsView.tsx:133`).
5. In `ChatInterface.tsx`, when `voice_default_derived === true`, show a one-line banner under the greeting: "Using a default voice · [Customize]" → links to `/settings/aion`.
6. Test with a fresh workspace: form should prepopulate with the synthesized default, save should clear `voice_default_derived`, and the draft should immediately reflect the new voice.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx:33-249`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:13-17` — AionVoiceConfig type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — saveAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27` — synthesizeDefaultVoice
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — getOnboardingState
- `src/app/api/aion/lib/generate-draft.ts:26-46` — generateFollowUpDraft
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/chat/route/prompts.ts:275-338` — onboarding forcing block + greetings
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice"
