# Replies Card v2 — Design Doc

**Source:** 2026-04-24 convergence of Visionary + User Advocate (Marcus, composite pilot user). Grounds the PR #20 implementation that follows PR #19's pipeline hardening.

**Core problem the redesign solves:** the current card stacks every thread open with every message rendered flat, so a 47-message wedding thread or a deal with 6 concurrent threads visually crushes the Deal Lens. Marcus's words: "I can see it becoming a monolith."

---

## Decisions where the two agents disagreed

| Topic | Visionary | Marcus | Resolved |
|---|---|---|---|
| Tier 1 filter row `[All] [Unread] [Has questions] [+ Auto-replies hidden]` | Keep | **Kill it. Replace with an "owed" indicator.** | **Marcus wins.** See §1 below. |
| "Show original" raw HTML toggle | Phase 2B per-message | **Never use. Drop.** | **Marcus wins.** Phase 1 dropped; admin tool only if ever added. |
| Default visible messages in expanded thread | Latest 3 | **Latest 5, with date dividers driving the cut so I don't get half of Tuesday's exchange.** | **Marcus's instinct wins.** Default 5, but additionally ensure we never split a calendar day. Last 5 OR all messages from the most recent date divider, whichever is more. |
| Composer autofocus on thread-expand via notification | Implied focused | **Don't autofocus. I might want to mark stage, not reply.** | **Marcus wins.** Composer present but unfocused. |
| In-card search (⌘F + card-header icon) | Phase 2B | **Day-1 must-have (Moment C: client asks fact-check in person)** | **Pull into PR #20.** Data is already in memory (we load all messages per thread); client-side filter is ~40 lines of code. Postgres FTS deferred until threads > 100 msgs. |

---

## What the agents converged on

Strong agreement — no decision needed:

- **Threads collapsed by default** in the card. Each thread = one row.
- **One-expanded-at-a-time** behavior (Apple Mail pattern). Clicking a new thread auto-collapses the current.
- **Single composer at the bottom of an expanded thread**, not per-message. (Today's per-message Reply button IS the monolith symptom Daniel flagged.)
- **Show latest N + "Show N earlier messages · date range"** ghost row. (N resolved above.)
- **Quoted-reply auto-collapse per message** — "Show 6 earlier quoted lines." Use Postmark's `StrippedTextReply` to compute the boundary.
- **Card chrome row** — title + thread count + unread count + (the new "owed" indicator).
- **Date dividers** between messages.
- **Auto-reply muted treatment** (already shipped in PR #19) stays.
- **Stacked-avatar tile** on collapsed thread rows — up to 3 avatars, "+N" overflow.

Deferred from Phase 1 by both (not disagreed):

- Aion thread summary line (Phase 1.5+, gated on classification precision)
- Aion classification chips per message (Phase 1.5+, precision-gated)
- Sender filter chips *always visible* (Phase 2B; conditional render is acceptable if we skip for now)
- `Recent Replies` lobby panel (Phase 2B — separate widget)
- Deep-link URL pattern `?thread=&message=` (Phase 2B)
- Internal-team comments on threads (Phase 1.5 — Front-flavored)
- Templates / snippets (Phase 1.5)
- Cross-deal sender history (Phase 1.5)
- Per-channel threading toggle for SMS (Phase 1.5 when SMS ships)
- Mobile bottom-sheet behavior (Phase 1.5 mobile pass)

---

## 1. The "Owed" indicator (Marcus's biggest contribution)

Marcus's distinction: **unread is "did I see it," owed is "do they need something from me."** A thread can have 12 unread auto-replies and zero owed; the card should say "all clear." That's the trust signal.

**Card header signal line** (replaces the v1 filter row entirely):

- Zero owed: `Caught up · last reply Tue 4:12pm`
- One owed: `Owed · Ally Chen asked about the smoke permit (Wed 10:47pm)`
- Multiple owed: `2 owed · Ally (smoke permit) · Pramila (final headcount)`

**Phase 1 heuristic for "owed"** (no Aion dependency):

```sql
-- A thread is OWED when:
--   (a) its most recent message is inbound,
--   (b) that message is < 30 days old,
--   (c) that message is NOT an auto-reply.
SELECT mt.id
FROM ops.message_threads mt
JOIN LATERAL (
  SELECT direction, is_auto_reply, created_at, from_address
  FROM ops.messages
  WHERE thread_id = mt.id
  ORDER BY created_at DESC
  LIMIT 1
) latest ON true
WHERE mt.deal_id = $1
  AND latest.direction = 'inbound'
  AND latest.is_auto_reply = false
  AND latest.created_at > now() - interval '30 days';
```

Single RPC: `ops.get_owed_threads_for_deal(p_deal_id)`. Returns rows with `thread_id, primary_contact_name, preview, last_message_at`. Server-side. Cached 60s on the RSC; invalidated on inbound webhook.

Phase 1.5 upgrade path: Aion classification replaces the heuristic with `aiClassification IN ('question', 'decision_needed', 'wants_meeting', 'objection')`.

---

## 2. Thread-row bounce indicator (trust-critical)

Today: bounce renders as a red footer inside a message tile, only visible when the thread is expanded.

v2: bounce is **thread-row state**. If any outbound message on the thread has `bounced_at IS NOT NULL` AND no subsequent successful delivery, the collapsed thread row renders:

- Red dot next to the avatar (not the unread blue dot — the two dots are distinct colors)
- Tag in the meta row: `Bounced`
- Meta row tap → expands thread AND scrolls to the bounced message
- Overflow menu on that message: "Retry send"

Marcus's phrasing: "the experience of 'client replies stopped 5 days ago because my email got marked spam and I thought she was ghosting' — that single failure mode kills trust forever."

Data already present in `ops.messages.bounced_at`. Just needs query + UI.

---

## 3. Snooze (the 10:47pm dinner scenario)

Per-thread, three options (never more):

- **4 hours**
- **Tomorrow morning** (8am in workspace tz)
- **Next week** (Monday 8am in workspace tz)

Column on `ops.message_threads`:

```sql
ALTER TABLE ops.message_threads
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
```

Thread rows where `snoozed_until > now()` de-emphasize (opacity 0.5, italic). They still render — Marcus wants to see them. When `snoozed_until < now()`, they pop back to normal + unread-state surfaces them in the lobby "Snoozed to today" count.

Snooze UI: thread-row overflow menu (kebab on hover / three-dot tap). Three options, single click each.

Phase 1.5: the lobby's Aion Brief shows "1 thread snoozed to today" as a persistent reminder — that integration is separate from this PR.

---

## 4. In-card search (Moment C)

**Trigger:** `⌘F` when Replies card has scroll focus, OR the search icon in the card header.

**Scope:** all messages across all threads on THIS deal. Not global.

**Implementation (Phase 1):** client-side filter over the already-loaded message set. `getDealReplies` already returns every message; no new data-fetch needed.

**Interaction:**
- Input appears inline below the card header with `STAGE_LIGHT` spring drop
- Query runs on every keystroke (debounced 150ms)
- Threads with ≥1 match stay visible; non-matching threads fade to 30% opacity
- Within each surviving thread, message-count chip shows `2 of 12 match`
- Matched terms get a soft accent underline on the body text
- ESC or empty query resets

**What we're NOT doing in PR #20:**
- Global search across deals (Phase 2C)
- Sender+keyword compound search (Phase 2B)
- Natural language via Aion ("what did planner quote for uplights") — Phase 3
- Postgres FTS indexes — Phase 2C when thread sizes exceed client-side practical limits (~200 msgs)

---

## 5. Layout — tier-by-tier spec

All measurements at **balanced** density (default). Card uses `StagePanel elevated` (L=0.22). Inside the card, threads are `stage-panel-interactive` rows when collapsed, `stage-panel` containers when expanded.

### Tier 1 — Card chrome (~60px tall, fixed)

```
┌───────────────────────────────────────────────────────────┐
│  Replies · 3 threads · 2 unread            [⌕]  [+ Compose]│   row 1
│  Owed · Ally Chen asked about the smoke permit (Wed 10:47p)│   row 2 — the OWED line
└───────────────────────────────────────────────────────────┘
```

Row 2 always renders. Copy varies by owed count: "Caught up · last reply X" / "Owed · <msg>" / "2 owed · <a> · <b>."

### Tier 2 — Thread list (~80px per collapsed row)

```
┌──────────────────────────────────────────────────────────────┐
│ ●  [👤👤👤]  Ally Chen + 2 others                         2h │  ← avatar stack, name, time
│               Re: Sangeet timing                              │  ← subject (secondary)
│               "yes — let's lock May 15 for the Sangeet,…"     │  ← preview (primary, truncate 120ch)
│               📎 1 attachment · 47 messages · ● Bounced       │  ← meta row (tertiary)
└──────────────────────────────────────────────────────────────┘
```

- **Unread dot** on the far-left edge (8px, blue `--color-unusonic-info`).
- **Bounce dot** also on the far-left edge but distinct color (red `--color-unusonic-error`). Both can appear stacked vertically if both conditions fire.
- **Stacked-avatar tile** (up to 3, +N overflow). Resolved from `cortex.relationships` PARTNER/CLIENT edges where available; falls back to email initials.
- **Subject line** in `--stage-text-secondary`. If no subject (SMS-future), "[Direct message]".
- **Preview** uses `StrippedTextReply` when present, else `body_text`, truncated to ~120 chars. Short messages (<12 chars, e.g. "yes!! 💕") render full-size, not compressed.
- **Meta row**: attachment count, total message count, bounce/urgency/question chips. Tertiary text. Only renders slots that have data.
- **Hover:** 8% white overlay, edges intensify. No translateY. 80ms ease-out.
- **Click anywhere:** expand. `STAGE_MEDIUM` spring. Sibling expanded threads collapse simultaneously.
- **Snoozed threads:** full row at opacity 0.5, italic timestamp.

### Tier 3 — Expanded thread (variable height)

```
┌──────────────────────────────────────────────────────────┐
│ ●  [👤👤👤] Ally Chen + 2 others · Re: Sangeet timing  ▴ │   ← sticky header
│                                                           │
│  ┌─ Show 41 earlier messages · Apr 8 → Apr 22 ────────┐   │   ← ghost row (only if count > 5)
│                                                           │
│  ─── Apr 23 ─────────────────────────────────────────     │   ← date divider
│                                                           │
│  ┌─[👤] Pramila · Planner                       2:14p ┐  │   ← message tile (inbound)
│  │ Locking the timing — see Maria's note below…        │  │
│  │ ┌─ 6 earlier quoted lines ────────────────────────┐ │  │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─[👤] You                                      6:48p ┐  │   ← outbound
│  │ Confirmed — sending updated ROS tomorrow.           │  │
│  │ Delivered · Opened 7:02p                            │  │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─[👤] Ally · Bride                           10:47p ●┐  │   ← unread
│  │ yes — let's lock May 15 for the Sangeet, Pramila    │  │
│  │ is OK with that timing.                             │  │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Reply to thread…                               [→] │  │   ← composer (unfocused on land)
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- **Sticky header** — thread identity + chevron-up-to-collapse. `position: sticky; top: 0` with scroll-shadow.
- **"Show N earlier messages" ghost row** — only renders when `messages.length > 5`. Full history loads on click. No pagination beyond that.
- **Date dividers** — once per calendar day. Centered tertiary text with thin horizontal lines.
- **Message tiles** — `stage-panel` with 1px `--stage-edge-subtle` border (NOT higher fill, per the surface ceiling rule). Inbound has 2px left edge stripe (`--color-unusonic-info`); outbound no stripe.
- **Sender chip** — avatar + first name + role badge. Role from edges; badge is a 16px pill with stripe color by role semantic. Unresolved senders show email address only.
- **Quoted-reply collapse** — per message. "Show N earlier quoted lines" expander. When expanded, quoted content renders below, dimmed, with a left vertical quote bar.
- **Body text** — `text-sm leading-relaxed whitespace-pre-wrap break-words`. Preserves emoji and texture. Never sanitize/compress.
- **Delivery footer** — outbound only. "Delivered 7:02p · Opened 7:08p" in tertiary text. Bounce: error color + Retry button.
- **Composer** — single-line input at first, `stage-input` with `--ctx-well` background. On focus, expands to multi-line. ⌘Enter sends. ⌘Esc cancels. Send button is the only `--stage-accent` (white fill) in the card.

### Tier 4 — Per-message overflow menu (right-click / three-dot)

- Reply (focuses composer with quote pre-inserted)
- Copy permalink
- Mark Stage (Phase 1.5 — one-tap stage advance via Aion)

### Tier 5 — Per-thread overflow menu (kebab on hover)

- Snooze → 4h / Tomorrow / Next week
- Mark as read / unread
- Flag for follow-up (manual "owed" override)
- Mute thread (suppresses notifications)
- Copy thread link
- Tap-to-call primary contact (Phase 1.5, only if phone resolves)

---

## 6. Phase roadmap

### PR #20 — ships in 2–3 days (this PR)

Eight items. Blocker-set for Marcus's Day-1 pilot:

1. **Threads collapsed by default**, one-expanded-at-a-time
2. **Show latest 5 messages** (with date-divider smart cut) + "Show N earlier" ghost row
3. **Single composer at thread bottom**, unfocused on auto-expand from notifications
4. **Card chrome with owed indicator** (Phase 1 SQL heuristic, RPC `ops.get_owed_threads_for_deal`)
5. **Thread-row bounce indicator** (red dot + "Bounced" chip)
6. **Snooze** — 4h / Tomorrow / Next week, migration adds `snoozed_until` + `snoozed_by_user_id`
7. **In-card search** — client-side, ⌘F + icon trigger
8. **Quoted-reply collapse** per message

Ships with existing auto-reply muted treatment preserved. Stacked-avatar tile kept simple (up to 3 + overflow).

### PR #21 — ships 1 week after

9. Sender filter chips inside expanded thread (conditional: ≥4 senders OR ≥20 messages)
10. Per-message role badges (new server action `getThreadParticipantRoles`)
11. Aggregated auto-reply collapse ("3 auto-replies between Apr 14–21")
12. Thread-level mute (`muted_until` column, Front-style for the chatty-planner scenario)

### PR #22 — ships 2 weeks after

13. `Recent Replies` lobby panel (new widget)
14. Deep-link URL pattern `?thread=&message=` with scroll-to + accent ring
15. Rename `/replies/unresolved` page heading to "Triage"

### Phase 1.5+ — deferred

- Aion thread summary line (gated on classification precision)
- Aion classification chips per message (Question / Decision needed / etc.)
- "Has questions" filter chip
- Cross-deal sender history
- Per-channel threading (SMS)
- Internal team comments on threads
- Templates / snippets
- Tap-to-call affordance
- Mobile bottom-sheet behavior
- Full-screen `/crm/[dealId]/replies/[threadId]` view for monolith threads
- iframe-isolated raw HTML render ("Show original") — only if demand emerges

---

## 7. Bold ideas flagged for user's call (before building)

One genuine fork in the road that didn't get resolved in agent output:

### Fork: "Owed" heuristic vs manual-flag for Phase 1

- **Option A (current spec):** compute "owed" from the heuristic above (last message inbound, not auto-reply, <30 days old). Zero manual action. Automatic. Risk: false positives on messages where client's reply didn't actually require a response ("Thanks!").
- **Option B (alternative):** Marcus manually flags threads that need a reply, via a heart/star button on the thread row. Zero automation. Risk: Marcus forgets to flag; "owed" list grows stale.
- **Option C (combined, recommended):** Heuristic computes the default list. Manual flag OVERRIDES (either direction — can mark "not owed" on a false-positive, or mark "owed" on a message that doesn't match the heuristic). UI: swipe-left-to-dismiss on the owed line, plus a "Flag as owed" item in the thread overflow menu.

Recommend Option C but it adds ~80 lines of code to PR #20. Flag for user decision.

---

## 8. Files touched

**PR #20:**

- `src/features/comms/replies/ui/RepliesCard.tsx` — major rewrite
- `src/features/comms/replies/ui/ReplyComposer.tsx` — minor (single-line collapsed by default)
- `src/features/comms/replies/api/get-deal-replies.ts` — extend to return `unread_count` per thread, `message_count`, `latest_preview`, `has_bounce`, `snoozed_until`
- New: `src/features/comms/replies/api/get-owed-threads.ts` — RPC wrapper
- New: `src/features/comms/replies/api/snooze-thread.ts` — server action
- New: `src/features/comms/replies/ui/ThreadRow.tsx` — collapsed thread row component
- New: `src/features/comms/replies/ui/ExpandedThread.tsx` — expanded thread component
- New: `src/features/comms/replies/ui/OwedIndicator.tsx` — card chrome owed line
- New: `src/features/comms/replies/ui/CardSearchInput.tsx` — in-card search
- New: `src/features/comms/replies/lib/quote-stripper.ts` — compute quoted-reply boundary
- New: `supabase/migrations/<ts>_replies_v2_snooze_and_owed.sql` — migration (snooze columns + get_owed_threads RPC)
- Updated: `docs/reference/replies-design.md` — §3.1 v2 card spec
- Tests: `RepliesCard.test.tsx`, `ThreadRow.test.tsx`, `ExpandedThread.test.tsx`, `get-owed-threads.test.ts`, `quote-stripper.test.ts`

Estimated: ~1000 LOC implementation + ~500 LOC tests + 1 migration.

---

## Sign-off checklist for PR #20

Before cutting code, confirm with user:

- [ ] 8-item scope accepted (or edited)
- [ ] Fork resolved (Option A / B / C for "owed" flagging)
- [ ] OK to include snooze migration in this PR (extra schema change)
- [ ] OK to include in-card search in this PR (vs defer)
- [ ] OK with the ~2–3 day build estimate OR preference to split PR #20 into two smaller PRs

Once signed off, Builder agent executes with this doc as the spec.
