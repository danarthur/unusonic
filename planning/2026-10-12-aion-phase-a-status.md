# Aion Phase A: Current Status and Remaining Gap

_Researched: 2026-10-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is
currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum
path to unblock voice setup + first real draft? Context: the goal is to have Daniel open
the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an
Aion-generated follow-up draft that respects that voice.

_Note: the queue entry's premise is outdated. Phase A infrastructure shipped before this
run. This document corrects the record and identifies the one real open item._

## Current state

The `aion_config` JSONB column exists on `public.workspaces` and is actively read and
written. `getAionConfig()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`
and `getAionConfigForWorkspace()` at `:106` both read it. `saveAionVoiceConfig()` at `:178`
writes the voice sub-object via the RLS-bypassing service-role client.

The `/aion` page is live. `src/app/(dashboard)/aion/AionPageClient.tsx:66` mounts
`ChatInterface` directly. No paused state, no feature flag gate.

The chat route at `src/app/api/aion/chat/route.ts` is a fully authenticated, model-routing,
tool-calling handler. It reads `getOnboardingState(aionConfig)` at line 124 and passes the
result to both the system prompt builder and the greeting builder.

The 5-state onboarding machine is defined at
`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`:
`no_voice → no_example → no_guardrails → needs_test_draft → configured`.

The `save_voice_config` tool at
`src/app/api/aion/chat/tools/core.ts:118` saves description, example, and guardrails to
`aion_config.voice` and marks onboarding complete.

The `draft_follow_up` tool at `core.ts:318` generates a draft with full voice config, memory
enrichment, playbook channel rules, and tone anchoring. The response builder at
`src/app/api/aion/chat/route/helpers.ts:103` converts the tool result to a
`draft_preview` content card.

The onboarding system prompt directives at `prompts.ts:284-292` inject the correct
instruction for each state, including "Offer a test draft. Use draft_follow_up." at
`needs_test_draft`.

**The flow Daniel described is wired end-to-end.** However, two conditions must be true
for it to work: the workspace must not have `voice_default_derived: true`, and there must
be a deal in the follow-up queue (or active page context) when `draft_follow_up` fires.

## Intended state

A first-time user opens `/aion`, describes their communication style over a few turns, and
immediately receives a `draft_preview` card against a real deal. The voice is persisted to
`aion_config` and used on all subsequent drafts. Per the design doc, the 4-step onboarding
sequence should be the entry experience for any workspace that has not yet configured voice.

## The gap

- **Default bypass**: New workspaces get `voice_default_derived: true` injected by
  `applyVoiceDefaultIfEmpty()` at `aion-config-helpers.ts:35`, which synthesizes a voice
  from the workspace name and skips onboarding. `getOnboardingState()` at `aion-chat-types.ts:248`
  short-circuits to `'configured'`. The only re-entry path is "Tune Aion's voice" in the
  sidebar overflow (`AionSidebar.tsx:1043`). Non-obvious for first-time users.

- **Empty-queue failure at `needs_test_draft`**: `draft_follow_up` at `core.ts:332` returns
  `{ error: 'No deals in the follow-up queue.' }` when the queue is empty and there is no
  page context. This means a workspace with no follow-up queue items stalls silently at the
  last onboarding step.

- **Re-entry UX friction**: The sidebar overflow is not the surface a new user looks at.
  Discovering "Tune Aion's voice" requires scrolling into settings-like UI.

## Options

### Option A: Fix the empty-queue fallback in `draft_follow_up`

- **What it is:** When the queue is empty and no page context is set, fall back to the
  most recently updated active deal from `public.deals` instead of erroring. One small
  change to `core.ts:332-334`.
- **Effort:** Small (1 file, ~10 lines)
- **Main risk:** Drafts against deals the owner wasn't thinking about. Confusing if the
  fallback deal is stale or irrelevant.
- **Unlocks:** The onboarding sequence completes cleanly even on fresh workspaces.

### Option B: Add a first-use onboarding prompt surface

- **What it is:** Instead of relying on the sidebar overflow to re-trigger onboarding, add
  a visible prompt on the `/aion` page when `voice_default_derived: true` — a dismissable
  banner or an `AionFirstVisitPrompt` variant that says "Aion synthesized a default voice
  from your workspace name. Tune it for better drafts." Tap → calls `resetAionVoiceConfig`,
  enters `no_voice` state.
- **Effort:** Medium (new UI component, server action call, localStorage dismissal)
- **Main risk:** Adds noise for workspaces that are happy with the derived default.
- **Unlocks:** The onboarding funnel becomes intentional and measurable.

### Option C: Both A and B together

- **What it is:** Combine the empty-queue fallback (A) with the first-use prompt (B).
  Also add a check at `needs_test_draft` greeting that only shows the "Yes, try one" chip
  when at least one active deal exists, swapping it for "Add a deal first" otherwise.
- **Effort:** Large (3 file changes, UI component, conditional chip logic)
- **Main risk:** Scope creep. Each piece is independently deployable; bundling adds
  coordination risk.
- **Unlocks:** The complete "write 3 paragraphs → see a draft" experience as described,
  with no dead ends.

## Recommendation

Ship Option A first, today. The empty-queue fallback is a three-line code fix that removes
the only hard failure in the onboarding flow. `draft_follow_up` at `core.ts:332` already
has the fallback shape — it just needs to widen from "follow-up queue" to "any active deal."

Option B is worth doing as a follow-on, but it is a UX decision (should the derived default
be surfaced as provisional or invisible?). That is a product call, not a code fix. Option A
unblocks the stated goal without requiring that decision.

The "Brain tab is paused" framing in the queue entry is stale. The tab is live. The
infrastructure is shipped. The only thing standing between Daniel's "3 paragraphs → real
draft" experience and reality is: (1) calling `resetAionVoiceConfig` once to clear the
synthesized default, and (2) making sure the empty-queue case doesn't stall at the finish
line.

## Next steps for Daniel

1. **Verify the flow manually**: Go to `/aion`, open the sidebar overflow (three-dot
   icon), tap "Tune Aion's voice." Confirm the greeting fires `no_voice` onboarding.

2. **Apply the empty-queue fix**:
   In `src/app/api/aion/chat/tools/core.ts` around line 332, replace the early return on
   empty queue with a fallback: query `public.deals` for the most recently active deal
   and proceed with a synthetic queue item (`reason: 'Requested by user', reason_type: 'manual'`).

3. **Test end-to-end**: With a workspace that has at least one deal (queue or not), go
   through the 4-step onboarding and confirm a `draft_preview` card appears.

4. **Remove the stale queue entry** (this one) and add a new one if the fallback fix
   surfaces follow-on issues.

5. **Optional**: Decide whether `voice_default_derived` should be surfaced as provisional
   to users. If yes, queue Option B.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState` type
- `src/app/api/aion/chat/route.ts` — auth, onboarding state read, greeting dispatch
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting` (per-state greetings), `buildSystemPrompt` (per-state instructions)
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config`, `draft_follow_up`, `regenerate_draft`
- `src/app/api/aion/chat/route/helpers.ts:103` — `draft_follow_up` → `draft_preview` card conversion
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" affordance
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (synthesized default)
