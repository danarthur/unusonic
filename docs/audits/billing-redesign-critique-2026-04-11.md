# Billing redesign — stress-test critique

**Date:** 2026-04-11
**Target:** `docs/audits/billing-redesign-vision-2026-04-11.md`
**Author:** Critic agent (research team stress-test pass)
**Companion docs:**
- Trigger: `docs/audits/billing-system-schema-drift-2026-04-11.md`
- Vision: `docs/audits/billing-redesign-vision-2026-04-11.md`

Structured hard-questions pass on the Visionary's architecture spec. The core decision (Option B — greenfield `finance.*`, one-way QBO push, Stripe split) stands. The critical objections are about scope, specific data-model bugs, and two places where the plan contradicts its own "Linda-safety" mantra.

---

## 1. Scope realism on Wave 1

**The concern:** Wave 1 is a 10-item monolith that rebuilds data model, PDF stack, QBO integration, Stripe webhook split, dashboard, public pay route, and blank-invoice authoring — all before launch.

**Why it matters:** W1.2 (Linda-safe QBO sync) alone is a 3–4 week project with a production-grade bug budget. W1.4 (Presentable PDF) is 1–2 weeks if the proposal PDF stack is reusable and 3+ weeks if it isn't. Dependency graph has everything feeding W1.1 and most other items feeding W1.2. Any slip on the spine blocks everything.

**Risk level:** HIGH

**Recommended change:**
- **Cut W1.7 (blank invoice authoring) to Wave 2.** Dana "sometimes" bills non-proposal things — that's a Wave 2 signal, not a launch blocker.
- **Cut W1.9 (cancellation/kill fee text block)** to a bullet inside W1.4. Not a top-level feature.
- **Defer W1.5 (deposit tracking dashboard) to a skinnier "list view with filters."** Aging buckets are Wave 2 when there's data to bucket.
- **Combine W1.1 + W1.10.** W1.10 is literally an acceptance criterion of W1.1 by the Visionary's own admission.
- **Realistic Wave 1:** W1.1 (chain), W1.2 (QBO), W1.3 (record payment), W1.4 (PDF), W1.6 (Stripe pay), W1.8 (webhook split). Six items. Two months if focused.

---

## 2. Critical bugs in the data model (§3)

### 2a. `invoice_kind = 'credit_note'` collapse

**The concern:** Status enum (`draft | sent | paid | void | refunded`) doesn't cleanly model credit note states. A credit note isn't "paid" — it's applied.

**Why it matters:** Trigger in §3.3 (`paid_amount >= total_amount → paid`) applies negative totals weirdly: `total_amount = -500`, `paid_amount = 0`, so `balance_due = -500`. Latent breakage the first time a credit note ships.

**Risk level:** HIGH

**Recommended change:** Gate the trigger on `invoice_kind != 'credit_note'` and define a separate lifecycle (`draft → issued → applied → void`) handled outside the payment trigger.

### 2b. `balance_due` as STORED generated column

**The concern:** STORED is unnecessary. Cascades trigger lock contention under concurrent payment inserts.

**Risk level:** MEDIUM

**Recommended change:** Drop `balance_due` as a generated column. Compute in queries or via a `finance.invoice_balances` view.

### 2c. Concurrent Stripe webhook + manual payment race

**The concern:** Two transactions write `finance.payments` for the same invoice simultaneously. Trigger can fire status transitions in wrong order — "partial" trigger fires after "paid" trigger and flips status back.

**Risk level:** HIGH

**Recommended change:** Trigger function must `SELECT ... FOR UPDATE` on the invoice row before reading `paid_amount`. Add a pgTAP test hammering 20 concurrent payment inserts at one invoice.

### 2d. `public_token` on `finance.invoices` — security exposure

**The concern:** §3.1 leaves two options (RPC vs. JWT-claim policy). Ambiguity on security-critical code is where holes get drilled.

**Risk level:** HIGH

**Recommended change:** Delete the policy option. RPC-only, one way. "RLS denies all SELECT to `anon`. Public reads route through `get_public_invoice(token)` — SECURITY DEFINER, REVOKE FROM PUBLIC, GRANT EXECUTE TO anon, returns denormalized shape."

### 2e. `tax_amount` snapshot vs Wave 2 line edits

**The concern:** §3.1 says "never recomputed." Wave 2 edits change subtotal. Results inconsistent.

**Risk level:** MEDIUM (Wave 2 concern but schema migration later is expensive)

**Recommended change:** Add column `tax_rate_snapshot numeric(8,6)` alongside `tax_amount`. Line edits recompute `tax_amount = new_taxable_subtotal * tax_rate_snapshot`. Rate frozen, base can move.

### 2f. `bytea` + pgsodium handwave

**The concern:** Token encryption is security-critical and the plan doesn't specify which.

**Risk level:** MEDIUM

**Recommended change:** Pick pgsodium. "Tokens encrypted via `pgsodium.crypto_aead_det_encrypt` using a workspace-scoped key stored in `pgsodium.key`. Column privs deny SELECT on encrypted columns to all roles except SECURITY DEFINER functions."

### 2g. One realm per workspace — LLC + S-corp reality

**The concern:** Real production companies often run two legal entities (LLC for operations, S-corp for touring).

**Risk level:** LOW (for v1), but flag

**Recommended change:** Keep UNIQUE for v1. Document: "One realm per workspace. Multi-book workspaces must create a second Unusonic workspace." Don't call it forever.

### 2h. `bill_to_snapshot` jsonb schema

**Risk level:** LOW

**Recommended change:** Zod schema `BillToSnapshotV1` and `FromSnapshotV1` validated at write time. Version them (`{ v: 1, ... }`).

---

## 3. QBO integration gaps (§5)

### 3a. Customer mapping modal — unscalable UX

**The concern:** Dana adds 50 entities/month. Plan requires a modal for every new entity's first push. Unshippable.

**Why it matters:** "Never fuzzy" ≠ "never auto-match." Exact string matches on `display_name` can be automatic with zero HoneyBook risk.

**Risk level:** HIGH

**Recommended change:** Add to §5.3:
- **Exact match auto-link.** Query QBO `Customer WHERE DisplayName = '$name'`. Exactly one result (case-sensitive) → auto-link. Zero → show "Create in QuickBooks" chip on the invoice. ≥2 → modal (ambiguous).
- **Batch review view.** Settings → Finance → QuickBooks → Pending Mappings table with bulk-select.

### 3b. `default_item_id` — Linda's Sales by Item report breaks

**The concern:** One QBO Item for everything = QBO's Sales by Item report collapses to one row. Linda uses this report. Plan breaks her primary tool on day one. Internal contradiction with the "Linda-safety is the real test" mantra.

**Risk level:** HIGH

**Recommended change:** Ship per-`item_kind` mapping (5 items: `service`, `rental`, `talent`, `fee`, `discount`) as the Wave 1 default. Created during OAuth setup, mapped to QBO categories. Sales by Item gives Linda 5 meaningful rows instead of 1. Full per-catalog-line mapping stays Wave 2.

### 3c. Exponential backoff attempt 6 — who notices?

**The concern:** 5 attempts = ~14h. Attempt 6 never fires. "Surface to sync-status UI" doesn't specify terminal state.

**Risk level:** MEDIUM

**Recommended change:** Spec dead-letter state: "After attempt 5 fails, job enters `dead_letter`. Dashboard banner is persistent. Dana receives one email with retry link. Retry button resets attempt count."

### 3d. Advisory lock + Supabase Edge Functions

**The concern:** `pg_advisory_xact_lock` only works if all refresh calls share the same PG connection pool. Supabase Edge Functions may route through PgBouncer in transaction mode. If so, the lock is released at statement end, not transaction end — bricking the thing the lock is meant to prevent.

**Why it matters:** This is THE failure Field Expert cited as non-negotiable. If the mutex is broken on Supabase's infrastructure, the plan's central QBO safety claim is false.

**Risk level:** HIGH

**Recommended change:** Add to §5.2: "`get_fresh_qbo_token` must execute as a single RPC call — do not split read-and-refresh across multiple client round-trips. Verify PgBouncer pooling mode with Supabase support before shipping." The whole refresh must happen inside the SECURITY DEFINER function in one transaction.

### 3e. Partial success on multi-entity push

**Risk level:** MEDIUM

**Recommended change:** Enqueue "push customer if not mapped" sub-job; invoice job depends on it. Use deterministic `RequestId` on customer push too. Document that `RequestId` applies to *every* API call.

### 3f. Intuit API webhook replay

**Risk level:** LOW (no pull in v1)

---

## 4. Stripe architecture edge cases (§6)

### 4a. Proposal deposit backdated payment + QBO

**The concern:** First-time user: sign up, accept proposal, get paid, then connect QBO. Backfill push will fail with cryptic QBO error or post to wrong period.

**Risk level:** MEDIUM

**Recommended change:** On QBO OAuth connect, flag all pre-connection payments as `qbo_sync_status = 'excluded_pre_connection'`. Show "5 payments predate your QBO connection — push them anyway?" prompt with explicit user decision. Do not silently backfill.

### 4b. Keep old `/api/stripe-webhook` as 410 Gone?

**The concern:** Pre-launch. Zero traffic. 410 Gone is dead code.

**Risk level:** LOW

**Recommended change:** Delete the old route entirely. Clean break.

### 4c. `workspace_id` nullable on stripe_webhook_events

**The concern:** Dedup row created with NULL workspace. If processing fails before resolution, row is stuck with NULL. Retry skips it.

**Risk level:** MEDIUM

**Recommended change:** Don't write the dedup row until workspace is resolved. Use check-then-insert with `ON CONFLICT DO NOTHING` after resolution.

---

## 5. Missing pieces

### 5a. Invoice PDF versioning

**The concern:** Stable path = every regeneration overwrites. Client's original email link points at a PDF that silently changed.

**Risk level:** MEDIUM

**Recommended change:** Path includes version: `invoices/{invoice_number}/v{N}.pdf`. Store `pdf_version int` on `finance.invoices`.

### 5b. Email open tracking

**Risk level:** LOW

**Recommended change:** Add `email_opened_at` separate from `viewed_at`. Or note: "v1 has no email-open tracking; `viewed_at` is click-through."

### 5c. Empty-state dashboard on launch day

**The concern:** Wave 1 deletes the proposal proxy. Day one of launch: zero data. Dana opens Unusonic, sees "$0 / $0 aging / $0 MTD." Demo-killer.

**Risk level:** HIGH

**Recommended change:** Design an empty-state panel with fixture workflow: "No invoices yet. Create your first invoice from an accepted proposal or directly." CTA buttons. OR defer Financial Pulse widget, replace with an invoice list that empty-states gracefully.

### 5d. pgTAP infrastructure

**The concern:** Unusonic uses Vitest. pgTAP runner may not be configured.

**Risk level:** MEDIUM

**Recommended change:** First PR of Wave 1: "add pgTAP runner, wire into CI, verify one trivial test runs green."

### 5e. CI coverage of the RPC regression

**Risk level:** MEDIUM

**Recommended change:** Add to §13: "All pgTAP tests run on every PR via GitHub Actions. Schema-drift guard: test that asserts every public RPC has at least one integration test."

### 5f. Onboarding UX for finance setup

**The concern:** Nowhere in the plan does a new workspace get prompted to connect QBO, set invoice prefix, set payment due days, default tax rate, cancellation terms.

**Risk level:** HIGH

**Recommended change:** Add "Finance onboarding checklist in Settings → Finance." 5 items, checkmarks, one CTA per item. Surfaced prominently.

### 5g. Starting invoice number collision

**The concern:** "One-time wizard" handwave in §15.

**Risk level:** MEDIUM

**Recommended change:** On QBO OAuth connect, query `Invoice` for MAX DocNumber, parse trailing integer, set `next_value = max + 1`. If parse fails: "Your QuickBooks invoices end at #1247. Start Unusonic at #1248? [yes / no / custom]."

### 5h. Access control capabilities

**The concern:** `recordPayment`, `voidInvoice`, `issueRefund` have no gate spec.

**Risk level:** HIGH

**Recommended change:** Enumerate:
- `finance:read` — all members by default
- `finance:write` — create/edit invoices, record payments
- `finance:void` — void sent invoices
- `finance:refund` — issue refunds
- `finance:manage_qbo` — OAuth, mappings, sync settings
- `finance:see_internal_notes` — `internal_notes` field

Default role bundles: admin = all, PM = read+write, employee = read-only scoped to own assignments.

### 5i. Authenticated client portal pay flow

**Risk level:** MEDIUM

**Recommended change:** Authenticated portal invoice detail renders the same Pay button. Stripe Checkout metadata includes `client_user_id` for audit. Same `createInvoiceCheckoutSession` handler.

---

## 6. Questionable priority ordering

Covered in §1. Specifically:
- **W1.7 blank invoice authoring:** Wave 2. Cut.
- **W1.9 cancellation text block:** Bullet in W1.4, not a separate wave item.
- **W1.8 webhook route split:** Launch-blocking. Keep.
- **W1.5 dashboard vs W1.1 chain:** Overlapping. W1.5 → list view with filters.
- **W1.4 PDF vs infrastructure:** Merge PDF pipeline setup into W1.4 explicitly. Currently reads like "styling task" when it's "build the whole PDF pipeline."

---

## 7. Built-for-the-demo flags

- **W1.5 aging buckets** — beautiful on a slide, empty on launch day. Demo feature.
- **Prism Ledger Lens wiring (W1.10)** — adds no user workflow over a plain balance chip. Consider Wave 2.

---

## 8. Friction hidden in the plan

### 8a. First-time QBO connect — 9-10 clicks to first invoice

**Risk level:** MEDIUM

**Recommended change:** Spec "happy path under 3 minutes." Merge first-time wizard into OAuth callback as one scrollable form. Customer mapping modal should not block the *first* invoice send if the customer exact-matches.

### 8b. Recovering from wrong customer mapping

**The concern:** Plan doesn't describe unmap.

**Risk level:** HIGH

**Recommended change:** Add to W1.2 acceptance: "Unmap / remap button on the customer mapping panel." Must be in Wave 1.

### 8c. Workspace switch + QBO connection

**Risk level:** LOW

**Recommended change:** Add one-liner: "Workspace switch invalidates QBO connection state in memory; all finance queries are workspace-scoped."

---

## 9. Risks the plan missed (§15)

### 9a. Timezone on `issue_date`

**The concern:** `issue_date date` stored UTC. Dana in NY sends at 9pm ET → stored as next day's UTC date. PDF shows wrong date to client.

**Risk level:** MEDIUM

**Recommended change:** `issue_date = (now() AT TIME ZONE workspace.timezone)::date`. Requires `workspaces.timezone` column.

### 9b. Recurring invoices

**Risk level:** LOW — flag for Wave 3. `parent_recurring_id` column is cheap to add now.

### 9c. Invoice dispute workflow

**The concern:** User Advocate mentioned "in dispute / in discussion." Status enum doesn't include it.

**Risk level:** MEDIUM

**Recommended change:** Add `is_disputed boolean` + `dispute_note text`. One column, real workflow. Ship in Wave 1.

### 9d. Invoice routes to AP email, not primary contact

**The concern:** Corporate AP — invoice needs to go to `ap@acme.com`, not `marco@acme.com`.

**Risk level:** MEDIUM

**Recommended change:** Add `billing_email text NULL` column to `finance.invoices`. Default = primary contact email. Editable per invoice. Ship Wave 1.

### 9e. Supabase storage egress costs for PDFs

**Risk level:** LOW — flag, not v1 concern.

---

## 10. The single biggest objection

**The plan conflates "safe pre-launch rebuild" with "ship everything at once," and the Wave 1 scope will blow the launch.**

The correct response to the audit is "rebuild `finance.*` as spec'd + replace the broken pieces with working ones + ship." The Visionary instead used the rebuild as license to ship a dashboard, blank invoice authoring, aging buckets, cancellation text blocks, Prism Ledger Lens wiring, a contract chain view, and a greenfield QBO integration with an item mapping wizard.

Each is defensible individually. Together: 4+ months of work before the first customer can send a real invoice. The schema drift, webhook split, and two QBO folders can be fixed in 4–6 weeks.

**Pre-launch status is a gift, not a license. The gift is "no data migration." It is not "rebuild the entire finance product surface before shipping."**

**Recommendation:** Split the Visionary's Wave 1 into two phases:
- **Phase 1 — Launch:** W1.1 (chain), W1.2 (QBO minimum: connect + push + exact-match auto-map + error surface), W1.3 (record payment), W1.4 (PDF), W1.6 (Stripe pay), W1.8 (webhook split). The real v1.
- **Phase 2 — Post-launch first 90 days:** W1.5 (dashboard), W1.7 (blank authoring), W1.9 (cancellation text), W1.10 (Prism wiring), W1.2 extras (batch mapping, per-line items).

---

## Top 5 must-fix items (BLOCKERS)

1. **Wave 1 scope cut.** Move W1.7, W1.9, and the aging-bucket half of W1.5 out. Merge W1.10 into W1.1. Six real items, not ten.
2. **Customer mapping UX.** Exact-match auto-link + batch review. Modal-per-push flow is unshippable.
3. **`default_item_id` breaks Linda's Sales by Item report.** Ship per-`item_kind` default (5 items), not one.
4. **Advisory lock semantics on Supabase.** Verify `pg_advisory_xact_lock` actually serializes across Edge Functions through PgBouncer. If not, the QBO token mutex is theater.
5. **Access control capabilities not enumerated.** Must enumerate before first PR.

## Top 3 should-fix items (HIGH)

1. **Concurrent payment trigger locking.** Trigger must `SELECT FOR UPDATE` the invoice row before recomputing.
2. **`public_token` security path.** Delete the policy-based alternative from §3.1. RPC-only.
3. **Empty dashboard on launch day.** Ship invoice-list-with-filters instead of aging buckets.

## Top 5 nice-to-have improvements (MEDIUM)

1. `tax_rate_snapshot` column to survive Wave 2 edits.
2. `billing_email` column for AP redirect.
3. `is_disputed` flag + note field.
4. Invoice number collision wizard — specified, not handwaved.
5. Timezone-aware `issue_date` via `workspaces.timezone` column.

## Overall verdict

**Ship with edits. Material edits, not cosmetic.**

The architectural core (Option B decision, data model shape, QBO philosophy, Stripe split) is correct and should proceed. The specific columns, RLS patterns, and trigger design are 80% right — the other 20% needs the fixes in §2 and §3 of this critique before the first migration runs.

The Wave 1 feature list is the real problem. It's a four-month plan wearing a two-month plan's clothes. The Visionary correctly identified what needs to exist; they did not correctly identify what needs to exist *before launch*.

**Do not start the build until:**
1. Wave 1 is recut to six items.
2. Customer mapping UX, `default_item_id`, and advisory lock semantics are resolved.
3. Access control capabilities are enumerated.
4. pgTAP infrastructure is confirmed to exist and run in CI.

Everything else can be caught in code review. These four cannot.
