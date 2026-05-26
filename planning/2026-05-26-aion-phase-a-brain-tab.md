# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-05-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Goal: Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice.

**How I understood it:** The queue item's premises are stale. The primer dates from 2026-04-10; a lot shipped since. This doc corrects the current state and scopes the one real gap.

## Current state

**`aion_config` exists.** `public.workspaces.aion_config: Json` is in the generated types (`src/types/supabase.ts:7689`). The `AionConfig` TypeScript type is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` with `voice?: { description, example_message, guardrails }`, `onboarding_state?: string`, and related fields.

**Voice pipeline is built.** `src/app/api/aion/chat/route/prompts.ts:275–282` contains a 4-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft`). Each state injects an `=== ONBOARDING ===` directive into the system prompt. `src/app/api/aion/lib/tone-anchoring.ts` turns the saved voice config into a system-prompt preamble for every chat turn.

**Draft generation is built.** `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts:1`) takes `{ context: AionDealContext, workspaceId }`, loads `aion_config` (including voice), and calls `generateFollowUpDraft`. Auth-gated, tier-gated, kill-switch-aware.

**`getDealContextForAion` exists** at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. Returns deal + client + proposal + follow-up history assembled for draft generation. The `draft_follow_up` chat tool falls back to a synthetic queue item when no real one exists (`core.ts:343`).

**`saveAionVoiceConfig` server action exists** at `aion-config-actions.ts:178`. Writes voice config to `workspaces.aion_config` via service-role client.

**No Brain tab in Prism.** `prism.tsx:33` defines `PrismLens = 'deal' | 'plan' | 'ledger'`. Tabs at `prism.tsx:697–699`. The "Brain tab is paused" message the primer described was never built — it doesn't exist in the current codebase.

## Intended state

Daniel opens a Brain tab in the Prism side panel (alongside Deal / Plan / Ledger), writes a description of his communication style, optionally pastes an example message, and submits. The tab then shows an Aion-generated follow-up draft for the currently selected deal, using the just-saved voice. On subsequent visits the Brain tab shows the current voice config and a "regenerate draft" action.

## The gap

- `PrismLens` type has no `'brain'` value; no Brain tab exists in Prism
- No form component to collect `voice.description` / `voice.example_message` / `voice.guardrails` outside the Aion chat
- No server action that chains save-voice → assemble-deal-context → call draft-follow-up → return draft, in a single round-trip from Prism

Everything else is in place.

## Options

### Option A: Deep-link from deal view into existing Aion chat
- **What it is:** Add a "Set up Aion voice" button on the Deal lens that navigates to the Aion chat page with `pageContext.type = 'deal'` and `pageContext.entityId = dealId`. The existing onboarding state machine walks the user through voice setup, then at `needs_test_draft` the chat tool calls `draft_follow_up` with the deal in context.
- **Effort:** Small — one button, one URL, zero new components
- **Main risk:** UX fragmentation — user leaves the deal view to configure Aion and must navigate back. No "Brain tab" ever gets built.
- **Unlocks:** Proves the end-to-end pipeline works before building dedicated UI. Good smoke test.

### Option B: Brain tab with embedded ChatInterface
- **What it is:** Add `'brain'` to `PrismLens`, add a fourth tab, render `<ChatInterface>` inside it with `pageContext` set to the current deal. Aion runs the onboarding flow conversationally.
- **Effort:** Large — `ChatInterface` is 807 lines, manages its own session state, greeting dedup, sidebar, and model-mode picker. Embedding it in a narrow Prism column requires significant layout surgery.
- **Main risk:** High integration complexity; ChatInterface was designed for a full-page context. Risk of introducing regressions in the standalone Aion page.
- **Unlocks:** Fully conversational Brain tab. Over-engineered for Phase A.

### Option C: Brain tab with a lightweight Voice Setup form
- **What it is:** Add `'brain'` to `PrismLens` and add a `BrainLens` component with a structured 3-field form (description, example message, guardrails). On submit: call `saveAionVoiceConfig(voice)`, then call `getDealContextForAion` + POST to `/api/aion/draft-follow-up`, and display the returned draft inline. No chat involved.
- **Effort:** Medium — new Prism lens, new form component, one server action wrapper for the save+draft chain
- **Main risk:** Voice setup is now a form, not a conversation. Users who want to iterate on their voice via chat still can (Aion chat page remains available). Slight duplication of the save logic path.
- **Unlocks:** The exact UX Daniel described. Establishes Brain tab as the permanent home for Aion workspace config; later phases add learned vocabulary, playbook rules, and cadence settings to the same tab.

## Recommendation

**Option C.** The infrastructure is complete. The only missing piece is the UI surface. A structured form matches Daniel's mental model ("writes 3 paragraphs") better than a back-and-forth chat, and embedding ChatInterface in Prism (Option B) carries real regression risk at 807 lines. Option A proves the pipeline but never delivers the Brain tab, which is the intended permanent home for Aion config.

The tradeoff: voice setup lives in a form rather than Aion's conversational onboarding. That's fine — the Aion chat page is still there for users who prefer conversation. The Brain tab form is the deliberate, structured path. Keep the form minimal for Phase A: description textarea (required), example textarea (optional), guardrails textarea (optional). Skip all wizard chrome and states — just submit + show draft.

## Next steps for Daniel

1. Add `'brain'` to `PrismLens` at `src/app/(dashboard)/(features)/events/components/prism.tsx:33`
2. Add `{ value: 'brain' as const, label: 'Brain' }` to the tabs array at `prism.tsx:697–699`; gate it as always-enabled (no event required)
3. Create `src/features/aion/brain-lens/BrainLens.tsx` — 3-field form with a single submit button
4. On submit, call `saveAionVoiceConfig(voice)` from `aion-config-actions.ts:178`, then POST `{ context, workspaceId }` to `/api/aion/draft-follow-up` (assemble context via `getDealContextForAion` with a synthetic queue item if none exists — see pattern at `core.ts:343`)
5. Display the returned `{ draft, channel }` inline in the Brain tab below the form; add a copy-to-clipboard action
6. Wire the Brain lens render branch in `prism.tsx` alongside the existing `lens === 'deal'` / `lens === 'plan'` / `lens === 'ledger'` branches

## References

- `src/app/(dashboard)/(features)/events/components/prism.tsx:33` — PrismLens type
- `src/app/(dashboard)/(features)/events/components/prism.tsx:697–699` — tabs array
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — AionConfig type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — saveAionVoiceConfig
- `src/app/api/aion/chat/route/prompts.ts:275–282` — onboarding state machine
- `src/app/api/aion/lib/tone-anchoring.ts` — voice config → system prompt
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/chat/tools/core.ts:318–344` — draft_follow_up tool + synthetic queue item pattern
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — getDealContextForAion
