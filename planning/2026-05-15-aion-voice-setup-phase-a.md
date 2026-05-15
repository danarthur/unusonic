# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-05-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer described two blockers that no longer hold.

**`aion_config` does exist.** `public.workspaces` has an `aion_config jsonb` column. `getAionConfig()` reads it at `aion-config-actions.ts:84`, `getAionConfigForWorkspace()` reads it at `aion-config-actions.ts:106`. `saveAionVoiceConfig()` writes to it at `aion-config-actions.ts:178`. All three are in production and used by live routes.

**The chat route is fully wired.** `/api/aion/chat/route.ts:57` is a full auth-protected, tool-calling, `streamText`-powered endpoint — not the 16-line GPT-4-turbo stub the primer described.

**The 4-step onboarding state machine is built.** `getOnboardingState()` at `aion-chat-types.ts:247` drives a `no_voice → no_example → no_guardrails → needs_test_draft → configured` sequence. The chat route checks this on every cold open (`chat/route.ts:122`) and `buildGreeting()` returns the appropriate first message for each state (`prompts.ts:301–338`).

**The draft-follow-up route is live.** `/api/aion/draft-follow-up/route.ts:21` is auth-gated, reads voice config, calls `generateFollowUpDraft()` from `lib/generate-draft.ts:25`, and returns `{ draft, channel }`.

**The `voice_default_derived` bypass is the actual blocker.** `aion-config-helpers.ts:43` synthesizes a default voice from the workspace name when no voice is stored, sets `voice_default_derived: true`, and `getOnboardingState()` at `aion-chat-types.ts:248` returns `'configured'` when it sees that flag. New workspaces land in the chat already "configured" — the 4-step flow never fires. The only entry point to force it is `resetAionVoiceConfig()` wired to "Tune Aion's voice" in `AionSidebar.tsx:1002`, which is buried three clicks deep.

**No Brain tab or voice-setup surface exists.** Navigation at `nav-items.ts` has a single `/aion` entry. No `/aion/setup`, no Brain tab within deal/event pages, no first-run modal. The `CadenceLearningToggle` component (`CadenceLearningToggle.tsx:14`) mentions the Brain tab in a comment as a future home, but that is the only reference.

## Intended state

Daniel opens a dedicated surface (tab or modal), writes three freeform paragraphs — communication style, an example message, guardrails — and within two seconds sees a draft that sounds like those paragraphs. The "aha" is immediate: he teaches Aion once and every future follow-up draft sounds like him. The chat-based 4-step flow exists but is conversational and slow — it was designed as a backup, not a first-run path.

## The gap

- No dedicated voice-setup UI surface; the form fields (`description`, `example_message`, `guardrails`) only exist as TypeScript types, not as rendered inputs.
- `voice_default_derived` bypass makes the 4-step chat flow invisible to new owners.
- No preview-draft call from a setup surface — the `/draft-follow-up` endpoint exists but nothing calls it from a setup context.
- If no real deals exist when setup completes, the draft call needs a fallback sample context.

## Options

### Option A: Make the chat-based 4-step flow reachable
- **What it is:** Add a prominent "Set up your voice" button on the `/aion` empty state (or a banner when `voice_default_derived` is true) that calls `resetAionVoiceConfig()` and refreshes the chat. The existing `no_voice` greeting fires. The draft test at step 4 is already wired.
- **Effort:** Small — one button, one server action call, one redirect. No new pages.
- **Main risk:** The conversational path is still 4 turns before seeing a draft. Chips help, but it does not match the "write 3 paragraphs, see a draft" goal. The example-message step expects a paste, which is awkward in a chat box.
- **Unlocks:** Voice setup without new UI work. Proves the state machine works end-to-end.

### Option B: Build a small voice-setup form with instant draft preview
- **What it is:** A new page at `/aion/setup` (or a full-screen modal launched from the `/aion` empty state). Three labeled textareas map to `description`, `example_message`, and `guardrails`. A "Save and see a draft" button calls `saveAionVoiceConfig()` then immediately fetches `/api/aion/draft-follow-up` with the first open deal context (or a hardcoded demo deal if none exist). The result renders as a `draft_preview` card below the form.
- **Effort:** Medium — one new route or modal, a form component (~150 lines), a sample-deal fallback constant, and wiring the two existing server actions.
- **Main risk:** The demo-deal fallback produces a less compelling preview than a real deal. Acceptable for Phase A; replace with real deal data in Phase B.
- **Unlocks:** The exact "write and see" moment Daniel described. Also becomes the natural home for the cadence toggle and playbook editor in Phase B.

### Option C: Parse freeform paragraphs in the chat
- **What it is:** Modify the `no_voice` greeting to accept a multi-paragraph dump ("Tell me everything about how you work in one message") and use an LLM extraction step to split it into `description`, `example_message`, and `guardrails` fields, then immediately generate a draft.
- **Effort:** Medium — requires a new extraction prompt, a tool call or secondary `generateText` pass, and careful error handling when the paragraphs don't map cleanly.
- **Main risk:** Parsing three fields from freeform text is brittle. The user experience is unclear about format. A misextracted `guardrails` field could permanently misbehave the cron drafts.
- **Unlocks:** Single-turn setup from the chat surface — no new page needed.

## Recommendation

Build Option B. The form-based path is what Daniel described ("write 3 paragraphs, see a draft immediately") and it matches how designers and makers think, not how chatbot users think. The conversational 4-step flow (Option A) is already built and reachable — it can stay as a fallback via the sidebar "Tune Aion's voice" menu. Option C is clever but fragile; incorrect field extraction would silently degrade every future draft.

Option B's medium effort estimate is generous. The server-side work is done: `saveAionVoiceConfig()` and `generateFollowUpDraft()` both exist and are tested. The UI is three textareas, a button, and a draft card. The only non-trivial decision is whether to build this as a new route (`/aion/setup`) or a modal on the existing `/aion` page. Given the goal is a focused, distraction-free writing experience, a full-page route is cleaner.

The `voice_default_derived` bypass should also be addressed: once a workspace completes the form setup, that flag is already cleared by `saveAionVoiceConfig()` (`aion-config-actions.ts:190`). No migration needed.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/setup/page.tsx` — a server component that reads `getAionConfig()` and passes the stored voice fields as props to a client form.
2. Create `src/features/aion/ui/VoiceSetupForm.tsx` — three textareas (description, example message, guardrails), a submit button. On submit, calls `saveAionVoiceConfig()` then POST `/api/aion/draft-follow-up` with the workspace's first open deal (or the hardcoded fallback).
3. Define the demo-deal fallback constant in `src/features/aion/lib/demo-deal-context.ts` — a realistic wedding/corporate show with a sent proposal and no response in 5 days.
4. Render a `draft_preview`-style card below the form after the draft returns (reuse the card shape from `aion-chat-types.ts:176`).
5. Add a "Set up your voice" link to the `/aion` page when `voice_default_derived` is true — point it at `/aion/setup`.
6. Add a "Retune" link in the existing `AionSidebar.tsx` overflow menu pointing to `/aion/setup` instead of calling `resetAionVoiceConfig()` inline (keeps the reset + setup in one flow).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `voice_default_derived` synthesis bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/route/prompts.ts:292` — `buildGreeting` per-state greeting logic
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` shared function
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — existing "Tune Aion's voice" reset entry point
