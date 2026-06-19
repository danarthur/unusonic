# Aion Phase A: minimum path to voice setup + first follow-up draft

_Researched: 2026-06-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**`aion_config` already exists.** The primer said it was missing, but `public.workspaces.aion_config: Json` is live in `src/types/supabase.ts:7782`. This changes the calculus — no migration needed.

**Voice type is fully defined.** `AionVoiceConfig = { description: string; example_message: string; guardrails: string }` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`. This is exactly the "3 paragraphs" — how you talk, an example message, and what to avoid. The type mapping was intentional.

**Save action exists.** `saveAionVoiceConfig(voice: AionVoiceConfig)` at `aion-config-actions.ts:178` reads current config, merges voice, and writes to `workspaces` via the server client. It clears `voice_default_derived` on explicit save.

**Draft endpoint exists.** `POST /api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts:1` takes `{ context: AionDealContext, workspaceId }`, loads voice from `aion_config`, calls `generateFollowUpDraft()`, returns `{ draft: string, channel: 'sms' | 'email' }`. Auth + tier gate already wired.

**Deal context assembler exists.** `getDealContextForAion()` at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` assembles deal + client + proposal + follow-up log into `AionDealContext` from a `dealId`.

**No Brain tab.** `PrismLens` type at `prism.tsx:33` is `'deal' | 'plan' | 'ledger'`. The tab array at `prism.tsx:697-699` has three entries. `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` all exist under `/app/(dashboard)/(features)/aion/components/` but are not mounted in Prism.

**Aion chat components are full-page.** `ChatInterface.tsx` is 808 lines — a complete standalone chat experience with sidebar, session history, model picker, tool rendering. Mounting it in a 400px Prism panel requires significant adaptation.

## Intended state

Daniel opens a Brain lens in Prism, sees three labeled text areas (voice description, example message, guardrails), fills them out, hits save, and immediately sees a follow-up draft for the selected deal using that voice. The voice is workspace-wide; the draft is deal-specific.

This is explicitly Phase A — not the full conversational ChatInterface experience (which is paused pending the timeline engine). The goal is to prove the voice → draft loop works before building the chat surface around it.

## The gap

- `PrismLens` type and tab array don't include `'brain'`
- No `BrainLens` component exists
- No server action wrapper to call `getDealContextForAion()` from a client component and pipe the result to the draft endpoint
- No UI state to show the returned draft inline

Everything else is already shipped.

## Options

### Option A: Thin BrainLens panel (voice form + draft preview)
- **What it is:** Add `'brain'` to `PrismLens`, add the tab button, create `brain-lens.tsx` — three labeled textareas wired to `saveAionVoiceConfig()`, followed by a draft panel that calls `/api/aion/draft-follow-up` after save. Deal context fetched via a small server action wrapper.
- **Effort:** Small (3–4 files, ~150 LOC total)
- **Main risk:** "No deal selected" edge case — Brain lens is in Prism which can be open without a deal selected. Need a guard.
- **Unlocks:** The exact experience described. Also creates the slot where ChatInterface drops in later without any structural refactor.

### Option B: Voice setup on global Aion page, draft in Follow-Up Card
- **What it is:** Add a "Voice" settings section to `/aion`, extend the Follow-Up Card in the Deal lens to show a draft after voice is set. No new Prism tab.
- **Effort:** Medium (touches two separate surfaces)
- **Main risk:** Fragmented — voice setup and draft preview are on different pages. The "write 3 paragraphs → see the draft" loop requires two navigations.
- **Unlocks:** Voice config UI without touching Prism. Weaker UX story for the demo.

### Option C: Full ChatInterface as Brain lens (scoped to deal)
- **What it is:** Mount `ChatInterface.tsx` as the Brain tab, inject `dealId` as page context so Aion can pull deal facts, let the conversational onboarding flow collect the voice naturally.
- **Effort:** Large (ChatInterface is 808 LOC, needs deal scope threaded through session management, starter messages, and tool resolution)
- **Main risk:** This is the paused feature. The primer explicitly notes Brain is "waiting for timeline engine." Shipping it half-wired risks a broken experience.
- **Unlocks:** The full conversational Aion-in-deal experience — but that's Phase B, not A.

## Recommendation

Option A. The backend stack is complete — type, save action, draft endpoint, deal context assembler. Every one of those was built anticipating exactly this flow. The only missing layer is a thin UI bridge inside Prism: three textareas, a save button, and a draft preview card. That's an afternoon of work, not a feature sprint.

Option B fragments the loop that makes the demo compelling. Option C is explicitly deferred — don't unblock a paused feature by partially wiring it.

One detail worth watching: `saveAionVoiceConfig()` at `aion-config-actions.ts:197` writes via the server session client (not system), which means `workspaces` needs an UPDATE RLS policy for authenticated workspace members. Verify this policy exists before testing, or the save will silently fail and return `{ success: false }`. Check `supabase/migrations/` for a `workspaces UPDATE` policy.

## Next steps for Daniel

1. Extend `PrismLens` type at `prism.tsx:33` to `'deal' | 'plan' | 'ledger' | 'brain'` and add `{ value: 'brain', label: 'Brain' }` to the tab array at `prism.tsx:697`.
2. Add a server action `getBrainDraftContext(dealId: string)` in `follow-up-actions.ts` that calls `getDealContextForAion()` and returns the result — this is the client-safe bridge.
3. Create `src/app/(dashboard)/(features)/events/components/brain-lens.tsx` — three labeled textareas pre-filled from `getAionConfig()`, a save button calling `saveAionVoiceConfig()`, and a draft panel.
4. In the draft panel: on save success, POST to `/api/aion/draft-follow-up` with `{ context: await getBrainDraftContext(dealId), workspaceId }` and render `draft` + `channel` label.
5. Guard the "no deal selected" case — show a "Select a deal to generate a draft" placeholder when `selectedId` is null.
6. Verify a `workspaces UPDATE` policy exists for authenticated workspace members in `supabase/migrations/`. If missing, the save action will fail silently.

## References

- `src/types/supabase.ts:7782` — `aion_config` column definition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12` — `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/api/aion/draft-follow-up/route.ts:1` — draft endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion()`
- `src/app/(dashboard)/(features)/events/components/prism.tsx:33` — `PrismLens` type
- `src/app/(dashboard)/(features)/events/components/prism.tsx:697` — tab array
