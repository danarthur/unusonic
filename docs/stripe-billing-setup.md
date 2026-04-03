# Stripe Billing Setup Guide

Instructions for configuring Stripe to work with the Unusonic 3-tier subscription model.

---

## 1. Environment Variables

Ensure these are set in `.env.local` (dev) and Vercel (production):

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser-side Stripe key |
| `ENABLE_STRIPE_BILLING` | Feature flag — set to `true` to activate Stripe billing lifecycle. When falsy, plan changes do bare DB updates only. |

---

## 2. Create Stripe Products and Prices

Create the following in the [Stripe Dashboard](https://dashboard.stripe.com/products) (or via API). Each tier is a Product with two Prices.

### Foundation ($39/mo)

1. **Product:** "Unusonic Foundation"
2. **Price 1 (base fee):** $39.00/month, recurring. This is the `stripe_price_id`.
3. **Price 2 (extra seats):** $15.00/month per unit, recurring. This is the `stripe_extra_seat_price_id`.

### Growth ($99/mo)

1. **Product:** "Unusonic Growth"
2. **Price 1 (base fee):** $99.00/month, recurring. This is the `stripe_price_id`.
3. **Price 2 (extra seats):** $15.00/month per unit, recurring. This is the `stripe_extra_seat_price_id`.

### Studio ($249/mo)

1. **Product:** "Unusonic Studio"
2. **Price 1 (base fee):** $249.00/month, recurring. This is the `stripe_price_id`.
3. **Price 2 (extra seats):** $12.00/month per unit, recurring. This is the `stripe_extra_seat_price_id`.

### Aion Autonomous Actions (Studio only)

1. **Product:** "Aion Autonomous Actions"
2. **Price:** Metered usage, $X per action/month (pricing TBD). Billed at period end based on reported usage.

---

## 3. Store Price IDs in Database

After creating the Products and Prices, copy the `price_xxx` IDs into the `tier_config` table:

```sql
UPDATE public.tier_config
SET stripe_price_id = 'price_FOUNDATION_BASE_ID',
    stripe_extra_seat_price_id = 'price_FOUNDATION_SEAT_ID'
WHERE tier = 'foundation';

UPDATE public.tier_config
SET stripe_price_id = 'price_GROWTH_BASE_ID',
    stripe_extra_seat_price_id = 'price_GROWTH_SEAT_ID'
WHERE tier = 'growth';

UPDATE public.tier_config
SET stripe_price_id = 'price_STUDIO_BASE_ID',
    stripe_extra_seat_price_id = 'price_STUDIO_SEAT_ID'
WHERE tier = 'studio';
```

---

## 4. Register Webhook Endpoint

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://your-domain.com/api/stripe-webhook`
3. Subscribe to these events:
   - `checkout.session.completed` (existing — invoice payments)
   - `payment_intent.succeeded` (existing — proposal deposits)
   - `payment_intent.payment_failed` (existing — failed payments)
   - `customer.subscription.created` (new — subscription lifecycle)
   - `customer.subscription.updated` (new — tier/seat changes)
   - `customer.subscription.deleted` (new — cancellations)
   - `invoice.paid` (new — billing period resets)
   - `invoice.payment_failed` (new — past due detection)
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## 5. Workspace Table Columns

The following columns on `public.workspaces` are used by the billing integration:

| Column | Type | Purpose |
|---|---|---|
| `stripe_customer_id` | text | Stripe Customer ID for the workspace |
| `stripe_subscription_id` | text | Active Stripe Subscription ID |
| `subscription_tier` | subscription_tier enum | Current tier (foundation/growth/studio) |
| `extra_seats` | integer | Extra seats purchased beyond included |
| `billing_status` | text | `active`, `past_due`, `canceling`, `canceled` |
| `aion_actions_used` | integer | Aion autonomous actions consumed this period |
| `aion_actions_reset_at` | timestamptz | When Aion action counter was last reset |

---

## 6. Feature Flag Behavior

When `ENABLE_STRIPE_BILLING` is **not set or falsy**:
- Plan changes do a bare DB update to `subscription_tier` (current behavior)
- No Stripe API calls are made
- Seat/show limits still enforce based on DB tier config
- Useful for development, staging, and the initial rollout of the tier structure before billing goes live

When `ENABLE_STRIPE_BILLING` is **truthy**:
- Plan changes create/update Stripe subscriptions
- Webhook events sync billing state back to the workspace
- Seat quantity changes update the Stripe subscription line item
- Cancellations set `cancel_at_period_end` on the Stripe subscription
