# Scope Phase A: Aion voice setup + first real draft

_Researched: 2026-08-09 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on primer accuracy:** Both stated premises are outdated. `aion_config` is live. The 16-line GPT-4 stub has been superseded by a full streaming chat route. The only thing missing is the voice-setup UI.

## Current state

**`aion_config` column is live.** Added via `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` (`ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS aion_config jsonb NOT NULL DEFAULT '{}'`). Typed in `src/types/supabase.ts:7782`.

**`AionVoiceConfig` type is defined** at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16` — three fields: `description` (how this company communicates), `example_message` (a sample outbound message), `guardrails` (strict override rules).

**Voice is already injected into every AI prompt.** `src/app/api/aion/lib/generate-draft.ts:52-80` reads all three fields and injects them under a `"--- How This Company Communicates ---"` header. The chat tool at `src/app/api/aion/chat/tools/core.ts:36` does the same via `buildDraftPrompt`.

**Draft endpoint is live.** `src/app/api/aion/draft-follow-up/route.ts` (74 lines) — authenticated POST, Aion-tier gated. Takes `{ context: AionDealContext, workspaceId }`, calls `generateFollowUpDraft`, returns `{ draft: string, channel }`.

**`getDealContextForAion` is live.** `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-598` — 4 parallel queries, returns full `AionDealContext` (deal, client, proposal, followup log).

**`saveAionVoiceConfig` action exists** at `aion-config-actions.ts:162` — deep-merges into `aion_config.voice`.

**5-state onboarding machine is defined** at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`.

**Brain tab does not exist.** No route segment for `brain` exists anywhere under `src/app/`. `CadenceLearningToggle.tsx` references "the Brain tab" in a comment (`src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14`) but the route is never created.

## Intended state

Daniel opens a Brain tab, steps through a 3-field voice form (how he communicates / sample message / guardrails), and immediately sees Aion produce a follow-up draft in that voice for one of his open deals. The config is saved to `aion_config.voice` and applies to all future drafts from that moment on.

The 5-state machine already models this flow — it just needs a UI surface to drive it.

## The gap

- No `/aion/brain` route or page exists
- No voice-setup form component (3-textarea stepped form wired to `saveAionVoiceConfig`)
- No test-draft UX (call `/api/aion/draft-follow-up` with a real deal, show result inline)
- The onboarding state machine is defined but no UI drives it
- No "Brain" nav item in the Aion interface

Everything else — DB column, types, save action, draft endpoint, deal context builder, prompt injection — is wired.

## Options

### Option A: Voice setup panel inside the existing /aion chat interface

**What it is:** Add a setup state to `ChatInterface.tsx` — when `onboarding_state !== 'configured'`, render a stepped form overlay rather than the main chat. No new route.

**Effort:** Small (1–2 days). All server plumbing exists.

**Main risk:** `ChatInterface.tsx` is already complex. Embedding setup logic there tangles concerns and makes the future Brain tab harder to grow.

**Unlocks:** Voice configured and draft seen from the existing `/aion` URL with no nav change.

### Option B: New /aion/brain route as a standalone page

**What it is:** Create `src/app/(dashboard)/(features)/aion/brain/page.tsx`. Full-page voice setup + test-draft preview. Add "Brain" to Aion nav. `CadenceLearningToggle` drops in immediately as a second section.

**Effort:** Medium (2–3 days). New route + stepped form UI, but all server actions and the AI endpoint already exist.

**Main risk:** Adds a nav destination before it has enough content to justify its own page — may feel sparse on day one.

**Unlocks:** A permanent home for all Brain-tab features: cadence learning, playbook rules, autonomous-addon toggle. Grows cleanly.

### Option C: Wire voice setup into workspace settings

**What it is:** Add an "Aion Voice" section to the existing workspace settings page. Lowest-friction delivery.

**Effort:** Small (half a day). Pure UI plumbing.

**Main risk:** Wrong product location. Buries the feature; kills the "write → see draft instantly" moment that makes voice setup compelling.

**Unlocks:** Voice config saved — but misses the aha moment entirely.

## Recommendation

**Option B: ship the `/aion/brain` route.**

The voice-setup form is only 3 textareas plus one API call — it will not take 2–3 days at full pace. But keeping the setup logic inside `ChatInterface.tsx` (Option A) is a short-term shortcut that makes the eventual Brain tab harder to extract, and workspace settings (Option C) loses the "I just wrote how I talk and Aion immediately drafted for me" moment that makes the feature worth building.

Starting the Brain tab as a focused voice-setup page is low-risk because `CadenceLearningToggle.tsx` already exists as a drop-in second section, the playbook editor can follow naturally, and the onboarding state machine is already defined. The route just needs a page, a stepped form, and a test-draft panel — all wired to existing server actions and a live endpoint. Day one the page is sparse; that is fine, because the draft it produces is the whole point.

Accept the tradeoff: it requires adding a nav item and a new page file, but it is the right foundation.

## Next steps for Daniel

1. Check what nav component the Aion interface uses (look for `AionSidebar` or the layout file in `src/app/(dashboard)/(features)/aion/`) and add a "Brain" link pointing to `/aion/brain`.
2. Create `src/app/(dashboard)/(features)/aion/brain/page.tsx` — server component that calls `getAionConfig()` and passes `onboarding_state` down.
3. Create `src/app/(dashboard)/(features)/aion/brain/components/VoiceSetupForm.tsx` — stepped form: description → example_message → guardrails, each step calls `saveAionVoiceConfig`. Use `stage-panel` surface (not `liquid-card`).
4. After guardrails saved, show a "Test draft" button: fetch the top `ops.follow_up_queue` item, call `getDealContextForAion`, POST to `/api/aion/draft-follow-up`, display the returned draft in a read-only panel.
5. Add "Looks right" CTA that calls `saveAionVoiceConfig({ onboarding_state: 'configured' })` and removes the setup UI.
6. Drop `CadenceLearningToggle` into the page as a second section below the configured voice display — it's already built and references this tab.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionVoiceConfig type, saveAionVoiceConfig, getAionConfig, onboarding state machine
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — voice injected into prompts
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts` — getDealContextForAion, AionDealContext
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — 5-state onboarding machine
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx` — Brain tab drop-in
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — aion_config column origin
