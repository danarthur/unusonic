# Aion Phase A: Minimum path to voice setup + first real draft

_Researched: 2026-05-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Both premises in the queue item are stale. The codebase has moved significantly since this was written.

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). It stores voice config, learned rules, follow-up playbook, kill switch, and onboarding state.

**The Brain tab is live, not paused.** `/aion` renders a full `ChatInterface` via `AionPageClient.tsx:73`. The "paused" state is the `kill_switch` boolean in `aion_config`, checked at the route level (`src/app/api/aion/chat/route.ts:111`). There is no UI banner saying "Brain Mode is paused."

**The voice onboarding state machine is fully implemented.** Five states — `no_voice → no_example → no_guardrails → needs_test_draft → configured` — live in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`. The chat route reads them (`route.ts:122`) and the prompt builder injects per-state guidance (`chat/route/prompts.ts:275–283`). Greeting messages for each state are built in `chat/route/prompts.ts:301–338`.

**Draft generation is fully wired.** `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts`) is auth-gated, tier-gated, kill-switch-checked, and calls `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:25`). Voice config is injected into the system prompt at `generate-draft.ts:63–74`.

**The onboarding shortcut bypasses setup for new workspaces.** Wk 11 §3.8 (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–44`): when `aion_config.voice` is empty, `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name and sets `voice_default_derived = true`. `getOnboardingState` sees that flag and immediately returns `'configured'` (`aion-chat-types.ts:248`). New workspaces never hit the 4-step onboarding flow — they get the pull-mode greeting with suggestion chips instead.

The only path to voice setup today: the sidebar settings menu → "Tune Aion's voice" → `resetAionVoiceConfig()` → then start a new chat (`AionSidebar.tsx:998–1011`). That drops the synthesized default and re-enters the `no_voice → no_example → no_guardrails → needs_test_draft` sequence across four separate chat turns.

## Intended state

Daniel opens the Aion tab. He sees a simple form with three fields: how he talks to clients, an example message he has sent, and any rules. He fills it in — one sitting, no back-and-forth — and clicks "Generate draft." Aion immediately produces a follow-up for the top-priority deal in his queue using exactly the voice he just described. From there, Aion is configured and the chat opens in pull mode.

## The gap

- No standalone voice setup form exists. Setup today requires a 4-turn chat conversation.
- The Wk 11 shortcut (`voice_default_derived`) means new workspaces skip the onboarding flow entirely and get a synthesized default instead.
- The "Tune Aion's voice" reset entry point is buried in a sidebar overflow menu with no affordance for first-time users.
- There is no "one form → one draft" path. The draft call (`/api/aion/draft-follow-up`) exists and takes a deal context, but nothing in the UI wires a voice form save directly to a draft render.

## Options

### Option A: Dedicated voice setup panel

- **What it is:** A `VoiceSetupPanel` component rendered at `/aion` when `onboarding_state` is `no_voice` (or `voice_default_derived === true` and the workspace has zero prior chat sessions). Three labeled textareas (style, example, guardrails) and a "Save and generate draft" button. Calls `saveAionVoiceConfig` then immediately calls `getDealContextForAion` on the top follow-up queue item and posts to `/api/aion/draft-follow-up`. On success, transitions into the normal chat UI with the draft pre-rendered.
- **Effort:** Small — existing server actions and the draft API route already exist. New UI component only.
- **Main risk:** Need to decide what to show when the follow-up queue is empty (no deals to draft against). Fall back to showing a sample draft with placeholder data.
- **Unlocks:** Exactly the stated goal. One sitting, no chat, immediate draft feedback. Also creates a natural re-entry if the user wants to retune (replace the sidebar overflow with a link to the same panel).

### Option B: Surface the existing chat onboarding more prominently

- **What it is:** Remove the `voice_default_derived` shortcut (or narrow it to workspaces with at least one sent follow-up) so new workspaces land in `no_voice` state and walk through the 4-turn guided setup in chat. Add a prominent "Set up your voice" chip on the configured-state greeting for anyone with `voice_default_derived === true`.
- **Effort:** Small — change the condition in `getOnboardingState` and update the greeting chip set in `prompts.ts`.
- **Main risk:** Conversational onboarding is inherently multi-turn. Daniel's stated goal ("write 3 paragraphs... immediately see a draft") implies a form, not a chat. The chat path also requires Aion to successfully parse each answer and call `save_voice_config` mid-conversation — more failure modes.
- **Unlocks:** Reuses existing chat infrastructure with no new components. But does not deliver the "one form → one draft" experience.

### Option C: Aion-driven setup within a single chat turn

- **What it is:** Add a special "voice setup" intent that, when Aion detects the user typed a multi-paragraph description of their style, parses all three fields (description, example, guardrails) from a single user message and immediately responds with a draft preview card — all in one turn.
- **Effort:** Medium — requires intent classification, multi-field extraction prompt, and a new `setup_voice_and_draft` tool that chains `saveAionVoiceConfig` + `generateFollowUpDraft` in one invocation.
- **Main risk:** Extraction reliability. If the user's description doesn't include all three fields, the turn either fails silently or asks clarifying questions — back to multi-turn. Also more novel code to maintain.
- **Unlocks:** The most natural UX for a chat-native product. Worth shipping as a Phase B upgrade after Option A ships.

## Recommendation

Ship **Option A** — the dedicated voice setup panel.

The three-textarea form is exactly what Daniel described, and all the hard infrastructure already exists: `saveAionVoiceConfig` (`aion-config-actions.ts:178`), `getDealContextForAion` (`follow-up-actions.ts:545`), and `POST /api/aion/draft-follow-up`. The new code is one client component and one conditional render in `AionPageClient`. Effort is a few hours, not a sprint.

The tradeoff you're accepting: this creates a slight inconsistency between the form path (immediate) and the "Tune voice" chat path (conversational). That's fine — the chat path can be deprecated in favor of the panel in a follow-up. Option C is the eventual ideal but requires multi-field extraction reliability that doesn't exist yet. Ship the form now, upgrade to single-turn extraction later.

One decision needed before starting: show the panel only when `voice_default_derived === true` (i.e., user has never configured voice explicitly) OR also show it for `no_voice` state? Recommend checking `voice_default_derived === true` — it preserves the Wk 11 shortcut and only intercepts users who haven't consciously set up their voice.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — three textarea fields using `AionVoiceConfig` shape, submit calls `saveAionVoiceConfig` then immediately calls `/api/aion/draft-follow-up` with the top queue item.
2. In `AionPageClient.tsx`, pass the workspace's `aion_config` (server-fetched) as a prop. If `voice_default_derived === true`, render `<VoiceSetupPanel />` instead of `<ChatInterface />`.
3. After `saveAionVoiceConfig` and a successful draft, transition to `<ChatInterface />` with the draft pre-loaded as the first assistant message (or navigate to `/aion` with a `?openDraft=<dealId>` param the chat route handles).
4. Handle the no-deals edge case: if `ops.follow_up_queue` is empty, show a sample draft against a placeholder deal and skip the real API call.
5. Replace the sidebar "Tune Aion's voice" overflow entry with a link back to the setup panel (or keep both — the panel is just more accessible).
6. Smoke-test: fresh workspace, open `/aion`, fill the three fields, verify the draft renders and the subsequent chat session uses the saved voice.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:66–76` — Aion page shell
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–44` — `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–206` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545–599` — `getDealContextForAion`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts:25–46` — `generateFollowUpDraft`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:972–1011` — current "Tune voice" entry point
