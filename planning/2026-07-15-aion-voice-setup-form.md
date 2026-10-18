# Add voice setup form and immediate test-draft flow to Aion

_Researched: 2026-07-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on stale premise:** The planning primer's description of the current state is significantly out of date. Both gating assumptions in the question are already resolved. See Current State below.

## Current state

The Aion tab is fully live and production-grade. Key facts with citations:

**`aion_config` exists.** `public.workspaces.aion_config` is a `Json` column typed in TypeScript as `AionConfig` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`). It already holds `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived`.

**`AionVoiceConfig` has exactly the three fields Daniel would write.** `description`, `example_message`, `guardrails` (`aion-config-actions.ts:12-16`). `saveAionVoiceConfig()` (`aion-config-actions.ts:178`) and `resetAionVoiceConfig()` (`aion-config-actions.ts:214`) are working server actions.

**`/api/aion/draft-follow-up` is fully implemented.** 74-line route at `src/app/api/aion/draft-follow-up/route.ts`. Accepts `{ context: AionDealContext, workspaceId }`, reads `aion_config.voice`, calls `generateFollowUpDraft()`, returns `{ draft: string, channel }`. Used today by `FollowUpCard` (`src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:341`).

**`/api/aion/chat/route.ts` is not a stub.** It is a 450-line production handler with auth, rate limiting, tier gates, a 5-state onboarding state machine, streaming, tool use, and onboarding state checks (`src/app/api/aion/chat/route.ts:57-435`).

**The 4-step voice onboarding flow exists but is bypassed.** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) checks `voice.description` → `no_voice` → `no_example` → `no_guardrails` → `needs_test_draft` → `configured`. The system prompt then steers the conversation accordingly. However, `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`) synthesizes a default voice from the workspace name on every config read and sets `voice_default_derived = true`. Because `getOnboardingState` short-circuits to `configured` when `voice_default_derived === true` (`aion-chat-types.ts:248`), no workspace ever reaches the guided setup path.

**There is no form UI for explicit voice input.** `AionFirstVisitPrompt.tsx` is a consent modal (beta opt-in), not a voice setup form. The sidebar has a "Tune Aion's voice" overflow item that calls `resetAionVoiceConfig` and re-enters the chat-guided flow — but the chat flow is conversational, not a form, and there is no post-onboarding "test draft" trigger in the UI.

## Intended state

Daniel opens the Aion tab, sees a prompt to describe his communication style, fills in 3 fields (his own words, not a synthesized default), clicks a button, and immediately reads an Aion-generated follow-up draft in his voice against a real pending deal. After that, the Aion chat and FollowUpCard use his voice in every draft. The 3 fields map directly to `AionVoiceConfig.description`, `.example_message`, and `.guardrails`.

## The gap

- No form UI where Daniel can write his own voice (only synthesis exists)
- The chat-guided 4-step setup is bypassed for all workspaces via `voice_default_derived`
- No "write → see draft" feedback loop visible to the user
- "Tune Aion's voice" in the sidebar resets to the chat flow, which asks one question at a time — not the instant 3-paragraph form experience Daniel described

## Options

### Option A: VoiceSetupPanel in the Aion sidebar
- **What it is:** A collapsible panel (or sheet) in `AionSidebar` with 3 textarea fields (communication style, example message, guardrails) plus a "Save and test" button. On submit: calls `saveAionVoiceConfig()` (already works), then immediately calls `POST /api/aion/draft-follow-up` with the workspace's highest-priority queue item to render a live draft. The sidebar overflow "Tune Aion's voice" already exists to re-open it.
- **Effort:** Small — one new component, no schema changes, no new API routes. Both the save action and the draft endpoint are working.
- **Main risk:** Choosing the reference deal for the test draft (need the top `ops.follow_up_queue` item; if queue is empty, fall back to the most recent deal).
- **Unlocks:** Voice immediately flows into `FollowUpCard` drafts, `AionSidebar` learned-summary card, and the system prompt's `=== VOICE CONFIG ===` block for every subsequent chat turn.

### Option B: Re-enable the chat-guided onboarding for fresh workspaces
- **What it is:** Add a flag (e.g. `voice_setup_skipped: boolean`) or check workspace age in `applyVoiceDefaultIfEmpty`. For workspaces with no explicit voice and no activity, return the raw config without synthesizing — so `getOnboardingState` hits `no_voice` and the existing 4-step chat flow runs. Remove `voice_default_derived` bypass.
- **Effort:** Small-medium — touches `aion-config-helpers.ts`, `aion-chat-types.ts`, `buildGreeting` (to verify the greeting copy for each state is production-ready), and needs verification the `needs_test_draft` terminal state calls `generateFollowUpDraft` automatically.
- **Main risk:** Existing workspaces that relied on the synthesized default will hit the onboarding flow unexpectedly on next login. Needs a migration guard (check `onboarding_state === 'complete'` or `voice_default_derived`).
- **Unlocks:** Conversational onboarding without shipping a form. Better for mobile (voice input path). But the flow is multi-turn — not the "3 paragraphs → instant draft" experience described.

### Option C: A dedicated `/aion/settings` page
- **What it is:** A full settings surface with tabs: Voice, Playbook, Learned. Voice tab = the 3 textareas from Option A + full playbook rule list. Lives under a new route segment.
- **Effort:** Large — new route, new layout, multiple feature panels, playbook CRUD UI.
- **Main risk:** Over-engineering before the core voice setup is proven.
- **Unlocks:** Comprehensive Aion configuration outside the chat. Worth building eventually but not the minimum path.

## Recommendation

Ship Option A. It is the minimum path by a significant margin: both `saveAionVoiceConfig` and `/api/aion/draft-follow-up` already work; the gap is purely a UI form. A `VoiceSetupPanel` inside `AionSidebar` closes the loop in one small component, and "Tune Aion's voice" in the overflow already exists as the entry point. The form experience (3 textareas + one button → immediate draft) directly matches the mental model Daniel described, without restructuring the chat onboarding or risking regressions for active workspaces.

Option B is appealing because the chat-guided flow already exists, but it requires multi-turn conversation before a draft appears — not "3 paragraphs → instant result." Option C is premature.

One caveat: the test-draft trigger needs a reference deal. Add a server action that fetches the workspace's top `ops.follow_up_queue` item, or if the queue is empty, the most recently updated deal. Scope that to `getDealContextForAion` (already at `follow-up-actions.ts:545`) — it handles the context assembly.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — find the existing "Tune Aion's voice" overflow trigger and trace where it leads. The new `VoiceSetupPanel` will open from this trigger.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` with 3 textarea fields bound to `description`, `example_message`, `guardrails`.
3. Wire the Save button to `saveAionVoiceConfig()` (`aion-config-actions.ts:178`) — this action is already written and tested.
4. After a successful save, call `POST /api/aion/draft-follow-up` with the workspace's top queue item (fetch via a new lightweight server action wrapping `supabase.schema('ops').from('follow_up_queue').select(...).eq('status','pending').order('priority_score', {ascending:false}).limit(1)`).
5. Render the draft response in a `DraftPreviewCard` (component already exists at `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx`).
6. Optionally: add a `hasExplicitVoice` check to `applyVoiceDefaultIfEmpty` so the sidebar panel shows a "set your own voice" banner when only a derived default is active.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — applyVoiceDefaultIfEmpty, synthesizeDefaultVoice
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — getOnboardingState, OnboardingState
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/chat/route/prompts.ts` — buildSystemPrompt (voice config injection at line 88)
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:341` — reference consumer of getDealContextForAion + draft-follow-up
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — getDealContextForAion
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — existing draft card to reuse
