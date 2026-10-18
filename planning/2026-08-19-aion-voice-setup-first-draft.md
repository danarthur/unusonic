# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-08-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's stated prerequisites are already shipped. The research found:

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfig()` and `getAionConfigForWorkspace()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` both read it. `saveAionVoiceConfig()` writes to it at line 178.

**The 5-state onboarding machine exists.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` implements `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a distinct greeting with chips.

**The greetings are wired.** `buildGreeting()` in `src/app/api/aion/chat/route/prompts.ts:292` matches all five states. The `no_voice` greeting opens with "How would you describe your style?" and chips to start. The `needs_test_draft` greeting offers "Want me to draft a test message for one of your active deals?"

**The draft route is live.** `/api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` is authenticated, tier-gated, and calls `generateFollowUpDraft()` which injects `aion_config.voice` into the system prompt at `src/app/api/aion/lib/generate-draft.ts:63`.

**The learn-from-edit loop is live.** `/api/aion/learn-from-edit` extracts vocabulary swaps from edited drafts and writes them back to `aion_config.learned`.

**The gap:** One shortcut bypasses all of this for every workspace. `applyVoiceDefaultIfEmpty()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a generic voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState()` at line 248 short-circuits to `'configured'` when that flag is set. New workspaces (and Daniel's own) jump straight to the configured pull-mode greeting — they never see the voice capture flow.

The "Tune Aion's voice" escape hatch lives in the sidebar overflow (`AionSidebar.tsx` imports `resetAionVoiceConfig`), but it's invisible to new users.

## Intended state

Daniel opens the Aion tab, describes how he talks to clients in his own words, and immediately sees a draft for a real deal that sounds like him. The onboarding flow already has everything: the greeter asks for communication style, then an example message, then guardrails, then generates a test draft. What's missing is simply the path to it: new workspaces should enter this flow rather than jumping straight to the generic configured state.

## The gap

- `applyVoiceDefaultIfEmpty()` synthesizes a voice for all new workspaces — the 4-step flow never fires
- `voice_default_derived: true` tells `getOnboardingState()` to report `'configured'` immediately
- New users have no visible discovery path to voice setup (overflow menu item is invisible until you're inside the sidebar)
- The "3 paragraphs → draft" experience is fully coded but unreachable by default

## Options

### Option A: Remove the `voice_default_derived` bypass

- **What it is:** Delete `applyVoiceDefaultIfEmpty()` (or gate it so it doesn't apply on the first `getAionConfig` call for a workspace with no existing voice). New workspaces start at `no_voice` and flow through the 4-step sequence. The existing greetings, chips, and `save_voice_config` tool handle everything.
- **Effort:** Small — change one helper function, remove or conditionalize the shortcut, update the one test that asserts the bypass.
- **Main risk:** Users who want to use Aion for knowledge-graph queries (crew lookup, deal status) before completing voice setup will be stuck in onboarding mode. The current system prompt injects `ONBOARDING` directives but doesn't disable other tools — so queries still work, but the assistant also asks voice questions. Could feel intrusive.
- **Unlocks:** The intended onboarding experience lands automatically for every new workspace.

### Option B: Add a `voice_default_derived` branch in the configured greeting

- **What it is:** In `buildGreeting()`, when state is `'configured'` but `config.voice_default_derived === true`, return a different opener: "I built a starter voice from your company name. Want to personalize it so drafts sound more like you?" with a chip "Yes, let's tune it" that sends `Let me describe how I talk to clients.` This resets the session into the no_voice conversational path without calling `resetAionVoiceConfig`.
- **Effort:** Small — add one branch (~15 lines) to `buildGreeting()`. No DB change, no new routes.
- **Main risk:** Users who dismiss the prompt get no second chance without finding the sidebar overflow. Also requires the Aion chat to handle "Let me describe..." as entering the voice tuning flow, which it will do if the onboarding block fires — but only if `voice_default_derived` is stripped from the config first.
- **Unlocks:** Discovery without forcing a gate. Existing users who haven't tuned their voice see the offer on next cold open.

### Option C: Add a one-time setup prompt before the first chat session

- **What it is:** On the `/aion` route, server-render a modal or inline prompt (outside ChatInterface) when `config.voice_default_derived === true` and no `onboarding_dismissed` flag exists. The prompt links to the Aion sidebar's "Tune voice" flow or renders a 3-field form (description, example, guardrails) directly, then calls `saveAionVoiceConfig`.
- **Effort:** Medium — new UI component, new server action path, need to avoid introducing a blocking gate that interrupts navigation.
- **Main risk:** Modal fatigue; adds complexity to the `/aion` page that's already handling session routing.
- **Unlocks:** A fully intentional first-run moment, more skimmable than a chat-based flow.

## Recommendation

**Option A.** Remove the `voice_default_derived` bypass entirely.

The bypass was introduced (Wk 11 §3.8 per the comment in `aion-config-actions.ts:71`) to skip the "4-step forcing block" for newcomers. But the intended outcome — Daniel writes how he talks, sees a draft — requires going through that flow. The chat onboarding path is already polished: each step has a specific greeting, chips, and a conversational handler. Making it unreachable is the bug.

The "stuck in onboarding" risk is manageable because the system prompt only adds an `ONBOARDING` section — it doesn't disable tools. A user asking "who's crew on the Henderson deal?" will still get an answer; Aion just also asks about voice. After one round-trip answer the session stays in the voice setup thread, which is the right behavior.

Concretely: remove the `applyVoiceDefaultIfEmpty` call in `getAionConfig` and `getAionConfigForWorkspace`, or gate it on a flag like `?bypassOnboarding=true` for admin use only. Update the one `aion-config-helpers.test.ts` assertion that currently validates the shortcut.

Accept the tradeoff: some users will find the voice questions interrupting. Mitigate by ensuring the `no_voice` greeting chips make it easy to say "let me skip this for now" — that chip can set `voice_default_derived: true` explicitly as a user-initiated choice (not a silently applied default).

## Next steps for Daniel

1. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — the `applyVoiceDefaultIfEmpty` function is the one thing to change.
2. In `aion-config-helpers.ts`: delete `applyVoiceDefaultIfEmpty` entirely, or change `applyVoiceDefaultIfEmpty` to return `config` unchanged (no synthesis). Whichever feels right.
3. Update `getAionConfig` at `aion-config-actions.ts:98` to not call `applyVoiceDefaultIfEmpty`.
4. Update `getAionConfigForWorkspace` at `aion-config-actions.ts:119` the same way.
5. Add a "Skip for now" chip to the `no_voice` greeting in `chat/route/prompts.ts:305` — chip value: `"I will set this up later."`. In the system prompt `ONBOARDING` handler, when user says skip, call `save_voice_config` with `voice_default_derived: true` to re-enable the bypass as an explicit user choice.
6. Run `npm run test` — update or delete the `aion-config-helpers.test.ts` assertions that test the bypass behavior.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — bypass implementation
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,119` — the two callers of `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, the `voice_default_derived` short-circuit
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting` (all five state greetings live here)
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into draft prompt
- `src/app/api/aion/draft-follow-up/route.ts` — the draft route (live, auth'd, tier-gated)
