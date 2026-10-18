# Minimum path to voice setup + first real draft

_Researched: 2026-07-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture. Given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Goal: Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice.

## Current state

**Both premises in the question are wrong.** The codebase is significantly further along than the planning primer describes.

`aion_config` is a live `Json` column on `public.workspaces`, confirmed at `src/types/supabase.ts:7782–7868`. `getAionConfigForWorkspace` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`. `saveAionVoiceConfig` writes it at line 178 of the same file.

The chat route at `src/app/api/aion/chat/route.ts` is a fully working tool-calling route, not a stub. It loads `aionConfig`, runs `getOnboardingState()`, and returns an appropriate greeting.

A 5-step onboarding state machine exists in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`:
- `no_voice` → chat asks about communication style (chip row + free-text)
- `no_example` → chat asks for a paste of a message that landed well
- `no_guardrails` → chat asks for hard rules
- `needs_test_draft` → chat offers to run `draft_follow_up` on the top deal
- `configured` → normal pull-mode chat

`generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:26` already accepts `AionVoiceConfig | null` and injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`generate-draft.ts:63–75`).

`/draft-follow-up/route.ts:53` reads `aionConfig.voice` and passes it through. The pipeline is complete.

**The actual blocker:** `applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name on every read and sets `voice_default_derived: true`. Because `getOnboardingState()` returns `configured` when that flag is set (`aion-chat-types.ts:248`), the 4-step onboarding flow **never fires** for any workspace that has a name. A new Daniel-workspace goes straight to `configured` state, bypassing the entire voice-collection flow.

The only route back into explicit voice setup is "Tune Aion's voice" — a sidebar overflow item (`AionSidebar.tsx:1043`) that calls `resetAionVoiceConfig`. This strips `voice`, `voice_default_derived`, and `onboarding_state` from the config, re-entering `no_voice` state. The affordance exists but is buried three clicks deep.

The `/settings/aion` page (`src/app/(dashboard)/settings/aion/page.tsx`) handles card-beta consent and memory backfill only. There is no form for directly writing voice config.

## Intended state

Daniel opens the Aion page, describes his voice in his own words (potentially multi-paragraph free text), and within the same session sees a follow-up draft that reflects what he wrote. The experience should not require: knowing about a sidebar overflow, understanding the state machine, or splitting voice description across 4 separate chat turns.

## The gap

- No dedicated form for writing voice config directly. The only input paths are the conversational onboarding (currently bypassed) and the sidebar overflow (buried).
- `applyVoiceDefaultIfEmpty` short-circuits the onboarding flow for every workspace that has a name, making the explicit flow invisible.
- The settings page (`/settings/aion`) has the right location for a voice form but the section does not exist.
- The "write 3 paragraphs" shape is a mismatch with the chip-driven conversational flow, which expects one answer per turn.

## Options

### Option A: Voice config form in settings

- **What it is:** Add a `VoiceConfigForm` section to `/settings/aion/page.tsx` — three labeled textareas (communication style, example message, hard rules) that call `saveAionVoiceConfig`. Add a "Test with a draft" button that calls `POST /api/aion/draft-follow-up` against the workspace's top active deal and renders the result inline.
- **Effort:** Small (one new component, ~150 lines, no DB changes, no new routes).
- **Main risk:** The test-draft button needs a deal in the workspace. Needs a graceful empty state: "Add a deal first, then I can show you a sample."
- **Unlocks:** Daniel can write freely, save, and see a draft in one sitting. The conversational onboarding remains intact for users who prefer guided setup.

### Option B: First-visit discovery banner on the Aion page

- **What it is:** When `voice_default_derived === true`, render a dismissible `StagePanel` notice above the ChatInterface in `AionPageClient.tsx` with copy like "Aion is using a generic voice. Tell it how you actually communicate." CTA: "Set up voice" → calls `resetAionVoiceConfig` + reloads, dropping into `no_voice` → the existing conversational flow takes over.
- **Effort:** Tiny (one server action call, one conditional StagePanel block).
- **Main risk:** Still forces Daniel through 4 separate chat turns to enter his style. Doesn't satisfy the "write 3 paragraphs in one shot" goal.
- **Unlocks:** Onboarding flow becomes discoverable without sidebar knowledge. Good complement to Option A, poor substitute.

### Option C: Inline voice-setup panel on first Aion open

- **What it is:** When `getOnboardingState` would return anything other than `configured` (or when `voice_default_derived` is true and user hasn't dismissed), render a StagePanel above the chat with three inline fields — style, example, rules. On save: call `saveAionVoiceConfig`, clear `voice_default_derived`, transition immediately to `needs_test_draft` with a draft rendered in the same view.
- **Effort:** Medium (new UI state in `AionPageClient`, inline draft fetch, dismissal logic).
- **Main risk:** More surface area than Option A with a similar payoff. Harder to revisit than a settings page.
- **Unlocks:** The "open → write → see draft" path is a single screen with no navigation required.

## Recommendation

Ship Option A first, add Option B as a two-line follow-on.

Option A is the right shape: Daniel has specific language he wants to encode, not a blank-slate user who needs conversational guidance. A form in `/settings/aion` matches how every comparable tool (Linear, HubSpot AI, Superhuman) handles assistant personalization — a dedicated settings surface, not a chat transcript. The infrastructure is already in place: `saveAionVoiceConfig` and `generateFollowUpDraft` need no changes. The only work is a form component and a test-draft call in the settings page.

Option B is a two-line follow-on: add the discovery banner so users who prefer conversational setup aren't locked out of the existing flow. It's 20 minutes of work once Option A is in.

Option C is the wrong tradeoff. It front-loads setup into the chat landing, which penalizes returning users who just want to ask a question.

The synthesized default behavior (`applyVoiceDefaultIfEmpty`) should stay — it's a sensible fallback for workspaces that skip setup. The only problem is discoverability, which both A and B address.

## Next steps for Daniel

1. Add `VoiceConfigForm` component to `src/app/(dashboard)/settings/aion/VoiceConfigForm.tsx` — three `<textarea>` fields wired to `saveAionVoiceConfig` via `useActionState`.
2. Add a "Test draft" button that calls `POST /api/aion/draft-follow-up` with the workspace's top active deal. Fetch the deal id from the existing `getAionConfig` + a simple deal lookup (one RPC or direct query against `public.deals`).
3. Wire `VoiceConfigForm` into `/settings/aion/page.tsx` — render it above `MemoryBackfillSection`, visible to admins/owners only.
4. Add the discovery banner to `AionPageClient.tsx`: if `voice_default_derived === true`, show a one-line `StagePanel` with a link to `/settings/aion`.
5. Smoke-test: fill all three fields, save, hit "Test draft" — confirm the draft reflects the written voice, not the synthesized generic.
6. Remove the line in the primer that says `aion_config` doesn't exist and the Brain tab is paused — both have been false for several sprints.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfigForWorkspace`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `getOnboardingState`, `OnboardingState` type
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, 4-step onboarding greetings
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings surface to extend
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/types/supabase.ts:7782` — `aion_config: Json` column confirmation
