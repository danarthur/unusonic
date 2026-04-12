Confirmed: types are `public`-only today (matching CLAUDE.md note), and both finance feature folders exist. I have enough grounding. Producing the synthesis now.

---

# Unusonic Billing & Finance — Redesign Vision v1

**Status:** Architecture spec. Pre-launch greenfield rebuild of `finance.*`.
**Author:** Visionary synthesis of Navigator + Field Expert + User Advocate research.
**Audience:** Plan team (breaks into PRs) and Build team (implements).
**Companion audit:** `docs/audits/billing-system-schema-drift-2026-04-11.md` (context only; not read by this doc).

---

## 1. The one-sentence vision

**Unusonic is the authoritative ledger for every dollar flowing through an event — proposals become a connected chain of invoices and payments in `finance.*`, Stripe executes the card transactions, and QuickBooks Online receives a clean one-way push that a bookkeeper never has to reconcile by hand.**

---

## 2. Core architectural decision

**Pick: Option B — Greenfield `finance.*` as authoritative internal ledger, one-way push to QBO, Stripe as card processor.**

This is the only option that simultaneously (a) matches what every serious competitor does, (b) gives Dana her single-glance contract balance view, and (c) protects Linda from duplicate-invoice hell. Rationale below, then the rejections.

**Why B wins:**
- Unusonic already owns proposals, events, crew, change orders — the internal-ledger data is already here. Not having an authoritative invoice row on top of that is the actual anomaly.
- "One deal → one proposal → many invoices that roll to a single contract balance" is impossible to model if QBO or Stripe is the source of truth. Those systems model one invoice at a time; they don't know a deposit and a final are siblings.
- QBO's OAuth/token lifetime (100-day idle limit, refresh mutex requirements, rate caps) means you cannot read QBO from UI hot paths. The answer is always "cache locally" — which means you've built an internal ledger anyway. Do it on purpose.

**Why A (patch `public.invoices`) is wrong:**
Four different mental models are already wired to the public tables. Patching perpetuates the drift. Pre-launch is the one moment this debt is cheap to delete. Keeping it is strictly worse than rebuilding.

**Why C (Stripe/QBO direct, Unusonic as thin orchestrator) is wrong:**
Kills the deposit-plus-final unified balance view. Makes Aion useless for revenue analysis (no joinable ledger). Makes `/finance` dashboard, Prism Ledger Lens, and Network entity financial panel all dependent on Intuit API availability. Also the Stripe-QBO direct integration (Intuit's "Connect to QuickBooks" for Stripe) posts as summary journal entries — exactly the wrong granularity for a services business that needs line-level Class/Location mapping.

**Why D (keep both finance-sync directories, defer decision) is wrong:**
The decision is the product. Two QBO codepaths guarantee the bookkeeper failure mode that kills the whole integration.

---

## 3. The canonical data model

All tables live in `finance.*`. Every table has `workspace_id uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` with a shared `set_updated_at` trigger. All amounts are `numeric(14,2)` in **dollars** (USD for v1). RLS uses `workspace_id IN (SELECT get_my_workspace_ids())` per the directory/ops/finance pattern in CLAUDE.md §"RLS Patterns". No policies are written against `cortex.relationships`. All SECURITY DEFINER functions must `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon` in the same migration (memory: prior sev-zero caused by defaulting PUBLIC EXECUTE).

**Important:** because the Supabase dashboard "Exposed schemas" does not include `finance` today (confirmed: `src/types/supabase.ts` has zero `finance.*` types), **PR 6.5 from `docs/audits/event-walkthrough-2026-04-11-fix-plan.md` ships as a blocker for this redesign** — add `finance` to exposed schemas, then regen types via `npm run db:types`. Without this, every caller is stuck on `(supabase as any).schema('finance')` forever.

### 3.1 `finance.invoices` — the core ledger row

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK → `public.workspaces.id` |
| `invoice_number` | text NOT NULL | Human-readable. Per-workspace sequence (see §3.9). |
| `invoice_kind` | text NOT NULL | `deposit` \| `progress` \| `final` \| `standalone` \| `credit_note` |
| `status` | text NOT NULL | `draft` \| `sent` \| `viewed` \| `partially_paid` \| `paid` \| `void` \| `refunded` |
| `bill_to_entity_id` | uuid NOT NULL | FK → `directory.entities.id`. Ghost-compatible. |
| `project_id` | uuid NULL | FK → `ops.projects.id` |
| `event_id` | uuid NULL | FK → `ops.events.id`. Primary operational link. |
| `proposal_id` | uuid NULL | FK → `public.proposals.id`. Lineage, not authority. |
| `deal_id` | uuid NULL | FK → `public.deals.id`. Denormalized for the "contract chain" roll-up queries. |
| `parent_invoice_id` | uuid NULL | Self-ref. A credit note's `parent_invoice_id` points at the invoice it reverses. Final invoices do NOT reference the deposit this way — both are siblings under the same `deal_id`. |
| `currency` | text NOT NULL DEFAULT `'USD'` | Schema room; v1 is USD-only (see §11 Wave 3). |
| `subtotal_amount` | numeric(14,2) NOT NULL | Sum of line items, pre-tax, pre-discount. |
| `discount_amount` | numeric(14,2) NOT NULL DEFAULT 0 | |
| `tax_amount` | numeric(14,2) NOT NULL | Snapshotted at `issued_at` from workspace `default_tax_rate` × taxable lines. Once set, never recomputed. |
| `total_amount` | numeric(14,2) NOT NULL | `subtotal - discount + tax`. Generated column? No — explicit for auditability. |
| `paid_amount` | numeric(14,2) NOT NULL DEFAULT 0 | Maintained by `recompute_invoice_paid(invoice_id)` trigger after any `finance.payments` row change. |
| `balance_due` | numeric(14,2) GENERATED ALWAYS AS `total_amount - paid_amount` STORED | Simplifies every UI query. |
| `issue_date` | date NULL | Set on `draft→sent` transition. |
| `due_date` | date NULL | Computed from `issue_date + workspace.payment_due_days` at send time, editable. |
| `issued_at` | timestamptz NULL | Server clock on transition to `sent`. |
| `sent_at` | timestamptz NULL | Last time the email was sent (can resend). |
| `viewed_at` | timestamptz NULL | First time the client opened the public page. |
| `paid_at` | timestamptz NULL | Set when `status → paid`. |
| `voided_at` | timestamptz NULL | Set when `status → void`. |
| `public_token` | text NOT NULL UNIQUE | Random 32-byte hex, generated on create. Powers `/i/[token]`. |
| `notes_to_client` | text NULL | Free text under line items on PDF. |
| `internal_notes` | text NULL | PM-only. Never rendered in client contexts. |
| `po_number` | text NULL | **First-class**. Corporate AP (Kristen) hard requirement — no "put it in notes". |
| `terms` | text NULL | Payment terms block — defaults from workspace, editable per invoice. |
| `bill_to_snapshot` | jsonb NOT NULL | Name, address, email, phone snapshotted at `issued_at`. Reason: `directory.entities` is mutable; the PDF you emailed must not retroactively rename the client. |
| `from_snapshot` | jsonb NOT NULL | Workspace name, address, EIN, logo_url snapshotted at `issued_at`. Same reason. |
| `qbo_invoice_id` | text NULL | QBO Invoice.Id. |
| `qbo_sync_token` | text NULL | QBO optimistic concurrency token. Updated on every successful push. |
| `qbo_doc_number` | text NULL | QBO's invoice number, if different (we'll configure QBO to accept ours). |
| `qbo_last_sync_at` | timestamptz NULL | |
| `qbo_last_error` | text NULL | Human-readable last failure. Clears on success. |
| `stripe_payment_link_id` | text NULL | Optional — Stripe Payment Link for a reusable pay URL. |
| `created_by_user_id` | uuid NULL | FK → `auth.users.id` |
| `sent_by_user_id` | uuid NULL | |

**RLS:** ALL policies gated by `workspace_id IN (SELECT get_my_workspace_ids())`. Plus a separate unauthenticated SELECT policy for public pages, scoped `WHERE public_token = current_setting('request.jwt.claims', true)::json->>'token'` — OR, simpler: do public reads through a SECURITY DEFINER RPC `get_public_invoice(token text)` with `REVOKE ALL FROM PUBLIC` and re-grant `EXECUTE TO anon`. **Use the RPC pattern** — cleaner, matches the public proposal precedent, avoids leaking the whole table shape.

**Why a single `invoices` table and not `invoices + credit_notes`:** QBO has a distinct CreditMemo type, but internally we model credit notes as `invoice_kind = 'credit_note'` with negative `total_amount`. The `qbo_push_invoice` worker reads `invoice_kind` and chooses between `Invoice` and `CreditMemo` POST paths. This keeps one `paid_amount` rollup per `deal_id` simple — contradicting Field Expert's recommendation to split tables. Field Expert is right that QBO needs separate API calls; User Advocate is right that the billing chain UI needs one rollup. The kind column reconciles both.

**Why `bill_to_snapshot` and `from_snapshot` are jsonb, not FK joins at render time:** The invoice is a legal document. If Marco changes his company address, last month's sent invoices do not silently rewrite. Snapshot on `issued_at`, never again.

**Why `tax_amount` is a column, not a generated value:** Tax snapshot at issue time is Field Expert non-negotiable #5. `workspaces.default_tax_rate` can change. An invoice issued under 8.75% stays at 8.75% forever, even after the workspace moves to 9.25%. Implemented via `transition_invoice_to_sent(invoice_id)` RPC that reads rate once and writes it.

**Why not `finance.customers`:** Field Expert nailed this. Customers are `directory.entities`. One identity system, Ghost Protocol intact. QBO linkage lives in `finance.qbo_entity_map`, not a duplicate customer table.

### 3.2 `finance.invoice_line_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | Denormalized for RLS. |
| `invoice_id` | uuid NOT NULL | FK → `finance.invoices.id` ON DELETE CASCADE |
| `position` | int NOT NULL | Sort order. |
| `item_kind` | text NOT NULL | `service` \| `rental` \| `talent` \| `fee` \| `discount` \| `tax_line` — matches catalog categories |
| `description` | text NOT NULL | Snapshot. |
| `quantity` | numeric(14,4) NOT NULL DEFAULT 1 | |
| `unit_price` | numeric(14,2) NOT NULL | Snapshot. |
| `amount` | numeric(14,2) NOT NULL | `quantity × unit_price` — stored, not generated, so line-level discounts can override. |
| `cost` | numeric(14,2) NULL | For profitability calc. Snapshot of package cost at issue time. |
| `is_taxable` | boolean NOT NULL | Snapshotted from `tax_meta.is_taxable` on the source proposal item. |
| `source_proposal_item_id` | uuid NULL | **Lineage, NOT FK.** `text`? No, uuid is fine because we're not FK-constraining — the source row can be deleted later. Enforce via soft reference only. |
| `source_package_id` | uuid NULL | Same — lineage. |
| `qbo_item_id` | text NULL | QBO Item.Id — required at push time; resolved via `finance.qbo_entity_map`. |
| `qbo_tax_code_id` | text NULL | |

**No FK from `source_proposal_item_id` to `public.proposal_items.id`.** This is deliberate and the most important single decision in the data model. Proposal items are mutable and often deleted during negotiation. Invoice lines are legal snapshots. Creating an FK means deleting a proposal item orphans invoices or cascade-deletes financial history. Both outcomes are unacceptable. We store the uuid for analytics lineage but not as a database constraint. If the source row vanishes, the invoice row is still valid.

**Tax modeling — line-level boolean, invoice-level amount:** Field Expert leaned toward line-level tax. User Advocate says most PMs think invoice-level. Pick the hybrid that's already in the proposal system: `is_taxable` lives per line, but the computed `tax_amount` is a single field on the invoice. A dedicated `tax_line` item_kind gets added at send time ("Sales tax (8.75%)") for PDF rendering consistency with current `create_draft_invoice_from_proposal` behavior. This matches Linda's mental model and the IRS doesn't care which of the equivalent representations we use internally.

**RLS:** Subquery via `invoice_id → invoices.workspace_id` would work, but denormalizing `workspace_id` on the row simplifies the policy and matches how `proposal_items` is modeled today.

### 3.3 `finance.payments` — separate entity

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | |
| `invoice_id` | uuid NOT NULL | FK → `finance.invoices.id` |
| `amount` | numeric(14,2) NOT NULL | Positive for payments, NEGATIVE for refunds. One table, one sign convention. |
| `method` | text NOT NULL | `stripe_card` \| `stripe_ach` \| `check` \| `wire` \| `cash` \| `bill_dot_com` \| `other` |
| `status` | text NOT NULL | `pending` \| `succeeded` \| `failed` \| `refunded` |
| `received_at` | timestamptz NOT NULL | The date Dana tells her client she "received" the money. Defaults to `now()` but editable for back-dated manual entries. |
| `reference` | text NULL | Check number, wire confirmation, PO, whatever. **Indexed.** Dana searches for "check #1284". |
| `notes` | text NULL | |
| `attachment_storage_path` | text NULL | Deposit slip photo, check scan. Follows storage path protocol. |
| `stripe_payment_intent_id` | text NULL UNIQUE | **Idempotency key for webhooks.** |
| `stripe_charge_id` | text NULL | |
| `qbo_payment_id` | text NULL | |
| `qbo_sync_token` | text NULL | |
| `qbo_last_sync_at` | timestamptz NULL | |
| `qbo_last_error` | text NULL | |
| `recorded_by_user_id` | uuid NULL | |
| `parent_payment_id` | uuid NULL | For refunds: the refund row points at the original payment row. |

**Why payments are a separate entity, not a status column on invoices:** Field Expert anti-pattern #6. A single invoice can receive partial payments. A deposit invoice can be paid in cash one day and the rest via Stripe the next. A refund is a negative row, not an edit. Linda's rule: never edit the past.

**Why the Stripe-path and the manual-path write into the same table:** Anti-pattern #14 in the finance-schema doc: `recordPayment()` is the canonical write path. We preserve and extend this. The webhook handler calls `recordPayment()`. The manual "Record Payment" button calls `recordPayment()`. No other code writes to `finance.payments`.

**Trigger:** After INSERT or UPDATE or DELETE on `finance.payments`, recompute `finance.invoices.paid_amount` for that invoice_id and update `status`:
- `paid_amount = 0` → leave current status (`draft`/`sent`/`viewed`)
- `0 < paid_amount < total_amount` → `partially_paid`
- `paid_amount >= total_amount` → `paid`, set `paid_at = now()`
- Negative net (refunds) → `refunded`

**RLS:** `workspace_id IN (SELECT get_my_workspace_ids())`.

### 3.4 `finance.qbo_connections`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL UNIQUE | One QBO realm per workspace (Field Expert). |
| `realm_id` | text NOT NULL | QBO company ID. |
| `access_token_enc` | bytea NOT NULL | Encrypted with `pgsodium` or KMS-per-workspace. See §5. |
| `refresh_token_enc` | bytea NOT NULL | |
| `access_token_expires_at` | timestamptz NOT NULL | |
| `refresh_token_expires_at` | timestamptz NOT NULL | 100-day inactivity wall. |
| `last_refreshed_at` | timestamptz NULL | |
| `environment` | text NOT NULL | `production` \| `sandbox` |
| `status` | text NOT NULL | `active` \| `needs_reconsent` \| `revoked` |
| `connected_by_user_id` | uuid NOT NULL | |
| `default_item_id` | text NULL | QBO Item for "Event Production Services" fallback. |
| `default_income_account_id` | text NULL | |
| `default_deposit_account_id` | text NULL | For payments that aren't yet deposited. |

**RLS:** workspace-scoped. Tokens never leave the row — readable only by SECURITY DEFINER functions, not by the session client. Policy: deny SELECT on `access_token_enc`/`refresh_token_enc` to `authenticated` (column privs), allow through the refresh RPC only.

### 3.5 `finance.qbo_entity_map` — the universal joiner

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | |
| `local_type` | text NOT NULL | `entity` \| `invoice` \| `payment` \| `item` \| `tax_rate` \| `bill` \| `bill_payment` |
| `local_id` | uuid NOT NULL | The Unusonic row. |
| `qbo_type` | text NOT NULL | `Customer` \| `Invoice` \| `Payment` \| `Item` \| `TaxCode` \| `Bill` \| `BillPayment` |
| `qbo_id` | text NOT NULL | |
| `qbo_sync_token` | text NOT NULL | |
| `last_hash` | text NULL | SHA-256 of last pushed payload. Skip no-op pushes. |
| `last_synced_at` | timestamptz NOT NULL | |
| `last_error` | text NULL | |

UNIQUE on `(workspace_id, local_type, local_id)` and `(workspace_id, qbo_type, qbo_id)`. Both sides indexed for bidirectional lookup.

**Why a join table and not columns on each entity:** The `qbo_invoice_id` column on `finance.invoices` is redundant with the map, yes. We keep the column for hot-path reads (invoice detail page showing sync status without another query) and the map as the authoritative ledger that also tracks customer, item, payment, and future bills. This is the kind of "tolerated denormalization" I'd normally push back on, but the performance cost of joining `qbo_entity_map` on every invoice list render is worse than one extra column.

### 3.6 `finance.qbo_sync_log`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | |
| `local_type` | text NOT NULL | |
| `local_id` | uuid NOT NULL | |
| `operation` | text NOT NULL | `create` \| `update` \| `void` \| `delete` |
| `direction` | text NOT NULL | Always `push` in v1. Schema room for `pull`. |
| `request_id` | text NOT NULL | The deterministic Intuit `RequestId` we sent. |
| `qbo_response_status` | int NULL | |
| `qbo_response_body` | jsonb NULL | |
| `error_code` | text NULL | |
| `error_message` | text NULL | |
| `started_at` | timestamptz NOT NULL | |
| `completed_at` | timestamptz NULL | |
| `attempt_number` | int NOT NULL | For retries. |

This table is how Linda debugs. Every QBO API call, logged. Clickable from the sync status chip on any invoice.

### 3.7 `finance.tax_rates`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | |
| `name` | text NOT NULL | "NYC Sales Tax" |
| `rate` | numeric(8,6) NOT NULL | `0.0875` |
| `qbo_tax_code_id` | text NULL | |
| `is_default` | boolean NOT NULL DEFAULT false | At most one default per workspace. |
| `is_archived` | boolean NOT NULL DEFAULT false | |

**Why not just keep `public.workspaces.default_tax_rate`?** Because Dana is in NYC today and running a show in NJ next month. One workspace, multiple rates, pick one per invoice. But: v1 only uses `is_default` and the existing `default_tax_rate` column continues to work. Wave 2 introduces the rate picker. Ship the table now so the snapshot data path is right from day one.

### 3.8 `finance.stripe_webhook_events`

| Column | Type | Notes |
|---|---|---|
| `stripe_event_id` | text PK | Dedup key — do not use uuid. |
| `event_type` | text NOT NULL | |
| `received_at` | timestamptz NOT NULL | |
| `processed_at` | timestamptz NULL | |
| `workspace_id` | uuid NULL | Resolved during processing. |
| `payload` | jsonb NOT NULL | |
| `processing_error` | text NULL | |

**RLS:** deny-all from session client. Only the webhook route (service client) writes. Schema-scoped.

### 3.9 `finance.invoice_number_sequences`

| Column | Type | Notes |
|---|---|---|
| `workspace_id` | uuid PK | |
| `prefix` | text NOT NULL DEFAULT `'INV-'` | |
| `next_value` | bigint NOT NULL DEFAULT 1000 | Start at 1000 so the first invoice isn't "INV-1" which looks unprofessional. |
| `pad_width` | int NOT NULL DEFAULT 4 | |

Consumed by `finance.next_invoice_number(workspace_id)` SECURITY DEFINER function that `UPDATE ... RETURNING next_value`. Serializable enough under normal load; add advisory lock if we see contention.

### 3.10 `finance.bills` and `finance.bill_payments` (SCHEMA-ONLY in v1)

Create the tables in the initial migration. Leave them unreferenced by UI. Wave 2 introduces the freelancer pay flow. Shape:

- `finance.bills` — mirrors `finance.invoices` but `pay_to_entity_id` (directory), `invoice_kind` replaced by `bill_kind = 'freelancer' | 'vendor' | 'expense_reimbursement'`. Maps to QBO `Bill`.
- `finance.bill_payments` — mirrors `finance.payments` but `bill_id` FK. Maps to QBO `BillPayment`.

Separate tables, not a union with invoices. Field Expert anti-pattern #13: reusing an AR table for AP. Confirmed.

### 3.11 What does NOT get its own table

- **No `finance.customers`** — use `directory.entities` + `finance.qbo_entity_map`.
- **No `finance.credit_notes`** — `invoice_kind = 'credit_note'` on the same table.
- **No `finance.transaction_allocations`** — Navigator flagged the legacy finance-sync code uses this. Wrong abstraction for Unusonic (was modeling split payments across multiple accounts). Delete it.
- **No `finance.statements`** — Wave 2 (User Advocate explicitly deferred consolidated statements).

---

## 4. The canonical billing lifecycle

Told in Dana's voice, annotated with state transitions and side effects.

### 4.1 Proposal → Acceptance

> "I build the proposal in the builder. Client signs it via DocuSeal. Done. I don't touch anything else."

- `public.proposals.status: draft → sent → accepted`
- DocuSeal webhook fires `submission.completed` (existing code path, PRESERVED unchanged from §8.5 of finance-schema doc).
- **New side effect:** webhook handler calls `finance.spawn_invoices_from_proposal(proposal_id)` SECURITY DEFINER function.
- Idempotency: `spawn_invoices_from_proposal` checks `finance.invoices WHERE proposal_id = $1 AND invoice_kind IN ('deposit','final','standalone')`; if any exist, no-op. Handles the double-fire case Navigator flagged.

### 4.2 Draft invoices spawned

> "Two invoices appear on the deal page: a deposit for 50%, a final for the remaining 50%, both in draft. I review them. Most of the time I don't need to edit — the line items came right from the proposal."

- `spawn_invoices_from_proposal` reads `proposals.deposit_percent`:
  - If NULL or 0 → spawn one `standalone` invoice for total.
  - If > 0 → spawn `deposit` invoice (percent × total, rounded) and `final` invoice (balance). Both as draft.
- Line items: copy from `proposal_items` (client-visible only) into `finance.invoice_line_items`, with `source_proposal_item_id` set for lineage.
- Proposal total snapshotting: the deposit gets one line item "Deposit for {proposal.title}" at the deposit amount. The final gets all the line items minus the deposit amount as a "Deposit applied" negative line.
  - **Alternative I considered:** final invoice has all line items at full price, and the deposit payment is "applied" as a non-line payment. Rejected because clients see the final PDF and need to see "minus deposit already paid" explicitly.
- `issue_date`, `due_date`, `tax_amount` are NOT set yet — those are sent-time snapshots.

### 4.3 Send

> "I click Send. It emails the client a link to a clean-looking invoice page. I can see it's been delivered. I can see when they open it."

- User clicks Send. Server action `sendInvoice(invoice_id)`:
  1. Validates draft state.
  2. Acquires `SELECT ... FOR UPDATE` on the invoice row.
  3. Assigns `invoice_number` via `next_invoice_number(workspace_id)`.
  4. Reads workspace default tax rate, computes `tax_amount` from taxable lines, writes snapshot.
  5. Writes `bill_to_snapshot` and `from_snapshot` jsonb from current `directory.entities` + `public.workspaces`.
  6. Sets `issue_date = today`, `due_date = today + workspace.payment_due_days`, `issued_at = now()`, `sent_at = now()`, `status = sent`.
  7. Generates PDF (server-side, reusing proposal PDF stack). Stores at `documents/{workspace_id}/{deal_id}/invoices/{invoice_number}.pdf`.
  8. Enqueues QBO push job (`finance_jobs` queue — see §5.4).
  9. Sends Resend email using workspace-aware `from` (per `getWorkspaceFrom`), with `/i/{public_token}` link and PDF attachment.
- Side effect on `viewed_at`: public page GET handler writes `viewed_at = now()` if null. No separate `viewed` event.

### 4.4 Payment (Stripe card)

> "They click the pay button on the invoice page. A Stripe Checkout page opens. They pay. I get an email. The invoice shows paid on my dashboard within seconds."

- Public page `/i/{token}` shows "Pay now" if `stripe_publishable_key` env set and `status IN ('sent','viewed','partially_paid')`.
- Click → `createInvoiceCheckoutSession(invoice_id, amount_due)` → Stripe Checkout session with metadata `{ unusonic_invoice_id, unusonic_workspace_id }`.
- Client completes. Stripe sends `checkout.session.completed` to `/api/stripe-webhook/client` (see §6.3 for the route split).
- Handler:
  1. Verifies signature.
  2. Checks `finance.stripe_webhook_events` dedup by `stripe_event_id`; if already processed, 200 no-op.
  3. Resolves `unusonic_invoice_id` from metadata.
  4. Calls `recordPayment({ invoice_id, amount, method: 'stripe_card', stripe_payment_intent_id, stripe_charge_id, status: 'succeeded', received_at: now() })`.
  5. Trigger recomputes `paid_amount` and transitions status.
  6. Enqueues QBO push for the payment.
  7. Writes `stripe_webhook_events.processed_at`.
  8. `revalidatePath('/i/{token}')` and `/events/{id}/finance`.

### 4.5 Payment (check / wire / cash / ACH — the 60-80% case)

> "Client sends a check. It shows up Tuesday. I go to the invoice, click Record Payment, type 2500, pick 'check', enter the check number, hit save. Done in ten seconds."

- One-click action on invoice detail AND on `/events/[id]/finance` AND on the deal page.
- Modal:
  - Amount (defaults to balance due)
  - Method dropdown (check/wire/cash/ACH/other)
  - Received date (defaults to today, backdateable)
  - Reference field (labeled dynamically: "Check number" for check, "Wire reference" for wire, etc.)
  - Attachment drop zone (optional)
  - Notes
- Server action `recordManualPayment` → same `recordPayment()` canonical path.
- Triggers status transition. QBO push enqueued.

### 4.6 Partial payments and over-payments

- Partial: status becomes `partially_paid`, dashboard shows `paid_amount / total_amount` bar. Normal.
- Over-payment: allowed (Kristen's AP sometimes pays multiple invoices with one check and picks the wrong one). Creates a negative balance. Handled in Wave 2 via "apply credit to other invoice" flow. V1: warn on save and let it save.

### 4.7 Refund

> "Client cancels. I refund the deposit."

- On a paid invoice, action "Issue Refund" → amount, method, reason.
- For Stripe-original payments: calls Stripe Refund API, creates negative `finance.payments` row with `parent_payment_id` set, `status: pending`. Webhook `charge.refunded` confirms → `status: succeeded`.
- For manual-original payments: creates negative row immediately, `status: succeeded`, no Stripe call.
- QBO: creates a QBO Refund Receipt or Payment delete depending on payment state. Worker handles.

### 4.8 Void / cancel

> "I made a mistake and sent the wrong amount. I void it and send a new one."

- A `draft` invoice is deleted outright.
- A `sent` invoice with zero payments is transitioned to `void`. No credit note needed.
- A `sent` invoice with payments received cannot be voided. User is forced to issue a credit note (`invoice_kind = credit_note`, `parent_invoice_id` set, negative total). This becomes a QBO CreditMemo on push. User Advocate deferred formal credit memo UI, but the data path must exist from day one — we just don't expose a dedicated "Create Credit Note" button in v1.

### 4.9 Change orders (v1: manual)

> "They added bottle service after signing. I send a new invoice for $800 against the same deal."

- Create new invoice manually, `invoice_kind = standalone`, link to same `deal_id`/`event_id`/`project_id`.
- Contract chain view rolls this up into total billed for the deal.
- Wave 1 does NOT include a `change_orders` table or dedicated UI. V1.5 introduces.

### 4.10 Close the books (Linda)

> "End of month. I open Unusonic. I look at Sync Status. Zero failures. I open QBO. Everything is there, correctly classed, payments linked. Ten minutes, done."

This is the success criterion. Not one of Linda's actions creates a ticket or an email to support.

---

## 5. QBO integration architecture

Hard commitment: **Unusonic is the source of truth. QBO is a downstream replica. We push. We never pull.** Field Expert's recommendation, User Advocate's Linda-safety argument, and the earlier "never query QBO from UI" comment in `src/features/finance/sync/` all converge on this.

### 5.1 OAuth flow

- New capability: `finance:manage_qbo` on the workspace admin role.
- Settings → Finance → Connect QuickBooks button → Intuit OAuth2 redirect.
- Callback at `/api/integrations/qbo/callback` (new route).
- Callback exchanges code for tokens, writes `finance.qbo_connections` row (encrypted tokens), fetches `realmId`, runs first-time mapping wizard (see §5.3).

### 5.2 Token handling with mutex

- All token reads go through `finance.get_fresh_qbo_token(workspace_id)` SECURITY DEFINER function.
- The function:
  1. `SELECT pg_advisory_xact_lock(hashtext('qbo_refresh_' || workspace_id::text))` — per-workspace lock inside a transaction.
  2. Reads current access token expiration.
  3. If > 5 minutes left → returns existing access token.
  4. If ≤ 5 minutes → calls Intuit refresh endpoint, decrypts refresh token, persists new tokens, returns new access token.
  5. Transaction ends, lock released.
- This prevents the concurrent-refresh brick scenario Field Expert flagged as non-negotiable.
- Daily proactive refresh cron (`trig_...` schedule, to be created) prevents the 100-day inactivity wall.

### 5.3 Entity mapping (the Linda-protection layer)

**The failure mode to prevent:** HoneyBook's #1 complaint — fuzzy-matching on customer name creates duplicate customers in QBO, then bank-feed sync matches against the wrong one.

**Our rule: no fuzzy matching. Ever.**

First time a workspace pushes an invoice whose `bill_to_entity_id` is not yet in `finance.qbo_entity_map`:
1. Push is deferred (job goes to `pending_mapping` state).
2. Dashboard banner: "One invoice is waiting on a QBO customer match."
3. Modal shows the Unusonic entity's name, suggests a search against QBO's customer list via `Customer` query endpoint.
4. User either:
   - Picks an existing QBO customer from search results → writes `finance.qbo_entity_map` row.
   - Clicks "Create new in QuickBooks" → POST `Customer`, writes map row.
5. Job resumes.

Items (QBO mandates `ItemRef` on every invoice line):
- First-time mapping wizard in the OAuth callback flow: "We'll map your catalog to QuickBooks Items. For now, we'll create one default Item called 'Event Production Services'. You can refine these mappings later."
- Writes `finance.qbo_connections.default_item_id`.
- Per-line QBO item mapping is Wave 2 — v1 ships with every line using the default item, which is acceptable for services businesses.

Tax codes: default tax rate maps to QBO `TaxCode`. Created during OAuth if workspace has a tax rate configured. Otherwise uses QBO `NON` tax code.

### 5.4 Sync triggers

Push on these state transitions:
- Invoice `draft → sent` → push `Invoice` (create).
- Invoice `sent → void` → push `Invoice` (void / delete).
- Invoice total or line items edited (Wave 2) → push `Invoice` (update with SyncToken).
- Payment row inserted (succeeded) → push `Payment`.
- Payment row negative (refund) → push `Payment` (or delete depending on QBO state).
- Nightly backfill cron: retry any `qbo_sync_log` row with `error_message IS NOT NULL` and `attempt_number < 5`.

**No polling. No real-time sync from QBO → Unusonic.** Ever.

### 5.5 Idempotency — deterministic RequestId

Intuit's `RequestId` header deduplicates API calls server-side. Field Expert non-negotiable.

```
request_id = sha256(workspace_id || '|' || local_type || '|' || local_id || '|' || operation || '|' || version)
```

Where `version` is a counter we maintain per (local_id, operation). Retries use the same `request_id`; Intuit returns the cached response. Writes to `finance.qbo_sync_log.request_id`.

### 5.6 Queue / worker layout

- New table: `finance.sync_jobs` (or use existing `ops.domain_events` seam if it exists from the Pass 3 Phase 3 commit — check; if the seam is generic enough, route jobs through it).
- Worker runs as a Vercel Cron + Supabase Edge Function combo, or a small Node worker deployed alongside the app. Pick Edge Function for v1 (simpler, already used).
- Job payload: `{ operation, local_type, local_id, request_id, attempt_number }`.
- On failure: exponential backoff `[1m, 5m, 30m, 2h, 12h]`, max 5 attempts, then surface to sync-status UI.
- State machine: `queued → in_progress → succeeded | failed | pending_mapping`.

### 5.7 Conflict resolution

**Unusonic always wins.** If a bookkeeper edits an invoice in QBO, the next push from Unusonic overwrites it. This is documented in Settings → Finance → QuickBooks with bold copy: "Edits made directly in QuickBooks will be overwritten. Make your edits in Unusonic."

This is deliberately the opposite of bidirectional. Field Expert is explicit: "two-way sync is Ignition's thing, everyone else got burned."

### 5.8 Sync status surface in UI

- **Chip on every invoice row:** "Synced" (green dot) / "Pending" (amber) / "Failed" (red) / "Not connected" (gray).
- **Click the chip** → slide-over with `finance.qbo_sync_log` rows for that invoice, last error copy, "Retry now" button, "Open in QuickBooks" link.
- **Dashboard banner** when any invoice in workspace has a failed sync older than 15 minutes.
- **Settings → Finance → QuickBooks panel** — connection status, last successful push, pending mappings count, manual "Sync all" button.

---

## 6. Stripe architecture

### 6.1 Payment intent flow for invoices

Use Stripe Checkout (hosted) for v1, not Payment Elements. Reasons:
- Existing `createCheckoutSession` code already works for proposals. Reuse.
- Hosted Checkout handles card + ACH + Apple/Google Pay out of the box.
- No PCI scope.
- Can migrate to Payment Elements in Wave 2 if we need embedded pay-in-portal.

Metadata on every session: `{ unusonic_invoice_id, unusonic_workspace_id, unusonic_invoice_kind }`.

Amount is the balance due (allowing partial Stripe payments is Wave 2).

### 6.2 Proposal deposit flow — preserved

Currently proposals have a `deposit_paid_at` flow that Stripe-charges before the full invoice exists. **This flow is preserved unchanged in Wave 1 short term.** Rationale: it works, it's on the critical path for the demo, and rewriting it simultaneously doubles risk.

**But:** on the DocuSeal webhook handler, after a proposal is accepted, we call `finance.spawn_invoices_from_proposal(proposal_id)`. If a deposit has already been paid on the proposal (`deposit_paid_at IS NOT NULL`), the spawner marks the deposit invoice as already paid and creates a retroactive `finance.payments` row with `method = stripe_card`, `stripe_payment_intent_id` from the proposal row, and backdates `received_at` to `deposit_paid_at`. QBO gets one invoice and one payment. Clean.

Wave 2: unify the flows. The proposal "Pay deposit" button generates the deposit invoice immediately and charges against it. No more special `deposit_paid_at` column.

### 6.3 Webhook route split — SEPARATE ROUTES

Navigator flagged this; I'm agreeing. The current `/api/stripe-webhook` handles both client payments and Unusonic SaaS subscription lifecycle. These have completely different blast radii — a bug in the client payment branch should never, ever break subscription billing, and vice versa.

**Split into:**
- `/api/stripe-webhook/client` — `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`. Writes `finance.payments` via `recordPayment`.
- `/api/stripe-webhook/billing` — `customer.subscription.*`, `invoice.paid` (Stripe-billed Unusonic subscriptions), `invoice.payment_failed`. Writes `public.workspaces.subscription_*`.

Each route has its own webhook secret (Stripe supports multiple endpoints).

**Migration:** Stripe dashboard gets two endpoints configured. Old `/api/stripe-webhook` route kept temporarily as a 410 Gone during a brief deprecation window, then deleted. Since we're pre-launch, this is a zero-risk change — Stripe dashboard reconfig + code deploy.

Both routes use `finance.stripe_webhook_events` as the dedup table with a `source` column distinguishing `client` from `billing`.

### 6.4 Cents ↔ dollars boundary

Per finance-schema.md §6.3, which is correct. Preserve strictly:
- Dollars→cents (×100) only in `createInvoiceCheckoutSession`.
- Cents→dollars (÷100) only in the webhook handler when calling `recordPayment`.
- All internal tables store dollars.

### 6.5 Webhook idempotency

`finance.stripe_webhook_events` with `stripe_event_id` as PK. First line of every webhook handler: `INSERT ... ON CONFLICT DO NOTHING RETURNING id`. If no row returned, event was already processed → 200 no-op. If row returned, proceed with processing, then set `processed_at`.

---

## 7. Resolutions to Navigator's 11 open intent questions

1. **Invoice key?** Primary operational link is `event_id`. Lineage link is `proposal_id`. Denormalized `deal_id` for chain rollup. Optional `project_id` for multi-event contracts. All four columns exist, only `event_id` is used for most queries. Navigator's four-opinion drift resolved by having all four and documenting which one is "primary".
2. **`finance.payments` table?** YES. Not optional. QBO-only would make manual check recording impossible. Field Expert and User Advocate both non-negotiable.
3. **QBO source of truth?** Unusonic authoritative. One-way push. Never pull. Settings copy explicit. Daniel's original "push to QBO" framing was correct; the newer `src/features/finance/sync/` had it right, the older `src/features/finance-sync/` had it wrong. Delete the older folder.
4. **`/i/[token]` vs `/client/invoice/[id]`?** Collapse to one: `/i/[token]` for PUBLIC (unauthenticated) view. `/client/invoice/[id]` becomes a redirect into `/client/event/[id]#invoices` (client portal detail), which itself reads by invoice id. Two routes, clear purposes: token route = anyone with the link, portal route = logged-in client. Delete the stub of whichever doesn't fit.
5. **Webhook split?** YES, split. See §6.3.
6. **`tier_config` dual source?** Out of scope for billing redesign, flag for separate cleanup. Note in migration plan.
7. **`finance.bills` in v1?** Create the tables empty. No UI in Wave 1. Wave 2 ships the freelancer pay flow.
8. **Financial Pulse proposal-proxy?** DELETE the proxy. Wave 1 Financial Pulse reads from `finance.invoices` and `finance.payments` only. If no data yet, the widget shows an empty state, not stale proxy math.
9. **`ops.event_expenses`?** Keep where it is. Wave 2 pulls expenses into profitability calcs on the event finance page. Not part of the v1 ledger.
10. **`/invoices/new` blank invoice authoring?** YES, ship it in Wave 1. It's trivial if the data model is right (just a form that writes `finance.invoices` + `invoice_line_items`), and Dana sometimes bills non-proposal things. New route: `/dashboard/finance/invoices/new`.
11. **(implicit) Public proposal vs public invoice rendering?** Same PDF stack, different templates. One server action, `generateFinanceDocumentPDF(kind, id)`.

---

## 8. Resolutions to Field Expert's 8 open decisions

1. **Line-level vs invoice-level tax?** Hybrid. `is_taxable` per line, `tax_amount` snapshot per invoice. See §3.2.
2. **Separate credit_notes table?** No. Same table, `invoice_kind = credit_note`. See §3.1.
3. **Default Item for v1?** Yes, one default "Event Production Services" Item. Per-line mapping is Wave 2.
4. **Push frequency?** On state transitions (immediate) + nightly retry cron. Not polling.
5. **Class/Location mapping?** Wave 2. V1 ships without. Linda can add Class manually in QBO post-push for the first month; Wave 2 makes it automatic based on workspace/event location.
6. **Sync log retention?** 1 year rolling. Add a cleanup cron.
7. **Customer matching strategy?** Explicit mapping modal, never fuzzy. See §5.3.
8. **Freelancer bills in v1?** Schema yes, UI no. See §3.10.

---

## 9. What gets deleted

Hard deletes (nothing here is in production):

**Directories / folders:**
- `src/features/finance-sync/` — ENTIRE directory. Older QBO sync path. Replaced by new `src/features/finance/qbo/` namespace (to be created under the surviving `src/features/finance/`).
- `src/features/finance/sync/` — the newer but not-quite-right path. Replaced by `src/features/finance/qbo/` with rebuilt push/map/oauth/worker modules.

**Routes:**
- `/invoices/new` — ghost route. Replaced by `/dashboard/finance/invoices/new`.
- `/api/stripe-webhook/route.ts` — split into `/api/stripe-webhook/client/` and `/api/stripe-webhook/billing/`.
- Any duplicate `InvoiceList.tsx` — keep one under `src/features/finance/ui/`.

**Database objects (migration to drop):**
- `public.invoices` table (legacy) — the "Model A" schema Navigator found. Pre-launch, no data to migrate. Drop.
- `public.invoice_items` table (legacy) — same reason. Drop.
- `public.payments` table (if exists as ghost) — Drop.
- `public.finance_invoices` table (underscored, "Model D") — Drop.
- `public.qbo_project_mappings` — Drop.
- `public.transaction_allocations` — Drop.
- `public.create_draft_invoice_from_proposal(uuid)` RPC — the ghost-target RPC. Replaced by `finance.spawn_invoices_from_proposal(uuid)`.
- `public.quickbooks_connections` if it exists — Replaced by `finance.qbo_connections`.
- `public.monthly_revenue`, `public.outstanding_invoices`, `public.dashboard_ledger` views — rebuild as `finance.*` views reading the new tables.

**Components (under `src/features/finance/ui/`):**
- Any `RevenueStream`, `ProfitabilityCard`, etc. pinned to ghost shapes — rewrite against new model. Preserve UI; swap data source.
- Any `PaymentTimeline` reading from ghost `public.payments` — rewrite.
- Any "Financial Pulse" widget using proposals-as-revenue-proxy — gut.

**Store this deletion list** in the initial PR description — "What This PR Deletes" section, so the build team has a checklist.

---

## 10. What gets preserved

Do not touch in Wave 1:

- **`src/shared/api/stripe/server.ts`** and **`client.ts`** — Stripe singletons, correct.
- **`src/shared/api/supabase/{client,server,system}.ts`** — three-client model, correct.
- **`src/shared/api/email/send.ts`** — `getWorkspaceFrom` logic, correct; invoice email will use it.
- **`public.proposals.deposit_paid_at` flow** — proposal deposit Stripe intent, currently working. Preserved in Wave 1, refactored in Wave 2.
- **DocuSeal webhook at `/api/docuseal-webhook`** — existing flow (§8.5 of finance-schema doc). Adds one call to `finance.spawn_invoices_from_proposal` in step 6. Otherwise unchanged.
- **`getEntityFinancialSummary`** — the one finance read path that uses the correct shape. Update its query to the new table but preserve its signature — it's called from Aion tools and the Network entity studio.
- **Client portal invoice read (`src/app/(client-portal)/client/invoice/[id]/page.tsx`)** — shape is correct. Update its query to new table, keep the component.
- **Stripe subscription webhook handlers** (whatever flow B currently does to `public.workspaces.subscription_*`) — moves to `/api/stripe-webhook/billing/` but the handler logic is preserved byte-for-byte.
- **`public.workspaces.default_tax_rate`** column — still read at invoice-send time. Will move to `finance.tax_rates` in Wave 2 but the column stays for backward compat.
- **Proposal item `tax_meta.is_taxable`** snapshotting — already correct, invoice send reads it.
- **`getWorkspaceFrom`** workspace-aware sending — invoice emails will use it.
- **`readEntityAttrs` / `patch_entity_attributes`** — bill-to snapshot reads `directory.entities` through these.

---

## 11. Prioritized feature set

### Wave 1 — v1 launch blockers (ranked by User Advocate priority)

**W1.1 — Connected billing chain (THE feature)**
- Data: `finance.invoices` + `invoice_line_items` + `payments` live with proper FKs.
- `spawn_invoices_from_proposal` RPC spawns deposit + final on proposal acceptance.
- Deal detail page shows "Contract chain": proposal, deposit invoice, final invoice, rollup balance with paid/due bars.
- Event finance page shows the same chain grouped by event.
- Acceptance: a test deal can move proposal → accepted → deposit invoice exists → deposit paid → final invoice visible → final paid, and the balance bar reflects state correctly at every step.

**W1.2 — Linda-safe QBO sync (minimum viable version)**
- OAuth connect flow in Settings → Finance.
- Token refresh with advisory-lock mutex.
- Explicit customer mapping modal (no fuzzy).
- Push invoice on draft→sent, push payment on insert, push void on sent→void.
- Sync status chip + log slide-over on every invoice.
- Default item and default tax code auto-created.
- Acceptance: connect a sandbox QBO, send five invoices of different shapes, pay three, void one, credit-note one — all appear correctly in QBO with zero duplicates and zero manual fixes.

**W1.3 — Record external payment (one-click)**
- Modal with amount/method/date/reference/notes/attachment.
- Available from invoice detail, event finance page, deal page, `/finance` dashboard.
- Writes `finance.payments` via `recordPayment` canonical path.
- Acceptance: record a check payment in under 10 seconds; invoice status flips; QBO push queued.

**W1.4 — Presentable invoice PDF**
- Branded header (workspace logo, name, address, EIN).
- **`po_number` field** rendered prominently under bill-to block if set.
- Line items table, subtotal, tax, total.
- Payment terms and notes to client.
- "Pay now" button on public view linking to Stripe Checkout.
- Acceptance: Kristen's AP can process this without asking for anything.

**W1.5 — Deposit tracking dashboard**
- `/finance` dashboard page rebuilt reading `finance.invoices`.
- Aging buckets (current, 1-30, 31-60, 61-90, 90+).
- Outstanding total, MTD revenue, pending QBO syncs count.
- Quick filters by status.
- Acceptance: Dana can see every invoice that's late, sorted by days overdue, on one screen.

**W1.6 — Stripe card payment on public invoice page**
- Reuses checkout flow from proposals.
- Metadata correctly wired to `unusonic_invoice_id`.
- New webhook route `/api/stripe-webhook/client`.
- Acceptance: Stripe CLI test event processes end-to-end in dev.

**W1.7 — Blank invoice authoring**
- `/dashboard/finance/invoices/new` form.
- Select bill-to entity (uses existing entity picker).
- Optional event/project/deal link.
- Line items editor (reuses proposal line item component if possible, otherwise simpler version).
- Save draft / send.
- Acceptance: Dana can bill a one-off consultation fee not tied to a proposal in under two minutes.

**W1.8 — Webhook route split**
- Two routes live, old route 410 Gone.
- Stripe dashboard reconfigured.
- Acceptance: SaaS subscription payments still work; client invoice payments work; one route failing does not affect the other.

**W1.9 — Cancellation/kill fee text block**
- Workspace setting: default cancellation terms text.
- Appears on invoice PDF under payment terms.
- No automation, no data model.
- Acceptance: text appears on PDF when set.

**W1.10 — Contract balance single-glance view on deal page**
- Already implied by W1.1 but explicit: deal page header shows `paid / total` across all invoices on the deal.
- Prism Ledger Lens wired to this data.
- Acceptance: Dana opens any deal, sees current state of the money in ≤2 seconds.

### Wave 2 — post-launch (3-6 months post-ship)

- **W2.1** Freelancer pay: `finance.bills` + `bill_payments` UI. Maps to QBO `Bill`/`BillPayment`.
- **W2.2** Per-line QBO item mapping + Class/Location mapping based on event location.
- **W2.3** Manual credit notes UI (backed by existing `invoice_kind = credit_note` path).
- **W2.4** Change orders as a tracked entity with deal-level rollup.
- **W2.5** Consolidated client statements.
- **W2.6** Tax rate picker per invoice (`finance.tax_rates` rows beyond just default).
- **W2.7** Unify the proposal deposit flow with invoice deposit flow (delete `deposit_paid_at`).
- **W2.8** Payment plans (N-payment schedules beyond deposit+final).
- **W2.9** Late fee automation + gentle dunning emails.
- **W2.10** `ops.event_expenses` into profitability calcs on event finance page.
- **W2.11** Card surcharge / convenience fee toggle.
- **W2.12** 1099 generation for freelancers.
- **W2.13** Public invoice page "History" section showing all payments against this invoice.

### Wave 3 — second-wave users

- **W3.1** Settlement sheets for touring PMs (Trey). Day-of-show reconciliation workflow.
- **W3.2** Multi-currency support (currency column already exists in schema).
- **W3.3** Multi-jurisdictional tax (multiple rates per invoice).
- **W3.4** Bill.com ACH integration as a payment method provider.
- **W3.5** Automated dunning sequences with Aion-drafted copy.
- **W3.6** Two-way QBO sync (only if a customer explicitly asks — default stays one-way forever).
- **W3.7** Aion-powered cash flow forecasting over the invoice + expense ledger.

---

## 12. Dependency graph

- **W1.1 (connected chain)** is the spine. Everything else in Wave 1 depends on it.
- **W1.2 (QBO)** depends on W1.1 being data-complete, plus W1.3 (payments table) existing.
- **W1.4 (PDF)** depends on W1.1's bill_to/from snapshot columns.
- **W1.6 (Stripe pay)** depends on W1.3 (payments canonical path) and W1.8 (webhook split).
- **W1.5 (dashboard)** depends on W1.1 + W1.3 being live and populated.

**Schema room deliberately left for Wave 2+:**
- `currency` column on invoices → W3.2 multi-currency.
- `parent_invoice_id` → W2.3 credit notes UI.
- `parent_payment_id` → refund chain already working v1.
- `finance.tax_rates` table → W2.6 picker.
- `finance.bills` / `bill_payments` tables → W2.1 freelancer pay.
- `finance.qbo_entity_map` supports bills + bill_payments from day one → W2.1 flip.
- `finance.sync_jobs` generic shape → any future integration (Xero? Wave 99).

---

## 13. Test & validation strategy (pre-launch, no real customers)

**Fixture data:**
- Seed script `scripts/seed/finance-fixtures.ts` creates: 3 workspaces, 5 clients (2 corporate with PO numbers, 2 individuals, 1 ghost), 10 proposals at various stages, 15 spawned invoices across all `invoice_kind` values, 20 payments across all methods.

**pgTAP tests** (`supabase/tests/finance/`):
- RLS: user in workspace A cannot read invoices from workspace B. Every table.
- Trigger: payment insert recomputes paid_amount, status flips correctly at boundaries (0, partial, exact, over).
- Spawner: `spawn_invoices_from_proposal` is idempotent (second call is no-op).
- Tax snapshot: draft invoice tax_amount is NULL, sent invoice tax_amount is frozen.
- SECURITY DEFINER functions: `has_function_privilege('anon', oid, 'EXECUTE')` is FALSE for every new function. **Non-negotiable check per memory.**
- `next_invoice_number` is strictly monotonic under concurrent calls (pgbench with 50 parallel clients).

**Stripe CLI scenarios:**
- `stripe trigger checkout.session.completed` with correct metadata → payment row created, status flips.
- `stripe trigger charge.refunded` → negative payment row, status flips to refunded.
- Duplicate event redelivery → no duplicate payment row.
- Subscription events → routed correctly to billing endpoint.

**QBO sandbox flows:**
- Connect sandbox workspace. Verify tokens stored encrypted.
- Send deposit+final invoice pair for one deal. Verify both appear in sandbox QBO as separate invoices.
- Pay one via Stripe, one via manual check. Verify two Payment records in QBO, correctly LinkedTxn'd.
- Void an invoice. Verify QBO reflects void.
- Force a mapping conflict (delete customer in QBO, try to push). Verify "needs remap" state surfaces to UI.
- Kill refresh token proactively, force a refresh mid-sync, verify advisory lock serializes.
- Cron-simulate nightly backfill against a failed row, verify retry logic.

**Manual smoke test plan before launch day (runbook, 2 hours):**
1. Fresh workspace, connect QBO sandbox, confirm default mappings.
2. Create a proposal, sign via DocuSeal sandbox.
3. Verify deposit + final draft invoices spawn.
4. Send deposit, pay via Stripe test card.
5. Verify QBO has invoice + payment, no duplicates.
6. Send final, record a check payment manually.
7. Verify QBO push.
8. Issue a credit note against a paid invoice.
9. Verify QBO CreditMemo.
10. Try a blank invoice from `/dashboard/finance/invoices/new`.
11. Open `/finance` dashboard, verify counts and aging buckets.
12. Open an event finance page, verify Prism Ledger Lens renders.
13. Open the deal chain view, verify rollup math.
14. Linda-test: pretend to be a bookkeeper, try to spot anything that would create a ticket. Document every friction point.

---

## 14. Migration plan for existing fake data

**Assumption verification step (first PR task):** Query dev DB for non-zero row counts in `public.invoices`, `public.invoice_items`, `public.payments`, `public.finance_invoices`, `public.qbo_project_mappings`, `finance.invoices`, `public.transaction_allocations`. Report results in the PR description.

**Expected state:** All zero or near-zero. Pre-launch, no real billing has occurred.

**If all zero:** Drop the ghost tables in the initial migration. Nothing to migrate.

**If non-zero (dev seed data):** One-time script `scripts/migrate/finance-dev-reset.ts` that:
1. Exports any non-zero rows to `docs/audits/finance-dev-snapshot-2026-04-11.json` for forensic reference.
2. Truncates.
3. Drops tables.
4. Re-runs the new seed fixtures.

**Proposals stay.** Proposals are in `public.proposals` and are not part of this redesign's deletion scope. All existing proposal data is preserved. Only the downstream invoice/payment tables are greenfielded.

**`public.workspaces.default_tax_rate` stays** populated as-is. Wave 2 migrates to `finance.tax_rates`.

**Environment reset:** Dev Stripe test mode data (test customers, test subscriptions) is NOT touched. Only our DB shape changes.

---

## 15. Risks and unknowns

**Risks the research covered:**
- QBO token brick via concurrent refresh → mitigated by advisory lock (§5.2).
- Duplicate customers in QBO → mitigated by explicit mapping (§5.3).
- Webhook reprocessing → mitigated by `stripe_webhook_events` dedup (§3.8, §6.5).
- Stripe subscription blast radius → mitigated by route split (§6.3).
- Tax drift → mitigated by snapshot on send (§3.1).
- Ghost customer failures → Ghost Protocol already works via `bill_to_entity_id` (§3.1).

**Risks the research did NOT cover — the plan team will need to resolve:**

1. **Intuit API rate limits.** Field Expert mentioned "rate caps" but didn't quantify. Plan team needs to verify current QBO rate limits (500 req/min per realm last I checked) and confirm our worker won't hit them under peak load. Probably fine for v1 — one invoice push is ≤3 API calls — but worth measuring.
2. **QBO Invoice DocNumber uniqueness.** QBO rejects duplicate invoice numbers. Our `invoice_number_sequences` is per-workspace, but if a bookkeeper created invoices directly in QBO before connecting, collision is possible. Plan team should implement a "suffix with `-U` on first conflict, then `-U2`" fallback, OR prompt the user to pick a starting number that avoids their existing QBO numbers during OAuth setup. I lean toward the second — one-time wizard cost, zero ongoing weird.
3. **Refund-after-QBO-push edge case.** If a Stripe refund happens while a QBO push is in flight (reordered webhooks), state can be wonky. Plan team: enforce processing order via a per-invoice advisory lock in the worker loop.
4. **PDF generation cost.** Generating a PDF on every send is fine. Generating 50 at once (bulk send, which we don't support v1 but might Wave 2) could saturate. Flag for later.
5. **Email deliverability for invoices.** Proposals already use `getWorkspaceFrom`. Invoices will too. But: invoices from unverified sending domains will land in spam more often than proposals (clients sometimes expect proposals from random-looking emails, never invoices). Plan team should gate the Send button on workspace domain verification, OR prominently warn before sending from the fallback domain.
6. **QBO `SalesItemLineDetail` Class mapping.** Wave 2 item, but the shape of how Class maps (by event location? by workspace default?) is a design question I couldn't resolve without more field data. Flag for Wave 2 kickoff.
7. **Stripe Payment Links vs Checkout Sessions.** Wave 1 uses Checkout Sessions. Payment Links have better UX for resending an unpaid invoice (same URL every time). Worth revisiting in Wave 2.
8. **`currency` handling when Stripe account is USD-only.** Trivial in v1. Becomes real in Wave 3.
9. **The `/finance` vs `/dashboard/finance` path naming.** Navigator found `/finance` as a dashboard route. Confirm this is correct Next.js route group path in current codebase — do not blindly use `/dashboard/finance` if the actual route is `/(dashboard)/finance`. **Plan team: confirm before writing URL constants.**
10. **`tier_config` dual source of truth** (Navigator Q6) is flagged but deferred. It's not part of billing mechanics but it touches subscription pricing which the billing webhook reads. Plan team should audit whether any of the subscription webhook code depends on `tier_config` from the DB vs `src/shared/lib/tier-config.ts` and ensure the moves happen coherently.

---

## Appendix — concrete file landmarks the plan team will touch

**Create:**
- `supabase/migrations/{timestamp}_finance_rebuild.sql` — the big one.
- `supabase/migrations/{timestamp}_finance_expose_schema.sql` — PR 6.5 (exposes `finance` in PostgREST).
- `supabase/migrations/{timestamp}_finance_functions.sql` — `spawn_invoices_from_proposal`, `next_invoice_number`, `get_fresh_qbo_token`, `get_public_invoice`, `recompute_invoice_paid`, all with `REVOKE ALL FROM PUBLIC, anon`.
- `src/features/finance/qbo/` — new namespace, replacing both deleted sync folders. Subpaths: `oauth.ts`, `token.ts`, `push-invoice.ts`, `push-payment.ts`, `push-void.ts`, `map-customer.ts`, `worker.ts`, `request-id.ts`.
- `src/features/finance/api/invoice-actions.ts` — rebuilt. Functions: `createInvoice`, `spawnFromProposal`, `sendInvoice`, `recordPayment` (canonical), `voidInvoice`, `issueCreditNote`, `createInvoiceCheckoutSession`.
- `src/features/finance/ui/` — rebuilt `InvoiceList`, `InvoiceDetail`, `PaymentModal`, `SyncStatusChip`, `SyncLogSlideOver`, `QBOConnectPanel`, `CustomerMappingModal`.
- `src/app/(dashboard)/(features)/finance/invoices/new/page.tsx` — blank invoice author.
- `src/app/(dashboard)/(features)/finance/settings/qbo/page.tsx` — connection management.
- `src/app/api/stripe-webhook/client/route.ts` — new.
- `src/app/api/stripe-webhook/billing/route.ts` — new.
- `src/app/api/integrations/qbo/callback/route.ts` — OAuth return.
- `src/app/i/[token]/page.tsx` — public invoice view (wire to `get_public_invoice` RPC).
- `supabase/tests/finance/*.sql` — pgTAP tests.
- `scripts/seed/finance-fixtures.ts` — fixture seeder.

**Modify:**
- `src/app/api/docuseal-webhook/route.ts` — one added call to `spawn_invoices_from_proposal`.
- `src/app/(client-portal)/client/invoice/[id]/page.tsx` — rewire query to new table, preserve component.
- `src/features/network/.../getEntityFinancialSummary` — rewire query.
- `scripts/gen-db-types.js` — probably nothing, but verify `finance` schema is picked up after exposure migration runs.
- `CLAUDE.md` §Database Architecture — update finance schema block to reflect new tables.
- `docs/reference/finance-schema.md` — rewrite entirely against new shape.

**Delete:** (see §9)

---

This is the plan. Hand it to the Critic.
