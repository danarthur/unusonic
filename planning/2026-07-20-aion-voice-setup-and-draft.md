# Minimum path to voice setup + first real draft in Aion

_Researched: 2026-07-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain
tab is currently paused and `public.workspaces.aion_config` doesn't exist,
what's the minimum path to unblock voice setup + first real draft? Context:
the goal is to have Daniel open the Brain tab, write 3 paragraphs about how
he talks to clients, and immediately see an Aion-generated follow-up draft
that respects that voice.

**Note on premise:** This question was written against the April 10 state of
the codebase. As of July 20, the situation has changed substantially. The
findings below describe what actually exists today.

## Current state

`aion_config` exists on `public.workspaces` and is actively read/written.
`getAionConfigForWorkspace` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`)
queries it via the system client. `saveAionVoiceConfig` (`aion-config-actions.ts:178`) writes it.

The chat route at `/api/aion/chat/route.ts` is a full production handler: auth,
tier gate, kill-switch check, workspace config load, tool assembly, `streamText`
with multi-step tool-calling, and streaming response. Not a stub.

`save_voice_config` is a live tool in `core.ts:118` — description says "Call
this whenever the user describes how they talk to clients." It calls
`updateAionConfigForWorkspace`, refreshes the runtime config, and emits
`configUpdates` back to the client.

`draft_follow_up` is a live tool in `core.ts:318` — fetches the top deal from
the follow-up queue (or the deal in page context), enriches with semantic
memory and entity episodic facts, applies playbook channel/drafting rules, and
calls `generateText` with the voice config injected into the system prompt.

The onboarding state machine (`aion-chat-types.ts:225`) has five states:
`no_voice → no_example → no_guardrails → needs_test_draft → configured`. The
system prompt in `prompts.ts:275–283` forces conversation toward the next
onboarding step when the state is not `configured`. After `needs_test_draft`,
the model is told to "Offer a test draft. Use draft_follow_up."

Tone anchoring (`tone-anchoring.ts:60`) operates as a parallel signal: real
outbound message history is pulled and injected into drafts alongside the saved
voice config. Both are active when a draft is generated.

**The short-circuit:** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`)
synthesizes a voice from the workspace name on every config read and returns
`voice_default_derived: true`. `getOnboardingState` (`aion-chat-types.ts:247`)
returns `'configured'` immediately when that flag is true — so the 4-step
onboarding flow never fires for any new workspace. This was an intentional
regression fix from Wk 11 §3.8 to avoid friction for operators who already
know what they're doing.

## Intended state

Daniel opens `/aion`, is guided through 3 questions (communication style,
example message, guardrails), and the moment he completes the third, Aion
immediately generates a follow-up draft for his top queued deal using the
captured voice — no second message required. The draft respects the exact
language, length, and register he described.

## The gap

- `voice_default_derived` short-circuits `getOnboardingState()` to `'configured'`
  for all new workspaces — the 4-step guided flow never activates
- The system prompt for `needs_test_draft` says "Offer a test draft" (ask first)
  rather than "Generate immediately" — adds an unnecessary round-trip
- `draft_follow_up` fails with `"No deals in the follow-up queue"` on a fresh
  workspace with no deals — the test draft experience has an undocumented
  prerequisite
- The "Tune Aion's voice" re-entry point is buried in the sidebar header
  overflow menu — first-time setup is not discoverable from the chat landing

## Options

### Option A: Remove the `voice_default_derived` short-circuit (recommended)
- **What it is:** Delete the `if (config.voice_default_derived === true) return 'configured'`
  check in `getOnboardingState()` (`aion-chat-types.ts:247`). Keep the synthesis
  in `applyVoiceDefaultIfEmpty` so the system prompt always has a baseline voice
  to work with, but stop treating synthesis as "configured." Also change the
  `needs_test_draft` prompt line (`prompts.ts:282`) from "Offer a test draft" to
  "Generate a test draft immediately with draft_follow_up, then ask for feedback."
- **Effort:** Small — 2 lines changed in 2 files, no schema work, no new
  components. Existing users who have `voice_default_derived: true` stored will
  be prompted to complete onboarding on next chat open.
- **Main risk:** Existing workspaces that the default silently covered will now
  see the onboarding prompts. Operators who want to skip can say "skip" and Aion
  will need to handle that gracefully (call `save_voice_config` with a neutral
  description and mark `onboarding_complete: true`).
- **Unlocks:** The full voice-setup → immediate draft loop as described in the queue item.

### Option B: Add a landing-page CTA in `AionLandingStarters`
- **What it is:** Pass the `onboarding_state` as a prop to `AionLandingStarters`
  and render a prominent "Tell Aion how you communicate with clients" CTA when
  `voice_default_derived: true`. Clicking it calls `resetAionVoiceConfig()` then
  fires a starter message that enters the 4-step flow.
- **Effort:** Medium — requires prop threading from server component through to
  the starters, plus a `resetAionVoiceConfig` call before the session starts.
- **Main risk:** Two-step: the CTA is opt-in rather than the default path, so
  users who skip the CTA still get the synthesized default silently. Daniel
  has to notice and click the CTA; the stated "immediately" path depends on him
  doing so.
- **Unlocks:** Discoverability of voice setup without touching existing users.

### Option C: Skip to drafted onboarding via an explicit `/aion/setup` route
- **What it is:** A separate `/aion/setup` page (or modal on first visit) with a
  3-field form (description, example, guardrails). On submit, calls
  `saveAionVoiceConfig` then redirects to `/aion?context=setup_complete` which
  auto-triggers `draft_follow_up` for the top queued deal.
- **Effort:** Large — new page/modal, form component, redirect wiring, auto-trigger
  in `AionPageClient` on context param.
- **Main risk:** Bypasses the conversational model entirely — Aion learns nothing
  from the phrasing, only from the three filled-in fields.
- **Unlocks:** A polished first-run setup that could later become a proper product
  onboarding milestone.

## Recommendation

Ship Option A. It is 2 lines in 2 files with no schema migration. The core
machinery (`save_voice_config`, `draft_follow_up`, `buildSystemPrompt` with
onboarding state injection, multi-step tool-calling) is already in production —
the only thing blocking the stated flow is the `voice_default_derived` line that
marks every new workspace as configured before the user has said a word. Remove
it, update the `needs_test_draft` prompt to generate immediately rather than
offer, and the full loop activates.

The main risk (existing users suddenly seeing onboarding prompts) is real but
manageable: the conversation handles it — Aion can accept "skip" and write a
neutral voice. If this is a concern, guard the change behind the `kill_switch`
flag or scope it to workspaces created after a cutoff date.

The no-deals prerequisite is a hard blocker for the test draft. Document it
clearly: Aion should detect an empty queue during `needs_test_draft` and respond
with "Add your first deal and I can show you how a draft looks in your voice."

## Next steps for Daniel

1. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`,
   delete the `if (config.voice_default_derived === true) return 'configured';`
   guard (one line).
2. In `src/app/api/aion/chat/route/prompts.ts:282`, change the `needs_test_draft`
   instruction from `'Offer a test draft. Use draft_follow_up.'` to
   `'Generate a test draft immediately using draft_follow_up — do not ask first.
   After showing it, ask if they want to adjust the voice.'`
3. In `core.ts:333`, handle the empty-queue case gracefully: when
   `draft_follow_up` returns `{error: 'No deals...'}`, have Aion respond with
   a clear prompt to add the first deal rather than a raw error.
4. Open `/aion` in the app, ensure the chat opens in `no_voice` state and asks
   the first onboarding question.
5. Type 3 paragraphs describing your voice. Verify Aion calls `save_voice_config`
   in one turn, then calls `draft_follow_up` without prompting.
6. If you have no deals in the queue, add one first — the draft experience
   requires it.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — short-circuit
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — synthesis
- `src/app/api/aion/chat/route/prompts.ts:275–283` — onboarding instructions
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/tone-anchoring.ts:60` — parallel observed-style signal
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
