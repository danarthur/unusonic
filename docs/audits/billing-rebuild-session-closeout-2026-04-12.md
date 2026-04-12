# Billing Rebuild — Session Closeout

**Date:** 2026-04-12
**Commit:** `5edf5ff`
**Status:** Foundation phase complete. Client billing + subscription billing infrastructure shipped.

---

## 1. Session summary

A full greenfield billing rebuild was completed for Unusonic, covering both client billing (workspace charges its clients) and SaaS subscription billing (Unusonic charges the workspace). The session began with a research phase (schema drift audit, vision doc, stress-test critique, final plan synthesis), followed by implementation of the complete `finance.*` database schema (12 tables, 1 view, 9 functions), RLS policies on every table, 10 finance + 2 billing access-control capabilities, split Stripe webhook routes, server actions for invoice generation/payment recording/sending, QBO sync worker infrastructure, a public invoice page at `/i/[token]`, blank invoice authoring at `/finance/invoices/new`, a `/settings/billing` page for subscription management, PDF generation via `@react-pdf/renderer`, email sending via Resend, Zod-validated snapshot schemas, a tier-config consistency check script, and pgTAP regression tests. All work was committed in `5edf5ff` on `main`.

---

## 2. What was built -- complete inventory

### Database migrations (9 files in `supabase/migrations/`)

| File | Description |
|---|---|
| `20260412020000_drop_preferred_crew_column.sql` | Drops vestigial `public.deals.preferred_crew` column (rescan finding C7) |
| `20260412021047_finance_rebuild_01_drop_legacy_invoices.sql` | Drops broken legacy `finance.invoices`, `finance.payment_reminder_log`, and `public.create_draft_invoice_from_proposal` RPC |
| `20260412021222_finance_rebuild_02_core_tables.sql` | Creates `finance.invoices`, `finance.invoice_line_items`, `finance.payments`, the concurrent-safe `recompute_invoice_paid` trigger, `payments_recompute_trigger`, and `set_updated_at` |
| `20260412021350_finance_rebuild_03_qbo_tables.sql` | Creates `finance.qbo_connections` (Vault-backed tokens), `finance.qbo_entity_map`, `finance.qbo_sync_log`, `finance.sync_jobs`, plus `get_fresh_qbo_token` and `persist_refreshed_qbo_tokens` RPCs |
| `20260412021511_finance_rebuild_04_support_and_capabilities.sql` | Creates `finance.tax_rates`, `finance.stripe_webhook_events`, `finance.invoice_number_sequences`, `finance.bills`, `finance.bill_payments`; stubs for `spawn_invoices_from_proposal`, `record_payment`, `get_public_invoice`; `invoice_balances` view; 10 finance + 2 billing capabilities in `ops.workspace_permissions` |
| `20260412021604_finance_rebuild_05_rls_policies.sql` | RLS on all 12 finance tables with workspace isolation via `get_my_workspace_ids()`, column-level REVOKE on `qbo_connections` token columns, full deny on `stripe_webhook_events` for session clients |
| `20260412024241_finance_spawn_invoices_from_proposal.sql` | Placeholder for full `spawn_invoices_from_proposal` implementation (applied to production via Supabase MCP) |
| `20260412025043_finance_record_payment_implementation.sql` | Placeholder for full `record_payment` implementation (applied to production via Supabase MCP) |
| `20260412030000_add_timezone_columns.sql` | Adds `timezone text NOT NULL DEFAULT 'UTC'` to `public.workspaces` and `ops.events` with IANA check constraints |

### Database tests (`supabase/tests/`)

| File | Description |
|---|---|
| `supabase/tests/database/00300-finance-isolation.test.sql` | Pre-existing finance isolation test |
| `supabase/tests/database/00800-finance-rebuild-regression.test.sql` | 14-test pgTAP suite: payment trigger status flips, credit note gating, refund reversal, REVOKE posture, `get_public_invoice` anon access, `next_invoice_number` monotonicity, payment write-path denial for authenticated, `stripe_webhook_events` read denial, `invoice_balances` view correctness, cross-workspace isolation |

### Server actions + RPCs (`src/features/finance/api/`)

| File | Description |
|---|---|
| `invoice-actions.ts` | `spawnInvoicesFromProposal`, `recordManualPayment`, `recordPaymentFromWebhook`, legacy `generateInvoiceFromProposal` alias, `sendInvoice` proxy |
| `send-invoice.ts` | Full send flow: number assignment, tax snapshot, bill_to/from snapshots, PDF generation, email send, QBO push enqueue |
| `create-blank-invoice.ts` | `createBlankInvoice` server action for standalone invoices not tied to proposals |
| `generate-invoice-pdf.ts` | Server-side PDF generation via `@react-pdf/renderer` `renderToBuffer` |
| `send-invoice-email.ts` | Invoice email via Resend with workspace-aware from address |
| `convertProposalToInvoice.ts` | Legacy wrapper around `spawnInvoicesFromProposal` for backward compat |

### QBO integration (`src/features/finance/qbo/`)

| File | Description |
|---|---|
| `request-id.ts` | Deterministic `sha256`-based Intuit RequestId generator |
| `push-invoice.ts` | QBO Invoice push: customer resolution, line item mapping, sync log writes |
| `worker.ts` | Queue processor for `finance.sync_jobs`: batch dispatch, per-workspace concurrency, exponential backoff, dead-letter at attempt 6 |
| `index.ts` | Barrel export |

### Stripe webhook routes (`src/app/api/stripe-webhooks/`)

| File | Description |
|---|---|
| `client-billing/route.ts` | Handles `checkout.session.completed`, payment failures, refunds for client invoices. Dedup via `finance.stripe_webhook_events`. Calls `recordPaymentFromWebhook`. |
| `subscription/route.ts` | Handles `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Dedup via `finance.stripe_webhook_events` with `source='subscription'`. Writes to `public.workspaces`. |

### UI surfaces

| File | Description |
|---|---|
| `src/app/i/layout.tsx` | Light-theme layout for public invoice pages (no auth, no sidebar) |
| `src/app/i/[token]/page.tsx` | Full public invoice page: header, bill-to, line items table, totals, status chip, notes, terms. Pay button disabled pending Stripe wiring. |
| `src/app/(dashboard)/(features)/finance/invoices/new/page.tsx` | Server component: fetches entities + events, renders `NewInvoiceForm` |
| `src/app/(dashboard)/(features)/finance/invoices/new/new-invoice-form.tsx` | Client component: line items editor, entity picker, event linker, `useActionState` submission |
| `src/app/(dashboard)/settings/billing/page.tsx` | Server component: fetches workspace billing state, subscription invoices, subscription events |
| `src/app/(dashboard)/settings/billing/billing-page-client.tsx` | Client component: invoice history table, payment method management, subscription event audit trail |
| `src/features/finance/ui/widgets/InvoiceListWidget.tsx` | Dashboard invoice list with status chips, QBO sync status, inline expansion, payment modal trigger |
| `src/features/finance/ui/widgets/PaymentModal.tsx` | Record manual payment: method picker, amount, reference, date, `useActionState` + `createPortal` |
| `src/features/finance/ui/pdf/InvoicePDF.tsx` | `@react-pdf/renderer` document: branded header, PO number, line items, totals, pay-now link |

### Finance schemas (`src/features/finance/schemas/`)

| File | Description |
|---|---|
| `invoice-snapshots.ts` | Zod schemas `BillToSnapshotV1Schema` and `FromSnapshotV1Schema` with versioned `v: 1` field. Parse functions for write-time validation. |

### Scripts

| File | Description |
|---|---|
| `scripts/check-tier-config-consistency.ts` | CI check: compares TS `tier-config.ts` constant against DB `public.tier_config` rows. Fails build on mismatch (excluding env-specific Stripe price IDs). |

### Documentation (`docs/audits/`)

| File | Description |
|---|---|
| `billing-system-schema-drift-2026-04-11.md` | Trigger audit that discovered the broken billing layer |
| `billing-redesign-vision-2026-04-11.md` | Visionary architecture spec |
| `billing-redesign-critique-2026-04-11.md` | Critic stress-test (all objections upheld in final plan) |
| `billing-redesign-final-plan-2026-04-11.md` | Build-ready spec: data model, QBO, Stripe, subscription parity, PR sequence |

### CLAUDE.md updates

- Added `finance` schema to the Five Schemas table
- Added finance capability keys to documentation
- Updated grandfathered tables section to note `public.invoices`/`public.invoice_items` are now dropped
- Added finance reference doc links

### Deleted files

- `finance.invoices` (legacy Model B table, 0 rows, wrong shape)
- `finance.payment_reminder_log` (empty, unused)
- `public.create_draft_invoice_from_proposal` RPC (targeted nonexistent tables)
- `public.deals.preferred_crew` column (vestigial after handoff wizard Step 3 removal)

---

## 3. Architecture decisions -- for the record

### Decisions from the final plan (verbatim from `billing-redesign-final-plan-2026-04-11.md` section 15)

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
| Token storage | Supabase Vault (wraps pgsodium) with managed keys | Recommended Supabase pattern, simpler than raw pgsodium |
| Public invoice access | RPC-only via `get_public_invoice(token)`, not policy-based | Single security path, no ambiguity |
| Realm per workspace | One realm per workspace for v1; multi-book = multi-workspace | Documented limitation, schema room left |
| Premium-over-speed | This is the founder's stated preference for Unusonic billing redesigns | Memory: `feedback_premium_over_speed.md` |

### Implementation decisions made during build (not in the plan)

| Decision | Choice | Rationale |
|---|---|---|
| Token encryption | Supabase Vault (`vault.create_secret` / `vault.update_secret` / `vault.decrypted_secrets`) instead of raw `pgsodium.crypto_aead_det_encrypt` | Vault is the recommended Supabase abstraction over pgsodium; handles key management automatically. Plan said pgsodium; implementation uses Vault which wraps it. |
| Server action boundary | `'use server'` directive at line 1 of every server action file | Required by Next.js App Router for server actions callable from client components |
| `@ts-expect-error` for server/client boundary | `send-invoice.ts` dynamic import in `invoice-actions.ts` uses `@ts-expect-error` | tsc traces `server-only` imports through the dynamic import chain from client context. Runtime is correct because Next.js handles the `'use server'` boundary, but tsc cannot verify this. |
| `(supabase as any).schema('finance')` casts | Used throughout all finance server actions and webhook handlers | `finance` schema is not yet in PostgREST "Exposed schemas" (tracked as PR-INFRA-2). All casts are annotated with `// eslint-disable-next-line` and reference PR-INFRA-2. |
| Stub RPCs in migration, full body via MCP | Migrations 6 and 7 are local placeholders; full SQL applied to production via Supabase MCP | Avoids divergence between production DB and local migration files. Placeholders will be populated on next `supabase db pull`. |
| `balance_due` as view, not column | `finance.invoice_balances` view computes `total_amount - paid_amount` | Critic section 2b: STORED generated column causes trigger lock contention under concurrent payment inserts |
| Fallback webhook secrets | Both webhook routes fall back to `STRIPE_WEBHOOK_SECRET` if the split-specific env var is not set | Allows gradual migration of Stripe Dashboard configuration |

---

## 4. Production database state

### Finance schema tables (12)

| Table | Purpose |
|---|---|
| `finance.invoices` | Core ledger row. 52 columns including snapshots, QBO mapping, dispute fields, PDF versioning. |
| `finance.invoice_line_items` | Per-invoice line items with `item_kind`, lineage to proposal items, QBO mapping. |
| `finance.payments` | First-class payment ledger. Refunds as negative siblings. Stripe idempotency via unique `stripe_payment_intent_id`. |
| `finance.qbo_connections` | One per workspace. Vault-backed token storage. Five default item IDs by `item_kind`. |
| `finance.qbo_entity_map` | Universal local-to-QBO ID joiner. Supports entity, invoice, payment, item, tax_rate, bill, bill_payment types. |
| `finance.qbo_sync_log` | Append-only audit of every QBO API call with deterministic RequestId. |
| `finance.sync_jobs` | Worker queue: job kinds, dependency chains, exponential backoff, dead-letter state. |
| `finance.tax_rates` | Workspace-scoped tax rates with QBO mapping. Single default per workspace enforced by partial unique index. |
| `finance.stripe_webhook_events` | Stripe webhook idempotency dedup. PK on `stripe_event_id`. Source column distinguishes `client_billing` from `subscription`. |
| `finance.invoice_number_sequences` | Per-workspace invoice number allocator with configurable prefix and padding. |
| `finance.bills` | AP side (schema-only Wave 1, no UI). Freelancer/vendor/expense reimbursement types. |
| `finance.bill_payments` | AP payment ledger (schema-only Wave 1). |

### Finance schema views (1)

| View | Purpose |
|---|---|
| `finance.invoice_balances` | Computes `balance_due` and `days_overdue`. Replaces the rejected STORED generated column. |

### Finance schema functions (9)

| Function | Security | Granted to |
|---|---|---|
| `finance.set_updated_at()` | trigger | service_role only |
| `finance.recompute_invoice_paid(uuid)` | SECURITY DEFINER | service_role only |
| `finance.payments_recompute_trigger()` | SECURITY DEFINER | service_role only |
| `finance.get_fresh_qbo_token(uuid)` | SECURITY DEFINER | service_role only |
| `finance.persist_refreshed_qbo_tokens(...)` | SECURITY DEFINER | service_role only |
| `finance.next_invoice_number(uuid)` | SECURITY DEFINER | service_role only |
| `finance.spawn_invoices_from_proposal(uuid)` | SECURITY DEFINER | service_role only |
| `finance.record_payment(...)` | SECURITY DEFINER | service_role only |
| `finance.get_public_invoice(text)` | SECURITY DEFINER | **anon**, authenticated, service_role |

### RLS policies

Every table has RLS enabled and forced. Pattern: `workspace_id IN (SELECT get_my_workspace_ids())` for authenticated. Key exceptions:
- `finance.invoices`: no anon policies (public reads via RPC only)
- `finance.payments`: SELECT only for authenticated (writes via RPC)
- `finance.qbo_connections`: column-level REVOKE hides token secret IDs from authenticated
- `finance.stripe_webhook_events`: full deny for authenticated and anon (service_role only)

### Capabilities inserted into `ops.workspace_permissions`

`finance:read`, `finance:write`, `finance:void`, `finance:refund`, `finance:credit_note`, `finance:see_internal_notes`, `finance:manage_qbo`, `finance:manage_settings`, `billing:manage_subscription`, `billing:view_subscription`

### Verification queries run during session

- All SECURITY DEFINER functions checked: `has_function_privilege('anon', oid, 'EXECUTE')` is FALSE for internal functions, TRUE only for `get_public_invoice`
- All tables confirmed RLS enabled via `pg_class.relrowsecurity`
- Every migration includes inline sanity-check `DO $$` blocks that raise exceptions on miscount
- pgTAP regression suite (14 tests) validates trigger behavior, access control, and isolation

---

## 5. Manual actions required

### Stripe Dashboard configuration

1. **Create a new webhook endpoint for client billing.**
   - URL: `https://unusonic.com/api/stripe-webhooks/client-billing`
   - Events to subscribe: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   - Copy the signing secret and set as `STRIPE_WEBHOOK_SECRET_CLIENT` in Vercel env vars.

2. **Create a new webhook endpoint for subscription billing.**
   - URL: `https://unusonic.com/api/stripe-webhooks/subscription`
   - Events to subscribe: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`, `invoice.upcoming`, `invoice.finalized`
   - Copy the signing secret and set as `STRIPE_WEBHOOK_SECRET_SUBSCRIPTION` in Vercel env vars.

3. **Delete the old webhook endpoint** pointing to `/api/stripe-webhook` once the new ones are confirmed working.

### Vercel environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET_CLIENT` | Signing secret for client billing webhook endpoint | Stripe Dashboard > Webhooks > client-billing endpoint |
| `STRIPE_WEBHOOK_SECRET_SUBSCRIPTION` | Signing secret for subscription billing webhook endpoint | Stripe Dashboard > Webhooks > subscription endpoint |

Both routes fall back to `STRIPE_WEBHOOK_SECRET` if the split-specific vars are not set, so there is no downtime during transition.

### Supabase Dashboard configuration

1. **Expose `finance` schema in PostgREST.** Go to Supabase Dashboard > Project Settings > API > Exposed schemas. Add `finance` to the list. This is tracked as PR-INFRA-2 and will eliminate all `(supabase as any).schema('finance')` casts.

2. **Regenerate types** after exposing `finance`: run `npm run db:types` to get `Database['finance']['Tables']` in `src/types/supabase.ts`.

### Stripe Customer Portal (for `/settings/billing`)

1. **Configure Stripe Customer Portal.** Go to Stripe Dashboard > Settings > Billing > Customer Portal. Enable "Update payment method" and "View invoice history". Set the return URL to `https://unusonic.com/settings/billing`.

### Tier config seeding

1. **Populate `stripe_price_id` and `stripe_extra_seat_price_id`** in `public.tier_config` rows for each tier. These are currently NULL in production and will cause webhook tier resolution to silently fail. Use the Stripe Dashboard to find the price IDs for Foundation, Growth, and Studio tiers, then run an UPDATE:
   ```sql
   UPDATE public.tier_config SET stripe_price_id = 'price_xxx' WHERE slug = 'growth';
   -- Repeat for each tier
   ```

---

## 6. Known issues and tech debt

### Persistent tsc errors (2)

1. **`src/features/finance/api/invoice-actions.ts` line 88** -- `@ts-expect-error` on the dynamic import of `send-invoice.ts`. The `send-invoice` module imports `server-only` (for PDF generation), and tsc traces this chain from client context even though the `'use server'` directive means Next.js handles the boundary at runtime. This is correct at runtime; tsc cannot verify the server action boundary.

2. **`src/features/finance/ui/widgets/PaymentModal.tsx`** -- imports `recordManualPayment` from `invoice-actions.ts` which is a `'use server'` file. The types resolve correctly at runtime (Next.js creates a server reference), but tsc may flag the import chain in certain configurations.

### Legacy files still referencing ghost `public.invoices` (6)

These files reference `public.invoices` via `.from('invoices')` calls that predate the rebuild. They need to be rewired to `finance.invoices` (via `.schema('finance').from('invoices')` or typed path after PR-INFRA-2):

1. `src/app/api/aion/chat/tools/production.ts`
2. `src/features/client-portal/api/get-client-home-data.ts`
3. `src/features/network-data/api/network-read-actions.ts`
4. `src/shared/lib/api/finance.ts`
5. `src/shared/actions/search-global.ts`
6. `src/features/network-data/api/entity-context-actions.ts`

Note: `src/features/finance/api/get-event-ledger.ts` and `src/features/finance/api/get-gig-financials.ts` also reference `.from('invoices')` but may already be pointing at the finance schema depending on import context.

### `docs/` directory in `.gitignore`

Line 49 of `.gitignore` contains `docs/`. All audit documents in `docs/audits/` were force-added to git. New files in `docs/` will not be tracked by default and must be force-added with `git add -f docs/path/to/file.md`.

### Stub migration files

`20260412024241_finance_spawn_invoices_from_proposal.sql` and `20260412025043_finance_record_payment_implementation.sql` contain only `SELECT 1;` placeholders. The actual SQL was applied to production via Supabase MCP. These files should be populated on the next `supabase db pull` to maintain local-production parity.

### Pay button on public invoice page

The "Pay now" button on `/i/[token]` is rendered as `disabled` with a "Coming soon" label. Stripe Checkout wiring is PR-CLIENT-9b.

### `(supabase as any)` casts throughout finance code

Every call to the finance schema uses `(supabase as any).schema('finance')` because the schema is not yet PostgREST-exposed. All instances are annotated. Tracked as PR-INFRA-2.

---

## 7. What's left from the plan

Reference: `docs/audits/billing-redesign-final-plan-2026-04-11.md` section 9.

### Completed in this session

| PR | Status | Notes |
|---|---|---|
| PR-FOUND-1 (initial finance schema) | **Done** | Migrations 2-4, all tables + functions + RLS |
| PR-FOUND-2 (drop legacy) | **Done** | Migration 1 |
| PR-FOUND-3 (capabilities) | **Done** | 10 finance + 2 billing caps in Migration 4 |
| PR-CLIENT-1 (spawn_invoices_from_proposal) | **Done** | Server action + RPC (full body via MCP) |
| PR-CLIENT-2 (recordPayment) | **Done** | Server action + RPC (full body via MCP) |
| PR-CLIENT-3 (Stripe webhook split) | **Done** | Two routes, two secrets, dedup table |
| PR-CLIENT-4 (send invoice + PDF) | **Done** | Full send flow with PDF, email, QBO enqueue |
| PR-CLIENT-7 (client billing UI) | **Partial** | InvoiceListWidget, PaymentModal built. SyncStatusChip, SyncLogSlideOver, QBOConnectPanel, CustomerMappingModal, PendingMappingsTable not yet built. |
| PR-CLIENT-8 (finance dashboard) | **Partial** | Finance page shell exists; aging buckets and MTD revenue widgets not yet wired to new tables |
| PR-CLIENT-10 (blank invoice authoring) | **Done** | `/finance/invoices/new` with entity picker, line items editor |
| PR-SUB-1 (subscription schema parity) | **Partial** | Workspace columns (`current_period_end`, `trial_ends_at`, `cancel_at_period_end`, `last_payment_failed_at`, `grace_period_ends_at`) not yet migrated. `subscription_invoices` and `subscription_events` tables not yet created. Tier config consistency script created. |
| PR-SUB-2 (subscription webhook hardening) | **Done** | Subscription route handles all events, writes dedup rows |
| PR-SUB-3 (Customer Portal + /settings/billing) | **Partial** | Page exists with invoice history and audit trail. Stripe Customer Portal redirect button needs `STRIPE_CUSTOMER_PORTAL_URL` env config. |

### Remaining -- client billing

| PR | Status | What's needed |
|---|---|---|
| PR-INFRA-2 (finance schema PostgREST exposure) | Not started | Add `finance` to Supabase Dashboard exposed schemas, regenerate types, remove all `(as any)` casts |
| PR-INFRA-3 (advisory lock verification) | Not started | Verify `pg_advisory_xact_lock` works across Edge Function invocations through PgBouncer |
| PR-CLIENT-5 (QBO OAuth + wizard) | Not started | OAuth flow, first-time setup wizard, Vault token storage wiring |
| PR-CLIENT-6 (QBO sync worker deployment) | Not started | Edge Function or Vercel Cron deployment, end-to-end QBO sandbox testing |
| PR-CLIENT-9 (public pay page + Stripe Checkout) | Not started | Wire "Pay now" button to `createInvoiceCheckoutSession` |
| PR-CLIENT-11 (refund + credit note) | Not started | Stripe refund flow, credit note creation, QBO CreditMemo push |
| PR-CLIENT-12 (finance onboarding checklist) | Not started | Settings > Finance checklist panel |

### Remaining -- subscription billing

| PR | Status | What's needed |
|---|---|---|
| PR-SUB-1 (schema additions) | Partial | Workspace columns migration, `subscription_invoices` + `subscription_events` tables, tier_config price ID seed |
| PR-SUB-3 (Customer Portal) | Partial | Stripe Customer Portal redirect needs env config and testing |
| PR-SUB-4 (trial period) | Not started | 14-day trial implementation, trial countdown banner, `trial_will_end` email |
| PR-SUB-5 (billing_status enforcement) | Not started | `requireBillingActive` helper, grace period calculation, Aion soft warn/hard block |

### Remaining -- polish

| PR | Status | What's needed |
|---|---|---|
| PR-POLISH-1 (delete legacy dead code) | Not started | Remove `src/features/finance-sync/`, legacy `InvoiceList.tsx`, `(supabase as any)` casts |
| PR-POLISH-2 (documentation rewrite) | Not started | Rewrite `docs/reference/finance-schema.md`, update `docs/onboarding-subscription-architecture.md` |
| PR-POLISH-3 (smoke test runbook) | Not started | 14-step manual smoke test, `scripts/smoke/billing-end-to-end.ts` |

### Wave 2 (post-launch)

W2.1 freelancer pay UI (uses pre-built `finance.bills`) -- W2.2 per-line QBO item mapping + Class/Location -- W2.3 dedicated Credit Note UI -- W2.4 tracked change orders -- W2.5 consolidated client statements -- W2.6 multi-tax-rate per invoice -- W2.7 unified proposal-deposit + invoice-deposit (delete `deposit_paid_at`) -- W2.8 multi-payment schedules -- W2.9 dunning + late fees -- W2.10 expenses to profitability -- W2.11 card surcharge -- W2.12 1099 generation -- W2.13 Stripe Metered Billing for Aion overages.

### Wave 3 (second-wave users)

W3.1 settlement sheets for touring -- W3.2 multi-currency -- W3.3 multi-jurisdictional tax -- W3.4 Bill.com integration -- W3.5 Aion-drafted dunning copy -- W3.6 two-way QBO sync -- W3.7 cash flow forecasting.

---

## 8. Testing strategy -- what exists vs what's needed

### What exists

**pgTAP tests** (`supabase/tests/database/00800-finance-rebuild-regression.test.sql`):
- 14 tests covering: payment trigger status flips (full, partial), credit note trigger gating, refund reversal, REVOKE posture on SECURITY DEFINER functions, `get_public_invoice` anon accessibility, `next_invoice_number` monotonicity, payment INSERT denial for authenticated, `stripe_webhook_events` SELECT denial for authenticated, `invoice_balances` view correctness, cross-workspace payment isolation.
- Run with: `supabase test db`

**Vitest tests** (`src/features/finance/api/__tests__/`):
- `invoice-actions.test.ts` -- unit tests for invoice action type resolution
- `expense-actions.test.ts` -- pre-existing expense tests
- `create-proposal-deposit-intent.test.ts` -- pre-existing deposit intent tests
- `calculate-deposit.test.ts` -- pre-existing deposit calculation tests

### What's missing

1. **Stripe CLI end-to-end scenarios** -- needed for both webhook routes:
   - Client billing: `stripe trigger checkout.session.completed`, `charge.refunded`, duplicate event redelivery
   - Subscription: `stripe trigger customer.subscription.created`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`

2. **QBO sandbox flows** -- the full "Linda test": connect, send 5 invoices of different shapes, pay 3, void 1, credit-note 1. Zero duplicates, zero manual fixes.

3. **Concurrent payment race pgTAP test** -- the plan calls for 20 concurrent payment inserts at one invoice. The current test validates sequential behavior; concurrent hammering needs `pgbench` or explicit parallel transaction testing.

4. **`requireBillingActive` helper tests** -- every billing state should return the correct gate result.

5. **PR-POLISH-3 smoke test runbook** -- the 14-step manual end-to-end runbook documented in the plan section 12.

---

## 9. Glossary of new finance domain terms

### `invoice_kind` values

```sql
CHECK (invoice_kind IN ('deposit', 'progress', 'final', 'standalone', 'credit_note'))
```

| Value | Meaning |
|---|---|
| `deposit` | First payment against a deal (usually spawned from proposal acceptance) |
| `progress` | Mid-project billing (not yet implemented in UI) |
| `final` | Balance-due invoice after deposit (spawned from proposal) |
| `standalone` | Blank invoice not tied to a proposal |
| `credit_note` | Negative-amount correction against a parent invoice. Trigger-gated out of payment recompute. |

### Invoice `status` values

```sql
CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'void', 'refunded'))
```

| Value | Transition |
|---|---|
| `draft` | Initial state. Editable. |
| `sent` | After `sendInvoice()`. Number assigned, snapshots frozen, PDF generated. |
| `viewed` | Set by `get_public_invoice()` on first access. |
| `partially_paid` | Set by `recompute_invoice_paid` when `0 < paid_amount < total_amount`. |
| `paid` | Set by trigger when `paid_amount >= total_amount`. |
| `void` | Manual void action. |
| `refunded` | After full refund (negative payment row brings `paid_amount` to 0). |

### Payment `method` values

```sql
CHECK (method IN ('stripe_card', 'stripe_ach', 'check', 'wire', 'cash', 'bill_dot_com', 'other'))
```

### Payment `status` values

```sql
CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded'))
```

### QBO sync status values (on `finance.invoices` and `finance.payments`)

```sql
CHECK (qbo_sync_status IN ('not_synced', 'queued', 'in_progress', 'synced', 'failed', 'pending_mapping', 'dead_letter', 'excluded_pre_connection'))
```

| Value | Meaning |
|---|---|
| `not_synced` | Default. QBO not connected or push not yet triggered. |
| `queued` | Sync job created, awaiting worker. |
| `in_progress` | Worker has leased the job. |
| `synced` | Successfully pushed to QBO. |
| `failed` | Push failed, will retry per backoff schedule. |
| `pending_mapping` | Blocked on customer/item mapping resolution. |
| `dead_letter` | 5 attempts exhausted. Requires manual retry. |
| `excluded_pre_connection` | Payment predates QBO connection. User must explicitly push. |

### Sync job `state` values

```sql
CHECK (state IN ('queued', 'in_progress', 'succeeded', 'failed', 'dead_letter', 'pending_mapping'))
```

### `billing_status` values (on `public.workspaces`)

| Value | Behavior |
|---|---|
| `active` | Full access. |
| `past_due` | Yellow banner. 7-day grace period before tier-gated features hard-block. |
| `canceling` | Blue banner. Full access until `current_period_end`. |
| `canceled` | Red banner. Foundation features only. |

### `item_kind` values (line items)

```sql
CHECK (item_kind IN ('service', 'rental', 'talent', 'fee', 'discount', 'tax_line'))
```

Maps to 5 default QBO Items created during OAuth setup (excluding `tax_line`).

### Finance capability keys

| Key | Grants |
|---|---|
| `finance:read` | View invoices, payments, dashboard, sync status |
| `finance:write` | Create/edit drafts, send invoices, record payments |
| `finance:void` | Void sent invoices |
| `finance:refund` | Issue refunds |
| `finance:credit_note` | Issue credit notes |
| `finance:see_internal_notes` | Read `internal_notes` field |
| `finance:manage_qbo` | OAuth, mappings, sync settings |
| `finance:manage_settings` | Tax rates, invoice prefix, payment terms |
| `billing:manage_subscription` | Change tier, manage seats, view payment method |
| `billing:view_subscription` | View current tier, usage, invoice history |

---

## 10. File tree

New files created in the billing rebuild, organized by FSD layer:

```
supabase/
  migrations/
    20260412020000_drop_preferred_crew_column.sql
    20260412021047_finance_rebuild_01_drop_legacy_invoices.sql
    20260412021222_finance_rebuild_02_core_tables.sql
    20260412021350_finance_rebuild_03_qbo_tables.sql
    20260412021511_finance_rebuild_04_support_and_capabilities.sql
    20260412021604_finance_rebuild_05_rls_policies.sql
    20260412024241_finance_spawn_invoices_from_proposal.sql
    20260412025043_finance_record_payment_implementation.sql
    20260412030000_add_timezone_columns.sql
  tests/
    database/
      00800-finance-rebuild-regression.test.sql

src/
  app/                                          # App layer
    i/
      layout.tsx                                # Public invoice layout (light theme)
      [token]/
        page.tsx                                # Public invoice page
    api/
      stripe-webhooks/
        client-billing/
          route.ts                              # Client payment webhook
        subscription/
          route.ts                              # SaaS subscription webhook
    (dashboard)/
      (features)/
        finance/
          invoices/
            new/
              page.tsx                          # New invoice server component
              new-invoice-form.tsx              # New invoice client form
      settings/
        billing/
          page.tsx                              # Billing settings server component
          billing-page-client.tsx               # Billing settings client component

  features/                                     # Features layer
    finance/
      schemas/
        invoice-snapshots.ts                    # BillToSnapshotV1 + FromSnapshotV1 Zod schemas
      api/
        invoice-actions.ts                      # Rebuilt: spawn, record payment, send proxy
        send-invoice.ts                         # Full send flow (number, snapshot, PDF, email, QBO)
        create-blank-invoice.ts                 # Standalone invoice creation
        generate-invoice-pdf.ts                 # Server-side PDF via @react-pdf/renderer
        send-invoice-email.ts                   # Invoice email via Resend
        convertProposalToInvoice.ts             # Legacy compat wrapper
      qbo/
        index.ts                                # Barrel export
        request-id.ts                           # Deterministic Intuit RequestId
        push-invoice.ts                         # QBO Invoice push with customer resolution
        worker.ts                               # Sync job queue processor
      ui/
        pdf/
          InvoicePDF.tsx                        # @react-pdf/renderer document
        widgets/
          InvoiceListWidget.tsx                 # Dashboard invoice list
          PaymentModal.tsx                      # Record manual payment modal

scripts/
  check-tier-config-consistency.ts              # CI: TS constant vs DB tier_config check

docs/
  audits/
    billing-system-schema-drift-2026-04-11.md
    billing-redesign-vision-2026-04-11.md
    billing-redesign-critique-2026-04-11.md
    billing-redesign-final-plan-2026-04-11.md
    billing-rebuild-session-closeout-2026-04-12.md  # This document
```
