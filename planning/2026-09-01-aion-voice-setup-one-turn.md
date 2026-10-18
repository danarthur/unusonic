# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-09-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Important:** the planning-primer is significantly out of date on this topic. The Brain tab is not paused, `aion_config` exists, and the chat route is production-grade. Here is the actual state as of this run.

`public.workspaces.aion_config` **exists** and is actively read/written. `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads it; `saveAionVoiceConfig()` at `:178` writes it. The column stores a typed `AionConfig` JSONB with `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `voice_default_derived` fields.

The chat route (`src/app/api/aion/chat/route.ts`) is a full authenticated tool-calling system — not a stub. It gates on tier, loads `aion_config`, computes `onboardingState` via `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`), and dispatches a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`.

The 5-state greeting is wired in `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:292`. Each state produces a different greeting and set of suggestion chips.

The `save_voice_config` chat tool (`src/app/api/aion/chat/tools/core.ts:118`) already accepts all three fields (`description`, `example_message`, `guardrails`) as optional — it can save all three in one call.

The `draft_follow_up` chat tool (`src/app/api/aion/chat/tools/core.ts:318`) is fully wired. It calls `getDealContextForAion` → `generateFollowUpDraft` with `voice` from the config. The companion API route `/api/aion/draft-follow-up/route.ts` does the same.

The "Tune Aion's voice" re-entry affordance **is wired** in the sidebar overflow at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982`. It calls `resetAionVoiceConfig()` which clears the voice fields and `voice_default_derived` flag, so the next chat re-enters the `no_voice` greeting.

## Intended state

Daniel opens the Aion tab, sees a prompt inviting him to describe how he talks to clients in one go (style + example + guardrails), types 3 paragraphs, and immediately sees a follow-up draft for one of his deals — all within a single chat turn or two. No multi-step back-and-forth required.

## The gap

- **The `no_voice` greeting doesn't invite one-turn comprehensive input.** It asks "How would you describe your style?" with three short chips (`prompts.ts:303`). Nothing tells the user they can describe style, paste an example, and add guardrails all at once.
- **The system prompt instruction for `no_voice` is too narrow.** It only says "Ask about communication style. Save via save_voice_config." (`prompts.ts:276`). It doesn't instruct the model: "if the user provides all three fields at once, save all three and immediately offer a draft."
- **`draft_follow_up` errors on empty queue** (`core.ts:334`). `{ error: 'No deals in the follow-up queue.' }` is returned but the model may not handle this gracefully for first-time users.
- **All new workspaces bypass onboarding entirely.** `getOnboardingState()` returns `configured` when `voice_default_derived === true` (`aion-chat-types.ts:248`) — meaning every workspace that hasn't explicitly run the 4-step flow skips it silently. The re-entry path ("Tune Aion's voice") is buried in a sidebar overflow icon.

## Options

### Option A: Upgrade the `no_voice` greeting and system prompt instruction

- **What it is:** Change the `no_voice` greeting copy to explicitly invite a one-turn comprehensive description ("Tell me about how you talk to clients — your style, an example message you'd send, and any rules you follow. Write as much or as little as you like, and I'll extract everything at once."). Update the system prompt onboarding block to tell the model "if the user provides all three fields, save them all in one `save_voice_config` call and immediately call `draft_follow_up`." Also add a graceful fallback in `draft_follow_up` when the queue is empty (use any active deal, or ask the user to paste a deal).
- **Effort:** Small — 3 targeted text edits in `prompts.ts:276`, `prompts.ts:302–311`, and `core.ts:332–334`. No schema changes, no new components.
- **Main risk:** LLM extraction from free-form prose is probabilistic. Some users may write something too abstract for the model to extract a usable `example_message`. The step-by-step flow is more reliable per field.
- **Unlocks:** The "write 3 paragraphs → see draft" experience with no UI work.

### Option B: Add a dedicated voice setup form

- **What it is:** Build a `VoiceSetupPanel` component with three labeled textareas (communication style, example message, guardrails). Wire a "Set up Aion's voice" CTA on the empty-state landing. On submit, call `saveAionVoiceConfig()` directly (server action already exists), then send a synthetic user message to the chat: "I've saved my voice config — now show me a draft for my top deal." This bypasses the conversation entirely and gives full control over field capture.
- **Effort:** Medium — new component (~100 lines), new CTA on landing, wire to existing server action.
- **Main risk:** Introduces a form surface alongside the conversational UI, which may feel inconsistent. Requires decisions about where in the empty state it lives.
- **Unlocks:** Reliable, deterministic field capture; the 3-paragraph UX works exactly as described.

### Option C: Add a landing starter that primes one-turn input

- **What it is:** Add a fifth starter to `AionLandingStarters` (`DEFAULT_STARTERS` at `AionLandingStarters.tsx:41`): `{ label: "Set up Aion's voice", value: "Let me describe how I talk to clients: [style] [example message] [rules]" }`. The user replaces the placeholders and sends. This is a discoverability fix only — the underlying 4-step flow is unchanged.
- **Effort:** Tiny — 1 line in `AionLandingStarters.tsx`.
- **Main risk:** Still requires the user to understand they need to replace placeholders. Doesn't change the underlying multi-step conversation.
- **Unlocks:** Discoverability of voice setup for users landing on the Aion page.

## Recommendation

**Option A.** It directly delivers the described UX with the smallest possible code delta. The tools, state machine, and DB plumbing are already in place — the only gap is the greeting text and the system prompt instruction. Two changes:

1. In `prompts.ts` around line 276: expand the `no_voice` system prompt instruction to "If the user provides all three fields (description, example message, guardrails) in one message, call save_voice_config with all three and then call draft_follow_up immediately. Don't wait for step-by-step if the user is ready."

2. In `prompts.ts` around line 304: change the `no_voice` greeting from "How would you describe your style?" to something like "I'm Aion. To get started, tell me how you talk to clients — your style, an example message you'd send, and any rules. One paragraph or three, whatever feels natural."

The tradeoff you are accepting: Aion may occasionally fail to extract a clean `example_message` from an unstructured block and ask a follow-up. This is acceptable — it's still one or two turns, not four. If Daniel wants a form-based experience later, Option B can be layered on top without rework.

Also add the empty-queue fallback in `draft_follow_up` (core.ts ~line 332): if `queue.length === 0`, fall through to any active deal via a direct `getDeal` query rather than erroring. This is a separate small fix worth doing regardless of which option you pick.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts`. Find the `no_voice` case at line 276 (system prompt instruction). Expand it to tell the model to save all three fields in one call if provided, and immediately follow with `draft_follow_up`.
2. In the same file, find line 302–311 (the `no_voice` greeting). Replace the "How would you describe your style?" prompt with a single open-ended invitation that mentions all three fields.
3. Open `src/app/api/aion/chat/tools/core.ts`. Find the `draft_follow_up` empty-queue error at line 332–334. Replace the hard error with a fallback: query for any deal in the workspace via the server supabase client and use its ID.
4. Test by clicking "Tune Aion's voice" in the sidebar overflow, starting a new chat, and writing one message covering all three topics. Verify the model calls `save_voice_config` once with all three fields and then immediately calls `draft_follow_up`.
5. Check the config was saved: query `select aion_config from workspaces where id = '<your-workspace-id>'` in the Supabase SQL editor. The `voice` key should have all three fields populated.
6. If the draft looks wrong, check that `voice.description` is feeding `buildFollowUpPrompt()` in `src/app/api/aion/lib/generate-draft.ts:52`.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/api/aion/chat/route/prompts.ts:275–286` — system prompt onboarding injections
- `src/app/api/aion/chat/route/prompts.ts:292–436` — `buildGreeting()` per state
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–410` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–100` — `getAionConfig()`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982–1049` — "Tune Aion's voice" menu item
- `src/app/api/aion/lib/generate-draft.ts:26–46` — `generateFollowUpDraft()` with voice injection
