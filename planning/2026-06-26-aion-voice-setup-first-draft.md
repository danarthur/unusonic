# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Restatement: The queue item's premises are outdated. See Current State below. The real question is: where does the voice setup form live, and how does it connect to the draft on first use?_

---

## Current state

**`public.workspaces.aion_config` exists.** The `Json` column is live on the `workspaces` table (`src/types/supabase.ts:7782`). The full `AionConfig` type — including `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived` — is defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`.

**`AionVoiceConfig` is the right shape.** Three fields: `description` (communication style), `example_message` (sample message), `guardrails` (things to avoid). Exactly what the queue item describes as "3 paragraphs" (`aion-config-actions.ts:12-16`).

**`saveAionVoiceConfig()` is fully implemented.** Server action at `aion-config-actions.ts:178`. Merges into `aion_config`, clears `voice_default_derived`, writes via system client. Ready to call.

**`/api/aion/draft-follow-up` is live.** Authenticated, tier-gated, kill-switch gated. Reads `aion_config.voice`, calls `generate-draft.ts` which builds a system prompt from the voice fields, returns a draft string + channel (`src/app/api/aion/draft-follow-up/route.ts:1-73`).

**`getDealContextForAion()` is implemented.** Returns a clean DTO (deal, client, proposal summary, recent follow-up log) safe to send to the LLM. Used by the Follow-Up Card, the dispatch handlers, and the chat route (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545-611`).

**What does not exist:** A voice setup form UI. `AionSettingsView` (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) is about beta consent and cadence opt-in only — it has no fields for `description`, `example_message`, or `guardrails`. No `VoiceSetupForm` component exists anywhere.

**Brain tab state:** `AionPageClient.tsx` renders `ChatInterface` with `viewState="chat"`. The components are wired. The tab is paused by product decision (timeline engine dependency), not a code gap.

---

## Intended state

Daniel opens the Brain tab. If voice has never been configured (or `voice_default_derived: true`), the tab shows a short onboarding form: three labeled fields (style, example, guardrails). He fills them, hits save. Aion immediately fetches his top pending follow-up queue item, generates a draft using his voice, and shows it inline as a preview. He can edit and copy it. The Brain tab is no longer "paused" in this narrow sense — voice setup and first draft work without the timeline engine.

---

## The gap

- No voice setup form component exists anywhere in the UI
- No code reads `onboarding_state` or `voice_default_derived` to trigger an onboarding screen in the Brain tab
- No flow connects voice save → queue item fetch → draft preview as a single first-run sequence
- `AionSettingsView` covers consent/cadence but not voice
- Everything else needed (save action, draft route, context builder) is already live

---

## Options

### Option A: Voice form in Aion settings page
- **What it is:** Add a "Voice" card to `AionSettingsView` (or a new `/settings/aion/voice` route) with three text areas wired to `saveAionVoiceConfig()`. No draft preview — just saving the config.
- **Effort:** Small — one new form section, no new API routes, no schema changes.
- **Main risk:** Disconnected from the experience Daniel described. Setup happens in settings; the payoff (draft) is elsewhere. Easy to do and never visit.
- **Unlocks:** Voice-aware drafts from the Follow-Up Card immediately; other team members can set their workspace voice.

### Option B: Voice onboarding gate in the Brain tab (recommended)
- **What it is:** In `AionPageClient.tsx`, check `aion_config` on load. If `!voice || voice_default_derived`, render a `VoiceOnboarding` component instead of `ChatInterface`. Three fields, save via `saveAionVoiceConfig()`, then fetch the top `ops.follow_up_queue` item, call `POST /api/aion/draft-follow-up`, and show the resulting draft as an inline preview card. After this first-run flow, normal chat takes over.
- **Effort:** Medium — one new component (`VoiceOnboarding`), one new server action to fetch the top queue item, one sequential client-side call chain after save.
- **Main risk:** The Brain tab is declared "paused" — the team may push back on un-pausing it even partially. Scope carefully: the onboarding gate can be a separate surface (`/aion/setup`) that the Brain tab redirects to, avoiding touching the paused `ChatInterface` routing logic.
- **Unlocks:** Exactly the experience in the queue item. Validates voice config with real follow-up data on first save. Makes the Brain tab useful before the timeline engine lands.

### Option C: Inline voice prompt in the Follow-Up Card
- **What it is:** When "Draft a message" is clicked and voice is missing, expand an inline form in the Follow-Up Card (two fields: style + example, skip guardrails). Save and immediately generate the draft.
- **Effort:** Small-medium — modify `follow-up-card.tsx`, which is already the largest component in the follow-up flow.
- **Main risk:** Context is shallow — the user is mid-deal-action, not in a reflective mode. The form will feel like an interruption. Guardrails are skipped, reducing draft quality.
- **Unlocks:** Voice-aware drafts from wherever the card appears; no Brain tab dependency at all.

---

## Recommendation

**Option B, scoped to a standalone `/aion/setup` page rather than modifying `AionPageClient` directly.**

The infrastructure is complete. The only missing piece is a UI that connects three things in sequence: voice form → save → first draft preview. Option B delivers that experience without tangling with the paused `ChatInterface` timeline. Create `/app/(dashboard)/aion/setup/page.tsx` as a new server component that reads `aion_config`, redirects to `/aion` if voice is already configured, and renders `VoiceOnboarding`. The Brain tab can redirect to `/aion/setup` on first load instead of showing the paused chat. This is a clear scope boundary: one new page, one new client component, zero schema changes, zero new API routes.

Option A is too disconnected — saving voice in settings and never seeing a draft means nobody will do it. Option C solves the wrong UX — the card is a task-execution surface, not a setup surface.

---

## Next steps for Daniel

1. Create `src/app/(dashboard)/aion/setup/page.tsx` — server component that calls `getAionConfig()`, redirects to `/aion` if `voice && !voice_default_derived`, otherwise renders `<VoiceOnboardingForm initialConfig={config} />`.
2. Create `src/app/(dashboard)/aion/setup/VoiceOnboardingForm.tsx` — client component with three `<textarea>` fields (description, example_message, guardrails), styled as `stage-panel`, wired to `saveAionVoiceConfig()` via `useTransition`.
3. After `saveAionVoiceConfig()` succeeds, call a new server action `getTopFollowUpForVoicePreview(workspaceId)` that queries `ops.follow_up_queue WHERE status = 'pending' ORDER BY priority_score DESC LIMIT 1`, then calls `getDealContextForAion()`.
4. POST that context to `/api/aion/draft-follow-up` from the client and render the returned draft + channel in an inline preview card below the form.
5. In `AionPageClient.tsx`, add a redirect: if `!voice || voice_default_derived`, `redirect('/aion/setup')` at the top of the server component wrapper.
6. Delete or clear `voice_default_derived` flag after explicit save (already handled by `saveAionVoiceConfig` — no extra work needed).

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig` type, `getAionConfig`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab entry point
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — consent/cadence UI (voice form is not here)
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx` — Follow-Up Card with draft action
- `src/types/supabase.ts:7782` — `workspaces.aion_config` column
