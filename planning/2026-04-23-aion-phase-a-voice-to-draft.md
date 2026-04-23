# Aion Phase A: voice setup to first real draft

_Researched: 2026-04-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question is now outdated. Research shows the infrastructure is substantially built.

**`aion_config` exists.** Migration `supabase/migrations/20260407140000_aion_voice_foundation.sql:6-7` adds `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. The generated types reflect it at `src/types/supabase.ts:6561`.

**The voice type is defined and the save action is ready.** `AionVoiceConfig { description, example_message, guardrails }` is typed at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:11-15`. `saveAionVoiceConfig()` exists at line 161 of that file.

**A 5-state onboarding machine routes the voice collection.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237-246` maps config state to: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a matching greeting prompt in `buildGreeting()` at `src/app/api/aion/chat/route.ts:859-900`. Voice is NOT collected via a form — Aion asks Daniel conversationally and saves each piece via the `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:115-132`).

**The draft generation pipeline is fully implemented.** `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25-46` calls `ai`'s `generateText`, builds a real system prompt, and injects voice at lines 63-75 when `voice.description`, `voice.example_message`, or `voice.guardrails` are set. The `/api/aion/draft-follow-up` route (`src/app/api/aion/draft-follow-up/route.ts:1-73`) is fully implemented with auth, a tier gate, a kill-switch check, and model call.

**The Follow-Up Card wires it.** At `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:338-370`, the card calls `getDealContextForAion()` then POSTs to `/api/aion/draft-follow-up`. `getDealContextForAion` at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545-611` assembles deal + client + proposal + history.

**The Brain tab is not hard-blocked.** `src/app/(dashboard)/aion/page.tsx` renders `ChatInterface` with `viewState="chat"` (`AionPageClient.tsx:73`). The "paused" gate is `aion_config.kill_switch === true` in the API; the chat interface itself renders. `ChatInterface` calls `/api/aion/chat` (`ChatInterface.tsx:207`), not the legacy `/api/aion` stub.

**Tier gating exists.** `canExecuteAionAction(workspaceId, 'active')` at `src/features/intelligence/lib/aion-gate.ts` checks workspace subscription tier before allowing draft generation. Foundation tier fails this check.

## Intended state

Daniel opens the Brain tab, which greets him with the `no_voice` onboarding prompt. He describes his communication style through a short conversation. Aion saves each piece to `aion_config.voice`. He then goes to an active deal, opens the Follow-Up Card, clicks "Draft with Aion", and gets a message that sounds like him. The voice config persists for all future drafts.

## The gap

The system is built. The gaps are operational:

- **Tier gate may block draft.** `/api/aion/draft-follow-up` gates on `canExecuteAionAction(workspaceId, 'active')`. If the dev workspace is on Foundation tier, drafts return 403. Unknown whether Daniel's dev workspace is provisioned as Growth or Studio.
- **`saveAionVoiceConfig` may fail silently on RLS.** The function at `aion-config-actions.ts:168-177` uses `createClient()` (server cookie session, respects RLS). A comment in the same file at line 139 says workspaces has no UPDATE RLS policy for authenticated callers — `setLearnOwnerCadence()` routes through the system client for exactly this reason. The `save_voice_config` chat tool may have the same issue. If voice saves are silently failing, Daniel's descriptions disappear and drafts are always voiceless.
- **No review/edit surface.** Once voice is set via chat, there is nowhere to see or edit what was captured. If the conversation was awkward or cut short, Daniel has no way to fix it except chatting again.
- **Primer is 13 days stale.** It describes the system as of 2026-04-10 and lists Phase 2 prerequisites as not started. All of them now exist.

## Options

### Option A: Verify and fix end-to-end
- **What it is:** Run the full flow in dev — open Brain tab, complete voice onboarding via chat, then trigger a Follow-Up Card draft. Fix the two potential blockers: confirm the dev workspace tier is Growth/Studio, and test whether voice saves via `save_voice_config` tool actually persist (add logging or a quick DB check). Patch `saveAionVoiceConfig` to use system client if the RLS check fails.
- **Effort:** Small (2–4 hours)
- **Main risk:** Tier gate might require a DB update to the dev workspace `tier_config`. That's a one-line SQL change but requires knowing the current tier.
- **Unlocks:** Daniel's stated goal is fully reachable via the existing conversational onboarding flow.

### Option B: Add a voice config settings page
- **What it is:** Build `/settings/aion-voice` — a three-field form (description textarea, example message textarea, guardrails textarea) that saves to `aion_config.voice` via the system client. Adds a clear "write my 3 paragraphs" entry point matching Daniel's mental model from the queue entry.
- **Effort:** Medium (4–8 hours, new route + form + server action)
- **Main risk:** Creates two surfaces for voice config (chat onboarding + form). They need to stay in sync; if one clears and the other doesn't, voice state becomes confusing.
- **Unlocks:** Non-conversational setup path. More auditable — Daniel can see exactly what's saved.

### Option C: Update the primer and reassess
- **What it is:** Rewrite the primer's "current notable state" section to reflect reality. Re-fire the research agent on a narrower follow-up question once Daniel confirms whether the flow actually works in his dev environment.
- **Effort:** Tiny (30 min)
- **Main risk:** Doesn't fix anything — the RLS issue and tier gate remain unknown.
- **Unlocks:** Accurate planning context. Future queue items won't start from a wrong premise.

## Recommendation

**Option A.** The system is built; the goal is to confirm it works and fix the two concrete blockers. Start by checking the dev workspace tier (`SELECT tier FROM public.tier_config WHERE workspace_id = '<dev-id>'`) and verifying a voice save persists (`SELECT aion_config FROM public.workspaces WHERE id = '<dev-id>'` before and after completing the Aion onboarding chat). If `saveAionVoiceConfig` is failing on RLS, switch it to use the system client with the same membership check pattern used by `setLearnOwnerCadence` (lines 128-134 of `aion-config-actions.ts`). This is a 2-line fix. Option B's settings page is genuinely useful but not the minimum path — add it after confirming the chat flow works. Option C alone is insufficient; the RLS risk is real enough to investigate now.

## Next steps for Daniel

1. Check dev workspace tier: `SELECT id, tier FROM public.tier_config WHERE workspace_id = '<your-dev-workspace-id>';` in the SQL editor. Upgrade to `growth` if needed.
2. Open the Brain tab in dev. Confirm the `no_voice` greeting appears ("How would you describe your style?").
3. Complete the 3-step onboarding conversation. Then run: `SELECT aion_config FROM public.workspaces WHERE id = '<your-dev-workspace-id>';` and confirm `voice.description` is set.
4. If voice is empty after step 3, the RLS bug is confirmed. Fix: in `aion-config-actions.ts:168`, replace `createClient()` with the system-client pattern from `setLearnOwnerCadence:127-146` (membership check + system write).
5. Go to a deal with a pending follow-up. Open the Follow-Up Card and click "Draft with Aion". Confirm the draft sounds like the voice you set.
6. Update `planning-primer.md` "current notable state" to reflect that Phase A infrastructure is shipped — the chat onboarding, draft pipeline, and Follow-Up Card wiring all exist.

## References

- `supabase/migrations/20260407140000_aion_voice_foundation.sql:6-7` — `aion_config` column
- `src/types/supabase.ts:6561` — `aion_config: Json` in workspaces Row type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:11-15, 139-179` — `AionVoiceConfig`, RLS note, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237-246` — 5-state `getOnboardingState`
- `src/app/api/aion/chat/route.ts:183-204, 859-900` — kill-switch, onboarding routing, `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts:115-132` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:25-75` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/draft-follow-up/route.ts:44-56` — tier gate, kill-switch check
- `src/features/intelligence/lib/aion-gate.ts` — `canExecuteAionAction` tier logic
- `src/app/(dashboard)/(features)/crm/components/follow-up-card.tsx:338-370` — draft call in Follow-Up Card
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545-611` — `getDealContextForAion`
- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — Brain tab renders ChatInterface with `viewState="chat"`
- `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:207` — calls `/api/aion/chat`
