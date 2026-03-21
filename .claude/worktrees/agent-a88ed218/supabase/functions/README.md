# Edge functions

Supabase Edge Functions (Deno). Deploy via Supabase Dashboard or `supabase functions deploy`.

| Function | Purpose |
|----------|--------|
| **`qbo-webhook`** | QuickBooks Online webhook ingestion: verifies Intuit signature, parses CloudEvents payload, upserts into `qbo_sync_logs`. Processing of pending logs is done separately (trigger/cron). |

See each function’s `index.ts` for env vars (e.g. `QBO_VERIFIER_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
