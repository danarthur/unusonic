# Aion Phase A: Voice setup + first real draft

_Researched: 2026-09-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I read this:** the primer is dated 2026-04-10. Phase A has since shipped in full. The question is really: why doesn't the 3-paragraphs-to-draft flow work on a fresh open of `/aion`, and what's the one-file fix?

## Current state

`aion_config` **already exists** on `public.workspaces`. The entire Phase A infrastructure is live:

- `AionConfig` type with `voice: { description, example_message, guardrails }` — `aion-config-actions.ts:12`
- `getAionConfig()` / `getAionConfigForWorkspace()` / `saveAionVoiceConfig()` / `resetAionVoiceConfig()` — `aion-config-actions.ts:84–256`
- 5-state onboarding machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured` — `aion-chat-types.ts:225–257`
- Chat-route greeting per state — `prompts.ts:301–347` — including the "how would you describe your style?" opener for `no_voice`
- System prompt injection per state — `prompts.ts:284–292`
- `save_voice_config` chat tool that writes back to `aion_config` mid-conversation — `chat/tools/core.ts:118`
- `draft_follow_up` chat tool that generates a draft against top-priority deal using the stored voice — `chat/tools/core.ts:318`
- `generateFollowUpDraft()` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the model system prompt — `lib/generate-draft.ts:52–74`
- `/api/aion/draft-follow-up` route — authenticated, tier-gated, kill-switch-aware — `draft-follow-up/route.ts`
- `/api/aion/learn-from-edit` route — captures vocabulary delta when Daniel edits a draft — `learn-from-edit/route.ts`

The `/aion` page is live (`AionPageClient.tsx:66`). The primer's "Brain tab paused" was accurate in April; it has since been superseded by the standalone Aion page.

**The actual blocker — Wk 11 §3.8 bypass:**

`applyVoiceDefaultIfEmpty()` runs on every `getAionConfig()` read. When no explicit voice is stored, it synthesizes a generic one from the workspace name and sets `voice_default_derived: true` — `aion-config-helpers.ts:35`. `getOnboardingState()` short-circuits to `'configured'` when that flag is set — `aion-chat-types.ts:248`. Result: new workspaces never enter the 4-step onboarding flow.

**`AionLandingStarters` ships a `NEW_WORKSPACE_STARTERS` array and an `isNewWorkspace` prop** — but `ChatInterface.tsx:402` renders it without that prop, so the default (established workspace) starters always show. The voice-setup path is reachable only via AionSidebar overflow → "Tune Aion's voice", which is invisible to a first-time user.

## Intended state

Daniel opens `/aion`. A visible CTA ("Tell Aion how you write") appears on the landing. Clicking it resets the synthesized default, drops him into the `no_voice` onboarding conversation, and within ~5 messages he has described his style, pasted an example, and stated his guardrails. Aion then offers a test draft against his top deal. The draft respects his voice. He edits if needed; `learn-from-edit` captures the delta.

## The gap

- `ChatInterface` passes no `isNewWorkspace` prop to `AionLandingStarters` — so the new-workspace starter set is dead code
- No CTA surfaces the "Tune Aion's voice" reset path for first-time owners
- The voice-to-draft pipeline works end-to-end once the user is in the flow; the gap is purely the entry door

## Options

### Option A: Thread `isNewWorkspace` from `voice_default_derived` to the starters

- **What it is:** In `ChatInterface`, read `aionConfig.voice_default_derived` (already available in the session context or as a prop) and pass `isNewWorkspace={voice_default_derived === true}` to `AionLandingStarters`. Add a "Tell Aion how you write" starter to `NEW_WORKSPACE_STARTERS` that sends: "Let me tell you how I communicate with clients." Aion's `no_voice` greeting fires, `save_voice_config` tool captures the response, flow completes in one session.
- **Effort:** Small — one prop thread, one starter addition in `AionLandingStarters.tsx`
- **Main risk:** `aionConfig` may not be available client-side in `ChatInterface` today; may need a small server action or context extension to expose `voice_default_derived`
- **Unlocks:** The 3-paragraphs-to-draft flow works on first open, no other changes

### Option B: Reset-and-onboard button above the starters

- **What it is:** Add a dismissible banner or card above `AionLandingStarters` (visible when `voice_default_derived === true`) with a single CTA. Click calls `resetAionVoiceConfig()` as a server action, then dispatches a seed user message into the chat to start the onboarding conversation automatically.
- **Effort:** Small-medium — new inline component, server action already exists
- **Main risk:** Requires a client-side call to `resetAionVoiceConfig()` before sending the chat message; must handle the async gap gracefully
- **Unlocks:** More prominent than Option A; Daniel sees the offer without reading the starters

### Option C: Remove the Wk 11 bypass

- **What it is:** Delete the `applyVoiceDefaultIfEmpty` call in `getAionConfig()`. New workspaces start at `no_voice` state natively. The greeting is immediately the "how would you describe your style?" prompt. No CTA needed.
- **Effort:** Small — remove one function call, adjust the `aion-config-helpers.ts` import
- **Main risk:** Medium — the bypass was added intentionally so established workspaces that skipped voice setup don't see onboarding every time. Removing it regresses anyone who has no explicit voice stored (existing workspaces that coasted on the synthesized default). Scope with a `workspace_age` or `first_chat_at` guard to limit to genuinely new workspaces.
- **Unlocks:** Cleanest long-term path; voice setup becomes the default first-run experience

## Recommendation

**Option A.** The system is fully functional; this is a one-prop fix. Thread `voice_default_derived` from `aionConfig` into `ChatInterface` and pass it as `isNewWorkspace` to the starters. Add one starter: `"Tell Aion how you write"` → sends `"Let me tell you how I communicate with clients."` The `no_voice` onboarding path fires, `save_voice_config` captures the description/example/guardrails, and after 3-4 turns Aion offers a `draft_follow_up` against the top deal.

Option B is slightly better UX but requires more plumbing (reset action + seed message dispatch). Option C is cleaner long-term but needs a guard to avoid regressing established workspaces — worth a dedicated ticket, not the current sprint.

One caveat: `draft_follow_up` returns `{ error: 'No deals in the follow-up queue.' }` when the workspace has no deals. If Daniel's workspace is empty, the test draft step fails silently. The greeting at `needs_test_draft` should handle this gracefully — either surface an empty state or offer a manual prompt ("Describe a client situation and I'll draft for it"). That's a one-line guard in the `no_queue` path of the greeting.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:402` — confirm how `aionConfig` is accessed client-side in that component
2. Pass `isNewWorkspace={aionConfig?.voice_default_derived === true}` to `<AionLandingStarters>` at that line
3. In `AionLandingStarters.tsx:49`, add starter: `{ label: 'Tell Aion how you write', value: 'Let me tell you how I communicate with clients.' }` at the top of `NEW_WORKSPACE_STARTERS`
4. Manually reset your workspace's `aion_config.voice` via `resetAionVoiceConfig()` (or directly in the DB) to test the flow end-to-end
5. Verify the `needs_test_draft` greeting handles an empty follow-up queue — see `chat/tools/core.ts:332–334` for the error path and add a graceful fallback
6. Optionally open a follow-up ticket for Option C (age-gated bypass removal) to make the Wk 11 bypass time-limited rather than permanent

## References

- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:48–52` — `NEW_WORKSPACE_STARTERS` and `isNewWorkspace` prop (unused today)
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:402` — `<AionLandingStarters>` render site
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:284–347` — system prompt + greeting per state
- `src/app/api/aion/chat/tools/core.ts:118, 318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection into system prompt
