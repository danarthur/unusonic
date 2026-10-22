# Aion Phase A: voice setup + first real draft

_Researched: 2026-10-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Agent note: the primer's "notable state" section (as of 2026-04-10) is outdated. Both blockers it describes no longer exist. See Current State below._

## Current state

`aion_config` is a live JSONB column on `public.workspaces`. `getAionConfig()` reads and writes it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`. The `AionConfig` type (`aion-config-actions.ts:50`) carries `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

The Brain tab is not paused. `AionPageClient.tsx:73` renders `<ChatInterface viewState="chat">` directly — there is no "paused" gate in the component tree.

The 4-step onboarding state machine is fully wired:
- `getOnboardingState()` at `aion-chat-types.ts:247` maps config fields to `no_voice → no_example → no_guardrails → needs_test_draft → configured`.
- `buildGreeting()` at `prompts.ts:301` renders a distinct greeting for each state — including chips that feed the user's next reply into the voice-capture loop.
- `save_voice_config` tool at `chat/tools/core.ts:118` writes description, example, and guardrails back to `aion_config.voice` and can set `onboarding_state: complete`.

The draft pipeline is live too. The `draft_follow_up` tool at `core.ts:318` calls `getDealContextForAion`, enriches with `cortex.aion_memory`, applies playbook channel rules, and emits a `draft_preview` structured block. `/api/aion/draft-follow-up` does the same thing as a direct REST call.

**The actual blocker:** For any workspace where `aion_config.voice` is empty (new workspaces, or reset workspaces), `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` short-circuits on that flag (`aion-chat-types.ts:248`) and returns `configured` — skipping the 4-step onboarding entirely. The user lands in pull-mode chat with a generic greeting and no prompt to teach Aion their voice.

The only re-entry point is the sidebar overflow "Tune Aion's voice", which calls `resetAionVoiceConfig()` (`aion-config-actions.ts:214`). It is not surfaced during onboarding and would not be found on a first visit.

A second gap: `draft_follow_up` in the `needs_test_draft` step falls back to the top item in `ops.follow_up_queue`. If that queue is empty (day-zero workspace), the tool returns `{ error: 'No deals in the follow-up queue.' }` and the test draft step silently fails.

## Intended state

Daniel opens the Brain tab for the first time. Aion greets him with the voice-setup prompt (step 1 of 4). He types 3 paragraphs. Aion extracts description + example + guardrails across those paragraphs using the `save_voice_config` tool. At step 4, Aion offers a test draft. If a deal is available, it drafts against a real deal. If none, it uses a plausible synthetic deal. Daniel sees a draft that sounds like him.

## The gap

- `voice_default_derived` short-circuit (`aion-config-helpers.ts:39`) bypasses onboarding before the user can teach their voice.
- No first-visit CTA surfaces the voice setup to a user who lands in `configured` state via the default.
- `draft_follow_up` errors on empty `ops.follow_up_queue` with no graceful fallback (`core.ts:334`).
- No mechanism for Aion to extract voice from a multi-paragraph monologue — current prompts ask one field at a time, which works but doesn't match "write 3 paragraphs" usage.

## Options

### Option A: Remove the voice_default_derived shortcut for new workspaces

- **What it is:** Change `applyVoiceDefaultIfEmpty` so it only applies after `onboarding_state === 'complete'`. New workspaces with no voice stored always start at `no_voice`. Existing workspaces where the user already completed onboarding are unaffected (they have `onboarding_state: 'complete'` or real voice fields).
- **Effort:** Small — two-line logic change in `aion-config-helpers.ts`, one guard in `getOnboardingState`.
- **Main risk:** Any workspace that relied on the synthesized default (has `voice_default_derived: true` but never ran onboarding) resets to `no_voice` next read. They go through onboarding, which is the intended behavior. Low blast radius.
- **Unlocks:** Daniel's exact desired flow with zero new UI.

### Option B: Surface a "Train your voice" chip in the configured greeting

- **What it is:** Keep `voice_default_derived` as-is but add a prominent chip to the pull-mode greeting when the flag is set: "Train your voice → value: `[retrain-voice]`". The chat route treats `[retrain-voice]` as a synthetic command that calls `resetAionVoiceConfig` and re-fetches the greeting.
- **Effort:** Medium — needs a synthetic message handler in the chat route (alongside `parseArgEditMessage`), a server action call mid-stream, and the chip in `resolveGreetingChips`.
- **Main risk:** More moving parts than Option A. The user still has to click the chip — they could ignore it and go about their day in a voice Aion synthesized, not one they trained.
- **Unlocks:** Preserves the default-voice shortcut for users who genuinely don't care to tune it, while making the path obvious for those who do.

### Option C: Fix the empty-queue draft fallback first, then do Option A

- **What it is:** Fix `draft_follow_up` to use any active deal (not just one in the queue) when the queue is empty. If the workspace has no deals at all, use a canned synthetic deal (fictional client name, wedding archetype, 3 weeks out). Then do Option A to restore the onboarding flow.
- **Effort:** Medium — two changes: the fallback deal lookup in `core.ts:332`, and a synthetic context builder.
- **Main risk:** A synthetic demo draft could confuse some users ("who is Sarah?"). Must be clearly labelled as a demo.
- **Unlocks:** The full end-to-end flow works even on day zero.

## Recommendation

Ship **Option C** — it's Option A plus the draft fallback, which is the only thing that makes the end-to-end flow actually work for Daniel on a fresh workspace.

Option A alone restores the onboarding prompts but the `needs_test_draft` step will still fail if there are no queued deals. That makes the experience worse than the current synthesized-default path, not better. The fix is a two-step:

1. In `aion-config-helpers.ts`: change `applyVoiceDefaultIfEmpty` to only apply when `config.onboarding_state === 'complete'`. A workspace where the user has never set their voice should enter onboarding, not skip it.
2. In `core.ts` `draft_follow_up`: when `getFollowUpQueue()` returns empty, fall back to `supabase.from('deals').select().eq('workspace_id', workspaceId).limit(1)`. If that also returns empty, return a short clearly-labelled synthetic context with `isSynthetic: true` so the draft begins with a marker the UI can render.

Option B (chip in the greeting) is worth adding later as a discoverability layer for users who slipped through to `configured` without training, but it is not the core fix.

## Next steps for Daniel

1. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — change the guard from `if (config.voice?.description) return config;` to `if (config.voice?.description || config.onboarding_state !== 'complete') return config;`. Wait — reverse the logic: return early (apply default) only when `onboarding_state === 'complete'` AND no voice exists. Actually the simplest formulation: remove the shortcut entirely by changing `voice_default_derived: true` to only be set when `onboarding_state` is already `'complete'` or voice fields have been previously set.
2. In `aion-config-helpers.ts`, add an explicit check: `if (config.onboarding_state === 'complete' && !config.voice?.description)` — only then synthesize the default.
3. In `src/app/api/aion/chat/tools/core.ts:332` — when queue is empty, attempt `supabase.from('deals').select('id, title, event_date').eq('workspace_id', workspaceId).neq('status', 'archived').limit(1)` before returning the error.
4. Add a synthetic fallback context function (`buildSyntheticDealContext()`) for when both queue and deals are empty — a labelled demo deal so the onboarding test draft always resolves.
5. Run the test suite: `npm run test -- aion-config` and `npm run test -- core.ts` to catch regressions.
6. Manually smoke-test by resetting your own workspace's voice (`resetAionVoiceConfig`) and opening `/aion` — confirm you land on the `no_voice` greeting, walk through 4 steps, and see a draft.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` (all onboarding branches)
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (queue fallback at line 332)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214` — `resetAionVoiceConfig`
- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — confirms Brain tab is not paused
