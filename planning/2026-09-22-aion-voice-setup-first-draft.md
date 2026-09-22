# Aion voice setup + first draft: minimum unblock path

_Researched: 2026-09-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the premise in the queue item is out of date. The primer was last updated 2026-04-10. As of this run, `aion_config` exists, the Aion chat is fully live, and the Brain tab (the `/aion` page) is not paused. The actual gap is narrower — see below._

## Current state

**`aion_config` column** — exists as `public.workspaces.aion_config jsonb DEFAULT '{}'::jsonb NOT NULL` (migration: `supabase/migrations/20260101000000_baseline_schema.sql:15058`; TypeScript types: `src/types/supabase.ts:7895`).

**`AionConfig` shape** — defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`. Contains `voice?: AionVoiceConfig` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `voice_default_derived`.

**Conversational voice onboarding** — a 5-state machine defined in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`, `getOnboardingState()`:
- `no_voice` → `no_example` → `no_guardrails` → `needs_test_draft` → `configured`
- Line 235–238: comment confirms step 4 is "offer to generate a test draft."

**The bypass** — `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`, `applyVoiceDefaultIfEmpty()`: when `voice.description` is absent, synthesizes a generic voice (`"Writing for {company}. Sentence case..."`) and sets `voice_default_derived: true` in memory. `getOnboardingState()` line 248 then short-circuits immediately to `'configured'` on that flag. Result: **every new workspace skips all four onboarding steps.** The user never sees the voice collection prompts.

**Chat route** — `src/app/api/aion/chat/route.ts:110–128`: loads config via `getAionConfigForWorkspace` (which calls `applyVoiceDefaultIfEmpty`), then calls `getOnboardingState` (line 124) and passes the result to `buildSystemPrompt` and `buildGreeting`. The onboarding states are fully wired into the system prompt/greeting flow — they just never fire for new users.

**Draft endpoint** — `src/app/api/aion/draft-follow-up/route.ts:60–65`: calls `generateFollowUpDraft({ context: AionDealContext, voice: aionConfig.voice })`. Voice is respected. Requires a `context` (deal data) — cannot be called standalone without a deal.

**Tune voice affordance** — `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1043` (sidebar overflow menu). Calls `resetAionVoiceConfig()` which strips voice + flags from DB, re-entering the `no_voice` state. Exists but undiscoverable for first-time users.

## Intended state

User opens the Brain tab (or `/aion`), is greeted with a voice collection prompt, writes 3 paragraphs about how they communicate with clients, and immediately receives a concrete follow-up draft that reflects that writing style. After that, every follow-up the system generates matches the voice.

The 4-step onboarding machine already encodes this intent. Step 4 (`needs_test_draft`) is meant to close the loop with an immediate draft. The entire pipeline from voice → draft is wired (`chat/route.ts` → `buildSystemPrompt` → `generateFollowUpDraft`). The gap is one line.

## The gap

- `aion-chat-types.ts:248` — `voice_default_derived === true` short-circuits the onboarding to `'configured'` before any step is shown.
- `applyVoiceDefaultIfEmpty` sets `voice_default_derived: true` for every new workspace on every chat load, so the bypass is permanent unless the user manually resets.
- `needs_test_draft` step exists but its draft generation requires a deal context. If the user has no deals yet, a standalone test draft cannot be produced by `draft-follow-up/route.ts`.
- No visible affordance guides a new user into the explicit voice setup path.

## Options

### Option A: Remove the `voice_default_derived` short-circuit

- **What it is:** Delete line 248 from `getOnboardingState()` and replace with a check for `onboarding_state === 'skipped'`. Keep `applyVoiceDefaultIfEmpty` as a runtime fallback (Aion stays functional), but stop letting it gate out the onboarding. Add one conversational option in the `no_voice` prompt ("skip for now") that saves `onboarding_state: 'skipped'` and earns the configured return. For `needs_test_draft`: have the system prompt instruct Aion to generate a draft from the user's most recent deal, or use a canned synthetic context if no deals exist.
- **Effort:** Small — 3 file changes (`aion-chat-types.ts`, `aion-config-helpers.ts`, `aion-config-actions.ts`). No schema changes.
- **Main risk:** Existing workspaces with `voice_default_derived === true` in DB are currently in `'configured'` state. Removing the bypass would push them back to `no_voice`. Need a migration or a one-time flag write to set `onboarding_state: 'skipped'` for existing configured workspaces before deploying.
- **Unlocks:** Every new workspace hits voice collection. The 4-step flow becomes the real onboarding. Voice-accurate drafts from day one.

### Option B: Dedicated voice setup form in `/settings/aion`

- **What it is:** A structured form — three textareas for description, example, and guardrails — with a "preview draft" button that calls `draft-follow-up` with the most recent deal context (or a canned default). Lives at `/settings/aion` alongside `CadenceLearningToggle`. The chat interface is unchanged; users who want conversational setup still have it.
- **Effort:** Medium — new settings page, new form component, minor Server Action update to accept direct voice input.
- **Main risk:** Adds a parallel voice-collection path. Two paths means two places to test and maintain. The chat's onboarding flow would remain unreachable unless the bypass is also removed.
- **Unlocks:** Explicit, inspectable voice config that non-conversational users can edit. Good for workspace admin.

### Option C: Surface onboarding chip in the chat header

- **What it is:** When `voice_default_derived === true`, show a dismissible chip in the Aion chat header: "Aion is using a default voice — tell it how you write." Clicking it calls `resetAionVoiceConfig()` and starts a fresh session, entering the `no_voice` state. Bypass stays in place but becomes opt-out instead of invisible.
- **Effort:** Small-medium — new UI component, no backend changes.
- **Main risk:** Relies on users noticing and clicking the chip. Most won't. The first draft is still generic.

## Recommendation

**Option A.** The infrastructure is complete; the only real problem is a 3-year-old design decision (auto-synthesis as default) that was appropriate before the onboarding machine existed. Removing the `voice_default_derived` bypass costs one afternoon: patch `getOnboardingState`, write a one-time migration to set `onboarding_state: 'skipped'` for the ~N existing workspaces that have `voice_default_derived = true` in their DB row, deploy.

The `needs_test_draft` step is the only piece that needs a small addition: the `buildSystemPrompt` for that state should instruct Aion to call `get_deal_list` (already a tool) and pick the most recent deal as context for the draft. If there are no deals, have Aion generate a fictional but plausible example with a note that it's illustrative. This is a system-prompt edit, not a new endpoint.

Option B is worth doing eventually — direct form editing is good for power users — but it does not solve the first-run problem and costs more. Option C is the least effective; it leaves the default voice in place and bets on user curiosity.

## Next steps for Daniel

1. **Audit existing workspaces:** `SELECT id, aion_config->>'voice_default_derived' AS vdd FROM public.workspaces WHERE aion_config->>'voice_default_derived' = 'true';` — count affected rows before touching anything.
2. **Write a migration** (`supabase/migrations/<timestamp>_set_onboarding_skipped_for_derived.sql`): `UPDATE public.workspaces SET aion_config = aion_config || '{"onboarding_state":"skipped"}' WHERE aion_config->>'voice_default_derived' = 'true';`
3. **Edit `getOnboardingState`** (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`): replace `if (config.voice_default_derived === true) return 'configured';` with `if (config.onboarding_state === 'skipped') return 'configured';`.
4. **Add a "skip for now" path** in the system prompt for the `no_voice` state (`src/app/api/aion/lib/system-prompt.ts` or wherever `buildSystemPrompt` lives): when user says skip/later, call `saveAionConfig` with `{ onboarding_state: 'skipped' }`.
5. **Wire `needs_test_draft`** in the system prompt: instruct Aion to call `get_deal_list`, pick the latest deal, and generate a draft using `generate_follow_up_draft` tool. If no deals exist, produce a fictional illustrative draft and label it so.
6. **Test end-to-end** in a fresh workspace (no voice in DB): open `/aion`, confirm `no_voice` greeting fires, complete the 3-step input, confirm a draft appears.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/chat/route.ts:110–128` — config load + state dispatch
- `src/app/api/aion/draft-follow-up/route.ts` — voice-respecting draft endpoint
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–206` — `saveAionVoiceConfig`
- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column definition
