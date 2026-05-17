# Unblocking Aion voice setup and first real draft

_Researched: 2026-05-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**Both stated assumptions are outdated.** The codebase has moved significantly since the primer was written (2026-04-10).

`public.workspaces.aion_config` **exists.** It is a JSONB column with a full type system defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`. Fields include `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, and `voice_default_derived`.

The **Brain tab is not paused** — `/aion` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` (`src/app/(dashboard)/aion/AionPageClient.tsx:73`). The chat route at `src/app/api/aion/chat/route.ts` is 451 lines, authenticated, and uses streaming tool-calls.

The **4-step voice onboarding flow is implemented.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) drives both the system prompt (`src/app/api/aion/chat/route/prompts.ts:275–283`) and the cold-open greeting (`prompts.ts:300–338`). Both `save_voice_config` and `draft_follow_up` tools are in the chat tool set (`src/app/api/aion/chat/tools/core.ts:118` and `:318`). The draft route at `src/app/api/aion/draft-follow-up/route.ts` is fully wired and injects the workspace voice into the system prompt (`src/app/api/aion/lib/generate-draft.ts:63–75`).

**However:** `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`) synthesizes a generic voice from the workspace name whenever no explicit voice is stored, and sets `voice_default_derived: true`. `getOnboardingState()` returns `'configured'` immediately for any workspace with `voice_default_derived: true` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`). This means the 4-step setup flow **never fires** for a new user unless they find the buried "Tune Aion's voice" entry in the sidebar overflow, which calls `resetAionVoiceConfig()`.

The chat route also requires `active` tier — Foundation workspaces receive an upgrade message before any onboarding (`src/app/api/aion/chat/route.ts:98–105`).

## Intended state

Daniel opens `/aion`, is prompted to describe how he communicates with clients, types freely, and Aion captures that as a structured voice config. On the same visit Aion offers a test draft for the top-priority deal. From then on, every follow-up draft reflects his actual voice. The `/settings/aion` page currently handles consent and cadence but has no voice form (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx:33`).

## The gap

- The 4-step voice setup chat flow is built but **unreachable by default** because `voice_default_derived` bypasses it for every workspace.
- The only escape hatch — "Tune Aion's voice" in the sidebar overflow — is invisible to a first-time user.
- No voice form in settings; voice is only editable through a conversational flow that silently doesn't fire.
- Tier gate (`active` required) is a hard blocker if Daniel's workspace is on Foundation.

## Options

### Option A: Surface a "Set up your voice" banner on the Aion landing

- **What it is:** When `voice_default_derived === true`, render a dismissible banner or prompt card at the top of the `ChatInterface` landing state (no messages). The banner says "You're using a default voice. Set it up so drafts sound like you." with a single call-to-action that calls `resetAionVoiceConfig()` and reloads — triggering the `no_voice` greeting. No new infrastructure; the full 4-step flow already works.
- **Effort:** Small — one conditional block in `ChatInterface.tsx`, one server action call, one `revalidatePath`.
- **Main risk:** Minor UX interruption for workspaces that intentionally never want to configure voice (rare in production context).
- **Unlocks:** First-time users reach the voice setup flow without finding a buried overflow menu. Daniel's desired experience works today once tier is confirmed.

### Option B: Add a voice form to `/settings/aion`

- **What it is:** Add a "Voice" section to `AionSettingsView.tsx` with three labeled textareas (communication style, example message, guardrails) and a Save button wired to `saveAionVoiceConfig()`. Include a "Generate a test draft" button that POSTs directly to `/api/aion/draft-follow-up` with a deal picker. The settings page becomes the single-pane home for all Aion config.
- **Effort:** Medium — new form section, a deal picker (can start as a plain input for deal ID), test draft display component.
- **Main risk:** Needs a deal in the queue for the test draft to work; if the queue is empty the button is dead.
- **Unlocks:** Non-conversational, inspectable, re-editable voice setup. Better for owners who want to tune without going through the chat.

### Option C: Flip the synthesized-default logic — always show setup on first open

- **What it is:** Remove `voice_default_derived` as a bypass in `getOnboardingState()`. New workspaces get an `onboarding_state: 'setup_pending'` marker; the chat greeting always runs the 4-step flow on first open. The synthesized voice is kept as a draft fallback for drafts while setup is in progress, but users always go through the flow on their first visit.
- **Effort:** Medium — changes `getOnboardingState()`, `applyVoiceDefaultIfEmpty()`, and the greeting routing.
- **Main risk:** Changes first-run experience for all new workspaces. Workspaces that want to skip setup and use the default have no escape until they dismiss. Harder to test safely in production.
- **Unlocks:** Every new workspace is voice-configured within the first chat session, automatically.

## Recommendation

Ship Option A first, then Option B.

The entire desired experience — write, save, draft — already exists in the chat flow. The only missing piece is discoverability. A banner on the landing state of `/aion` that fires when `voice_default_derived: true` costs one component change and makes the existing infrastructure usable. This unblocks Daniel's goal within a day.

Option B matters for the long run because the conversational setup is good for first-run but bad for editing. A form in settings gives owners a persistent, inspectable home for their voice config without re-entering a chat flow. Build it after Option A is confirmed working.

Option C is the right eventual architecture but creates regression risk — skip it for now and revisit once Options A and B have proven the setup flow is stable.

**Before anything:** verify Daniel's workspace is on `active` tier. If it's on Foundation, the chat returns an upgrade message before any greeting renders. One SQL check: `SELECT aion_config->>'onboarding_state', tier FROM public.workspaces WHERE id = '<workspace_id>'` against the tier config.

## Next steps for Daniel

1. Confirm workspace tier is `active` or higher. If not, update `public.tier_config` or the workspace subscription before proceeding.
2. Check current `aion_config` state: `SELECT aion_config FROM public.workspaces WHERE id = '<your-workspace-id>'`. If `voice_default_derived: true`, the setup flow is bypassed.
3. To test the existing flow right now: call `resetAionVoiceConfig()` from the sidebar overflow ("Tune Aion's voice") on the `/aion` page. The next cold-open should greet you with the voice setup prompt.
4. To ship Option A: add a conditional banner in `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` that renders when `voice_default_derived` is on the session config and the message list is empty. Wire the CTA to call `resetAionVoiceConfig()` + `router.refresh()`.
5. To ship Option B: add a "Voice" section to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` with three textareas + `saveAionVoiceConfig()`. For the test draft button, pass the highest-priority `ops.follow_up_queue` item's `deal_id` to `POST /api/aion/draft-follow-up`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState` (state machine)
- `src/app/api/aion/chat/route/prompts.ts:275–338` — system prompt onboarding injection + `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts:118–144, 318–345` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts:52–137` — `buildFollowUpPrompt` (voice injection into drafts)
- `src/app/api/aion/chat/route.ts:97–105` — tier gate (hard blocker if Foundation)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — no voice form here currently
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178–206` — `saveAionVoiceConfig` (ready to call)
