# Aion Phase A: unblock voice setup + first real draft

_Researched: 2026-06-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's description is significantly out of date. The codebase is further along than the primer suggests:

**`aion_config` already exists.** `workspaces.aion_config: Json` is live in `src/types/supabase.ts:7689`. The full `AionConfig` type — `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch` — is defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`.

**Write paths are implemented.** `saveAionVoiceConfig` is a working server action at `aion-config-actions.ts:178`. It reads the current config, strips `voice_default_derived`, merges the new voice, and writes via the server client. `resetAionVoiceConfig` (`aion-config-actions.ts:214`) clears voice + flags so the onboarding flow re-fires.

**Draft generation is implemented.** `/api/aion/draft-follow-up/route.ts` is a complete, authenticated, tier-gated, kill-switch-respecting POST handler. It calls `generateFollowUpDraft` in `src/app/api/aion/lib/generate-draft.ts`, which builds a voice-aware system prompt and calls the fast model. `getDealContextForAion` exists at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`.

**Chat onboarding flow exists.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is defined in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`. The greeting builder at `src/app/api/aion/chat/route/prompts.ts:300` sends a voice-question greeting when `onboardingState === 'no_voice'`.

**The bypass is the blocker.** `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts:35-45` runs on every `getAionConfig()` read. For any workspace with no stored voice, it synthesizes a default from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `'configured'` when that flag is set (`aion-chat-types.ts:248`). Net result: new workspaces skip voice setup entirely and land in pull-mode greeting.

**"Brain tab" as a separate settings surface does not exist.** `ChatInterface.tsx` has a model mode picker (Auto/Fast/Thinking) using a Brain icon. There is no separate Brain tab page.

## Intended state

Daniel opens the Aion page, sees a voice setup surface (not buried in sidebar overflow), writes a few paragraphs describing his communication style, and immediately receives a follow-up draft for a real deal. After that one-time setup, subsequent opens go straight to the pull-mode greeting. The three `AionVoiceConfig` fields — `description`, `example_message`, `guardrails` — should be populated from that initial input.

## The gap

- No dedicated voice setup form; voice is only configurable through 3 sequential chat turns
- `applyVoiceDefaultIfEmpty` bypasses the chat onboarding flow for all new workspaces — they never see the voice prompts
- The "Tune Aion's voice" sidebar overflow calls `resetAionVoiceConfig` but then returns the user to a chat with no obvious next step (just the `no_voice` greeting)
- No path from voice save → immediate test draft without manually navigating to a deal

## Options

### Option A: Voice setup panel triggered from lobby

- **What it is:** When `voice_default_derived === true` (new workspace, no explicit voice), show an inline "Set up your voice" panel on the Aion lobby page. Three labeled textareas: writing style, example message, rules/guardrails. On submit, calls `saveAionVoiceConfig`, then auto-fetches the highest-priority item from `ops.follow_up_queue` and POSTs to `/api/aion/draft-follow-up` to show the draft inline.
- **Effort:** Medium — new component (~150 lines), one new server action to pull the top queue item, wiring to existing `saveAionVoiceConfig` + draft endpoint.
- **Main risk:** Requires at least one item in `ops.follow_up_queue`; if the queue is empty the test draft step can't run. Need a fallback ("Queue empty — add your first deal to try a draft").
- **Unlocks:** A first-class onboarding moment that gets voice + a real draft in one session.

### Option B: Fix the chat bypass

- **What it is:** Remove or gate the `applyVoiceDefaultIfEmpty` synthesis in `aion-config-helpers.ts:35-45` so it no longer fires for fresh workspaces. New workspaces land on `no_voice` and the existing chat onboarding handles everything — it already asks for style, example, guardrails, then offers a test draft. The sidebar "Tune Aion's voice" overflow continues to call `resetAionVoiceConfig` which re-enters the same flow.
- **Effort:** Small — one conditional in `applyVoiceDefaultIfEmpty` plus confirming the 4-step chat flow works end-to-end.
- **Main risk:** The sequential 3-turn chat flow is more friction than a form; each field is a separate back-and-forth. Also, the synthesized default is used by the proactive cron and follow-up engine — removing it for all workspaces could degrade draft quality for workspaces that never complete setup.
- **Unlocks:** The onboarding flow that is already built. Low code cost.

### Option C: Voice form as a special message block in chat

- **What it is:** Add a `voice_setup_form` entry to the `AionMessageContent` union. When `onboardingState === 'no_voice'`, the greeting emits this block, which renders as a compact 3-field form (not 3 sequential turns). On submit, calls `saveAionVoiceConfig`, then Aion auto-continues with the test draft turn. Sidebar overflow "Tune Aion's voice" resets config and restarts chat, which fires the form block again.
- **Effort:** Large — new message content type, new renderer component, client-side form state inside the chat stream, new chat API handling to detect and respond to the form submission.
- **Main risk:** Expands the message type union and the renderer in an already complex `AionMessageRenderer`. Adds interactive state to what is otherwise a read-only message stream.
- **Unlocks:** A clean all-in-chat experience. Consistent with Aion's chat-native model.

## Recommendation

**Option A.** The backend is 100% ready; only the entry point is missing. A form panel is the right tool for structured data — the three `AionVoiceConfig` fields are typed, labeled inputs, not a conversational exchange. Sequential chat turns add friction without adding value here.

The implementation surface is tight: one new component, one new server query for the top queue item, and a wire from `saveAionVoiceConfig`'s success callback to the draft endpoint. The existing "Tune Aion's voice" sidebar overflow can open the same panel via a flag/modal state on the Aion page.

Option B is tempting for its low cost but the 3-turn sequential flow is objectively worse UX for a one-time setup task, and removing the voice synthesis globally risks degrading draft quality for workspaces that never engage with setup. Option C is the most coherent long-term but carries meaningful code complexity for a first-pass flow.

The test draft step requires a queue item — if `ops.follow_up_queue` is empty for the test workspace, skip the test draft and show "Add your first deal to try a draft." That's an acceptable fallback for day-0.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — 3 labeled textareas for `description`, `example_message`, `guardrails`. Submit → calls `saveAionVoiceConfig`. (~120 lines)
2. Add a server action (or inline query) to `aion-config-actions.ts` that selects `id, deal_id` from `ops.follow_up_queue WHERE workspace_id = ? AND status = 'pending' ORDER BY priority_score DESC LIMIT 1` — returns the top deal context for the test draft.
3. In the submit handler of `VoiceSetupPanel`, after `saveAionVoiceConfig` succeeds, fetch the top queue item, POST to `/api/aion/draft-follow-up`, and render the `DraftPreviewCard` component inline.
4. In the Aion page (`src/app/(dashboard)/(features)/aion/page.tsx` or its layout), check `voice_default_derived` and render `VoiceSetupPanel` prominently when true — above the chat interface.
5. In `AionSidebar.tsx`, change the "Tune Aion's voice" overflow handler to open the same panel (via a state flag passed down) rather than just calling `resetAionVoiceConfig` in isolation.
6. Smoke-test: clear `aion_config` on the dev workspace → open `/aion` → panel appears → fill fields → submit → draft renders.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` — `AionConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState` + 5-state machine
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint (complete)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` + `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — "Tune Aion's voice" overflow entry point
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — existing draft preview renderer
