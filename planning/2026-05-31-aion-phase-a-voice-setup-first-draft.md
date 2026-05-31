# Aion Phase A: Voice setup + first real draft

_Researched: 2026-05-31 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written against the primer dated 2026-04-10. The premises have changed significantly since then — see Current state below._

---

## Current state

The infrastructure described as missing is shipped.

**`public.workspaces.aion_config`** exists (`src/types/supabase.ts:7689`). It is typed as `Json` and stores `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, and `voice_default_derived`.

**`/api/aion/chat/route.ts`** is a 451-line production endpoint — not a 16-line stub. It is auth-guarded (`src/app/api/aion/chat/route.ts:57–73`), loads `aion_config` (`route.ts:107–119`), and routes through a 4-step onboarding state machine on every request.

**The 4-step voice onboarding is live.** `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) maps config fields to: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state injects a prompt directive into the system prompt (`src/app/api/aion/chat/route/prompts.ts:275–282`). Step 4 calls the `draft_follow_up` chat tool directly in-conversation.

**`draft_follow_up` tool** (`src/app/api/aion/chat/tools/core.ts:318`) fetches the top-priority deal from `ops.follow_up_queue`, loads deal + client + proposal context via `getDealContextForAion`, enriches with semantic memory search, and calls `/api/aion/draft-follow-up` which is also a standalone 73-line authenticated endpoint.

**The "Brain tab"** as a separate paused surface no longer exists. Aion lives at `/aion` (full chat interface, `src/app/(dashboard)/aion/page.tsx`), with a deal-embedded thread card per deal page.

**One catch:** `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:99, 119`) synthesizes a voice from the workspace name on every config read when voice is absent. When `voice_default_derived === true`, `getOnboardingState` returns `'configured'` immediately — **bypassing the 4-step flow entirely**. New workspaces skip onboarding.

**Re-tuning entry point:** sidebar overflow → "Tune Aion's voice" calls `resetAionVoiceConfig()` (`aion-config-actions.ts:209`), which clears `voice_default_derived` and re-enables the onboarding flow. This affordance is not prominently surfaced.

---

## Intended state

Daniel opens `/aion`, types 3 paragraphs about his communication style, and Aion immediately generates a draft for the top-priority deal that mirrors his voice. The loop is: describe style → confirm example → set guardrails → get draft.

This is the exact 4-step conversation onboarding flow that is implemented. The gap is purely in discoverability: the flow fires on first open only if `voice_default_derived` is false, which it isn't for most workspaces.

---

## The gap

- The pipeline (voice → draft) is fully built and correct.
- New workspaces get a synthesized default voice and never see the onboarding conversation.
- The only path to the onboarding conversation is a buried sidebar overflow item ("Tune Aion's voice").
- The `/settings/aion` page offers consent and memory controls but no voice setup UI (`AionSettingsView.tsx:33`).
- No first-run nudge exists for workspaces with `voice_default_derived === true`.

---

## Options

### Option A: Use what exists, no changes
- **What it is:** Call `resetAionVoiceConfig()` manually (sidebar overflow) to clear the derived default, then open `/aion`. The 4-step onboarding conversation fires immediately.
- **Effort:** Zero code — done in ~2 minutes from the running app.
- **Main risk:** Requires knowing the sidebar overflow exists; not a durable fix for new workspaces.
- **Unlocks:** Immediate test of the full voice → draft loop with the live system.

### Option B: Add a greeting chip for voice setup
- **What it is:** In `src/app/api/aion/lib/greeting-chips.ts`, add a chip ("How I write") that appears when `voice_default_derived === true`. Clicking it calls `resetAionVoiceConfig()` client-side and triggers the 4-step onboarding in the same chat session.
- **Effort:** Small — greeting chips already have a slot system. One chip definition, one client action, no new endpoints or schema changes.
- **Main risk:** Chip ordering / visibility rules need to be checked so it doesn't crowd existing chips.
- **Unlocks:** Every new workspace gets a visible first-run path to voice setup. Onboarding conversion improves.

### Option C: Voice setup form in `/settings/aion`
- **What it is:** Add three textarea fields (communication style, example message, guardrails) to `AionSettingsView.tsx` that write directly via `saveAionVoiceConfig()`. After saving, redirect to `/aion` with a `?startDraft=1` query param that triggers `draft_follow_up` on mount.
- **Effort:** Medium — new UI section, server action, query param handler in `ChatInterface`.
- **Main risk:** Duplicates the onboarding conversation flow outside the chat paradigm. Two paths to the same state create consistency risk.
- **Unlocks:** Users who prefer a form over a conversation can set up voice without chat interaction.

---

## Recommendation

Do Option A first (now, ~2 minutes) to validate the live pipeline. Then ship Option B.

Option A proves the end-to-end loop is wired correctly in your workspace before writing any code. The 4-step chat onboarding is a good experience — the problem is just that it's hidden behind a default-derived voice.

Option B is the right permanent fix: one chip in `greeting-chips.ts` surfaces the onboarding path for workspaces that got a synthetic default. It costs half a day, requires no schema changes, and stays within the conversational paradigm (chat owns onboarding, settings owns management). Option C is over-engineered for what is essentially a discoverability problem.

Skip C unless user research shows people prefer forms over chat for initial setup — that's not worth building speculatively.

---

## Next steps for Daniel

1. **Verify the loop works today:** From `/aion` sidebar overflow → "Tune Aion's voice" → type 3 paragraphs in chat → confirm example → set guardrails → Aion generates a draft. If this works, the Phase A goal is already met.
2. **If the draft is poor:** Check `aion_config.voice` in Supabase Studio (`workspaces` row) to confirm `save_voice_config` tool actually persisted the description/example/guardrails. If not, the tool call is silently failing.
3. **Ship the chip:** Add a `'how_i_write'` chip in `src/app/api/aion/lib/greeting-chips.ts` that appears when `voice_default_derived === true`. Chip action: call `resetAionVoiceConfig()` then re-render the session with a greeting that opens step 1 of onboarding.
4. **Wire chip click client-side:** In `ChatInterface.tsx` suggestion chip handler (currently around line 420), add a case for `how_i_write` that fires the reset action before sending the chip as a message.
5. **Test with a fresh workspace** to confirm new users see the chip and can complete onboarding without touching the sidebar.

---

## References

- `src/app/api/aion/chat/route.ts` — main chat endpoint, onboarding state loading
- `src/app/api/aion/chat/route/prompts.ts:275–282` — 4-step prompt injection per state
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:99,119,209` — `applyVoiceDefaultIfEmpty`, `resetAionVoiceConfig`
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/api/aion/lib/greeting-chips.ts` — chip slot system (target for Option B)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page (no voice form today)
