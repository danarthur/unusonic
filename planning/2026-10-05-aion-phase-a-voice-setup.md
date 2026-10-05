# Scope Phase A of Aion: voice setup and first draft

_Researched: 2026-10-05 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Much of what this question assumed as missing has since shipped. The primer reflects state as of 2026-04-10; the codebase has moved considerably since then.

**`public.workspaces.aion_config` exists.** `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads `workspaces.aion_config` as a typed `AionConfig` struct that already includes `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`. `saveAionVoiceConfig()` at line 178 is the write path, using the server RLS client.

**The chat route is fully wired.** `/api/aion/chat/route.ts:59` handles auth, tier gate, and kill switch, then reads workspace config and derives onboarding state via `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. On an empty message array it short-circuits to a state-aware greeting (`route.ts:126–130`). The system prompt injects the current state so Aion knows what to ask (`src/app/api/aion/chat/route/prompts.ts:284–292`).

**The 5-state onboarding machine runs in the chat.** `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Aion asks one question per turn and calls `save_voice_config` (`src/app/api/aion/chat/tools/core.ts:118`), which deep-merges into `workspaces.aion_config` via `updateAionConfigForWorkspace`. State advances automatically on the next turn.

**`draft_follow_up` tool is live** (`src/app/api/aion/chat/tools/core.ts:318`). In `needs_test_draft` state the system prompt instructs Aion to offer a test draft; after the user confirms, Aion calls the tool, which pulls the highest-priority follow-up, generates a draft with the saved voice, and returns a `draft_preview` card.

**The Brain tab is unwrapped.** `src/app/(dashboard)/aion/AionPageClient.tsx:66–76` renders `<ChatInterface>` directly with no pause banner or feature flag gate.

**One real blocker remains.** The tier gate at `src/app/api/aion/chat/route.ts:99–107` calls `canExecuteAionAction(workspaceId, 'active')` before any message is processed. A workspace on Foundation tier (mode: `passive`) receives "Upgrade your plan" before ever seeing the onboarding greeting. Voice setup requires no AI output and should cost nothing — gating it behind a paid tier is the wrong placement.

**Edge case: no deals in queue.** The `draft_follow_up` tool calls `getFollowUpQueue`. For a fresh workspace with no deals the queue is empty, the tool fails silently, and the user reaches `needs_test_draft` state with no path forward.

## Intended state

Daniel opens the Brain tab, types how he talks to clients, and within the same session sees a follow-up draft that sounds like him. Voice setup is a prerequisite for any Aion output — it should never be blocked by a tier check. After voice is configured, Aion must be able to produce at least one concrete draft, even if no live deals exist yet.

The conversational model is correct for this. There is no requirement for a dedicated form page — the chat-driven sequence already handles multi-paragraph style descriptions naturally.

## The gap

- Tier gate fires before the greeting, blocking Foundation-tier workspaces from starting onboarding.
- `needs_test_draft` → draft fails silently when the follow-up queue is empty.
- No fallback draft path for fresh workspaces: Aion needs a synthetic demo scenario when there are no real deals.

## Options

### Option A: Exempt onboarding turns from the tier gate

- **What it is:** In `src/app/api/aion/chat/route.ts`, move `canExecuteAionAction` to after the `messages.length === 0` greeting branch. For non-configured workspaces (`onboardingState !== 'configured'`), skip the gate and return the greeting. Pair with a synthetic demo fallback in `draft_follow_up` for the empty-queue case.
- **Effort:** Small — ~15 lines changed in two files.
- **Main risk:** Foundation-tier users finish onboarding and then immediately hit the tier wall on their first real message. Must be communicated clearly at session end.
- **Unlocks:** Any workspace, any tier, can complete voice setup and see one draft.

### Option B: Standalone voice setup form at `/settings/aion/voice`

- **What it is:** A dedicated settings page with a 3-field form (description, example, guardrails) calling `saveAionVoiceConfig` directly. After save, generates a preview draft via a separate low-permission route. Tier gate stays exactly where it is.
- **Effort:** Medium — new page, new API route, form + save state UI.
- **Main risk:** Splits onboarding across two surfaces with no continuity. Users complete the form, re-open the chat, and the connection between their written style and Aion's output is not visible in the same session.
- **Unlocks:** Voice setup for any tier, but the demo draft is one click removed from the context where it would make sense.

### Option C: Pre-generate draft inline with the `needs_test_draft` greeting

- **What it is:** When `onboardingState === 'needs_test_draft'`, `buildGreeting()` pre-calls `generateFollowUpDraft` (or uses a synthetic fallback) and embeds a `draft_preview` card alongside the greeting text — no confirm turn needed.
- **Effort:** Small-medium — modify `buildGreeting()` in `prompts.ts:338`.
- **Main risk:** Calls the model on every greeting when state is `needs_test_draft`. If the user closes and reopens the tab before confirming, they get a new draft on each open.
- **Unlocks:** Voice-to-draft is immediate, one session, no confirmation round.

## Recommendation

**Option A.** Voice setup is infrastructure, not a premium feature. The tier gate belongs on turns that consume AI capacity (tool calls, message generation). Moving it past the `messages.length === 0` branch costs nothing and unblocks the primary goal. The synthetic fallback for empty queues is a 10-line addition to the `draft_follow_up` tool.

The bait-and-switch risk is manageable: when onboarding completes on a Foundation-tier workspace, append a message at session end — "That's your voice configured. Upgrade to Growth to use Aion drafts going forward." Factual, no pressure, and it makes the tier model transparent rather than surprising.

Option B splits the surface area. Option C is worth revisiting later (one-shot onboarding is genuinely good UX), but it's an optimization — the core blocker is the tier gate placement.

## Next steps for Daniel

1. **`src/app/api/aion/chat/route.ts`** — move `canExecuteAionAction` (~line 99) to after the `messages.length === 0` + onboarding greeting branch (line 126). Add: if `onboardingState !== 'configured'` and `messages.length === 0`, return the greeting regardless of tier.
2. **`src/app/api/aion/chat/tools/core.ts` `draft_follow_up` tool (~line 318)** — add an early branch: if `getFollowUpQueue` returns empty, generate a draft from a hardcoded synthetic deal scenario (returning client, event 6 weeks out, hasn't replied to proposal). Label it "demo draft" in the `draft_preview` card text.
3. **`src/app/api/aion/chat/route/prompts.ts:338`** — add suggestion chips to the `needs_test_draft` greeting: `[{ label: "Yes, show me", value: "Yes, show me a draft" }, { label: "Skip for now", value: "Skip" }]` so the confirm step is one tap.
4. **After onboarding completion**: when tier is `passive`, append a `text` message after `save_voice_config` sets `onboarding_complete: true` explaining what the current plan includes vs. Growth.
5. **Test end-to-end**: open `/aion` with a fresh workspace on any tier, no deals. Walk the 5-step sequence. Verify `workspaces.aion_config.voice` is populated at each step (`supabase studio` or a debug SQL script in `scripts/debug/`).

## References

- `src/app/api/aion/chat/route.ts:59–130` — auth + tier gate placement
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:284–341` — onboarding prompt injection and greetings
- `src/app/api/aion/chat/tools/core.ts:118–135` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–439` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–74` — `AionConfig` and `AionVoiceConfig` types
- `src/features/intelligence/lib/aion-gate.ts:42–56` — `canExecuteAionAction` tier check
- `src/app/(dashboard)/aion/AionPageClient.tsx:66–76` — Brain tab render, no pause gate
