# Minimum path to voice setup and first Aion draft

_Researched: 2026-06-13 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer is significantly stale. Most of Phase A is already shipped.

**Schema — exists.** `public.workspaces.aion_config` is a `jsonb DEFAULT '{}'` column in the baseline migration. The TypeScript shape is `AionConfig` (`aion-config-actions.ts:50-74`) with a `voice?: AionVoiceConfig` field holding `{ description, example_message, guardrails }` (`aion-config-actions.ts:12-16`).

**Voice defaults — exist.** `synthesizeDefaultVoice(workspaceName)` generates a starter voice from the workspace name (`aion-config-helpers.ts`). `applyVoiceDefaultIfEmpty()` applies it on every read without writing to disk; when present, it sets `voice_default_derived: true` (`aion-config-actions.ts:66-73`). `saveAionVoiceConfig()` clears that flag and persists the user's explicit voice (`aion-config-actions.ts:178-200`).

**Draft endpoint — exists and real.** `POST /api/aion/draft-follow-up` (`draft-follow-up/route.ts`) is auth-gated, tier-gated, kill-switch-aware, and calls `generateFollowUpDraft()` which uses `generateText` from the Vercel AI SDK (`generate-draft.ts:37`). If `aion_config.voice` is set, the three fields are injected into the system prompt as a "How This Company Communicates" section (`generate-draft.ts:63-75`).

**Deal context — exists.** `getDealContextForAion()` assembles client name, proposal status, view count, follow-up reason, and recent log into `AionDealContext` (`follow-up-actions.ts:545-611`). `FollowUpCard` has a working "Draft a message" button that passes this context to the endpoint (`follow-up-card.tsx:531-543`).

**Aion chat — live.** The `/aion` page and `ChatInterface.tsx` are fully wired (808 lines), with session management, model modes, and sidebar. The primer's "Brain tab is paused" statement is stale.

**What's missing:** There is no voice setup form anywhere in the product. `saveAionVoiceConfig()` is never called from any UI component. The `/settings/aion` page (`AionSettingsView.tsx`) covers consent/access/memory backfill — not voice. When Daniel clicks "Draft a message," the endpoint receives `voice: null` and falls back to generic system prompt defaults.

## Intended state

Daniel opens the product, describes how he writes client messages across three fields (style description, a real example, guardrails), saves it, and the next follow-up draft from the `FollowUpCard` reflects that voice immediately. No schema work, no new API routes, no new infra — the backend is complete. Only the UI form is missing.

## The gap

- `saveAionVoiceConfig()` has no caller — voice is never explicitly set
- No UI exposes `AionVoiceConfig.description`, `.example_message`, `.guardrails` as editable fields
- No "preview a draft" test affordance — Daniel can't verify the voice took effect without opening a real deal
- The flow from "write voice" to "see draft" crosses two separate pages under any current option

## Options

### Option A: Voice setup section in `/settings/aion`

- **What it is:** Add a `VoiceSetupSection` component to `AionSettingsView.tsx` — three textareas (style, example, guardrails), one save button wired to `saveAionVoiceConfig()`, and a "Preview a draft" button that calls `draft-follow-up` against the most recent queued deal and displays the result inline.
- **Effort:** small (one new component, two server action calls, no routing changes)
- **Main risk:** "Preview a draft" requires fetching a recent queue item server-side for context, which is a small but non-trivial data fetch. If no queue item exists, the preview has no context and the draft is generic.
- **Unlocks:** Permanent home for voice settings that Daniel can return to and refine. Settings is the right long-term location.

### Option B: Inline voice gate in `FollowUpCard`

- **What it is:** When `voice_default_derived: true` (voice never explicitly saved) and Daniel clicks "Draft a message," show a setup sheet before the draft runs. He writes the three fields inline, `saveAionVoiceConfig()` fires, the draft runs immediately with the new voice, and the result appears in the same card.
- **Effort:** small (one new modal/sheet component inside `follow-up-card.tsx`, existing action + endpoint)
- **Main risk:** Voice setup lives inside the deal card — hard to find later to update. One-time first-run UX, not a settings pattern. If Daniel dismisses without saving, he loses the setup moment.
- **Unlocks:** Exact flow described in the question — write voice, immediately see draft — in a single page without navigation.

### Option C: Conversational voice setup via Aion chat

- **What it is:** Add a structured prompt template or tool to the `/api/aion/chat` route. Daniel opens Aion chat and types "Help me set up my voice." Aion asks a few questions, extracts the answers into `AionVoiceConfig` structure, and saves via a server-side tool call.
- **Effort:** medium (new Aion tool definition, extraction prompt, streaming output with structured save action)
- **Main risk:** Extraction quality depends on the model reliably outputting valid `AionVoiceConfig` JSON; requires tool-call infrastructure in the chat route that may not exist today.
- **Unlocks:** Shows Aion's self-configuration capability; most on-brand UX for an AI-native product.

## Recommendation

**Option A.** The settings page is already the right home for voice configuration — admins expect to configure behavior in settings, not inside a deal card. Adding a `VoiceSetupSection` below the existing cadence-learning toggle is three textareas and a save button; the only lift is the "Preview a draft" fetch. Scope that preview to a best-effort call: if a queued deal exists, use it; otherwise fall back to a synthetic placeholder context so the preview always runs. Daniel can test voice changes without navigating to a specific deal.

Option B delivers the exact flow described, but couples a configuration concern to the deal card — fragile, hard to find again. Option C is the most elegant long-term play, but it's a larger build and the chat tool infrastructure is unclear.

The "Brain tab" as a concept can stay aspirational. The immediate unlock is a settings form — ship that in an hour, use the existing backend, and the full voice → draft cycle works end to end.

## Next steps for Daniel

1. Add `VoiceSetupSection` component to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — three `<textarea>` fields mapped to `AionVoiceConfig`, one save button calling `saveAionVoiceConfig()`.
2. Add a "Preview draft" server action in `src/app/(dashboard)/settings/aion/` that fetches the most recent `pending` item from `ops.follow_up_queue` for the workspace, calls `getDealContextForAion()`, then `generateFollowUpDraft()` — return the draft text to render inline.
3. Show the preview result in a `DraftPreviewCard`-style panel below the form (component already exists at `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx`).
4. Test the round-trip: fill three fields → save → Preview → confirm the draft copy reflects the saved voice (compare to the synthesized-default draft before saving).
5. Once confirmed, clear the `voice_default_derived` flag from `aion_config` in the test workspace to verify that `saveAionVoiceConfig()` correctly un-sets it.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `AionConfig`, `saveAionVoiceConfig()`, `getAionConfigForWorkspace()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice()`, `applyVoiceDefaultIfEmpty()`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint (auth + tier gate)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft()`, `buildFollowUpPrompt()` (voice injection at lines 63–75)
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion()`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:531` — "Draft a message" button
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page (add voice section here)
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — reusable draft preview component
