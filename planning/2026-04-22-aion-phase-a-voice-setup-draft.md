# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-04-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Two premises in the question are outdated — both have since been built:

**`aion_config` does exist.** `public.workspaces.aion_config` is typed as `Json` at `src/types/supabase.ts:6306`. The three-field `AionVoiceConfig` type (`description`, `example_message`, `guardrails`) is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:11–15`. A `saveAionVoiceConfig(voice)` server action exists at the same file, line 161, and deep-merge via `updateAionConfigForWorkspace` is at line 192.

**The draft route is live.** `POST /api/aion/draft-follow-up/route.ts` accepts `{ context: AionDealContext, workspaceId }`, gates on Aion tier, reads `aion_config.voice` from the workspace, calls `generateFollowUpDraft()` (defined at `src/app/api/aion/lib/generate-draft.ts:25`), and injects voice config into the system prompt via `buildFollowUpPrompt` (same file, line 35).

**What genuinely does not exist:**

The `/settings/aion` page (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) only handles card-beta consent and cadence learning. There is no UI form for the three voice fields. Voice config today can only be set conversationally — the Aion Chat's `save_voice_config` tool call (tool defined in `src/app/api/aion/chat/tools/core.ts` around line 115) is the only write path a user can trigger.

**One latent bug to verify:** `saveAionVoiceConfig` at line 174 uses the authenticated server client, not the system client. The comment at line 139 of the same file notes that `public.workspaces` has no UPDATE RLS policy for authenticated callers and must route through service role. If this is accurate, `saveAionVoiceConfig` silently updates zero rows. `updateAionConfigForWorkspace` at line 192 correctly uses the system client.

## Intended state

Daniel opens a voice profile section, fills in three plain-text fields ("how you talk to clients," "an example message you're proud of," "rules Aion should never break"), saves, and immediately sees a real draft for a real open deal rendered below the form. The voice config then propagates automatically to every subsequent `generateFollowUpDraft` call — no extra wiring needed, because `draft-follow-up/route.ts` already reads `aion_config.voice` on every request.

## The gap

- No form UI for `AionVoiceConfig` (description, example_message, guardrails)
- No "test draft" trigger in settings after saving voice config
- `saveAionVoiceConfig` may use the wrong Supabase client (needs system client, not server client)
- `draft-follow-up` needs an `AionDealContext` — a test-draft flow needs to fetch the most recent open deal to provide it

## Options

### Option A: Voice profile section in `/settings/aion`

- **What it is:** Add a new `StagePanel` section to `AionSettingsView.tsx` with three textareas mapping to `AionVoiceConfig`, wired to a fixed `saveAionVoiceConfig` server action. On successful save, a server-fetched "test draft" renders below using the workspace's most recently updated open deal as context — a single query to `public.deals WHERE status = 'open' ORDER BY updated_at DESC LIMIT 1`.
- **Effort:** Small — one component section, one server action fix (client swap), one server fetch for most-recent deal, one fetch to `/api/aion/draft-follow-up`.
- **Main risk:** The test draft requires an open deal to exist. First-time workspaces with no deals get no preview. Mitigate with a placeholder message ("Add a deal to see a sample draft").
- **Unlocks:** Voice config is writable via form from day one. Every existing `generateFollowUpDraft` call immediately benefits. No architectural change.

### Option B: Structured onboarding in Aion Chat first visit

- **What it is:** Replace `AionFirstVisitPrompt.tsx` with a two-step modal: Step 1 is the three voice fields (same fields, same server action), Step 2 shows an immediate draft using the most recently touched deal. After completing, transitions to the full chat interface with `onboarding_state: 'voice_complete'` written to `aion_config`.
- **Effort:** Medium — requires step/modal state, the same server action fix, deal fetch, and draft call. The onboarding flow also needs to be skippable and re-triggerable via settings later.
- **Main risk:** Once dismissed, voice config is hard to find and edit. Users who want to refine their voice profile after onboarding have nowhere to go unless Option A is also built.
- **Unlocks:** First-use voice setup with a guided, contextual feel. Sets `onboarding_state` which other parts of the Aion system already key off.

### Option C: Brain sub-tab in the deal lens

- **What it is:** Add a "Brain" tab inside the deal detail view alongside existing tabs. The tab shows the voice form + a live draft for that specific deal. Saving voice config here is immediately validated against the client you're looking at, making the feedback maximally relevant.
- **Effort:** Large — the deal lens tab system is complex, this touches multiple layers of the deal layout, and any regression in the Plan or Proposal tabs is painful.
- **Main risk:** Architectural coupling. The deal lens is already dense. A voice profile form belongs to the workspace, not to a single deal — embedding it there is conceptually awkward for a second visit.
- **Unlocks:** Highest-fidelity first experience, but the benefit over Option A is marginal once voice config is saved — `draft-follow-up` already scopes the draft to the deal in the Follow-Up Card.

## Recommendation

**Ship Option A.** It is the minimum path with no architectural risk. All three fields, the server action, and the draft generation route already exist — the only missing pieces are the form component, the client-fix in `saveAionVoiceConfig`, and the deal fetch for the preview.

Option B requires more state management and still needs a settings-page fallback for re-editing voice config later, so you'd build Option A anyway. Option C is a meaningful UX improvement but premature before voice setup is functional at all.

The one thing to validate immediately: check whether `public.workspaces` has an UPDATE RLS policy for authenticated users. If not, swap the `supabase` client at `aion-config-actions.ts:174` to `getSystemClient()` (matching `setLearnOwnerCadence` at line 141). Without this fix, the form saves but the voice config is never actually written.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a new `StagePanel` section after the cadence learning block with three `<textarea>` fields for `description`, `example_message`, and `guardrails`. Use `useActionState` to wire to `saveAionVoiceConfig`.
2. Fix `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:174` — swap the server client for `getSystemClient()` (same pattern as `setLearnOwnerCadence` at line 141).
3. In the `/settings/aion/page.tsx` server component, fetch the most recent open deal (`public.deals WHERE status = 'open' ORDER BY updated_at DESC LIMIT 1`) and pass it as a prop.
4. After a successful voice save, POST to `/api/aion/draft-follow-up` with the fetched deal context and render the response in a read-only block below the form.
5. Populate `aion_config.onboarding_state = 'voice_complete'` on first save so the Aion Chat first-visit prompt knows setup is done.
6. Manual test: save voice config in settings, open the deal Follow-Up Card, trigger a new draft — confirm your tone shows up.

## References

- `src/types/supabase.ts:6306` — `aion_config` column on `public.workspaces`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:11–65` — `AionVoiceConfig`, `AionConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:161` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:192` — `updateAionConfigForWorkspace` (uses system client correctly)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (no voice form)
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint with tier gate + voice injection
- `src/app/api/aion/lib/generate-draft.ts:25–46` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/chat/tools/core.ts:~115` — `save_voice_config` chat tool (current only write path)
- `src/app/(dashboard)/(features)/aion/components/AionFirstVisitPrompt.tsx` — onboarding nudge (not read in detail)
