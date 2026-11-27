# Aion Phase A: Voice setup + first real draft

_Researched: 2026-11-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Note on assumed blockers:** Both prerequisites named in the question have been resolved since it was written (the primer dates from 2026-04-10). `aion_config` is live, and the Brain tab is a full chat interface. The gap is now UX-side: there is no first-class form for voice setup, and the test-draft feedback loop is missing. The options below focus on closing that gap.

## Current state

**`aion_config` exists on `public.workspaces`**, typed as JSONB with a full `AionConfig` shape (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`). It includes `voice: { description, example_message, guardrails }`, `learned`, `follow_up_playbook`, `kill_switch`, and `learn_owner_cadence`.

**`saveAionVoiceConfig` is a live server action** (`aion-config-actions.ts:178`) that merges explicit voice values and clears the `voice_default_derived` flag.

**`/api/aion/draft-follow-up` is live** (`src/app/api/aion/draft-follow-up/route.ts:1`). It authenticates the caller, checks the tier gate, reads the workspace voice config via `getAionConfigForWorkspace`, then calls `generateFollowUpDraft` which injects voice into the system prompt (`src/app/api/aion/lib/generate-draft.ts:62`).

**The Brain tab is a full chat interface** (`src/app/(dashboard)/aion/AionPageClient.tsx:66`), rendering `ChatInterface`. Not paused.

**A 5-state onboarding machine exists** (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route and system prompt both respect this state (`src/app/api/aion/chat/route/prompts.ts:284`).

**The Wk 11 bypass (§3.8):** `getOnboardingState` short-circuits to `configured` when `voice_default_derived=true` (`aion-chat-types.ts:248`). `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name on every config read (`aion-config-helpers.ts:35`), so all new workspaces with no explicit voice are treated as `configured` immediately — the 4-step chat onboarding never fires.

**Voice reset lives in the sidebar overflow**: `resetAionVoiceConfig` is called from `AionSidebar.tsx:1002` via "Tune Aion's voice" — a secondary affordance buried in an overflow menu.

**No voice setup form exists** anywhere in the app. `/settings/aion/page.tsx` covers only the deal card beta consent, cadence opt-in, and memory backfill — no voice fields.

## Intended state

Daniel opens the Brain tab (or settings), writes how he communicates with clients in free-form prose, and within that session sees a follow-up draft that uses his stated style. The 3-field shape (`description`, `example_message`, `guardrails`) maps well to "3 paragraphs" — but the user shouldn't have to know the field names.

The existing chat onboarding was designed for exactly this flow, but was bypassed (Wk 11) because step-by-step questions felt slow for motivated users. A direct form removes that friction while keeping the same backend.

## The gap

- No voice setup form in the product (only conversational via sidebar overflow → chat)
- Voice setup is hidden: requires knowing about "Tune Aion's voice" in the sidebar overflow
- No "test draft" feedback loop after saving voice — draft generation requires going to a deal's follow-up card
- The `needs_test_draft` chat state has a handler (`prompts.ts:291`) but is never reached under the Wk 11 bypass
- Generating a test draft in the Brain tab requires a live deal with queue context; there is no synthetic fixture for it

## Options

### Option A: Voice setup form in /settings/aion/

- **What it is:** Add 3 labeled textareas to the existing `/settings/aion/` page — "How you write to clients," "Example message," "Rules." A "Save and test draft" button calls `saveAionVoiceConfig` then fetches a draft from `/api/aion/draft-follow-up` using either the first open deal in the follow-up queue or a hardcoded synthetic scenario if the queue is empty.
- **Effort:** Small — 1 form component (~150 lines), no new API routes, no schema changes.
- **Main risk:** Test draft without a real deal requires a synthetic deal fixture; it may feel generic if the queue is empty.
- **Unlocks:** Daniel can paste all 3 paragraphs at once and see a draft in the same page load. No chat session required.

### Option B: First-run prompt in the Brain tab

- **What it is:** When `voice_default_derived=true`, show a surface card in the Brain tab: "Aion is using a placeholder voice. Tell it how you actually write." This opens an inline form (the same 3 textareas) that collapses after save and immediately injects a test draft into the chat history.
- **Effort:** Small-medium — requires adding state to `AionPageClient`/`ChatInterface`, or a banner component in the layout. Chat injection needs a synthetic first message.
- **Main risk:** Interrupts the Brain tab's current clean cold-open experience; wires form state into the chat layer.
- **Unlocks:** Discoverability — users encounter voice setup without going to settings.

### Option C: Remove the Wk 11 bypass for brand-new workspaces

- **What it is:** Change `getOnboardingState` so `voice_default_derived=true` only short-circuits to `configured` when the workspace has at least one deal. For empty workspaces, let the `no_voice` chat onboarding fire naturally.
- **Effort:** Tiny — 1–3 lines in `aion-chat-types.ts`, but requires passing deal count into the function (currently it takes only `AionConfig`).
- **Main risk:** Existing users who've never configured voice (and have deals) are unaffected, but the function signature change propagates to all callers. The chat-based flow still doesn't support "paste 3 paragraphs" easily — it asks one question at a time.
- **Unlocks:** Day-0 workspaces get voice onboarding in the existing chat flow with no new UI.

## Recommendation

**Option A: voice setup form in /settings/aion/.** The backend is 100% built. `saveAionVoiceConfig` exists, `draft-follow-up` is live, and `AionVoiceConfig` already has 3 fields that map directly to 3 textarea prompts. The only work is a UI form component and a "test draft" call that picks the first pending follow-up or falls back to a synthetic context. Options B and C add discoverability but not the form itself — ship Option A first, then surface it via a banner (Option B) in the next pass.

For the test draft fallback: query `ops.follow_up_queue` for the first open item in the workspace. If the queue is empty, pass a minimal synthetic context (fictional deal title + reason "no reply in 7 days"). The draft will still demonstrate the voice even without real data.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a `VoiceConfigSection` component below the main card beta status panel.
2. The component: 3 labeled textareas bound to `description`, `example_message`, `guardrails`. "Save" calls `saveAionVoiceConfig`. "Save and test draft" calls save, then POSTs to `/api/aion/draft-follow-up` with deal context from step 3.
3. For draft context: call `supabase.schema('ops').from('follow_up_queue').select(...).eq('workspace_id', workspaceId).eq('status', 'open').limit(1)` to get the first real deal. Fall back to `{ deal: { title: 'Sample show', status: 'proposal' }, followUp: { reason: 'No reply in 7 days', suggested_channel: 'email', recent_log: [] }, client: { name: 'Sample Client', contact_first_name: 'Alex', past_deals_count: 1 }, proposal: null }` if empty.
4. Render the returned draft inline below the form in a read-only code/text block.
5. Update the `/settings/aion/page.tsx` server component to load current `aion_config.voice` and pass it as `initialVoice` to `AionSettingsView`.
6. Ship — no migration needed, no new routes, no schema changes.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfigForWorkspace`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState` machine, `getOnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for new form
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding state handling in system prompt
