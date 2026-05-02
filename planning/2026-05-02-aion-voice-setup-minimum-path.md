# Minimum path to voice setup and first real draft

_Researched: 2026-05-02 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** Both stated blockers are outdated. `public.workspaces.aion_config` was added in `20260407140000_aion_voice_foundation.sql`. There is no "Brain tab" in the current UI — "Brain" appears only as a Lucide icon for the Thinking model-mode toggle in `ChatInterface.tsx:783`. The research therefore reframes the question as: what is the minimum path for a workspace owner to write their voice config and see a real voice-respecting draft immediately?

## Current state

`aion_config` exists on `public.workspaces` with a `voice` subobject (`description`, `example_message`, `guardrails`) plus `learned`, `follow_up_playbook`, `kill_switch`, and `onboarding_state` fields (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`).

The 4-step onboarding state machine is fully implemented. `getOnboardingState()` returns one of `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:226-256`). The chat route reads this on every cold-open and routes to a matching `buildGreeting()` branch that prompts the user for that missing piece (`src/app/api/aion/chat/route/prompts.ts:300-338`).

However, `applyVoiceDefaultIfEmpty()` synthesizes a generic voice from the workspace name and sets `voice_default_derived: true` for any workspace with no explicit voice on disk (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45`). `getOnboardingState()` returns `'configured'` immediately when `voice_default_derived` is true (`aion-chat-types.ts:248`), so new workspaces skip the entire onboarding flow. The only way back in is "Tune Aion's voice" hidden in the sidebar overflow menu (`AionSidebar.tsx:972-1012`).

`/api/aion/draft-follow-up` is live, authenticated, and reads `aionConfig.voice` before generating (`src/app/api/aion/draft-follow-up/route.ts:53-66`). `generateFollowUpDraft()` injects the stored `description` and `example_message` into the system prompt (`src/app/api/aion/lib/generate-draft.ts`). `getDealContextForAion()` exists and assembles deal + client + proposal context for draft generation (`src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545`).

`saveAionVoiceConfig()` merges an explicit voice into `aion_config` and clears `voice_default_derived` (`aion-config-actions.ts:178-206`). No additional schema work is needed.

## Intended state

Daniel opens a surface (a dedicated Brain/Voice setup card or settings page), writes free-form in three fields (communication style, an example message he has sent, guardrails), hits save, and sees a test draft generated from his top-priority deal in that same view — all in under two minutes. After completing this, normal configured-mode Aion takes over. The key experience property is immediacy: the draft appears in the same view as the form, not after navigating elsewhere.

## The gap

- No dedicated voice setup surface — setup is buried in sidebar overflow ("Tune Aion's voice") which calls `resetAionVoiceConfig()` then forces a new chat session.
- `voice_default_derived` bypass means first-time users see no onboarding prompt at all; they get a synthesized generic voice silently.
- The 4-step conversational flow (when triggered) spans 3-4 turns over multiple round-trips — it is not a single "write about yourself" form.
- After `needs_test_draft`, Aion's draft offer is a chat turn, not an inline draft preview with copy/use actions.

## Options

### Option A: `VoiceSetupCard` on the `/aion` page

- **What it is:** A server-rendered card shown above the chat input when `voice_default_derived === true`. Three labeled textareas (style description, example message, guardrails). On submit: calls `saveAionVoiceConfig`, then fetches the top follow-up queue item via `ops.follow_up_queue` + `getDealContextForAion`, POSTs `/api/aion/draft-follow-up`, and renders the draft inline in the same card before handing off to normal chat mode.
- **Effort:** Small-medium. New component (`VoiceSetupCard.tsx`), one new server action to fetch top queue item + draft in one call, one small change to `/aion/page.tsx` to pass `voice_default_derived` down. No new routes, no schema changes.
- **Main risk:** If the workspace has no deals in `ops.follow_up_queue` yet (day-0), the draft step silently returns nothing and the card has to degrade gracefully.
- **Unlocks:** The exact experience Daniel described. After this ships, `CadenceLearningToggle` has a natural home on the same card.

### Option B: `/settings/aion` page

- **What it is:** A standalone settings page with the same three fields plus the cadence learning toggle, save → redirect to `/aion` where a pinned proactive line shows "Here is your first draft based on your new voice."
- **Effort:** Medium. New route (`/settings/aion/page.tsx`), nav entry, breadcrumb, redirect flow.
- **Main risk:** Adds friction (leave → fill form → return). The draft is not immediate; it arrives as a proactive line after navigation.
- **Unlocks:** A canonical settings home for all Aion workspace config (cadence, kill switch, playbook review). Worth building eventually.

### Option C: Remove the `voice_default_derived` bypass

- **What it is:** Delete (or gate behind an admin flag) the `applyVoiceDefaultIfEmpty` call so first-open of `/aion` lands on the real `no_voice` greeting. Accept the 4-turn conversational flow, but add a new Aion tool `set_voice_config_from_prose` that parses a single long message ("Here is how I talk to clients…") into all three fields at once, then triggers a draft.
- **Effort:** Small to implement the removal; medium to build the prose-parsing tool reliably.
- **Main risk:** Breaks experience for all existing workspaces that currently have no explicit voice stored. They would be forced into onboarding on next chat open. The prose-parsing tool adds AI-in-the-loop latency before the draft appears.
- **Unlocks:** A purely conversational path — no new UI components. But loses the immediacy of a form-based experience.

## Recommendation

Ship Option A. It is the minimum viable path to the stated goal with no schema changes, no new routes, and a total surface area of one new component plus two small edits.

The key implementation detail: the post-save draft fetch should happen in a single server action that (1) reads the top-priority item from `ops.follow_up_queue` for the workspace, (2) calls `getDealContextForAion` on that deal, and (3) POSTs `/api/aion/draft-follow-up` returning the draft text to render inline. Day-0 workspaces with no queue items should show a placeholder ("Add a deal to see a draft here") rather than an error. Do not attempt Option C until the `voice_default_derived` decision is deliberate — silently bypassing onboarding for existing workspaces was intentional, and reverting it is a distinct product decision.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupCard.tsx` — three textareas, a save button, an inline draft area. Controlled form, no library needed.
2. In `src/app/(dashboard)/(features)/aion/page.tsx`, call `getAionConfig()` server-side and pass `voice_default_derived` as a prop to the client shell. Render `VoiceSetupCard` when true.
3. Add a server action `generateFirstDraftFromVoice(workspaceId, voice)` to `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` that calls `saveAionVoiceConfig`, reads top `ops.follow_up_queue` item, calls `getDealContextForAion`, and returns the draft result.
4. Wire `VoiceSetupCard` submit to call that action and render the returned draft + channel inline.
5. On completion (or "Skip"), set `onboarding_state: 'complete'` via `updateAionConfigForWorkspace` so the card does not re-appear.
6. Add `CadenceLearningToggle` to the bottom of `VoiceSetupCard` (already drop-in compatible per its own comment).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `AionConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:226-256` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:300-338` — `buildGreeting` per-state branches
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route (live, auth-gated)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:972-1012` — current "Tune Aion's voice" entry point
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx` — drop-in cadence opt-in toggle
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
