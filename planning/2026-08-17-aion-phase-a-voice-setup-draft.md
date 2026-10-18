# Aion Phase A: Voice Setup and First Draft

_Researched: 2026-08-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

_Note: the premise of this question is out of date. Both `aion_config` and the draft route already exist. This doc reframes the question as: "what's the minimum path to give the owner an explicit write → see draft voice setup experience?"_

## Current state

**`aion_config` exists and is fully wired.** `public.workspaces.aion_config` is a `Json` column present in `src/types/supabase.ts:7782`. The TypeScript shape (`AionConfig`) is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`. It holds `voice.description`, `voice.example_message`, `voice.guardrails`, plus learned vocabulary, a follow-up playbook, and a kill switch.

**`/api/aion/draft-follow-up` is fully wired.** `src/app/api/aion/draft-follow-up/route.ts` handles auth, tier gate, kill-switch, and injects the workspace voice into `generateFollowUpDraft()` (`src/app/api/aion/lib/generate-draft.ts:26`). It is functional today.

**Voice setup happens conversationally.** The chat route classifies `onboardingState` via `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting and system prompt both branch on this state (`src/app/api/aion/chat/route/prompts.ts:275–283`, `route/prompts.ts:300–350`). `save_voice_config` and `draft_follow_up` are live tools in the chat (`src/app/api/aion/chat/tools/core.ts:118`, `318`).

**The 4-step onboarding flow is silently bypassed for most workspaces.** `aion-config-helpers.ts` calls `synthesizeDefaultVoice()` on every config read when `voice` is empty. The result sets `voice_default_derived: true`, which causes `getOnboardingState()` to return `'configured'` at line 248 — no onboarding prompt fires. Daniel already has a synthesized voice; the chat never asks him to set one up.

**The "Tune Aion's voice" affordance is hidden.** `resetAionVoiceConfig()` (`aion-config-actions.ts:214`) clears the voice and forces the onboarding flow on the next chat. It is surfaced only in the sidebar header overflow menu — there is no discovery path from the main Aion interface or settings page.

**Voice fields aren't visible to the owner anywhere.** No page shows Daniel what Aion currently thinks his style is, what the derived voice says, or how to explicitly override it.

## Intended state

Daniel opens the Aion settings (or a prompt inside the Aion chat), sees his current voice config (even the synthesized default), edits or pastes 3 paragraphs about his communication style, saves, and within seconds sees an Aion-generated follow-up draft that uses that voice. The loop is: write → save → draft → done. No hidden menu, no multi-turn chat discovery, no knowledge of `resetAionVoiceConfig`.

## The gap

- No UI surface shows the owner their current `aion_config.voice` values (description, example, guardrails).
- The onboarding flow is bypassed for all workspaces that have a synthesized default — which is every workspace post-onboarding.
- "Tune Aion's voice" is buried in the sidebar overflow; most owners will never find it.
- The `draft_follow_up` tool requires a deal in `ops.follow_up_queue`; if the queue is empty (new workspace), the test-draft step fails silently with `{ error: 'No deals in the follow-up queue.' }`.
- The settings page (`/settings/aion`) covers consent and cadence toggle only — no voice fields.

## Options

### Option A: Voice panel in `/settings/aion`

- **What it is:** Add a `VoiceConfigSection` component to `AionSettingsView.tsx`. Show the three voice fields (description, example, guardrails) pre-filled from `aion_config.voice` (including the synthesized default so Daniel can see it). On save, call `saveAionVoiceConfig`. Add a "Generate test draft" button that calls `/api/aion/draft-follow-up` with a synthetic context (top queue item, or a placeholder deal if queue is empty) and renders the draft inline.
- **Effort:** Small (one new component in an existing page, using existing server actions and API route).
- **Main risk:** The draft button needs a fallback when the queue is empty — either a placeholder deal object or a "add a deal first" prompt.
- **Unlocks:** Owner-visible voice config, explicit save, immediate draft preview. Completes the write → save → draft loop with zero new infrastructure.

### Option B: Inline prompt in the Aion chat empty state

- **What it is:** When `voice_default_derived === true` (derived, never explicitly set), show a non-blocking "Your voice — edit or confirm" card above the input on the Aion landing page. Tapping it opens a small modal with the three fields. On save, fire `save_voice_config` tool directly and then immediately call `draft_follow_up` so the first message in the thread is a real draft.
- **Effort:** Medium (new empty-state component, modal, and modified greeting logic to suppress the multi-turn flow when the card is used).
- **Main risk:** Requires changes in two layers (ChatInterface + greeting route); more surface area. Modal-in-chat feels inconsistent with the Stage Engineering "no modal over chat" pattern.
- **Unlocks:** First-run discovery without going to settings; the draft appears in the main chat thread naturally.

### Option C: `/settings/aion/voice` dedicated page

- **What it is:** New route with a full voice-tuning form, live draft preview pane (debounced, updates as the user types), and a "Done" state that marks `onboarding_state: 'complete'`. Linked from the Aion settings page and from the sidebar overflow "Tune Aion's voice" item.
- **Effort:** Large (new route, new page component, debounced generation, preview pane).
- **Main risk:** Over-engineered for Phase A. The live preview requires repeated API calls while typing.
- **Unlocks:** The clearest possible experience; shareable URL; lays groundwork for a full "Aion configuration" surface.

## Recommendation

**Option A.** Ship the voice panel in the existing `/settings/aion` page.

The entire infrastructure — `saveAionVoiceConfig`, `getAionConfigForWorkspace`, `generateFollowUpDraft`, the three `AionVoiceConfig` fields — is already in place. The only missing piece is a form surface that makes this visible and interactive. Adding `VoiceConfigSection` to `AionSettingsView.tsx` is one focused session of work.

For the empty-queue edge case: pass a lightweight synthetic context to `generateFollowUpDraft` when `ops.follow_up_queue` returns nothing — e.g. `{ deal: { title: 'Demo deal', status: 'pending', event_date: null }, client: null, proposal: null, followUp: { reason: 'Test draft', suggested_channel: 'sms', recent_log: [] } }`. This lets the draft button work for brand-new workspaces without blocking on real data.

Option B is more discoverable but requires changes across multiple files and risks design-system inconsistency. Option C is correct long-term but overkill for Phase A — ship it after the voice panel proves useful.

Tradeoff accepted: the settings page is one layer removed from the chat. If Daniel wants to tune voice from inside chat, the existing sidebar overflow still works. Phase A gets the job done; discoverability can be improved in Phase B.

## Next steps for Daniel

1. Read `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — this is where the new section lives.
2. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–206` — that's `saveAionVoiceConfig`, the mutation you'll call on form submit.
3. Add a `VoiceConfigSection` client component below the existing cadence toggle in `AionSettingsView.tsx`. Pre-fill fields from `state.aionConfig?.voice` (you'll need to pass `aionConfig` through `getWorkspaceFeatureState()` in `consent-actions.ts`).
4. Wire the "Generate test draft" button to `POST /api/aion/draft-follow-up` with `{ context: syntheticContext, workspaceId }`. Render the returned `draft` string inline below the button.
5. For the synthetic context fallback (empty queue), hardcode a minimal `AionDealContext` — the `generateFollowUpDraft` function only needs `deal.title`, `deal.status`, `followUp.reason`, and `followUp.suggested_channel` to produce a useful draft.
6. Test: visit `/settings/aion`, paste a paragraph in the style description, save, click "Generate test draft", confirm the draft reflects the new voice.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — where to add the section
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50,178` — `AionConfig` type + `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/api/aion/draft-follow-up/route.ts` — the draft API endpoint
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft()` and `buildFollowUpPrompt()`
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config` + `draft_follow_up` tools (for reference on how voice injection works)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice()` (why onboarding is bypassed)
