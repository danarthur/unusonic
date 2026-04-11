# Aion Phase A: voice setup form + first real follow-up draft

_Researched: 2026-04-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Brain tab** (`src/app/(dashboard)/brain/page.tsx:1-20`): A static placeholder — "Brain Mode is paused." No interactive surface. The tab exists in navigation but does nothing.

**Aion API route** (`src/app/api/aion/route.ts:1-16`): A 16-line stub. Calls GPT-4-turbo via `@ai-sdk/openai`, streams the response, but has no auth guard, no workspace scoping, and no deal context. Any request, authenticated or not, gets through.

**UI components exist but are unwired from the internal route.** `AionInput.tsx`, `AionVoice.tsx`, and `ChatInterface.tsx` all call `SessionContext.sendMessage`, which posts to `NEXT_PUBLIC_AION_VOICE_WEBHOOK` — an external webhook URL, not `/api/aion` (`src/shared/ui/providers/SessionContext.tsx:192-220`). Sessions are stored in localStorage. The internal `/api/aion/route.ts` is not called by any UI today.

**`public.workspaces` has no `aion_config` column.** The table has `aion_actions_used`, `aion_actions_reset_at`, `autonomous_addon_enabled` (added by `20260402120100_tier_config_and_workspace_columns.sql:40-45`), but nothing to store voice style notes or persona configuration.

**Follow-up engine Phase 1 is live.** `ops.follow_up_queue` and `ops.follow_up_log` exist, the cron engine scores deals, and `FollowUpCard` renders in the Deal Lens (`src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx`). The `suggested_action` on a queue item is a hardcoded template string from `buildReasonText()` (`src/app/api/cron/follow-up-queue/route.ts:352-403`) — not AI-generated.

**No `getDealContextForAion` server action exists.** Nothing in the codebase assembles deal context (title, status, client, event date, proposal state, follow-up history) for the AI layer.

**`ArthurInput.tsx` is empty** (`src/app/(dashboard)/(features)/brain/components/ArthurInput.tsx`): one line, legacy brand name, safe to delete.

## Intended state

Daniel opens the Brain tab, fills in a free-form textarea describing how he communicates with clients ("voice notes" — tone, vocabulary, typical phrases). He saves it. When he opens a deal with a pending follow-up, there's a "Draft with Aion" affordance in the FollowUpCard. Clicking it calls `/api/aion/draft-follow-up` with the deal's context snapshot plus the workspace voice notes. Aion returns a short draft in Daniel's voice. He edits it, logs it, moves on.

This does not require wiring the full chat interface. It's a single-purpose endpoint: deal context in, voice-aware draft out.

## The gap

- `public.workspaces.aion_config` column does not exist — no place to store voice notes
- Brain tab is a placeholder — no voice setup form
- `/api/aion/route.ts` has no auth guard — unauthenticated requests succeed
- No `/api/aion/draft-follow-up` endpoint
- No `getDealContextForAion` server action to assemble deal context
- `FollowUpCard` has no "Draft with Aion" affordance
- `ArthurInput.tsx` is an empty legacy file that should be deleted

## Options

### Option A: Full Phase A slice — schema + form + draft endpoint + FollowUpCard wire
- **What it is:** One migration adds `aion_config JSONB DEFAULT '{}'::jsonb` to `workspaces`. Brain tab gets a voice setup form (textarea, save button) that writes to `aion_config.voice_notes`. `/api/aion/route.ts` gets an auth guard. A new `/api/aion/draft-follow-up` route accepts deal context + voice notes and returns a streaming draft. FollowUpCard gets a "Draft with Aion" button that calls the new endpoint and shows the result inline.
- **Effort:** Medium — 1 migration, 2 server actions, 1 new API route, 2 component edits
- **Main risk:** The FollowUpCard wire touches a component that's already in production and well-tested. If the streaming UX is clunky, it degrades the existing follow-up flow.
- **Unlocks:** The end-to-end goal Daniel described. First real Aion output visible to users. Foundation for richer context injection in Phase A+1.

### Option B: Schema + form only, defer the draft integration
- **What it is:** Add `aion_config` column. Build the voice setup form on the Brain tab. Fix the auth guard on `/api/aion/route.ts`. Stop there — no draft endpoint, no FollowUpCard changes.
- **Effort:** Small — 1 migration, 1 component, 1 route fix
- **Main risk:** The form saves data nobody reads yet. Low motivation to fill it in — Daniel gets no immediate reward for the setup step.
- **Unlocks:** Unblocks Phase A+1 implementation (schema is ready), but delivers no visible output.

### Option C: Conversational voice capture via ChatInterface
- **What it is:** Fix `/api/aion/route.ts` with auth + workspace context. Wire `ChatInterface` / `SessionContext` to the internal route instead of the external webhook. Use a system prompt that tells Aion to listen for voice descriptions and extract a "voice signature" to write back to `aion_config`. Daniel describes his style in chat; Aion extracts and persists it.
- **Effort:** Large — requires fixing the divergent `SessionContext` webhook path, adding a structured extraction pass, building a write-back server action
- **Main risk:** Complex, fragile extraction step. Hard to test. The circular dependency (you configure the AI via the AI) is elegant in theory but brittle until the model and prompt are tuned. Longer path to shipping.
- **Unlocks:** More "magical" Brain tab experience, but only after significant engineering work.

## Recommendation

**Option A.** The question is about connecting a visible, testable loop: Daniel writes how he talks → Aion drafts in that style → Daniel sees it immediately on a real pending follow-up. Option B saves data nobody reads and has no feedback loop. Option C is the right long-term UX but the wrong next step when Phase 1 infrastructure hasn't been exercised yet.

The one constraint to respect with Option A: don't touch `SessionContext`'s webhook path or the existing ChatInterface. The draft endpoint should be a standalone POST (`/api/aion/draft-follow-up`) called directly from FollowUpCard via `fetch`, not routed through the chat session machinery. This keeps the scope contained and avoids breaking the existing (if unwired) chat components.

The FollowUpCard change can be minimal: a small secondary button "Draft a message" that shows a loading state, then replaces the note textarea placeholder with the Aion draft. If the call fails, the user still has the manual textarea. No regression risk.

## Next steps for Daniel

1. **Write and apply the migration.** Add `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS aion_config JSONB NOT NULL DEFAULT '{}'::jsonb;` — run in Supabase SQL editor, then `npm run db:types` (re-append the `Proposal`, `Package` etc. aliases after regen).
2. **Replace `src/app/(dashboard)/brain/page.tsx`** with a voice setup form: a `<textarea>` bound to a server action that reads/writes `workspaces.aion_config.voice_notes`. Use `StagePanel`, `stage-readout` typography. ~60 lines.
3. **Add auth guard to `src/app/api/aion/route.ts`.** Import `createClient` from `server.ts`, call `supabase.auth.getUser()`, return 401 if not authenticated. Remove the GPT-4-turbo placeholder or leave it for the chat path.
4. **Create `src/app/api/aion/draft-follow-up/route.ts`.** POST endpoint: reads `workspaceId` + `dealContext` from request body (validated with Zod), fetches `aion_config.voice_notes` from the workspace row, calls `streamText` with a focused prompt. Auth guard required.
5. **Add a `getDealContextForAion` server action** in `src/app/(dashboard)/(features)/crm/actions/`. Queries `deals` (title, status, proposed_date), `proposals` (status, view_count), and `ops.follow_up_queue` (reason, suggested_action) for a given deal. Returns a flat DTO the endpoint can stringify into the prompt.
6. **Add "Draft a message" button to `FollowUpCard`** (`src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:334-368`). Calls `getDealContextForAion`, POSTs to `/api/aion/draft-follow-up`, streams the response into the note textarea.

## References

- `src/app/(dashboard)/brain/page.tsx` — current placeholder
- `src/app/api/aion/route.ts` — unauthenticated stub
- `src/shared/ui/providers/SessionContext.tsx:173-282` — sendMessage posts to external webhook
- `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:241-388` — FullFollowUpCard, InlineLogForm
- `src/app/api/cron/follow-up-queue/route.ts:352-403` — buildReasonText (template-only today)
- `supabase/migrations/20260402120100_tier_config_and_workspace_columns.sql` — existing workspace column pattern
- `src/app/(dashboard)/(features)/crm/actions/get-deal.ts` — server action pattern to follow for getDealContextForAion
