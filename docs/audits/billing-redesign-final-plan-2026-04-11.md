# Unusonic Billing — Final Plan (Client + Subscription, Greenfield)

**Date:** 2026-04-11
**Status:** Build-ready architecture spec
**Authors:** Synthesized from Navigator + Field Expert + User Advocate + Visionary + Critic + Explore (subscription audit)
**Companion docs:**
- Trigger audit: `docs/audits/billing-system-schema-drift-2026-04-11.md`
- Architecture vision: `docs/audits/billing-redesign-vision-2026-04-11.md`
- Stress-test critique: `docs/audits/billing-redesign-critique-2026-04-11.md`
- Subscription doc: `docs/onboarding-subscription-architecture.md`

---

## 0. Why this document exists

The audit `billing-system-schema-drift-2026-04-11.md` discovered the Unusonic billing layer was broken in ways nobody had seen because every call site used `(supabase as any)` casts. A research team produced an architecture spec; a Critic stress-tested it; the founder reviewed both and chose the **premium outcome**: full greenfield rebuild, both billing systems first-class, take the time to do it right.

This document is the build-team source of truth. It supersedes the Visionary spec where they conflict (the Visionary's spec is preserved as a reference but the Critic's technical objections were 100% upheld and are baked into this version). It also adds a **Subscription Billing** architecture section that the original research did not cover.

**Two billing systems, one platform:**
1. **Client billing** — workspace charges its clients (production company → corporate event buyer / wedding couple / festival promoter). New `finance.*` schema, QBO sync, Stripe Checkout for card.
2. **Subscription billing** — Unusonic charges the workspace (Unusonic → production company). Existing `public.workspaces` columns + `tier_config`, Stripe Subscriptions, Stripe Customer Portal.

These systems share Stripe as a payment processor and the `directory.entities` graph as a customer model, but they are otherwise independent. They MUST be split at the webhook layer so a bug in one cannot break the other.

---

## 1. The one-sentence vision

**Unusonic is the authoritative ledger for every dollar flowing through the platform — client invoices and payments live in `finance.*` and push one-way to QuickBooks Online; SaaS subscription state lives in `public.workspaces` and stays in lock-step with Stripe Billing — Stripe executes the card transactions for both, neither system can break the other, and a bookkeeper never has to reconcile by hand.**

---

## 2. Core architectural decision

**Option B — Greenfield `finance.*` for client billing + parity-grade subscription billing on existing schema, both backed by a split Stripe webhook router.**

The Critic offered Option B-cut (six items, ship faster). The founder chose Option B-full: ship the complete Wave 1 spec with the Critic's technical fixes applied, plus a parallel Subscription Billing parity workstream that the original research missed.

**Why this is the right call given pre-launch status:**
- No data to migrate. The "redesign penalty" that normally makes greenfield billing rebuilds prohibitive does not apply.
- The audit's drift was not just a bug — it was a missing architecture. Patching the broken tables would perpetuate the four-mental-models problem Navigator found.
- Both billing systems will be on the critical path forever. Getting them right once is cheaper than getting them right twice.
- "Premium outcome over speed" is a stated founder preference, applied here.

**Constraints kept from the Visionary spec:**
- Unusonic is the source of truth. QBO is a downstream replica. One-way push.
- Stripe executes payments only. Never the system of record for invoices.
- Every cents↔dollars conversion happens at the Stripe boundary, never inside the DB.
- All finance tables in `finance` schema with `get_my_workspace_ids()` RLS.
- Every SECURITY DEFINER function has `REVOKE ALL FROM PUBLIC, anon` in the same migration (per the prior sev-zero memory).

---

## 3. The data model

This section is the Visionary's §3 with the Critic's data-model fixes applied. Read the Visionary doc for the full column-by-column rationale; this section ships the corrected spec.

### 3.1 `finance.invoices` — the core ledger row

All Visionary columns retained, with these **mandatory changes**:

| Change | Detail | Source |
|---|---|---|
| **Drop `balance_due` STORED generated column** | Compute in queries via `finance.invoice_balances` view, or in app code as `total_amount - paid_amount`. Eliminates trigger lock contention. | Critic §2b |
| **Add `tax_rate_snapshot numeric(8,6)`** | Frozen at send time alongside `tax_amount`. Enables Wave 2 line edits to recompute `tax_amount = new_taxable_subtotal * tax_rate_snapshot` without reissuing. Rate frozen, base can move. | Critic §2e |
| **Add `pdf_version int NOT NULL DEFAULT 1`** | Increments on every regeneration. PDF storage path becomes `documents/{workspace_id}/{deal_id}/invoices/{invoice_number}/v{N}.pdf`. Email links carry the version so a re-send after edits doesn't silently rewrite the original. | Critic §5a |
| **Add `billing_email text NULL`** | Default = primary contact email from `bill_to_entity_id`, editable per invoice. Corporate AP needs `ap@acme.com`, not `marco@acme.com`. | Critic §9d |
| **Add `is_disputed boolean NOT NULL DEFAULT false`** | Plus `dispute_note text NULL`. Real workflow state User Advocate flagged. Doesn't need a status enum value — orthogonal to lifecycle. | Critic §9c |
| **`public_token` access path** | RPC-only. Delete the JWT-claim policy alternative from the spec. RLS on `finance.invoices` denies all SELECT to `anon`. Public reads route through `finance.get_public_invoice(token text)` SECURITY DEFINER, `REVOKE FROM PUBLIC, GRANT EXECUTE TO anon`, returns a denormalized read-only shape. | Critic §2d |
| **Status enum gate on payment trigger** | The `recompute_invoice_paid` trigger fires only on rows where `invoice_kind != 'credit_note'`. Credit notes have their own lifecycle (`draft → issued → applied → void`) and are not driven by the payment table. | Critic §2a |

**`bill_to_snapshot` and `from_snapshot` are versioned jsonb.** Add Zod schemas `BillToSnapshotV1` and `FromSnapshotV1` in `src/features/finance/schemas/`. Validate at write time. Both blobs include `{ v: 1, ... }` so Wave 2+ can add fields without breaking existing reads. (Critic §2h)

**No `finance.customers` table.** Use `directory.entities` + `finance.qbo_entity_map`. Ghost Protocol intact.

### 3.2 `finance.invoice_line_items`

Visionary's spec verbatim, except:
- **Add `tax_rate_snapshot_applied` is NOT needed at line level** — the invoice-level frozen rate × per-line `is_taxable` boolean is the canonical model. Rationale: Linda thinks invoice-level, audit history is invoice-level, IRS is invoice-level, only multi-jurisdictional touring needs per-line rates and that's Wave 3.
- **`source_proposal_item_id` remains lineage-only, NOT FK**. This is the most important single decision in the data model. Proposal items are mutable; invoice lines are legal snapshots.

### 3.3 `finance.payments` — separate entity, with concurrency safety

Visionary's spec, plus:

**Concurrency safety on the recompute trigger** (Critic §2c):

```sql
CREATE FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_kind text;
BEGIN
  -- Lock the invoice row before reading paid_amount.
  -- This is the fix for the "Stripe webhook + manual payment race"
  -- where two trigger executions can flip status backwards.
  SELECT total_amount, invoice_kind
  INTO v_total, v_kind
  FROM finance.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  -- Credit notes have their own lifecycle; do not touch.
  IF v_kind = 'credit_note' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM finance.payments
  WHERE invoice_id = p_invoice_id AND status = 'succeeded';

  UPDATE finance.invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_paid >= v_total THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        ELSE status  -- preserve draft/sent/viewed
      END,
      paid_at = CASE WHEN v_paid >= v_total AND paid_at IS NULL THEN now() ELSE paid_at END
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.recompute_invoice_paid FROM PUBLIC, anon;
```

A pgTAP test in PR-INFRA-2 hammers 20 concurrent payment inserts at one invoice and asserts final state. This test is the regression guard against the race.

### 3.4 `finance.qbo_connections`

Visionary's spec, with **explicit token storage**:

- `access_token_enc` and `refresh_token_enc` are `bytea` encrypted via `pgsodium.crypto_aead_det_encrypt` using a workspace-scoped key stored in `pgsodium.key`.
- Column privileges deny SELECT on the encrypted columns to `authenticated` and `anon`. Only SECURITY DEFINER functions can decrypt.
- Token reads route exclusively through `finance.get_fresh_qbo_token(workspace_id)` (see §5.2 for the mutex pattern).

**One realm per workspace** — UNIQUE on `(workspace_id)` for v1. Documented limitation: multi-book production companies (LLC + S-corp) create a second Unusonic workspace. Wave 3+ may relax this.

### 3.5 `finance.qbo_entity_map`, `finance.qbo_sync_log`, `finance.tax_rates`, `finance.stripe_webhook_events`, `finance.invoice_number_sequences`

Visionary's specs verbatim, with one fix:

**`finance.stripe_webhook_events` workspace_id resolution** (Critic §4c):

Do NOT write the dedup row with `workspace_id = NULL` and fill it in later. That creates the orphan-row dead-letter trap. Instead:

1. Webhook handler extracts metadata, resolves `workspace_id` from `metadata.unusonic_workspace_id` or by Stripe customer lookup.
2. After resolution, `INSERT INTO finance.stripe_webhook_events (stripe_event_id, workspace_id, event_type, payload, received_at) ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id`.
3. If no row returned, event was already processed → 200 no-op.
4. If row returned, proceed with processing, set `processed_at` on success.

If workspace resolution fails before the insert, log to Sentry but do NOT write the dedup row. The next Stripe redelivery is the retry path.

### 3.6 `finance.bills` and `finance.bill_payments`

Schema-only in Wave 1, no UI. Tables exist so Wave 2 freelancer pay flow doesn't need a migration. Visionary's spec verbatim. (Field Expert anti-pattern #13: never reuse AR table for AP.)

### 3.7 What does NOT get its own table

Per Visionary §3.11, with one addition:

- **No `finance.customers`** — use `directory.entities`.
- **No standalone `finance.credit_notes`** — `invoice_kind = 'credit_note'` on the same table, with the trigger gate from §3.3.
- **No `finance.transaction_allocations`** — delete the legacy abstraction.
- **No `finance.statements`** — Wave 2.
- **NEW: No new subscription tables.** Subscription billing stays on `public.workspaces` columns + `public.tier_config`. See §7 for parity upgrades.

---

## 4. Access control — capabilities (Critic §5h)

The Visionary plan mentioned `finance:manage_qbo` and stopped. Full enumeration before any write action is built:

| Capability | Grants | Default role assignment |
|---|---|---|
| `finance:read` | View invoices, payments, dashboard, sync status | All workspace members |
| `finance:write` | Create/edit drafts, send invoices, record payments | Admin, Production Manager |
| `finance:void` | Void sent invoices with no payments | Admin, Production Manager |
| `finance:refund` | Issue refunds (partial or full) against paid invoices | Admin only |
| `finance:credit_note` | Issue credit notes against paid invoices | Admin only |
| `finance:see_internal_notes` | Read `internal_notes` field on invoices | Admin, Production Manager |
| `finance:manage_qbo` | OAuth connect/disconnect, customer mapping, item mapping, manual sync triggers | Admin only |
| `finance:manage_settings` | Tax rates, invoice prefix, payment terms, cancellation text | Admin only |
| `billing:manage_subscription` | Change Unusonic subscription tier, manage seats, view payment method | Admin (workspace owner) only |
| `billing:view_subscription` | View current tier, usage, invoice history | All workspace members |

**Employee portal scoping:** the `employee` role gets `finance:read` only, scoped to invoices on shows where the employee is assigned (via `ops.crew_assignments`). They never see internal notes, never see other shows' financials. Implementation: a separate `finance.get_employee_visible_invoices(user_id)` SECURITY DEFINER function that joins through assignments.

These capabilities slot into the existing `member_has_permission` / `get_member_permissions` infrastructure. PR-FOUND-3 wires them.

---

## 5. QBO integration architecture

Visionary §5 with the four critical fixes from the Critic.

### 5.1 OAuth flow

- New capability: `finance:manage_qbo`.
- Settings → Finance → Connect QuickBooks button.
- Intuit OAuth2 redirect.
- Callback at `/api/integrations/qbo/callback`.
- **First-time wizard merged into the OAuth callback as one scrollable form** (Critic §8a). Fields: realm confirmation, default item bundle (auto-creates 5 items, see §5.3b), default tax code, **starting invoice number** (see §5.3c). User clicks one "Connect" button, not five. Goal: under 3 minutes from "Connect QuickBooks" to "first invoice ready to push."

### 5.2 Token handling with mutex — verified for Supabase

The Visionary's `pg_advisory_xact_lock` pattern is correct **only if executed inside a single SECURITY DEFINER RPC call** so PgBouncer transaction-mode pooling does not release the lock mid-flight.

```sql
CREATE FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid)
RETURNS TABLE(access_token text, realm_id text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_key bigint := hashtext('qbo_refresh_' || p_workspace_id::text);
  v_access_token text;
  v_refresh_token text;
  v_expires_at timestamptz;
  v_realm_id text;
  v_new_tokens record;
BEGIN
  -- Per-workspace serialization. xact_lock releases on transaction end,
  -- which for a SECURITY DEFINER function is the end of this call.
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT
    pgsodium.crypto_aead_det_decrypt(access_token_enc, ...),
    pgsodium.crypto_aead_det_decrypt(refresh_token_enc, ...),
    access_token_expires_at,
    realm_id
  INTO v_access_token, v_refresh_token, v_expires_at, v_realm_id
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id AND status = 'active';

  IF v_expires_at > now() + interval '5 minutes' THEN
    RETURN QUERY SELECT v_access_token, v_realm_id;
    RETURN;
  END IF;

  -- Refresh path. Calls Intuit refresh endpoint via plpgsql HTTP
  -- extension OR (preferred) via a small Edge Function the RPC
  -- invokes synchronously. Either way, the whole refresh + persist
  -- is inside the locked transaction.
  v_new_tokens := finance._refresh_qbo_tokens(v_refresh_token);

  UPDATE finance.qbo_connections
  SET access_token_enc = pgsodium.crypto_aead_det_encrypt(v_new_tokens.access_token, ...),
      refresh_token_enc = pgsodium.crypto_aead_det_encrypt(v_new_tokens.refresh_token, ...),
      access_token_expires_at = now() + (v_new_tokens.expires_in || ' seconds')::interval,
      refresh_token_expires_at = now() + interval '100 days',
      last_refreshed_at = now()
  WHERE workspace_id = p_workspace_id;

  RETURN QUERY SELECT v_new_tokens.access_token, v_realm_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.get_fresh_qbo_token FROM PUBLIC, anon;
```

**Critical implementation rule** (Critic §3d): every QBO-touching code path calls `get_fresh_qbo_token` exactly once at the top of its operation, holds the returned access token in a local variable, and never re-enters the function during the same operation. Never split read-and-refresh across multiple client round-trips.

**Verification before shipping:** PR-INFRA-3 includes a Supabase support ticket / docs check confirming PgBouncer pooling mode for the Edge Function path. If transaction-mode pooling releases advisory locks at statement end (which it does for non-xact locks), the design is sound because we use `pg_advisory_xact_lock`. If there's any ambiguity, we route the entire QBO worker through a session-mode Postgres connection instead of PgBouncer.

**Daily proactive refresh cron:** new schedule `qbo_token_keepalive_daily` calls `get_fresh_qbo_token` for every workspace with `status='active'` once per day. Prevents the 100-day inactivity wall.

### 5.3 Entity mapping — three layers (Critic §3a, §3b)

**Layer 1: Customers — exact-match auto-link, never fuzzy.**

The "modal per first push" is unshippable for Dana's volume. Replace with:

1. On first push for a `bill_to_entity_id` not in `qbo_entity_map`, query QBO `Customer WHERE DisplayName = '$entity.display_name'` (case-sensitive exact match).
2. **Exactly one match** → silent auto-link, write `qbo_entity_map` row, log to `qbo_sync_log`. Push proceeds.
3. **Zero matches** → display a non-blocking chip on the invoice ("Customer not in QuickBooks → Create or Map") with one-click "Create in QuickBooks" CTA. Default action when Dana clicks the chip is to POST a new Customer using the entity's snapshotted data. Mapping written.
4. **Two or more matches** → ambiguous, blocking modal asks Dana to pick. This is the only modal interruption.
5. **Settings → Finance → QuickBooks → Pending Mappings** is a batch review page with bulk-select checkboxes and one "Accept all suggested" button. Users who skip the per-invoice flow can reconcile in bulk later.
6. **Unmap / remap** is a button on every mapped row in the same panel. Removes the `qbo_entity_map` row; next push re-prompts. **Wave 1, not deferred.** (Critic §8b)

**Layer 2: Items — five default items mapped to `item_kind`, not one.**

The "one default item" recommendation breaks Linda's Sales by Item report on day one. Ship the Wave 1 default as five Items created during OAuth setup:

| `item_kind` | QBO Item Name (default) | QBO Income Account |
|---|---|---|
| `service` | Event Production Services | Sales of Services |
| `rental` | Equipment Rental | Equipment Rental Income |
| `talent` | Talent / Performance Fees | Talent Fees Income |
| `fee` | Production Fees | Other Income |
| `discount` | Discounts | Discounts Given (negative) |

Stored in `finance.qbo_connections.default_item_ids jsonb` (one column, not five) keyed by `item_kind`. Resolved at push time: each `invoice_line_items.qbo_item_id` defaults from this map if not explicitly set. Per-catalog-line mapping (every catalog row → its own QBO Item) is Wave 2 and uses the same `qbo_entity_map` table with `local_type = 'item'`.

This design satisfies both:
- Ship Wave 1 with sane defaults — no user configuration required.
- Linda's Sales by Item report shows five meaningful categories on day one, not one collapsed row.

**Layer 3: Tax codes — workspace default + first OAuth seed.**

If the workspace has a `default_tax_rate` set, OAuth wizard creates a matching QBO `TaxCode` and stores `qbo_tax_code_id` in `qbo_entity_map` with `local_type = 'tax_rate'`. Otherwise uses QBO `NON`.

### 5.3c Starting invoice number — wizard, not handwave (Critic §5g)

During OAuth callback, query `Invoice` for `MAX DocNumber`, parse trailing integer:

- Parse succeeds → wizard pre-fills "Your QuickBooks invoices end at #1247. Start Unusonic at #1248? [Use this / Custom number]"
- Parse fails or no invoices in QBO → wizard pre-fills "Start at INV-1000? [Use this / Custom prefix and number]"

Writes `finance.invoice_number_sequences` row on completion.

### 5.4 Sync triggers, retry logic, dead letter

Visionary's spec, with explicit dead-letter resolution (Critic §3c):

- Push on state transitions: `draft→sent` (create), `sent→void` (void), payment insert (push payment), payment refund (push refund / void).
- Retry: exponential backoff `[1m, 5m, 30m, 2h, 12h]`, max 5 attempts.
- **Attempt 6+ → `dead_letter` state.** Persistent dashboard banner. One email to `finance:manage_qbo` capability holders with retry link. Retry button on the sync log slide-over resets `attempt_number` to 0 and re-queues.
- Nightly backfill cron retries any row in `failed` state with `attempt_number < 5` (skips dead-letter rows).

### 5.5 Idempotency — deterministic RequestId on every API call

Visionary's spec, plus (Critic §3e): `RequestId` applies to **every** Intuit API call, not just invoice creation. Customer creation, item creation, payment creation, void calls all use deterministic RequestIds derived from `(workspace_id, local_type, local_id, operation, attempt_version)`.

### 5.6 Worker / queue layout

`finance.sync_jobs` table:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid NOT NULL | |
| `job_kind` | text NOT NULL | `push_customer` \| `push_item` \| `push_invoice` \| `push_payment` \| `void_invoice` \| `refund_payment` |
| `local_id` | uuid NOT NULL | |
| `state` | text NOT NULL | `queued` \| `in_progress` \| `succeeded` \| `failed` \| `dead_letter` \| `pending_mapping` |
| `attempt_number` | int NOT NULL DEFAULT 0 | |
| `next_attempt_at` | timestamptz NOT NULL | |
| `last_error` | text NULL | |
| `request_id` | text NULL | |
| `depends_on_job_id` | uuid NULL | For "push customer first, then invoice" dependency chains (Critic §3e) |
| `created_at`, `updated_at` | timestamptz | |

Worker is a Supabase Edge Function invoked by a cron schedule every minute. Reads up to N jobs where `state IN ('queued')` AND `next_attempt_at <= now()` AND `(depends_on_job_id IS NULL OR depends_on_job.state = 'succeeded')`. Per-workspace concurrency limit (1 in-flight job per workspace) prevents rate-limit collisions.

### 5.7 Conflict resolution

**Unusonic always wins.** Settings page copy is bold: "Edits made directly in QuickBooks will be overwritten on next sync. Make your edits in Unusonic." This is non-negotiable per Field Expert and User Advocate consensus.

### 5.8 Sync status surface

Per Visionary §5.8, with the addition that the chip's slide-over includes:
- Last 20 `qbo_sync_log` entries for this invoice
- Mapping breadcrumbs: which QBO Customer / Item / TaxCode this invoice resolved to
- Buttons: "Retry now", "Open in QuickBooks", "Unmap customer" (if customer mapping is suspected wrong)

---

## 6. Stripe architecture (client billing side)

Visionary §6 with the route split made cleaner.

### 6.1 Webhook routes — fully split

**Two endpoints, two secrets, no shared route.**

- `/api/stripe-webhooks/client-billing/route.ts` — handles client invoice payment events
- `/api/stripe-webhooks/subscription/route.ts` — handles Unusonic SaaS subscription events

The legacy `/api/stripe-webhook/route.ts` is **deleted entirely** at the end of the relevant PR. No 410 Gone, no compatibility shim. We're pre-launch, this is the moment.

Stripe Dashboard configuration:
- Endpoint 1 → `/api/stripe-webhooks/client-billing` → secret `STRIPE_WEBHOOK_SECRET_CLIENT`
- Endpoint 2 → `/api/stripe-webhooks/subscription` → secret `STRIPE_WEBHOOK_SECRET_SUBSCRIPTION`
- Both endpoints subscribe only to the events they handle. Stripe will not deliver subscription events to the client-billing endpoint (and vice versa) by configuration.

`finance.stripe_webhook_events` is the dedup table for both routes, with a `source text NOT NULL` column distinguishing `client_billing` from `subscription`.

### 6.2 Client billing payment flow

Per Visionary §4.4:
1. Public `/i/{token}` page shows "Pay now" if invoice status allows.
2. Click → `createInvoiceCheckoutSession(invoice_id)` → Stripe Checkout with `metadata: { unusonic_invoice_id, unusonic_workspace_id, unusonic_invoice_kind }`.
3. Stripe Checkout handles card + ACH + Apple/Google Pay.
4. Webhook delivers `checkout.session.completed` to `/api/stripe-webhooks/client-billing`.
5. Handler resolves invoice from metadata, calls `recordPayment()`, trigger recomputes status, enqueues QBO push.

**Authenticated client portal** (Critic §5i): the same `createInvoiceCheckoutSession` handler is called from `/client/invoice/[id]` when the client is logged in. Metadata includes `client_user_id` for audit. No separate code path.

### 6.3 Proposal deposit flow — preserved with safer backfill (Critic §4a)

Wave 1 keeps the existing proposal deposit Stripe intent flow unchanged. The DocuSeal acceptance webhook adds one call to `finance.spawn_invoices_from_proposal(proposal_id)`. The spawner detects pre-existing `proposals.deposit_paid_at` and creates a retroactive `finance.payments` row.

**The Critic's safety fix:** if QBO is not yet connected when the spawner runs, the retroactive payment row is created with `qbo_sync_status = 'excluded_pre_connection'`. On QBO OAuth connect, the wizard surfaces a "5 payments predate your QuickBooks connection — push them anyway? [Push all / Skip / Review individually]" prompt. Never silently backfill into QBO.

Wave 2 unifies the proposal deposit and invoice deposit flows into one path; the legacy `deposit_paid_at` column is deleted.

### 6.4 Cents ↔ dollars boundary

Per Visionary §6.4 verbatim. Dollars in DB. Cents only at Stripe API boundary. Both webhook handlers call `recordPayment()` with dollars.

### 6.5 Webhook idempotency

Per Visionary §6.5 with the workspace_id resolution fix (§3.5 above).

### 6.6 Refund flow

Per Visionary §4.7 verbatim. Negative `finance.payments` row, never edit originals.

---

## 7. Subscription billing architecture (NEW — not in Visionary spec)

The Explore subscription audit found significant gaps in the existing subscription billing layer. This section is the parity plan to bring it to the same premium standard as the client billing rebuild.

### 7.1 Current state — what works, what's broken

**What works (do not regress):**
- `createOrGetStripeCustomer()` ensures one Stripe customer per workspace.
- Subscription create / tier change / cancel-at-period-end flows.
- Webhook handlers update `workspaces.subscription_tier`, `billing_status`, `extra_seats`, `stripe_subscription_id`.
- `aion_actions_used` counter increments on Aion autonomous actions.
- `aion_actions_used` resets to 0 on `invoice.paid` webhook.
- Two-gate access control: role capability AND tier check.
- Seat limit enforcement at invitation time via `count_team_seats` / `get_workspace_seat_limit` RPCs.
- `/settings/plan` page with tier cards and usage bars.
- `/api/stripe-webhook/route.ts` subscription branch with `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.

**What's broken or missing (must fix):**
1. **`tier_config` dual source-of-truth** — DB table and TS constant exist independently with no consistency check. DB rows have NULL `stripe_price_id` columns (never seeded), so webhook tier resolution silently fails in production.
2. **No `billing_status` enforcement** — a workspace with `billing_status = 'past_due'` can use every feature. The audit found code reads the column but no gate checks it.
3. **No Stripe Customer Portal link** — admins can't update payment method, view past invoices, or download receipts without leaving the app to email support.
4. **No invoice / receipt UI** — Stripe-generated invoices for the SaaS subscription are not surfaced in `/settings/plan` or anywhere else.
5. **Missing webhook events** — `customer.subscription.trial_will_end`, `invoice.upcoming` are not handled. No proactive renewal warnings.
6. **No trial period** — Foundation is the only no-card tier; paid tiers require immediate payment. Industry standard is 14-day trial on paid tiers.
7. **No subscription metadata cache on workspaces** — `current_period_end`, `trial_ends_at`, `next_invoice_date` are not stored locally, forcing every UI render to either skip the data or hit the Stripe API.
8. **`autonomous_addon_enabled` and friends** — orphan columns, never set or read. Either wire them or drop them.
9. **No payment failure recovery flow** — `invoice.payment_failed` updates `billing_status` but doesn't email anyone or surface a banner.
10. **No subscription event idempotency** — the subscription branch of the existing webhook lacks the dedup mechanism the new client-billing branch will have.
11. **No audit trail** — there's no record of "workspace upgraded from Foundation to Growth on date X by user Y" beyond Stripe's own dashboard.
12. **Webhook route is shared with client billing** — covered by the route split in §6.1.

### 7.2 Subscription billing target architecture

**Schema additions to `public.workspaces`** (one migration):

| Column | Type | Purpose |
|---|---|---|
| `stripe_customer_id` | text NULL | Cache the Stripe customer ID instead of fetching every time. |
| `current_period_end` | timestamptz NULL | Cached from `customer.subscription.updated`. UI reads this for "next invoice on…". |
| `trial_ends_at` | timestamptz NULL | Cached for trial countdown banners and gating. |
| `cancel_at_period_end` | boolean NOT NULL DEFAULT false | Mirrors Stripe `cancel_at_period_end`. UI reads for "subscription ending" warning. |
| `last_payment_failed_at` | timestamptz NULL | Set by `invoice.payment_failed`. Used for grace period calculation. |
| `grace_period_ends_at` | timestamptz NULL | 7 days after `last_payment_failed_at`. After this, hard-block on tier-gated features. |

**Schema additions to `public.tier_config`:**

Add a migration that **populates `stripe_price_id` and `stripe_extra_seat_price_id`** for every existing row using a per-environment seed (`scripts/seed/tier-config-prices.ts`) that reads from env vars `STRIPE_PRICE_FOUNDATION`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_STUDIO`, etc. Without this, the production webhook is broken even after every other fix lands.

**Resolve the dual source-of-truth:**
- DB `public.tier_config` is authoritative for: webhook tier resolution, server-side price ID lookup, billing enforcement.
- TS `src/shared/lib/tier-config.ts` is authoritative for: client-side display strings, capability map.
- **Add a CI check** (`scripts/check-tier-config-consistency.ts`) that fails the build if the TS constant and the DB seed disagree on any field except Stripe price IDs (those are env-specific).

### 7.3 Stripe Customer Portal integration

New page `/settings/billing` (separate from `/settings/plan`):
- "Manage payment method" button → `stripe.billingPortal.sessions.create({ customer, return_url })` → redirect.
- "Past invoices" section reads from a new `subscription_invoices` cache table populated by webhook (not by querying Stripe on every render).
- "Cancel subscription" button calls `cancelSubscription()` and shows the existing flow.

`subscription_invoices` cache table:

| Column | Type |
|---|---|
| `stripe_invoice_id` | text PK |
| `workspace_id` | uuid NOT NULL |
| `amount_due` | numeric(14,2) |
| `amount_paid` | numeric(14,2) |
| `currency` | text |
| `status` | text |
| `period_start` | timestamptz |
| `period_end` | timestamptz |
| `hosted_invoice_url` | text |
| `invoice_pdf_url` | text |
| `created_at` | timestamptz |

Populated by `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`, `invoice.finalized` webhook handlers. Lives in `public` because subscription billing is pre-workspace-context for some events; gated by RLS on `workspace_id`.

### 7.4 Trial period

Wave 1 ships with **14-day trial on Growth and Studio tiers**:
- Signup creates a Foundation workspace as today.
- "Try Growth free for 14 days" CTA on `/settings/plan` calls `createSubscription(tier, { trial_period_days: 14 })`.
- Stripe handles the trial — no card required up front (configurable).
- Webhook `customer.subscription.created` writes `trial_ends_at = subscription.trial_end`.
- Webhook `customer.subscription.trial_will_end` (3 days before end) emails the workspace admin.
- Trial expiry without card on file → `customer.subscription.deleted` → workspace reverts to Foundation, banner explains.

### 7.5 Billing status enforcement

Three states with different gates:

| `billing_status` | Soft warning | Hard blocks |
|---|---|---|
| `active` | None | None |
| `past_due` | Yellow banner: "Payment failed on {date}. Update payment method to avoid losing access in {days} days." | None for first 7 days. After grace period: hard-block all `tier:*` capabilities (Aion active/autonomous, custom roles, advanced reporting). Foundation features still work. |
| `canceling` | Blue banner: "Subscription ends on {current_period_end}. You will revert to Foundation." | None until `current_period_end`, then revert. |
| `canceled` | Red banner: "Subscription canceled. Foundation features only." | Hard-block all `tier:*` capabilities. |

Implementation: a new `requireBillingActive` server-side helper called from every server action that needs a tier capability. Reads `workspaces.billing_status` and `grace_period_ends_at`. Throws a typed error → caught by the action layer → surfaced as a "billing required" banner.

### 7.6 Aion usage — soft warn at 90%, hard block at 100%

The current "hard block at limit" UX is brittle. Replace with:
- Soft warn banner at 90% of monthly quota.
- Modal at 100% with two CTAs: "Upgrade tier" and "Buy 50 more actions" (if `autonomous_addon_enabled` is true).
- The `autonomous_addon_enabled` column is finally wired: it's a per-workspace toggle in `/settings/billing` that, when true, allows overage purchases via Stripe Metered Billing or a one-time charge.

Wave 1 ships the soft-warn / hard-block UX. The overage purchase flow is Wave 2 (it requires Stripe Metered Billing setup which is non-trivial).

### 7.7 Subscription audit log

New table `public.subscription_events`:

| Column | Type |
|---|---|
| `id` | uuid PK |
| `workspace_id` | uuid NOT NULL |
| `event_kind` | text NOT NULL | `created` \| `tier_changed` \| `seats_changed` \| `payment_failed` \| `payment_succeeded` \| `canceled` \| `reactivated` \| `trial_started` \| `trial_ended` |
| `from_state` | jsonb NULL | Snapshot before |
| `to_state` | jsonb NULL | Snapshot after |
| `triggered_by_user_id` | uuid NULL | If user-initiated; NULL if webhook |
| `stripe_event_id` | text NULL | Source webhook event |
| `created_at` | timestamptz NOT NULL |

Powers a "Subscription history" section in `/settings/billing`. Also gives Linda an audit trail when the production company asks "why did our bill change last month."

### 7.8 Subscription billing PR sequence

Four PRs, sequenced after the client billing infrastructure is in place:

- **PR-SUB-1**: Schema additions (workspace columns, `subscription_invoices` cache, `subscription_events` audit log, `tier_config` price ID seed). Webhook event idempotency for the subscription branch.
- **PR-SUB-2**: Stripe Customer Portal integration + `/settings/billing` page (read-only invoice history).
- **PR-SUB-3**: Trial period implementation + missing webhook handlers (`trial_will_end`, `invoice.upcoming`, `invoice.finalized`).
- **PR-SUB-4**: `billing_status` enforcement + grace period + soft warn / hard block Aion gating.

These ship in parallel with client billing PRs after the foundation is laid (PR-FOUND-* and PR-INFRA-* below).

---

## 8. Pre-flight blockers (must resolve before PR 1)

These are not PRs — they are decisions or verifications that must happen before the build team writes the first migration. The Critic identified these as "cannot be caught in code review."

| # | Blocker | Action | Owner |
|---|---|---|---|
| B1 | **Verify advisory lock semantics on Supabase + PgBouncer + Edge Function path.** Confirm that `pg_advisory_xact_lock` inside a SECURITY DEFINER function executed via `supabase.rpc()` from an Edge Function actually serializes across concurrent invocations. | Open a Supabase support ticket OR test with a 50-concurrent-call pgbench script against a dev project. Document the result in this file. | Build lead |
| B2 | **pgTAP infrastructure exists and runs in CI.** Unusonic uses Vitest for app tests; pgTAP is a separate runner. Confirm `supabase test db` works locally and that GitHub Actions runs it on every PR against an ephemeral Supabase branch. | Run `supabase test db` against current schema. If runner doesn't exist, set it up as PR-INFRA-1. | Build lead |
| B3 | **Lock down access control capabilities** in §4. Default role bundles confirmed with founder. Implementation slot in `member_has_permission` confirmed. | Founder review of §4 capability table. Build lead reviews the existing `member_has_permission` function to confirm the new capabilities slot in cleanly. | Founder + build lead |
| B4 | **Confirm Stripe Dashboard webhook endpoint configuration** is allowed. Stripe supports multiple endpoints per account; verify the Unusonic Stripe account has no rate limit or quota on this. | Check Stripe Dashboard. Document. | Build lead |
| B5 | **`pgsodium` extension enabled in production Supabase** for token encryption. Verify with `SELECT * FROM pg_extension WHERE extname = 'pgsodium'`. | Run query. If not enabled, request from Supabase. | Build lead |

Once B1–B5 are resolved (mostly under a day's work), the build sequence in §9 begins.

---

## 9. PR sequence — full client + subscription rebuild

Numbered PRs in dependency order. Every PR has explicit acceptance criteria. PRs marked **(critical path)** block the next PR; **(parallel)** can ship alongside the previous PR.

### Foundation phase (no user-visible changes yet)

#### **PR-INFRA-1** — pgTAP runner + CI pipeline
**Critical path.** Add pgTAP test runner. Wire to GitHub Actions. Ship one trivial test that runs green.
- Acceptance: `supabase test db` runs locally. PR-INFRA-1 itself includes a test that asserts `1 = 1`. CI fails on a deliberately broken test. Documentation in `supabase/tests/README.md`.

#### **PR-INFRA-2** — `finance` schema PostgREST exposure (audit's PR 6.5)
**Critical path.** Add `finance` to Supabase Dashboard "Exposed schemas". Run `npm run db:types`. Verify generated types include `Database['finance']['Tables']`.
- Acceptance: `src/types/supabase.ts` shows finance tables. The existing `getEntityFinancialSummary` no longer needs `(supabase as any).schema('finance')` cast.

#### **PR-INFRA-3** — Resolve advisory lock blocker (B1) and document
**Critical path.** Verify the advisory lock pattern on Supabase Edge Function path works. Document the verification in this file's §5.2 with a date and method.

#### **PR-FOUND-1** — Initial `finance.*` schema migration (additive, no deletions)
**Critical path.** Migration creates: `invoices`, `invoice_line_items`, `payments`, `qbo_connections`, `qbo_entity_map`, `qbo_sync_log`, `qbo_token_audit`, `tax_rates`, `stripe_webhook_events`, `invoice_number_sequences`, `bills`, `bill_payments`, `sync_jobs`. RLS on every table via `get_my_workspace_ids()`. Public token RPC. Recompute trigger with `FOR UPDATE`. Number sequence function. pgTAP tests for RLS, trigger lock semantics, RPC permissions, REVOKE coverage on every SECURITY DEFINER.
- Acceptance: schema applies cleanly. All pgTAP tests pass including the 20-concurrent-payment-insert race test. `has_function_privilege('anon', oid, 'EXECUTE')` is FALSE for every new function.

#### **PR-FOUND-2** — Drop legacy ghost objects
**Critical path** after PR-FOUND-1. Drops `public.invoices`, `public.invoice_items`, `public.payments`, `public.finance_invoices`, `public.qbo_project_mappings`, `public.transaction_allocations`, `public.create_draft_invoice_from_proposal`, `public.quickbooks_connections` (if present), legacy views. Deletes the local migration `supabase/migrations/20260412010000_create_draft_invoice_from_proposal_idempotency.sql` since it targets non-existent tables.
- Acceptance: `npm run build` and `npm run lint` pass. Every `(supabase as any).from('invoices')` cast in the codebase either resolves to the new `finance.invoices` typed path or is flagged for deletion in PR-CLIENT-7.

#### **PR-FOUND-3** — Access control capabilities (Critic §5h)
**Parallel** with PR-FOUND-1. Adds the capability rows from §4 to whatever permissions table backs `member_has_permission`. Default role bundles seeded.
- Acceptance: `member_has_permission(user_id, workspace_id, 'finance:write')` returns true for admin and PM, false for employee. pgTAP tests cover every capability.

### Client billing phase

#### **PR-CLIENT-1** — `spawn_invoices_from_proposal` RPC + DocuSeal hook
**Critical path.** Implements the spawner SECURITY DEFINER function. Modifies `/api/docuseal-webhook` to call it after `proposals.status → accepted`. Idempotent. Handles deposit-already-paid backfill case (with `qbo_sync_status = 'excluded_pre_connection'` flag).
- Acceptance: a test deal moves proposal → accepted → two draft invoices appear with correct amounts and snapshotted line items. Re-firing the webhook is a no-op.

#### **PR-CLIENT-2** — `recordPayment` canonical write path + concurrent-safe trigger
**Critical path.** Implements `finance.recordPayment` server action (and the corresponding RPC if needed). All payment writes route through this. Trigger `recompute_invoice_paid` is wired with the `FOR UPDATE` lock from §3.3.
- Acceptance: pgTAP race test passes. Manual record, Stripe webhook record, and refund all hit the same code path. Status transitions are deterministic under concurrent insert.

#### **PR-CLIENT-3** — Stripe webhook split into two routes
**Critical path.** Creates `/api/stripe-webhooks/client-billing` and `/api/stripe-webhooks/subscription`. Migrates existing handler logic into the appropriate route. Subscription branch keeps current behavior (works today, must not regress). Client branch implements `recordPayment` calls + dedup via `finance.stripe_webhook_events`. Deletes old `/api/stripe-webhook/route.ts`. Documents Stripe Dashboard reconfiguration steps in PR description.
- Acceptance: Stripe CLI test fires `checkout.session.completed` to client endpoint → `finance.payments` row created, status flips, QBO push enqueued. Stripe CLI fires `customer.subscription.updated` to subscription endpoint → `workspaces.subscription_tier` updated. Each route uses its own webhook secret. Both routes write to `finance.stripe_webhook_events` with correct `source`.

#### **PR-CLIENT-4** — Send invoice flow + PDF v1
**Critical path.** Server action `sendInvoice(invoice_id)` implementing §4.3 of the Visionary spec: assign number, snapshot tax, write bill_to/from snapshots, compute issue/due dates, generate PDF (versioned path), send email via `getWorkspaceFrom`, enqueue QBO push. PDF template includes branded header, **`po_number` field**, line items, terms, payment instructions, **cancellation text block** (§W1.9 collapsed in here).
- Acceptance: a draft invoice can be sent. Email arrives at test inbox. PDF renders all required fields. `pdf_version` increments on resend.

#### **PR-CLIENT-5** — QBO OAuth + first-time wizard
**Critical path** (gates PR-CLIENT-6). New `/api/integrations/qbo/callback`. New `/dashboard/finance/settings/qbo` connection management page. First-time wizard merged into callback as one form: realm confirm, default 5-item bundle creation, default tax code, starting invoice number (with QBO MAX DocNumber detection). Token storage with `pgsodium`. `get_fresh_qbo_token` RPC.
- Acceptance: connect a Stripe Sandbox + QBO Sandbox dev workspace in under 3 minutes. `finance.qbo_connections` row created with encrypted tokens. Five default Items visible in QBO sandbox. Tokens refresh under load (50 concurrent calls to `get_fresh_qbo_token` complete with no brick).

#### **PR-CLIENT-6** — QBO sync worker + push paths
**Critical path.** Edge Function worker reading `finance.sync_jobs`. Push paths: customer (with exact-match auto-link), invoice, payment, void, refund. Deterministic RequestId on every API call. Per-workspace job concurrency limit. Exponential backoff with dead-letter at attempt 6. Sync log writes.
- Acceptance: end-to-end test — create deal, accept proposal, send deposit, pay via Stripe, send final, pay via manual check, void a test invoice, issue credit note. All operations land correctly in QBO sandbox with zero duplicates and zero manual fixes. Linda-test passes.

#### **PR-CLIENT-7** — Client-billing UI surfaces
**Parallel** with PR-CLIENT-6. Rebuilds: `InvoiceList`, `InvoiceDetail`, `PaymentModal` (the one-click record-external-payment from W1.3), `SyncStatusChip`, `SyncLogSlideOver`, `QBOConnectPanel`, `CustomerMappingModal`, `PendingMappingsTable`. Updates `/events/[id]/finance` widgets to read new tables. Updates Prism Ledger Lens to read new tables (W1.10 absorbed into the chain rollup view here).
- Acceptance: Dana can record a check payment in 10 seconds. Pending mappings batch UI works. Sync chip shows green for synced invoices. Failure surfaces are obvious.

#### **PR-CLIENT-8** — `/finance` workspace dashboard rebuild
**Parallel** with PR-CLIENT-7. Replaces the existing `getFinanceDashboardData` (which targets ghost tables) with a new query against `finance.invoices` + `finance.payments`. Aging buckets, MTD revenue, outstanding total, pending QBO syncs, list view with filters. Empty-state UX for launch day (Critic §5c): pre-launch sample workspace ships with seed fixtures so the dashboard never looks empty during demos.
- Acceptance: Dana can see every late invoice sorted by days overdue on one screen. Aging buckets render. Empty state on a fresh workspace shows a "Create your first invoice" CTA.

#### **PR-CLIENT-9** — Public invoice page `/i/[token]` + Stripe Checkout pay
**Critical path.** Implements the public page reading via `finance.get_public_invoice(token)` RPC. Pay button triggers `createInvoiceCheckoutSession`. Authenticated client portal `/client/invoice/[id]` redirects to the same Pay button code path with `client_user_id` metadata.
- Acceptance: Stripe CLI scenario: open public link → click Pay → complete test card → invoice marked paid → QBO push enqueued.

#### **PR-CLIENT-10** — Blank invoice authoring
**Parallel** with PR-CLIENT-9. New `/dashboard/finance/invoices/new` form. Bill-to entity picker, optional event/project/deal link, line item editor, save draft / send. Reuses proposal line item component where possible.
- Acceptance: Dana can bill a one-off consultation fee not tied to a proposal in under 2 minutes.

#### **PR-CLIENT-11** — Refund + credit note flows
**Parallel** with PR-CLIENT-10. Implements Issue Refund action (Stripe + QBO paths), Issue Credit Note action (creates `invoice_kind = credit_note` row with `parent_invoice_id` set, pushes QBO CreditMemo). Wave 1 doesn't ship a dedicated "Create Credit Note" UI — the action is exposed only via the Refund modal's "convert to credit note" toggle.
- Acceptance: refund a paid invoice (Stripe-original) → negative payment row → QBO Refund Receipt. Issue credit note against a different paid invoice → new invoice row with negative total → QBO CreditMemo.

#### **PR-CLIENT-12** — Finance onboarding checklist (Critic §5f)
**Parallel** with later PRs. New panel in `/settings/finance`: 5-item checklist (workspace logo, address + EIN, default tax rate, payment due days, connect QuickBooks). Each item has a CTA. Checklist surfaces from a banner on the dashboard until all items are checked. Defaults work even if items are skipped — this is a guidance pattern, not a hard gate.
- Acceptance: a fresh workspace sees the checklist. Sending an invoice without setting EIN works but emits a Sentry warning. Full checklist completion dismisses the banner.

### Subscription billing phase (parallel with client billing where possible)

#### **PR-SUB-1** — Subscription schema parity
**Parallel** with PR-FOUND-1. Adds the workspace columns from §7.2 (`stripe_customer_id`, `current_period_end`, `trial_ends_at`, `cancel_at_period_end`, `last_payment_failed_at`, `grace_period_ends_at`). Creates `public.subscription_invoices` cache table. Creates `public.subscription_events` audit log table. Migration to seed `tier_config.stripe_price_id` and `stripe_extra_seat_price_id` from env. Adds CI consistency check `scripts/check-tier-config-consistency.ts`.
- Acceptance: webhook tier resolution succeeds against seeded `tier_config`. CI check fails the build if TS constant and DB rows diverge.

#### **PR-SUB-2** — Subscription webhook hardening + missing handlers
**Critical path** for subscription branch. Ships inside the subscription route created by PR-CLIENT-3. Adds dedup via `finance.stripe_webhook_events` with `source = 'subscription'`. Handles `customer.subscription.trial_will_end`, `invoice.upcoming`, `invoice.finalized` (writes to `subscription_invoices` cache). Writes audit rows to `subscription_events`.
- Acceptance: every Stripe subscription webhook event lands in either an action or an audit log row. Event redelivery is a no-op.

#### **PR-SUB-3** — Stripe Customer Portal + `/settings/billing` page
**Parallel** with PR-CLIENT-7. New page reads `subscription_invoices` cache + workspace billing columns. "Manage payment method" button hits `stripe.billingPortal.sessions.create`. "Past invoices" lists from cache with hosted URL + PDF download. "Subscription history" section reads from `subscription_events`.
- Acceptance: admin can update card, view past 12 months of invoices, download PDFs, see audit history.

#### **PR-SUB-4** — Trial period implementation
**Parallel** with PR-CLIENT-9. `/settings/plan` adds "Try Growth free for 14 days" CTA. `createSubscription` accepts `trial_period_days`. Trial countdown banner. Email sent on `trial_will_end`. Trial expiry handling.
- Acceptance: workspace on Foundation can start a Growth trial without entering a card. Trial countdown visible. Trial-end webhook fires correctly.

#### **PR-SUB-5** — `billing_status` enforcement + grace period + Aion soft warn
**Parallel** with PR-CLIENT-11. New `requireBillingActive` server-side helper. Banner system for `past_due` / `canceling` / `canceled` states. Grace period calculation. Aion soft warn at 90% of monthly quota, hard block at 100% (with upgrade CTA — overage purchase is Wave 2). Wires `autonomous_addon_enabled` toggle to the Aion gate.
- Acceptance: a workspace put into `past_due` via Stripe CLI sees the banner immediately. After 7 days of `past_due`, tier-gated features are hard-blocked. A workspace at 90% Aion usage sees the soft warn. At 100%, autonomous actions are blocked with an upgrade modal.

### Polish and cleanup phase

#### **PR-POLISH-1** — Delete legacy folders and dead code
**Parallel** with later PRs. Deletes `src/features/finance-sync/` entirely. Deletes `src/features/finance/sync/` (replaced by `src/features/finance/qbo/`). Deletes the dual `InvoiceList.tsx`. Removes `(supabase as any)` casts from the finance call sites that the new typed path covers. Updates `CLAUDE.md` finance section to reflect the new schema.
- Acceptance: zero references to deleted symbols. `npm run build` passes. `npm run lint` passes. tsc shows zero errors in `src/app/api/stripe-webhooks/**` and `src/features/finance/**`.

#### **PR-POLISH-2** — Documentation rewrite
**Parallel.** Rewrites `docs/reference/finance-schema.md` against the new shape. Updates `docs/onboarding-subscription-architecture.md` with the parity changes. Cross-links the two docs. Adds runbook entries for: "QBO sync stuck", "Stripe webhook event reprocessing", "Tier config out of sync".
- Acceptance: all docs match code reality. New developer can onboard from docs alone.

#### **PR-POLISH-3** — Pre-launch smoke test runbook
**Parallel.** Documents the 14-step manual smoke test from Visionary §13. Adds a `scripts/smoke/billing-end-to-end.ts` scripted version where possible.
- Acceptance: a non-author can run the runbook in under 2 hours and validate end-to-end behavior.

### Wave 2 (post-launch — referenced for schema-room planning, not built now)

W2.1 freelancer pay UI (uses pre-built `finance.bills` tables) · W2.2 per-line QBO item mapping + Class/Location · W2.3 dedicated Credit Note UI · W2.4 tracked change orders · W2.5 consolidated client statements · W2.6 multi-tax-rate per invoice · W2.7 unified proposal-deposit + invoice-deposit (delete `deposit_paid_at`) · W2.8 multi-payment schedules · W2.9 dunning + late fees · W2.10 expenses → profitability · W2.11 card surcharge · W2.12 1099 generation · W2.13 Stripe Metered Billing for Aion overages.

### Wave 3 (second-wave users)

W3.1 settlement sheets for touring · W3.2 multi-currency · W3.3 multi-jurisdictional tax · W3.4 Bill.com integration · W3.5 Aion-drafted dunning copy · W3.6 two-way QBO sync (only on customer demand) · W3.7 cash flow forecasting.

---

## 10. What gets deleted

Per Visionary §9 plus PR-POLISH-1 above. Hard delete list (pre-launch, no data):

**Folders:**
- `src/features/finance-sync/` — entire directory
- `src/features/finance/sync/` — entire directory (replaced by `src/features/finance/qbo/`)

**Routes:**
- `/api/stripe-webhook/route.ts` — replaced by split routes
- `/invoices/new` ghost route — replaced by `/dashboard/finance/invoices/new`
- Any duplicate `InvoiceList.tsx`

**Database objects:**
- Tables: `public.invoices`, `public.invoice_items`, `public.payments`, `public.finance_invoices`, `public.qbo_project_mappings`, `public.transaction_allocations`
- Functions: `public.create_draft_invoice_from_proposal`
- Views: `public.monthly_revenue`, `public.outstanding_invoices`, `public.dashboard_ledger` (if present)
- Migration file: `supabase/migrations/20260412010000_create_draft_invoice_from_proposal_idempotency.sql`

**Components:** any widget pinned to a ghost shape — rewrite against new model, preserve UI.

---

## 11. What gets preserved

Do not touch unless a PR description explicitly says to:

- `src/shared/api/stripe/{server,client}.ts` — Stripe singletons
- `src/shared/api/supabase/{client,server,system}.ts` — three-client model
- `src/shared/api/email/send.ts` + `getWorkspaceFrom` — invoice emails will use this
- `public.proposals` and the entire proposal builder — only the downstream invoice path changes
- `public.proposals.deposit_paid_at` flow — preserved Wave 1, refactored Wave 2
- `/api/docuseal-webhook` — adds one call to spawner, otherwise unchanged
- `getEntityFinancialSummary` — rewire query to new table, keep signature
- `src/app/(client-portal)/client/invoice/[id]/page.tsx` — rewire query, preserve component
- Existing subscription webhook handler logic — moves to new route, behavior preserved (PR-CLIENT-3 + PR-SUB-2 add to it; they do not replace it)
- `public.workspaces.default_tax_rate` column — still read at invoice send time; migrates to `finance.tax_rates` in Wave 2
- `readEntityAttrs` / `patch_entity_attributes` — `bill_to_snapshot` reads `directory.entities` through these
- `src/shared/lib/tier-config.ts` — kept for client-side display, with CI consistency check vs DB
- `/settings/plan` page — kept; `/settings/billing` is a new sibling page

---

## 12. Test & validation strategy

Per Visionary §13 with the Critic's additions:

**pgTAP infrastructure** is PR-INFRA-1, blocking everything. Tests cover:
- RLS isolation per table (workspace A cannot see workspace B)
- Recompute trigger lock semantics under 20 concurrent payment inserts
- `spawn_invoices_from_proposal` idempotency (second call no-op)
- Tax snapshot freezing at send time
- `next_invoice_number` strict monotonicity under pgbench load
- Every SECURITY DEFINER function: `has_function_privilege('anon', oid, 'EXECUTE')` is FALSE
- Schema-drift guard: every public RPC has at least one integration test

**Vitest layer** stays for app-level tests. New tests:
- `recordPayment` server action: manual + webhook + refund paths all hit the same code path
- `spawnInvoicesFromProposal`: deposit + final spawn correctly with snapshot
- `requireBillingActive` helper: every billing state returns the correct gate result

**Stripe CLI scenarios** for both webhook routes:
- Client billing: `checkout.session.completed`, `charge.refunded`, duplicate event redelivery
- Subscription: `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`, `invoice.upcoming`

**QBO sandbox flows:** the full Linda-test scenario from Visionary §13 — connect, send 5 invoices of different shapes, pay 3, void 1, credit-note 1. Zero duplicates, zero manual fixes.

**Pre-launch smoke runbook** is PR-POLISH-3.

---

## 13. Risks and unknowns

Visionary §15 list, plus the items the Critic added:

1. **Intuit API rate limits** — verify before shipping PR-CLIENT-6
2. **QBO Invoice DocNumber uniqueness** — handled by the OAuth wizard in PR-CLIENT-5
3. **Refund-after-QBO-push reordering** — per-invoice advisory lock in worker loop
4. **PDF generation cost at scale** — Wave 2 concern
5. **Email deliverability for invoices** — gate Send button on workspace domain verification, or warn prominently before sending from fallback domain. Decide in PR-CLIENT-4.
6. **`SalesItemLineDetail` Class mapping** — Wave 2 design question
7. **Stripe Payment Links vs Checkout Sessions** — Wave 1 uses Checkout Sessions; revisit Wave 2
8. **`currency` handling** — trivial Wave 1 (USD only), real Wave 3
9. **`/finance` route group naming** — confirm before writing URL constants
10. **Timezone on `issue_date`** (Critic §9a) — requires `workspaces.timezone` column. Add in PR-FOUND-1 if not already present, otherwise PR-CLIENT-4 includes the migration.
11. **Recurring invoices** — Wave 3 (Critic §9b)
12. **Invoice dispute workflow** — `is_disputed` column shipped in PR-FOUND-1
13. **Supabase storage egress costs for PDFs** — flag, not v1 concern
14. **Subscription webhook re-issue from Stripe Dashboard** — make sure we don't replay non-idempotent operations. Audit table from PR-SUB-1 helps catch this.
15. **`tier_config` env-vs-DB drift in production** — CI check from PR-SUB-1 catches this at build time. Production also needs a runtime alert if webhook fires for an unmapped Stripe price ID.

---

## 14. Founder review checkpoints

The build team should pause and request founder review at these points:

1. **After PR-FOUND-1** — schema is on disk. Daniel reviews the column shape one last time before downstream PRs lock it in.
2. **After PR-CLIENT-5** — first-time QBO wizard UX. Daniel walks through it personally and confirms <3 minute happy path.
3. **After PR-CLIENT-7 + PR-CLIENT-8** — invoice list + dashboard render with seed data. Daniel approves visual treatment.
4. **After PR-CLIENT-9** — public invoice page + Stripe pay flow. Daniel completes a personal end-to-end test with a real Stripe test card.
5. **After PR-SUB-3** — `/settings/billing` page. Daniel approves the customer portal integration.
6. **Before PR-POLISH-3 sign-off** — full smoke runbook completed by someone other than the build lead.

---

## 15. Decisions made — for the record

| Decision | Choice | Rationale |
|---|---|---|
| Architecture option | B (greenfield `finance.*`) | Pre-launch greenfield is cheaper than perpetuating drift |
| Wave 1 scope | Full Visionary spec, not Critic's six-item cut | Founder explicit: "willing to put in more work to get it right" |
| Invoice key | `event_id` primary, `proposal_id` lineage, `deal_id` denormalized for chain rollup, `project_id` optional | All four columns exist, only `event_id` is the primary read path |
| Payments | Separate `finance.payments` entity, not status column | Invoice has many payments; refunds are negative siblings |
| Tax model | Line-level `is_taxable` boolean, invoice-level `tax_amount` + `tax_rate_snapshot` | Hybrid satisfies both Field Expert and User Advocate |
| Credit notes | Same table, `invoice_kind = 'credit_note'`, trigger gate prevents payment-table interference | One source of truth for the chain rollup |
| Customer mapping | Exact-match auto-link, never fuzzy, batch review for unmatched | Linda-safety + Dana-volume reconciled |
| Default QBO items | Five items mapped to `item_kind`, not one | Linda's Sales by Item report stays useful |
| Webhook split | Two routes, two secrets, no compatibility shim | Pre-launch is the only moment for a clean break |
| Subscription billing | Parity workstream alongside client billing, not deferred | Founder explicit: "set up to handle SaaS B2B side as well" |
| Trial period | 14 days on Growth/Studio, no card required | Industry standard for premium B2B SaaS |
| QBO conflict resolution | Unusonic always wins, never pull | Field Expert + User Advocate consensus |
| QBO sync direction | One-way push, on state transition + nightly retry | No polling, no two-way edit sync |
| Token storage | `pgsodium.crypto_aead_det_encrypt`, workspace-scoped key | Proven pattern, simpler than per-workspace KMS |
| Public invoice access | RPC-only via `get_public_invoice(token)`, not policy-based | Single security path, no ambiguity |
| Realm per workspace | One realm per workspace for v1; multi-book = multi-workspace | Documented limitation, schema room left |
| Premium-over-speed | This is the founder's stated preference for Unusonic billing redesigns going forward | Memory: `feedback_premium_over_speed.md` |

---

## Appendix A — concrete file landmarks

**Create:**
- `supabase/migrations/{ts}_finance_expose_schema.sql`
- `supabase/migrations/{ts}_finance_initial_schema.sql`
- `supabase/migrations/{ts}_finance_drop_legacy.sql`
- `supabase/migrations/{ts}_subscription_schema_parity.sql`
- `supabase/migrations/{ts}_finance_capabilities.sql`
- `supabase/tests/finance/*.sql` (pgTAP)
- `src/features/finance/qbo/{oauth,token,push-invoice,push-payment,push-customer,push-void,worker,request-id,map}.ts`
- `src/features/finance/api/invoice-actions.ts` (rebuilt)
- `src/features/finance/schemas/{bill-to-snapshot,from-snapshot}.ts` (Zod)
- `src/features/finance/ui/{InvoiceList,InvoiceDetail,PaymentModal,SyncStatusChip,SyncLogSlideOver,QBOConnectPanel,CustomerMappingModal,PendingMappingsTable,FinanceOnboardingChecklist}.tsx`
- `src/app/(dashboard)/(features)/finance/invoices/new/page.tsx`
- `src/app/(dashboard)/(features)/finance/settings/qbo/page.tsx`
- `src/app/(dashboard)/settings/billing/page.tsx`
- `src/app/api/stripe-webhooks/client-billing/route.ts`
- `src/app/api/stripe-webhooks/subscription/route.ts`
- `src/app/api/integrations/qbo/callback/route.ts`
- `src/app/i/[token]/page.tsx`
- `scripts/seed/finance-fixtures.ts`
- `scripts/seed/tier-config-prices.ts`
- `scripts/check-tier-config-consistency.ts`
- `scripts/smoke/billing-end-to-end.ts`

**Modify:**
- `src/app/api/docuseal-webhook/route.ts` — one call added to `spawn_invoices_from_proposal`
- `src/app/(client-portal)/client/invoice/[id]/page.tsx` — query rewire
- `src/features/network-data/api/entity-context-actions.ts` — `getEntityFinancialSummary` query rewire
- `scripts/gen-db-types.js` — verify finance schema picked up
- `CLAUDE.md` — finance schema block update
- `docs/reference/finance-schema.md` — full rewrite
- `docs/onboarding-subscription-architecture.md` — subscription parity update

**Delete:** see §10
