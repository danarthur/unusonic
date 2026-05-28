# Aion Phase A: Voice Setup + First Draft — Unblock Path

_Researched: 2026-05-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** Both stated blockers no longer apply. `workspaces.aion_config` exists (`src/types/supabase.ts:7689`), the Brain tab page renders `ChatInterface` directly with no consent gate (`src/app/(dashboard)/aion/AionPageClient.tsx:73`), and `/api/aion/chat` is a fully-built 450-line endpoint. The real remaining gap is narrower and described below.

## Current state

The voice setup + draft pipeline is fully wired end-to-end.

**Config column:** `workspaces.aion_config` (Json) holds `AionConfig` with a `voice?: AionVoiceConfig` field: `description`, `example_message`, `guardrails` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16`).

**Onboarding state machine:** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) returns one of `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads this at request time (`src/app/api/aion/chat/route.ts:122`) and the system prompt and opening greeting both adapt to it (`src/app/api/aion/chat/route/prompts.ts:275–283`, `300–338`).

**Chat-native onboarding:** At `no_voice` the opening message is "How would you describe your style?" with three suggestion chips. Each chat turn saves one voice field via the `save_voice_config` tool. At `needs_test_draft` Aion offers to draft a test message via the `draft_follow_up` tool. The entire flow runs inside the chat — no separate form. (`src/app/api/aion/chat/route/prompts.ts:301–338`)

**Draft route exists:** `/api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts:52–63`) calls `generateFollowUpDraft()` with `aionConfig.voice`, and `getDealContextForAion()` (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`) assembles the deal DTO.

**The bypass:** `getAionConfigForWorkspace()` calls `applyVoiceDefaultIfEmpty()` (`aion-config-actions.ts:98–99`) which synthesizes a voice from the workspace name when `aion_config.voice` is null, then sets `voice_default_derived: true`. `getOnboardingState()` short-circuits on that flag: `if (config.voice_default_derived === true) return 'configured'` (`aion-chat-types.ts:248`). Any workspace that opened Aion before explicitly setting voice therefore lands in the `configured` (pull-mode) state and never sees the onboarding flow.

**Reset exists but is buried:** `resetAionVoiceConfig` clears `voice_default_derived` and returns the workspace to `no_voice`. It is wired to a "Tune Aion's voice" item in the sidebar overflow menu (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31`, `979`), which is not visible on first open.

## Intended state

Daniel opens the Brain tab cold. Aion greets him with a voice setup prompt. Across three natural chat turns he describes his style, pastes an example message, and states his rules. Aion then offers a test draft for an active deal. He reads it, approves, and the config is marked `configured`. The whole thing takes under five minutes and requires no settings navigation.

## The gap

- Any workspace where Aion was opened before voice was explicitly set has `voice_default_derived: true` → lands in `configured` greeting (pull mode), never reaches onboarding.
- "Tune Aion's voice" entry point is in the sidebar overflow — not visible on cold open.
- The `needs_test_draft` → live draft step works only if there is an active deal in the workspace. No deal → `getDealContextForAion()` returns empty context → draft is generic or fails.

## Options

### Option A: SQL reset for the target workspace
- **What it is:** One SQL update sets `aion_config = aion_config - 'voice' - 'voice_default_derived'` on Daniel's workspace. Next chat open: state is `no_voice`, full onboarding runs as designed.
- **Effort:** Small (one SQL statement in the Supabase dashboard or a debug script)
- **Main risk:** None — `resetAionVoiceConfig` already does the same thing; this is just a direct equivalent.
- **Unlocks:** Immediately tests the full voice setup → test draft flow without any code change.

### Option B: Add a setup CTA to the configured landing state
- **What it is:** When `voice_default_derived === true` (i.e., voice was never explicitly set), add a visible "Set up your voice" prompt or chip in `AionLandingStarters` or the `configured` greeting message. Clicking it calls `resetAionVoiceConfig` and restarts the onboarding loop.
- **Effort:** Small (one conditional render in `AionLandingStarters.tsx` or `ChatInterface.tsx`, one chip value that triggers reset)
- **Main risk:** Mild friction for workspaces that are genuinely happy with the default. Can be suppressed after one explicit dismissal.
- **Unlocks:** Discoverable entry point for all users, not just Daniel. Ships the intent of the onboarding design.

### Option C: Remove the default-synthesis bypass entirely
- **What it is:** Delete `applyVoiceDefaultIfEmpty()` and let `voice === undefined` fall through to `no_voice` naturally. Every new workspace sees onboarding on first chat open.
- **Effort:** Small to medium (remove helper, audit callers, verify `configured` greeting still works for orgs post-setup)
- **Main risk:** Forces voice setup on every new workspace unconditionally, including workspaces that just want to use Aion immediately without configuration. The default-derived path exists specifically to unblock those users.
- **Unlocks:** Guaranteed onboarding for all workspaces, but at the cost of the "just works" path.

## Recommendation

Do **Option A now** (takes two minutes) and then ship **Option B**.

Option A unblocks the exact user journey Daniel described today with no code change: run the SQL reset on the dev workspace, open the Brain tab, walk through the three chat turns, see the draft. This verifies the entire pipeline is wired correctly before writing a single line.

Option B is the right production fix — it preserves the default-derived path for users who skip setup, but makes the explicit setup discoverable when `voice_default_derived` is true. Concretely: in `AionLandingStarters.tsx`, when the landing chips are rendered for a `configured` workspace that has `voice_default_derived === true`, add a "Tune my voice" chip that calls `resetAionVoiceConfig()` and forces a page reload. One chip, one condition, one server action call — no new components.

Option C is a future consideration after seeing how many real workspaces actually complete setup vs. staying on the default.

## Next steps for Daniel

1. Run this SQL on your dev workspace to clear the bypass: `UPDATE public.workspaces SET aion_config = aion_config - 'voice' - 'voice_default_derived' WHERE id = '<your-workspace-id>';`
2. Open `/aion` — confirm the greeting is "Hey. I'm Aion — let's start with how you talk to clients."
3. Walk through 3 turns (style description → example message → rules). Confirm each saves correctly by checking `workspaces.aion_config` in the Supabase dashboard after each turn.
4. At `needs_test_draft`, select an active deal and confirm the draft respects your voice config.
5. If the draft looks right, file the Option B CTA work: add a "Tune my voice" chip in `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` guarded by `voice_default_derived === true`.
6. The `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:135` is the write path — verify it calls `saveAionVoiceConfig` server action and clears `voice_default_derived` on explicit save.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — Brain tab renders ChatInterface directly
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–99` — AionConfig type + getAionConfig + applyVoiceDefaultIfEmpty
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–256` — getOnboardingState logic + voice_default_derived bypass
- `src/app/api/aion/chat/route.ts:108–122` — onboarding state read at request time
- `src/app/api/aion/chat/route/prompts.ts:275–338` — system prompt + greeting builder per state
- `src/app/api/aion/draft-follow-up/route.ts:52–63` — draft route + kill_switch check
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — getDealContextForAion
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:979` — comment on onboarding sequence, reset entry point
