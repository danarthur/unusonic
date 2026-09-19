# Aion voice setup: minimum path to first real draft

_Researched: 2026-09-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: This question was written against the April 2026 codebase. The actual current state is significantly ahead of those premises — see below._

## Current state

`public.workspaces.aion_config` exists and is typed (`src/types/supabase.ts`). The full `AionConfig` shape lives in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`, including `voice: AionVoiceConfig` with `description`, `example_message`, and `guardrails` string fields.

The `/api/aion/chat` route (`src/app/api/aion/chat/route.ts:1`) is a fully-authenticated, tool-calling, streaming endpoint — not the 16-line stub from the primer. It reads `onboarding_state` via `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) and builds the system prompt accordingly.

The onboarding state machine has five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state injects a short instruction into the system prompt (`src/app/api/aion/chat/route/prompts.ts:284-292`) and produces a different greeting. The `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118`) already accepts `description`, `example_message`, and `guardrails` in a single call — all fields are optional.

The `/api/aion/draft-follow-up` route (`src/app/api/aion/draft-follow-up/route.ts:1`) is live, authenticated, and uses `aionConfig.voice` when building the prompt (`src/app/api/aion/lib/generate-draft.ts:52`). The `draft_follow_up` tool is wired into the chat route's tool set (`src/app/api/aion/chat/tools/core.ts:318`).

New workspaces receive a synthesized default voice derived from the workspace name (`voice_default_derived: true`), which sets `onboarding_state = configured` so the forcing block never fires. Owners re-enter setup via "Tune Aion's voice" in the sidebar (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982`), which calls `resetAionVoiceConfig()` and drops the workspace back to `no_voice`.

The "Brain tab" from the April primer does not exist as a distinct tab. The Aion chat page (`/aion`) is the live experience.

## Intended state

Daniel opens Aion, pastes 3 paragraphs describing how he writes to clients (covering style, an example, and any rules), and immediately sees a follow-up draft for a real active deal — without needing to answer 4 separate back-and-forth questions.

## The gap

- The `no_voice` system prompt instruction says only "Ask about communication style. Save via save_voice_config." It does not instruct the model to handle a multi-paragraph input in one shot.
- The `no_voice` greeting asks "How would you describe your style?" with 3 short chips — it invites a one-liner, not a multi-paragraph dump.
- After voice is configured, the `needs_test_draft` state still requires Daniel to say "Yes, try one" before a draft is generated. One extra round trip.
- No explicit instruction to skip straight to a draft when all three voice fields arrive in a single user message.

## Options

### Option A: Prompt-only fast path

- **What it is:** In `prompts.ts:284-292`, extend the `no_voice` onboarding block to add: "If the user provides a detailed multi-paragraph description that covers their style, an example message, and rules all in one reply, call `save_voice_config` with all three fields at once, then immediately call `draft_follow_up` for their highest-priority deal without waiting for confirmation." Also update the `no_voice` greeting to invite a multi-paragraph dump ("Tell me how you write to clients — feel free to paste 3–4 sentences, an example message you've sent, and any hard rules.").
- **Effort:** Small — two file changes: `prompts.ts` (4 lines), `buildGreeting` `no_voice` case (1 sentence).
- **Main risk:** LLM may still ask clarifying questions even with a complete input. Test against Claude Sonnet with a realistic 3-paragraph dump before shipping.
- **Unlocks:** "3 paragraphs → draft" flow without any UI work. Works today once Daniel resets voice via the sidebar.

### Option B: Structured voice intake card in chat

- **What it is:** Add a `voice_intake` message content type to `AionMessageContent`. The `no_voice` greeting emits it as a form block — a single large textarea labeled "Describe your style, paste an example, and mention any rules." On submit the client calls `saveAionVoiceConfig` directly (skipping the LLM), sets `onboarding_state = needs_test_draft`, and fires `POST /api/aion/draft-follow-up` for the top deal. Result streams into chat.
- **Effort:** Medium — new content type in `aion-chat-types.ts`, new renderer in `AionMessageRenderer.tsx`, one new server action, and a new client-side submit handler.
- **Main risk:** Adds a new structured block type to the message renderer and introduces a non-LLM path into the onboarding flow. More surface area to maintain.
- **Unlocks:** Deterministic, instant "form → draft" experience that doesn't depend on LLM parsing. Also testable end-to-end without a live LLM call.

### Option C: Dedicated /aion/setup page (Brain tab)

- **What it is:** A standalone `/aion/setup` page with three labeled text areas (voice description, example message, guardrails). On save, it writes to `aion_config` and redirects to `/aion` where the chat greets in `needs_test_draft` mode and immediately offers a draft.
- **Effort:** Large — new route, new page layout, navigation wiring, possible duplication with "Tune Aion's voice" sidebar affordance.
- **Main risk:** Fragments the settings surface. The sidebar "Tune Aion's voice" already exists and does the reset — a separate page competes with it. Also the highest effort for the narrowest gain.
- **Unlocks:** A named, navigable "Brain" entry point. Useful for sales demos and onboarding flows. Does not unlock anything the other options don't.

## Recommendation

Ship Option A. The infrastructure is entirely ready; this is purely a prompt and greeting copy change. The `save_voice_config` tool already accepts all three fields in one call — the only missing piece is explicitly instructing the LLM to do so when the user front-loads a complete description. Add the instruction to the `no_voice` prompt block and update the greeting to invite a paragraph-level input. That delivers the stated goal in under an hour of work.

Option B becomes the right follow-up if the LLM parsing proves unreliable in practice (misses the example, ignores guardrails). It trades LLM interpretation for deterministic form parsing, but it is worth validating Option A first. Option C addresses a different need (named navigation for demos/marketing) and is not the minimum path.

Before shipping A, Daniel should reset voice via the sidebar settings menu ("Tune Aion's voice"), open a fresh chat, and paste a realistic 3-paragraph description to validate that the model calls `save_voice_config` with all three fields and then fires `draft_follow_up` without prompting.

## Next steps for Daniel

1. Open `/aion`, click the sliders icon in the sidebar header, choose "Tune Aion's voice" — this resets the workspace to `no_voice`.
2. Edit `src/app/api/aion/chat/route/prompts.ts:284-285` — extend the `no_voice` onboarding block with a fast-path instruction for multi-paragraph input.
3. Edit `buildGreeting` in the same file (`prompts.ts:311`) — change the `no_voice` greeting text to invite a multi-paragraph dump instead of a one-liner.
4. Optionally update `needs_test_draft` prompt block (`prompts.ts:291`) to auto-call `draft_follow_up` without waiting if the workspace just completed a one-shot intake.
5. Test: open a fresh Aion chat, paste 3 paragraphs covering style/example/rules, and verify `save_voice_config` fires with all three fields and a draft appears.
6. If the LLM still steps through questions one at a time, escalate to Option B (structured intake card).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — `AionVoiceConfig`, `AionConfig` types
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state prompt injections
- `src/app/api/aion/chat/route/prompts.ts:308` — `buildGreeting()` with per-state cold opens
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool (all fields optional, can fire in one call)
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt()`, injects voice config into draft system prompt
- `src/app/api/aion/draft-follow-up/route.ts:1` — live draft generation API
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982` — "Tune Aion's voice" reset affordance
