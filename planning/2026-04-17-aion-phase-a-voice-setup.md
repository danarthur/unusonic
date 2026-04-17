# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-04-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premises:** Both stated blockers no longer reflect reality. `public.workspaces.aion_config` exists and is fully populated (`voice`, `learned`, `follow_up_playbook`, `kill_switch`, `aion_actions_used` — confirmed in `src/types/supabase.ts:4950–5075`). The Aion chat route is a full 1167-line implementation, not a stub. The primer was accurate as of 2026-04-10; meaningful work has landed since. This doc re-states the goal and maps the actual remaining gap.

---

## Current state

**Aion chat route** (`src/app/api/aion/chat/route.ts:1–1167`): fully built. Auth guard, rate limiting (60 req/60 s), intent-based tool filtering, streaming via Vercel AI SDK, system-prompt builder that reads `aion_config.voice` and `aion_config.learned`, greeting builder that detects onboarding state and drives the voice setup flow.

**Voice onboarding state machine** (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:221–246`): five states — `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `getOnboardingState(config)` derives the current state from `aion_config.voice` field presence.

**Voice config write path**: two paths exist. (1) `save_voice_config` LLM tool (`src/app/api/aion/chat/tools/core.ts:115–141`) called by Aion mid-conversation. (2) `saveAionVoiceConfig()` server action (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:99–124`).

**Deal context assembly** (`src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:498–564`): `getDealContextForAion()` is live. It returns deal, client, proposal, follow-up history, and entity IDs. Called by Aion core tools and dispatch handlers.

**Aion standalone page** (`src/app/(dashboard)/aion/AionPageClient.tsx:1–49`): renders `ChatInterface` with `viewState="chat"`. This is the only surface where the voice onboarding currently runs.

**"Brain tab" in the deal page**: does not exist. `prism.tsx:527–571` shows exactly three tabs — Deal, Plan, Ledger. No Aion or Brain tab.

**Conversational onboarding UX** (`src/app/api/aion/chat/route.ts:764–806`): greeting builder emits guided prompts per state with suggestion chips. Users type their style description; Aion calls `save_voice_config` to persist it. No form UI — it is entirely conversational.

---

## Intended state

Daniel opens something (Brain tab or the /aion page), writes three paragraphs about how he talks to clients, and Aion immediately generates a follow-up draft for a real deal that respects that voice. The flow should feel immediate: setup → test draft without a detour.

The `needs_test_draft` state exists exactly for this moment. After guardrails are saved, Aion should ask "want me to draft a test message?" and if yes, produce a real draft using deal context.

---

## The gap

- **No Brain tab in the deal page.** Daniel cannot access Aion while looking at a deal without navigating away. The conversational onboarding runs at `/aion/`, not in the deal context where follow-up drafts are most useful.
- **Test draft lacks deal context.** At the `needs_test_draft` state, the greeting asks the user if they want a draft — but the `/aion/` standalone page has no deal pre-loaded. The draft would be generic unless the user manually tells Aion which deal to use.
- **No end-to-end verification.** It is not confirmed that a fresh workspace (aion_config.voice = null) can complete the full arc: welcome prompt → voice description → example message → guardrails → test draft → draft appears. May work; has not been validated.
- **Legacy constants unrelated to this flow** (`ION_SYSTEM`, `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22–106`; `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts:116`) — stale brand names, not a blocker for Phase A.

---

## Options

### Option A: End-to-end smoke test of the existing conversational flow
- **What it is:** Run a new workspace through the onboarding state machine at `/aion/`. Log each state transition. Confirm `save_voice_config` persists to the DB. At `needs_test_draft`, manually give Aion a deal to draft from and confirm the draft respects the voice config.
- **Effort:** Small (a few hours of manual testing + minor fixes)
- **Main risk:** May find bugs that require multiple iterations before the flow is reliable
- **Unlocks:** A working Phase A with zero new UI. You can ship "go to /aion, set up your voice" as a real workflow today.

### Option B: Add a Brain tab to the Prism deal page
- **What it is:** Fourth tab in `prism.tsx` that renders a minimal `ChatInterface` scoped to the current deal. On mount, injects deal context so Aion immediately knows which deal it's working on. Voice onboarding runs in this scoped context; test draft is automatically for the open deal.
- **Effort:** Medium (tab scaffold + context injection + possibly a viewState="deal" variant of ChatInterface)
- **Main risk:** Prism is a critical, high-traffic component. Layout changes can introduce regressions in Deal/Plan/Ledger tabs.
- **Unlocks:** The exact flow described in the goal — Daniel is in a deal, opens the Brain tab, sets up voice, gets a draft for that deal without navigating away.

### Option C: Dedicated voice setup wizard (form-based)
- **What it is:** A multi-step form at `/aion/setup` that walks through description → example → guardrails → test draft. Bypasses conversational flow entirely for the initial setup.
- **Effort:** Medium (new page, 3-step form, server action wiring, redirect to /aion/ on complete)
- **Main risk:** Duplicates the conversational onboarding already built. Two paths to configure voice = two surfaces to keep in sync. Also loses the conversational feel.
- **Unlocks:** A more guided, inspectable setup for users who find chat-as-UI confusing.

---

## Recommendation

**Option A first, then B if setup validates.**

The conversational onboarding is more complete than the primer indicated. The right move is to run Option A — smoke-test the full arc on a fresh workspace — before building any new UI. If the state machine and `save_voice_config` tool work cleanly, Phase A is essentially done and Daniel can use `/aion/` as the voice setup surface today.

Option B (Brain tab in Prism) is the right next build, but it belongs in Phase B, not Phase A. The deal-context injection is the meaningful upgrade — not duplicating the setup flow somewhere new. Once Option A confirms the onboarding works, wire deal context into the `/aion/` page first (pass a `?dealId=` param that primes Aion's context) as a lower-risk bridge before touching Prism.

Option C is a trap: the conversational approach is already built and is a better UX than a wizard. Don't build a form.

---

## Next steps for Daniel

1. Open a fresh workspace (or clear `aion_config` on a test workspace) and navigate to `/aion/`. Confirm Aion greets with the `no_voice` prompt — "How would you describe your style?".
2. Complete the three onboarding steps (description → example → guardrails). After each, check `public.workspaces` in Supabase to confirm `aion_config.voice` fields are writing correctly.
3. At the `needs_test_draft` prompt, type a deal title or client name and ask for a draft. Note whether the draft respects the voice description you just gave.
4. If the flow breaks at any step: check `src/app/api/aion/chat/tools/core.ts:115–141` (`save_voice_config` tool) and `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:221–246` (state derivation logic).
5. Once validated: add `?dealId=<id>` param handling to `AionPageClient.tsx` — prime the greeting builder with deal context so the test draft auto-targets the right deal.
6. After that bridge works: scope the Brain tab in `prism.tsx` as Phase B.

---

## References

- `src/app/api/aion/chat/route.ts` — full chat orchestrator, system prompt builder, greeting builder
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:221–246` — onboarding state machine
- `src/app/api/aion/chat/tools/core.ts:115–141` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:99–124` — server actions for aion_config
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:498–564` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/crm/components/prism.tsx:527–571` — Prism tab list (3 tabs, no Brain)
- `src/types/supabase.ts:4950–5075` — `public.workspaces` with `aion_config` shape
- `src/app/(dashboard)/aion/AionPageClient.tsx` — standalone Aion page
