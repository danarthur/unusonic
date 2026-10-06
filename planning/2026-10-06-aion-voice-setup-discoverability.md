# Aion Phase A: Voice Setup Discoverability

_Researched: 2026-10-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The question's premises are outdated. Both have been resolved since the primer was written. The real gap is subtler — see below._

## Current state

`public.workspaces.aion_config` **exists and is fully typed** (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`). It holds `voice` (description, example_message, guardrails), `learned` (vocabulary swaps, patterns), `follow_up_playbook`, `onboarding_state`, `kill_switch`, and a `voice_default_derived` flag.

The **Brain tab is unpaused**. `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" />` directly with no paused state.

The **5-state onboarding machine** is fully built in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` in `src/app/api/aion/chat/route/prompts.ts:301` handles each state with contextual copy and action chips. The chat tool `save_voice_config` lives in `createCoreTools` and writes back to `aion_config` via `updateAionConfigForWorkspace`.

`/api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts:1`) is live — auth-gated, tier-gated, reads `aion_config.voice`, and calls `generateFollowUpDraft()` which injects voice into the system prompt.

`/api/aion/learn-from-edit` (`src/app/api/aion/learn-from-edit/route.ts:1`) is live — extracts vocabulary patterns from user edits and writes them to `aion_config.learned`.

**The actual blocker:** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` — when `config.voice_default_derived === true`, `getOnboardingState()` returns `'configured'` immediately, bypassing the 4-step prompting block. A new workspace that has never explicitly set a voice gets a synthesized default from the workspace name (via `synthesizeDefaultVoice` in `aion-config-helpers.ts:20`) and silently skips the onboarding entirely.

The entry point to explicitly set voice is **"Tune Aion's voice"** in the AionSidebar overflow, which calls `resetAionVoiceConfig()`. That path requires knowing the overflow exists.

## Intended state

Daniel opens the Brain tab, gets prompted to describe his communication style, writes 3 paragraphs, and immediately sees an Aion-generated draft for a real deal that reflects what he wrote. The synthesized default is a good silent fallback for workspaces that want to skip setup, but the first-time experience should surface the option to tune explicitly before landing on the default.

## The gap

- New workspace opens Brain tab → lands in `configured` pull-mode, no voice prompt fires.
- The 4-step onboarding machine and the draft route both exist but are only reachable after manually resetting via the sidebar overflow — a path with zero discoverability.
- No first-visit hook offers "Aion set a default — want to tune it?" before the user is past the natural onboarding moment.

## Options

### Option A: First-visit tuning prompt in the greeting

- **What it is:** Add a new `OnboardingState` value — `'default_voice_pending'` — that fires when `voice_default_derived === true` AND `onboarding_state !== 'skipped'`. `buildGreeting()` handles it with copy like "Aion set up a default voice from your workspace name. Want to tune it to match how you actually write?" with chips: `Tune it now` (calls `resetAionVoiceConfig` tool, transitions to `no_voice`) and `Default is fine` (saves `onboarding_state: 'skipped'`). Three files: `aion-chat-types.ts`, `prompts.ts`, `core.ts` (add skip tool).
- **Effort:** Small — ~50 lines across 3 files. No DB migration.
- **Main risk:** Adding a new union member to `OnboardingState` cascades to every switch on that type; easy to miss a branch. A TypeScript exhaustiveness check (`satisfies never`) will catch it.
- **Unlocks:** The full 4-step voice setup flow becomes discoverable from day one. Draft quality for new workspaces improves without forcing setup on users who don't want it.

### Option B: Dedicated voice form in Settings

- **What it is:** Add a "Voice" section to `/settings/aion/` with three `<textarea>` fields (description, example_message, guardrails) wired to `saveAionVoiceConfig()`. Always accessible, no chat context required. Daniel can paste his 3 paragraphs directly into the description field.
- **Effort:** Medium — new component (~150 lines), new settings section, read/write plumbing already exists.
- **Main risk:** Parallel path to the chat onboarding creates confusion about where the canonical voice lives. Users who set it in settings and then use chat may not realize the chat also has tuning — or vice versa.
- **Unlocks:** Intentional, repeatable voice editing outside the chat flow. Good for operators who want to copy-paste their full style guide.

### Option C: Remove the `voice_default_derived` bypass

- **What it is:** Revert the Wk 11 §3.8 decision — don't skip onboarding for `voice_default_derived`. Every new workspace walks the 4-step flow before Aion's `configured` state. Synthesized default still feeds the system prompt but doesn't gate-open onboarding.
- **Effort:** Small code change, large operational risk — any workspace with `voice_default_derived: true` in prod currently skips onboarding; reverting would re-trigger the 4-step flow for them mid-session.
- **Main risk:** Regression for existing users. Would require a migration to set `onboarding_state: 'skipped'` for workspaces that already passed through the bypass.
- **Unlocks:** Clean single path. But the Wk 11 decision was correct — blocking Aion for new users until they complete setup is a bad first-run experience.

## Recommendation

**Option A.** It is the minimum change that directly enables the stated goal without regressions.

The Wk 11 decision to synthesize a default voice was right — don't gate Aion behind a required setup form. The missing piece is a single first-visit prompt that says "here's what I defaulted to, want to do it properly?" Option A adds that prompt as a new onboarding state. The synthesized default continues to work as a fallback for anyone who clicks "Default is fine," and the 4-step flow activates cleanly for anyone who clicks "Tune it now."

Option B is worth shipping later as a complementary path (operators do want a settings-level form), but it doesn't solve the discoverability problem for the first-run experience. Option C has too much operational risk for what it fixes.

Accept the tradeoff: the greeting fires once and then the tuning state is resolved permanently either way.

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — add `'default_voice_pending'` to the `OnboardingState` union. Update `getOnboardingState()` to return it when `config.voice_default_derived === true && config.onboarding_state !== 'skipped'`.
2. In `src/app/api/aion/chat/route/prompts.ts` — add a `case 'default_voice_pending':` branch to both `buildSystemPrompt()` (minimal coaching note) and `buildGreeting()` (the prompt copy + 2 chips: tune / skip).
3. In `src/app/api/aion/chat/tools/core.ts` — add a `skip_voice_tuning` tool (saves `onboarding_state: 'skipped'` via `updateAionConfigForWorkspace`) for the "Default is fine" chip path.
4. Verify exhaustiveness: search for `case 'no_voice':` in the codebase to find every `OnboardingState` switch and add the new branch.
5. Test by resetting a workspace's `aion_config` voice fields and opening the Brain tab — confirm the `'default_voice_pending'` greeting fires, then both chips route correctly.
6. For the settings-form future: `saveAionVoiceConfig()` in `aion-config-actions.ts:178` is the write path — a settings form would be a thin UI wrapper around that action.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState` type + `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:284–292` — current onboarding state injection into system prompt
- `src/app/api/aion/chat/route/prompts.ts:308–347` — `buildGreeting()` state handlers
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/api/aion/draft-follow-up/route.ts:1` — the draft route (already live, reading voice)
- `src/app/api/aion/chat/route/tools.ts:58` — `config` intent uses core tools only (correct for voice setup)
