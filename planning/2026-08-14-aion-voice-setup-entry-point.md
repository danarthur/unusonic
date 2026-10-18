# Aion Phase A: Voice Setup Entry Point and Draft Path

_Researched: 2026-08-14 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note:** The primer's "current notable state" is dated 2026-04-10 and is significantly out of date. This research reflects what the codebase actually contains today.

## Current state

The Phase A foundation is substantially built. The "Brain tab" from the primer appears to be the `/aion` chat page, which is fully live. The `Brain` icon in `ChatInterface.tsx:4` is the thinking-mode toggle in the model picker, not a separate tab.

`aion_config` exists as a JSONB column on `public.workspaces` and is fully typed in `src/types/supabase.ts`. The server action layer is complete:

- `getAionConfig()` / `saveAionVoiceConfig()` / `resetAionVoiceConfig()` / `updateAionConfigForWorkspace()` — `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–290`
- Voice schema: `{ description, example_message, guardrails }` — `aion-config-actions.ts:12`
- 5-state onboarding machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured` — `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`

The chat route runs the full onboarding loop. When `onboarding_state === 'no_voice'`, the greeting asks "How would you describe your style?" — `src/app/api/aion/chat/route/prompts.ts:301`. The model then calls the `save_voice_config` tool — `src/app/api/aion/chat/tools/core.ts:118` — which merges the user's input into `aion_config.voice`.

The draft generation path is also complete. `draft_follow_up` tool — `tools/core.ts:318` — calls `getDealContextForAion()`, enriches with memory, applies playbook rules, and invokes `generate-draft.ts`, which uses the stored voice config to build its system prompt — `src/app/api/aion/lib/generate-draft.ts:63`.

The "Tune Aion's voice" affordance exists in the sidebar settings overflow and calls `resetAionVoiceConfig()` — `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002`.

## Intended state

Daniel opens `/aion`, writes 3 paragraphs about how he communicates with clients, and immediately receives an Aion-generated follow-up draft in his voice. The full loop: describe style → paste example → state rules → see test draft → done. Once done, every follow-up draft from the queue respects those inputs.

## The gap

The machinery is built but two blockers prevent the described flow from working end-to-end:

- **`voice_default_derived` bypass.** `getAionConfig()` synthesizes a generic voice from the workspace name when no voice is stored, then flags it `voice_default_derived: true`. `getOnboardingState()` returns `'configured'` for any config with `voice_default_derived: true` — `aion-chat-types.ts:248`. This means the 4-step conversation never triggers automatically on a fresh workspace. Daniel lands on the normal chat greeting, not the onboarding flow.
- **No discoverable entry point.** `AionLandingStarters.tsx` has no "Set up my voice" CTA. The only explicit route in is the sidebar overflow menu, which most users won't find on day one.
- **Test draft breaks on empty queue.** In `needs_test_draft` state, `draft_follow_up` checks `ops.follow_up_queue` first. If no deals are queued — common for a workspace actively configuring before any real deals run — it returns `'No deals in the follow-up queue.'`, stalling the flow at the final step.

## Options

### Option A: Landing CTA + queue fallback fix

- **What it is:** Add a "Teach Aion how I write" CTA to `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx`. When tapped, call `resetAionVoiceConfig()` server-side, then send the user into the `no_voice` greeting. Fix the `needs_test_draft` step to fall back to the highest-value active deal (from `public.deals`) if the formal queue is empty.
- **Effort:** Small (3–5 hours). Two narrow file changes and a fallback branch in `draft_follow_up`.
- **Main risk:** `resetAionVoiceConfig()` is a server action — triggering it from a landing-pane button click adds a round-trip before the chat opens. Use `useTransition` + optimistic state to hide latency.
- **Unlocks:** The full described flow works immediately. No new pages, no drift between settings and chat.

### Option B: Standalone voice setup form in Settings

- **What it is:** Add a `/settings/aion/voice` route with three free-text areas (description, example message, guardrails). Save submits `saveAionVoiceConfig()`. After save, redirect to `/aion` with a query param that auto-triggers a test draft.
- **Effort:** Medium (1–2 days). New page, route, and form, plus the query-param dispatch logic in `AionPageClient.tsx`.
- **Main risk:** Creates two authoritative paths for voice config (settings form + in-chat flow). Chat can still overwrite what the form set, and there's no easy way to show the current state in the form without another read.
- **Unlocks:** A non-conversational interface for owners who prefer forms over chat. Could also serve as an onboarding step during workspace creation.

### Option C: Remove voice_default_derived bypass, force onboarding

- **What it is:** Delete `applyVoiceDefaultIfEmpty()` so new workspaces land on `no_voice` state. The 4-step greeting triggers on first open with no manual entry point needed.
- **Effort:** Small (30 minutes). Delete one helper, update `getAionConfig()`.
- **Main risk:** Breaks every workspace that never explicitly set a voice — proactive cards, dispatch emails, and follow-up drafts all fall back to a poor default instead of a synthesized-but-decent one. Regression for active workspaces.
- **Unlocks:** The onboarding triggers automatically, as the original design intended.

## Recommendation

Ship Option A. The voice setup machinery is complete; the only thing missing is a door in.

Add "Teach Aion how I write" to `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx:48`. When clicked, call `resetAionVoiceConfig()` then start a new chat session — `SessionContext.startNewChat()` is already available in the component's context. The resulting empty-messages call to `/api/aion/chat` will land on `no_voice` and serve the right greeting.

For the queue fallback: in `draft_follow_up` (`tools/core.ts:332`), if `queue.length === 0`, fall back to `supabase.from('deals').select('id, title').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1)` and synthesize a minimal deal context. This gets the test draft to the user even if no formal queue entry exists.

Do not remove the `voice_default_derived` bypass (Option C). That would break workspaces that have been running in production without explicit voice setup. Fix it properly later if there's a reason to force all workspaces through onboarding.

## Next steps for Daniel

1. Add `{ label: 'Teach Aion how I write', value: '__voice_setup__' }` to `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx:48`. Give it a special sentinel value so the click handler can intercept it, call `resetAionVoiceConfig()`, then call `startNewChat()`.
2. Wire the interception in the `onStart` handler that `AionPageClient.tsx` passes to `<AionLandingStarters>`. Check `if (value === '__voice_setup__')` before dispatching as a chat message.
3. In `draft_follow_up` (`tools/core.ts:332–335`), after `if (queue.length === 0)`, add a fallback: query the most recent active deal from `public.deals` and construct a minimal `queueItem` (`{ deal_id, reason: 'Voice setup test', reason_type: 'manual', suggested_channel: 'email' }`).
4. Manually test the full loop: open `/aion`, click the new CTA, describe style in 3 messages, confirm the test draft renders correctly.
5. (Optional) Rename or update the `NEW_WORKSPACE_STARTERS` condition in `AionLandingStarters.tsx:60` — check what prop controls which starter set is shown, and confirm the voice-setup CTA appears for workspaces with `voice_default_derived: true`.
6. Move the "Tune Aion's voice" sidebar entry up in the menu so it's more visible — it currently lives at the bottom of a non-obvious overflow dropdown (`AionSidebar.tsx:1043`).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config CRUD
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275–338` — onboarding state → greeting dispatch
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — voice-aware draft generation
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:41` — starter CTAs
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — "Tune Aion's voice" reset
