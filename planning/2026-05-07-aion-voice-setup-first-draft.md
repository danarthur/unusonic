# Aion Phase A: Voice setup to first draft

_Researched: 2026-05-07 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premises:** Several assumptions in this question are no longer accurate as of today. The codebase has advanced significantly since the primer's "as of 2026-04-10" snapshot. The document below corrects those assumptions and redirects to the actual gap.

## Current state

**`aion_config` exists and is fully typed.** `public.workspaces.aion_config` is a non-null JSONB column defaulting to `{}`, present in the baseline migration and reflected in `src/types/supabase.ts:7689`. The TypeScript shape is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`:

```
AionConfig {
  voice?: { description, example_message, guardrails }
  learned?: { vocabulary, patterns, preferences }
  follow_up_playbook?: { rules, version }
  onboarding_state?: string
  kill_switch?: boolean
  learn_owner_cadence?: boolean
  voice_default_derived?: boolean
}
```

**Voice save/read/reset are implemented.** `saveAionVoiceConfig()` at `aion-config-actions.ts:178`, `resetAionVoiceConfig()` at `aion-config-actions.ts:214`, and `getAionConfigForWorkspace()` at `aion-config-actions.ts:106` are all live server actions using the system client. A synthetic default is applied when voice is empty via `applyVoiceDefaultIfEmpty()` — Aion is never voiceless.

**Draft-follow-up API is implemented and auth-guarded.** `src/app/api/aion/draft-follow-up/route.ts:1-73` enforces JWT auth, tier gate, and kill-switch check, then calls `generateFollowUpDraft({ context, voice })` at line 60 with the workspace voice config. It returns `{ draft: string, channel: 'sms' | 'email' }`.

**`getDealContextForAion` is implemented.** `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611` builds a full `AionDealContext` (deal, client, proposal, follow-up log, entity IDs) via four parallel fetches.

**Aion settings page exists.** `src/app/(dashboard)/settings/aion/page.tsx:1-77` is the live settings entry point, delegating to `AionSettingsView` which handles voice tuning, kill switch, and consent. There is no "Brain tab" — the UI is at `/settings/aion/`, not a tab inside a paused modal.

**Chat route is fully wired.** `/api/aion/chat/route.ts` enforces auth + tier + kill switch, runs intent classification, and selects a model tier. All tiers currently resolve to Haiku 4.5 (a temporary constraint noted in the code, not a structural limit).

**`ArthurInput.tsx` does not exist.** No legacy Arthur component to clean up.

## Intended state

Daniel opens the voice settings form, writes 3 paragraphs describing how he communicates with clients (`voice.description`), optionally adds an example message (`voice.example_message`), saves, and immediately sees a follow-up draft Aion would have sent for a real deal — demonstrating that the voice was absorbed. The feedback loop is the "wow moment" that validates the setup is working.

The infrastructure (save, read, generate) is present. What's missing is the **onboarding trigger**: after saving voice config, nothing surfaces a sample draft. The user saves into a void and has to trust it worked.

## The gap

- `AionSettingsView` has a voice form with save/reset but no post-save draft preview.
- No "generate sample" button or inline result panel exists in the settings page.
- No onboarding state transition from `voice_default_derived: true` → `voice_confirmed: true` after the user writes their own.
- The model tier lock at Haiku 4.5 means draft quality is currently capped; Daniel should know a voice preview will reflect the current tier, not the final quality target.

## Options

### Option A: "Preview draft" inline in voice settings

- **What it is:** Add a "Generate sample draft" button to the existing `AionSettingsView` voice form. On click, call `/api/aion/draft-follow-up` with the top item from the workspace's `follow_up_queue` (or a synthetic context if the queue is empty), and render the returned draft string in a read-only panel below the form.
- **Effort:** Small — one new client action, one UI block in an existing component. No schema changes.
- **Main risk:** If the queue is empty (new workspace, no deals yet), the fallback synthetic context needs to be realistic enough to show voice variation. A hollow placeholder draft undersells the feature.
- **Unlocks:** The complete voice-setup → feedback loop in the existing settings surface. Daniel can iterate on his description and re-preview.

### Option B: First-launch modal in the Aion chat

- **What it is:** On first visit to `/aion` when `aion_config.voice` is empty (and `voice_default_derived` is true), surface a guided setup modal: three prompts (voice, example message, guardrails), then generate and display a sample draft before dismissing. Set `onboarding_state: 'voice_complete'` on save.
- **Effort:** Medium — new modal component, new onboarding state machine branch, routing logic on page load.
- **Main risk:** Interrupts the Aion chat flow for anyone who hasn't set voice; if they dismiss without completing, the state is ambiguous. More moving parts to maintain.
- **Unlocks:** A cleaner onboarding narrative — voice setup feels intentional and contextual, not buried in settings.

### Option C: Dedicated onboarding wizard route

- **What it is:** `/aion/setup` — a multi-step wizard (voice → example → guardrails → preview draft → confirm) that sets `onboarding_state: 'complete'` and redirects to `/aion`. Linked from the empty-state in the Aion page.
- **Effort:** Large — new route, new wizard shell, completion redirect, state persistence.
- **Main risk:** Overbuilt for the current user count. Adds a flow that needs to be maintained as the product evolves.
- **Unlocks:** The cleanest UX, but overkill before product-market fit is confirmed.

## Recommendation

**Option A.** The infrastructure is built. The only missing piece is surfacing the draft result after voice is saved. Adding a preview panel to `AionSettingsView` is a contained, low-risk change that closes the loop without new routes or state machines.

One important caveat: the current Haiku 4.5 tier lock means the preview draft will be lower quality than the intended final product. Label the preview accordingly ("Sample — quality improves when your workspace tier unlocks higher models") so Daniel's first impression is calibrated.

If Daniel wants a more prominent onboarding moment, Option B is the right next step — but that should be a separate queue item after Option A confirms the voice → draft pipeline is working end-to-end.

## Next steps for Daniel

1. Read `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` to understand the current voice form shape and where to add the preview trigger.
2. Read `src/app/api/aion/draft-follow-up/route.ts` to confirm the request shape (`{ workspaceId, dealId?, context? }`) and response (`{ draft, channel }`).
3. Read `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178-206` to confirm `saveAionVoiceConfig()` returns the saved config (or re-fetch it after save).
4. Add a "Preview draft" button to `AionSettingsView` that fires after save: fetch the top `follow_up_queue` item for the workspace, pass its `deal_id` to the draft API, render the result inline.
5. Handle the empty-queue fallback: if no queued deals, call the draft API with a synthetic context (hardcoded archetype: "corporate event, client hasn't signed, 3 days since last touch") so the preview is still meaningful.
6. Add a visual label on the draft preview noting it reflects the current model tier.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config CRUD, type definitions
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/settings/aion/page.tsx` — settings entry point
- `src/app/api/aion/chat/route.ts` — chat route (model tier pattern)
- `src/types/supabase.ts:7689` — `workspaces.aion_config` column type
- `supabase/migrations/20260101000000_baseline_schema.sql:13510` — `ops.follow_up_queue` table
