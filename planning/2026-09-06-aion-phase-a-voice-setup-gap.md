# Aion Phase A: Voice Setup and First Draft — Where Things Actually Stand

_Researched: 2026-09-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise is out of date.** The primer describes a 16-line stub and a paused Brain tab. The codebase tells a different story.

`aion_config` is a JSONB column on `public.workspaces` and is fully wired. `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`, and `updateAionConfigForWorkspace` are all implemented in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–290`. The typed shape includes `voice.description`, `voice.example_message`, `voice.guardrails`, plus learned vocabulary, follow-up playbook, and a kill switch.

The Aion chat route at `src/app/api/aion/chat/route.ts` is 464 lines — not a stub. It has passkey auth, tier gating, an onboarding state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`), workspace snapshot injection, session scope resolution, tool calling, rolling summarization, and telemetry event logging.

`getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives both the system prompt and `buildGreeting()`. When a workspace has no explicit voice, `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts:35` synthesizes one from the workspace name and sets `voice_default_derived: true` — which makes `getOnboardingState` return `configured` immediately, bypassing the 4-step onboarding block.

`buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:301` handles each onboarding state with a specific opening message and chip suggestions. The `no_voice` greeting asks how Daniel talks to clients and gives three chip options. `needs_test_draft` offers to draft a test message.

`save_voice_config` and `draft_follow_up` are both registered Aion tools in `src/app/api/aion/chat/tools/core.ts:118` and `:318`. The system prompt at `prompts.ts:291` explicitly tells Aion to call them during onboarding.

"Tune Aion's voice" exists in the Sidebar overflow at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`. It calls `resetAionVoiceConfig`, which clears the stored voice and `voice_default_derived`, so the next chat open triggers the full 4-step flow.

`generateFollowUpDraft` is fully live at `src/app/api/aion/lib/generate-draft.ts` and called from `src/app/api/aion/draft-follow-up/route.ts`.

## Intended state

Daniel opens the Aion tab, writes 3 paragraphs describing his client communication style, Aion stores it via `save_voice_config`, then immediately drafts a real follow-up against an active deal. All three voice fields are stored; the draft reflects them.

## The gap

- **Discoverability**: The only entry point to voice setup is "Tune Aion's voice" buried in the sidebar header overflow menu. There is no first-run prompt, no CTA on the Aion landing state, and no link from Settings. New workspaces skip the 4-step flow entirely because `voice_default_derived: true` lands them at `configured` without ever seeing the onboarding questions.
- **`needs_test_draft` deal dependency**: The system prompt tells Aion to call `draft_follow_up` during onboarding, but that tool requires an active deal in scope. If Daniel enters the onboarding flow from a cold session with no deal selected, Aion has to pick one from the workspace snapshot — the tool handles this, but Aion may deflect rather than commit to a deal without explicit instruction.
- **`onboarding_state: 'complete'` setter**: `getOnboardingState` checks `config.onboarding_state === 'complete'` at line 255, but the system prompt instruction at `prompts.ts:291` tells Aion to call `save_voice_config` with `onboarding_complete: true` — this parameter does not exist on the tool's schema. The transition to `configured` after a test draft is unverified.
- **Primer drift**: The planning primer has not been updated since the Aion build accelerated. Future research runs will re-investigate infrastructure that is already shipped.

## Options

### Option A: Fix the existing loop, no new UI

- **What it is:** Reset Daniel's own workspace to `no_voice` via a one-time DB update, walk through the existing chat onboarding, fix the `onboarding_complete` schema gap in `save_voice_config`, confirm the `draft_follow_up` tool fires correctly in the `needs_test_draft` greeting.
- **Effort:** Small (a few hours). All the moving parts exist.
- **Main risk:** If the tool call doesn't fire reliably in the `needs_test_draft` greeting (model may write prose instead), the loop stalls and Daniel doesn't see a draft.
- **Unlocks:** Confident that voice setup → draft is a working product loop, not aspirational.

### Option B: Add a dedicated voice setup surface (Settings page section)

- **What it is:** Add a "Voice" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three labeled textareas (description, example, guardrails), a save button wired to `saveAionVoiceConfig`, and a "Preview draft" button that calls `/api/aion/draft-follow-up` against a random active deal. Remove the `voice_default_derived` bypass so new workspaces land in `no_voice` and the chat flow runs.
- **Effort:** Medium (one day). Requires UI work and the `voice_default_derived` behavior change.
- **Main risk:** Changing the default-voice bypass could break existing workspaces that never explicitly configured voice and are now on `configured`. They would suddenly enter `no_voice` state.
- **Unlocks:** A standalone "set up Aion's voice" surface that doesn't rely on the sidebar overflow being discovered.

### Option C: Make the existing chat onboarding discoverable with a first-run CTA

- **What it is:** When `getOnboardingState` returns `configured` but `voice_default_derived === true`, show a dismissable banner on the Aion landing state: "Aion is using a default voice — teach it how you actually write." Clicking it calls `resetAionVoiceConfig` and redirects to `/aion`. This surfaces the existing 4-step chat flow without a new UI surface.
- **Effort:** Small (a few hours). A single conditional render in `AionPageClient` or `ChatInterface`.
- **Main risk:** Adds a persistent banner that might annoy users who are happy with the synthesized default.
- **Unlocks:** Discoverability of voice setup without changing the chat onboarding logic.

## Recommendation

**Do Option A first, then Option C.**

The loop is already built. Before adding more UI, verify it works: reset Daniel's workspace to `no_voice` manually, walk through the conversation, and fix the `onboarding_complete` schema gap in `save_voice_config` (add the parameter, wire it to set `aion_config.onboarding_state = 'complete'`). That's a two-file change.

Once the loop is confirmed working, add the Option C banner so the next user who gets a synthesized-default voice has a path to the real setup. Option B is overkill until there is a real user complaint that chat-based voice setup is too opaque.

Option B's Settings form is appealing but it duplicates the logic already in the chat tools and creates a maintenance surface. The chat-native flow is the correct long-term pattern — it's what makes Aion feel like an agent rather than a settings page. Fix the plumbing, not the premise.

## Next steps for Daniel

1. Manually verify `aion_config` current state: in Supabase Dashboard, run `SELECT id, name, aion_config FROM public.workspaces WHERE id = '<your-workspace-id>'` and check the `voice` and `voice_default_derived` fields.
2. In `src/app/api/aion/chat/tools/core.ts`, find the `save_voice_config` tool schema and add `onboarding_complete` as an optional boolean parameter. When true, call `updateAionConfigForWorkspace` with `{ onboarding_state: 'complete' }` alongside the voice fields.
3. Reset voice to trigger onboarding: via the Supabase Dashboard, set `aion_config.voice_default_derived` to `false` and clear `aion_config.voice` (set to `null`) for your workspace.
4. Open the Aion tab, walk through the 3-paragraph voice setup, confirm Aion calls `save_voice_config`, confirm you reach `needs_test_draft`, confirm a draft is generated.
5. If the draft does not appear: check whether `draft_follow_up` is being called in the `needs_test_draft` turn by inspecting the streaming response in the browser network tab. If not, strengthen the `needs_test_draft` system prompt instruction from `prompts.ts:291` to be more directive.
6. Once the loop works, add the Option C banner to `src/app/(dashboard)/aion/AionPageClient.tsx`: if `aionConfig.voice_default_derived === true`, render a dismissable strip before `ChatInterface`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, CRUD actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route.ts:124` — onboarding state resolved per turn
- `src/app/api/aion/chat/route/prompts.ts:284–294` — onboarding system prompt injections
- `src/app/api/aion/chat/route/prompts.ts:301–347` — `buildGreeting` per onboarding state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`
- `src/app/api/aion/draft-follow-up/route.ts` — draft route
