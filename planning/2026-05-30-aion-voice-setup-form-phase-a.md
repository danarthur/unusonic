# Aion Phase A: Voice Setup Form + First Draft

_Researched: 2026-05-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's description is significantly outdated. Here is what the codebase actually contains:

**`aion_config` column exists.** `public.workspaces.aion_config` is a `jsonb` column with default `{}`. Defined in `supabase/migrations/20260101000000_baseline_schema.sql:15058` and typed in `src/types/supabase.ts:7689`.

**Voice config types are fully defined.** `AionVoiceConfig` has three fields: `description`, `example_message`, `guardrails`. Defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`. Server actions `saveAionVoiceConfig()` (line 178) and `resetAionVoiceConfig()` (line 214) are implemented.

**Brain tab is wired.** `src/app/(dashboard)/aion/AionPageClient.tsx:1-76` mounts `<ChatInterface viewState="chat" workspaceId={workspaceId} />`. The "unwired" description in the primer is outdated.

**Chat API is fully implemented.** `src/app/api/aion/chat/route.ts` is 450 lines — auth guard, tier gate, config load, tool assembly, streaming response. Kill switch check at line 109: when `aion_config.kill_switch` is true, the route returns a "paused" message through the chat thread (no dedicated UI block).

**Draft-follow-up route exists.** `src/app/api/aion/draft-follow-up/route.ts:1-73` takes `{ context: AionDealContext, workspaceId }`, calls `generateFollowUpDraft({ context, voice: aionConfig.voice })`, returns `{ draft, channel: 'sms' | 'email' }`.

**`getDealContextForAion` exists.** `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-609`. Fully implemented; already called by the Follow-Up Card in the Deal Lens.

**Voice setup is conversational, not a form.** The 4-step onboarding lives inside the chat flow. No standalone form exists. The "Tune Aion's voice" button in `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1043` calls `resetAionVoiceConfig()` to re-trigger the conversational flow.

**"Draft with Aion" exists on the Deal page.** `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx` has this button — it calls `/api/aion/draft-follow-up`. But it lives on the Deal page, not in the Brain tab.

## Intended state

Daniel opens the Brain tab, sees a first-run voice setup panel, pastes 3 paragraphs about how he communicates with clients, submits, and immediately sees a real Aion-generated follow-up draft for an open deal that reflects his voice. After that, the Brain tab becomes the live chat interface with voice locked in.

## The gap

- No standalone Voice Setup form. Voice setup is a 4-step conversational flow, not a form with text areas.
- No immediate draft trigger on voice setup completion. After onboarding finishes in chat, no deal draft is surfaced in the Brain tab.
- The "3 paragraphs" intent is not surfaced in any UI. `AionVoiceConfig` has the right 3-field structure already, but neither the onboarding flow nor any form presents it that way.
- Kill switch state is runtime. If `aion_config.kill_switch` is true in the DB, the Brain tab shows the chat UI but responds "paused" — with no form visible, voice setup is unreachable.

## Options

### Option A: Fix conversational onboarding + auto-draft at end
- **What it is:** Keep the chat-based onboarding. When all 4 steps complete, have the API pick the workspace's top `ops.follow_up_queue` item, call `getDealContextForAion`, and return a draft in the chat thread.
- **Effort:** Small
- **Main risk:** Conversational setup is slower and harder to iterate than pasting prose. The 4 back-and-forth turns add friction before Daniel sees anything useful.
- **Unlocks:** End-to-end flow without new UI components. Fast to ship.

### Option B: Free-form textarea + LLM extraction
- **What it is:** A first-run panel with one large textarea. User pastes prose. On submit, an LLM pass extracts `description`/`example_message`/`guardrails`, saves to `aion_config`, then triggers a draft.
- **Effort:** Medium
- **Main risk:** LLM extraction can misparse or hallucinate; harder to test reliably; adds a second model call before the draft.
- **Unlocks:** Exactly the "paste 3 paragraphs" UX as described. Maximum flow.

### Option C: 3-field form + immediate draft
- **What it is:** A first-run form panel in `AionPageClient.tsx`, rendered when `onboarding_state` is absent. Three labeled textareas mapping to the existing `AionVoiceConfig` fields. On submit: `saveAionVoiceConfig()`, fetch the top queue item for the workspace, call `getDealContextForAion` + `/api/aion/draft-follow-up`, surface the draft in the Brain tab, then transition to `<ChatInterface>`.
- **Effort:** Small-medium
- **Main risk:** Three labeled fields is slightly more structured than "3 paragraphs." Needs good placeholder copy to make the fields feel natural rather than bureaucratic.
- **Unlocks:** Reliable voice setup (no LLM extraction), immediate first draft, natural transition to live chat — all using existing infrastructure.

## Recommendation

Option C. The `AionVoiceConfig` schema already has the right 3-field shape — this is a UI problem, not a schema or API problem. Three labeled textareas with well-written placeholders will feel like "writing 3 paragraphs" to Daniel; the structure just guides what each paragraph is about.

All the hard work is already done: `saveAionVoiceConfig()` is the write path, `/api/aion/draft-follow-up` is the draft path, `getDealContextForAion` provides the deal context, and `onboarding_state` gates the first-run experience. The only new code is a `<VoiceSetupForm>` component and a small orchestration step that chains save → fetch top queue item → generate draft.

Option A is faster but delivers a worse experience: 4 chat turns of friction before any draft is seen. Option B is the purest interpretation of "3 paragraphs" but introduces a fragile LLM extraction step that isn't needed since the schema already has the right structure. Accept the tradeoff: labeled fields guide better writing and are trivially parseable.

## Next steps for Daniel

1. **Check kill switch.** In the Supabase Dashboard, run: `SELECT id, aion_config->'kill_switch' FROM public.workspaces WHERE id = '<your-workspace-id>'`. If true, set `aion_config = jsonb_set(aion_config, '{kill_switch}', 'false')`.
2. **Create `VoiceSetupForm.tsx`** at `src/app/(dashboard)/(features)/aion/components/VoiceSetupForm.tsx`. Three textareas for `description`, `example_message`, `guardrails` with placeholder copy; submit calls `saveAionVoiceConfig()`.
3. **Wire first-run gate in `AionPageClient.tsx`.** Load `getAionConfig()` in the page. Render `<VoiceSetupForm>` when `!config?.onboarding_state`. On form submit success, transition to `<ChatInterface>`.
4. **Add a `getDraftForTopQueueItem(workspaceId)` server action** that fetches the highest-priority `ops.follow_up_queue` item for the workspace, calls `getDealContextForAion`, then calls `/api/aion/draft-follow-up`. Surface the returned draft in the Brain tab as the first assistant message.
5. **Set `onboarding_state: 'complete'`** inside `saveAionVoiceConfig()` so the form doesn't re-render after first submit.
6. **Test end-to-end:** open `/aion` on a workspace with no `onboarding_state`, complete the form, confirm a draft appears referencing a real open deal.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab entry point
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16, 178, 214` — `AionVoiceConfig` type, save/reset actions
- `src/app/api/aion/chat/route.ts:109` — kill switch check
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-609` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx` — "Draft with Aion" button reference pattern
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1043` — "Tune Aion's voice" reset flow
- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column definition
- `src/types/supabase.ts:7689` — TypeScript type for `aion_config`
