# Minimum path to Aion voice setup and first follow-up draft

_Researched: 2026-04-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note:** The planning primer's description of current state is significantly outdated. Several things described as "not yet built" are already implemented. The analysis below reflects what the code actually contains.

---

## Current state

**The infrastructure is largely in place.** The primer's description of a "16-line GPT-4-turbo stub" and a missing `aion_config` column no longer matches the codebase.

- `public.workspaces.aion_config` exists as a non-null JSONB column (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). The `AionConfig` type (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50`) contains `voice`, `learned`, `follow_up_playbook`, `kill_switch`, `voice_default_derived`, and `learn_owner_cadence`.

- **Voice config schema** is `{ description, example_message, guardrails }` (`aion-config-actions.ts:12`). `saveAionVoiceConfig()` (line 178) is a working server action that merges these fields and writes to the workspace.

- **5-state onboarding machine** is fully wired in `/api/aion/chat/route.ts`. `getOnboardingState()` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`) evaluates the stored voice fields and returns one of: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route checks this on every request (line 267) and injects onboarding instructions into the system prompt.

- **`buildGreeting()`** (`chat/route.ts:967`) returns a tailored first message for each state — e.g., when `no_voice`, Aion opens with "How would you describe your style?" with three suggestion chips.

- **`save_voice_config` chat tool** (`src/app/api/aion/chat/tools/core.ts:118`) lets Aion call `saveAionVoiceConfig()` mid-conversation to persist what the user just said. It accepts `description`, `example_message`, `guardrails`, and `onboarding_complete` in one call.

- **`/api/aion/draft-follow-up/route.ts`** exists and is complete. It checks auth, kill_switch, generates a draft via `generateFollowUpDraft()`, and increments the action counter (`route.ts:1–73`).

- **`getDealContextForAion()`** exists (`src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545`).

- **Tier gate**: `canExecuteAionAction(workspaceId, 'active')` (`src/features/intelligence/lib/aion-gate.ts:42`) requires `aionMode: 'active'`, which maps to the "growth" tier and above (`src/shared/lib/tier-gate.ts:17`). Foundation workspaces are blocked from the chat entirely.

- **Settings page** (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) covers card-beta consent and cadence learning. It has no voice setup form.

---

## Intended state

Daniel opens the Aion page, writes how he talks to clients (style, an example, any guardrails), and immediately receives a follow-up draft for a real deal that sounds like him. The primer frames this as a "Brain tab," but the current product has a single `/aion` chat page — no separate tab.

The desired UX is: one screen, minimal friction, write once, see result. The conversational onboarding works but is spread across 3–4 separate chat turns.

---

## The gap

- No form UI for voice setup. The current path is chat-guided: Aion asks style, then example, then guardrails — three separate turns before reaching `needs_test_draft`. Daniel's stated goal ("write 3 paragraphs") describes a form.
- The settings page has no voice section.
- The tier gate will block the `/aion` chat if the workspace is on the foundation plan.
- `kill_switch` must be `false` — worth verifying before building UI.
- The primer is stale and will mislead future context loads. It should be updated to reflect what's actually built.

---

## Options

### Option A: Use the existing chat onboarding as-is
- **What it is:** Verify tier and kill_switch, then point Daniel at `/aion`. Aion's existing onboarding flow guides him through style → example → guardrails → test draft across 3–4 turns.
- **Effort:** Small (config check only, no code)
- **Main risk:** The 4-turn back-and-forth doesn't match the "write it once" mental model. Daniel may find it slower than expected.
- **Unlocks:** First real draft today, zero code. Validates the end-to-end flow.

### Option B: Add a voice setup form to `/settings/aion`
- **What it is:** A 3-field form (style description, example message, guardrails) in the Aion settings page. Submits to the existing `saveAionVoiceConfig()` server action. After save, links to `/aion`, which opens in `needs_test_draft` state — Aion immediately offers to draft for a real deal.
- **Effort:** Small-medium (new `VoiceSetupForm.tsx` component + section in `AionSettingsView.tsx`, no new server actions or schema)
- **Main risk:** Creates two paths to voice setup (chat and form). Needs a "reset voice / retune" affordance later to stay coherent.
- **Unlocks:** The exact UX Daniel described — write three paragraphs, get a draft. Gives non-chat-native users a familiar starting point.

### Option C: Fast-path free-form extraction in the first chat turn
- **What it is:** Change the `no_voice` greeting to accept a free-form block ("paste everything you'd like me to know about your style"). Aion calls `save_voice_config` with all three fields populated from a single response, skipping the step-by-step flow.
- **Effort:** Small (system prompt change for `no_voice` state, test against edge cases)
- **Main risk:** Extraction accuracy from unstructured prose is lower than structured fields. If Aion misses guardrails buried in a paragraph, the user won't notice until a draft violates them.
- **Unlocks:** Single-turn voice setup within the existing chat shell.

---

## Recommendation

**Ship Option B.** The form approach matches exactly what Daniel described ("write 3 paragraphs"), requires no new server actions or schema — only a UI component that calls `saveAionVoiceConfig()` which already exists. After submit, the user lands in the chat with `onboarding_state = needs_test_draft`, and Aion's existing greeting offers a real draft automatically. That is the complete "write it, see it" loop.

Option A is worth doing as a smoke test first (5 minutes to check tier + kill_switch), but it doesn't deliver the described UX. Option C is tempting but adds extraction risk — the form keeps voice config auditable and editable.

The two-path concern (form + chat) is real but manageable: the `resetAionVoiceConfig()` action already exists and the sidebar "Tune Aion's voice" affordance is documented in comments (`aion-config-actions.ts:208`). Both paths write to the same `aion_config.voice` field.

---

## Next steps for Daniel

1. **Check tier and kill_switch** — in Supabase dashboard or SQL: `SELECT subscription_tier, aion_config->'kill_switch' FROM workspaces WHERE id = '<your-workspace-id>';` — workspace must be on "growth" or "studio" for the chat to be unblocked.

2. **Smoke-test the existing chat flow** — if tier is growth+, open `/aion`, send an empty init request and confirm Aion returns the `no_voice` greeting. This validates the end-to-end path before building any UI.

3. **Build `VoiceSetupForm.tsx`** in `src/app/(dashboard)/settings/aion/` — three labeled textareas (style description, example follow-up, guardrails). Submit calls `saveAionVoiceConfig()` from `aion-config-actions.ts:178`.

4. **Mount the form** in `AionSettingsView.tsx` as a new section below the cadence toggle, gated behind `cardFlagEnabled` (same condition as the cadence section, line 200).

5. **After successful save, navigate to `/aion`** — `router.push('/aion')` — the greeting will be `needs_test_draft` and Aion will offer a test draft immediately. This is the payoff moment.

6. **Update `planning-primer.md`** — the primer's "Current notable state" section describes infrastructure as missing that is actually shipped. Future research runs will inherit the confusion. A 3-line patch to that section prevents it.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route.ts` — tier gate (line 242), onboarding state check (line 267), `buildGreeting` (line 967)
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/features/intelligence/lib/aion-gate.ts` — `canExecuteAionAction`
- `src/shared/lib/tier-gate.ts` — growth tier required for `tier:aion:active`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (no voice form)
