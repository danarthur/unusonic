/**
 * QBO Webhook Handler – Ingestion only.
 * Verifies Intuit signature, parses 2026 array payload (CloudEvents), upserts into qbo_sync_logs.
 * Processing of 'pending' logs is done by a separate Trigger or Cron.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const QBO_VERIFIER_TOKEN = Deno.env.get('QBO_VERIFIER_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !QBO_VERIFIER_TOKEN) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(QBO_VERIFIER_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(rawBody)
  );
  const computedHex = toHex(sig);
  const computedBase64 = toBase64(sig);
  const trimmed = signature.trim();
  return (
    trimmed.toLowerCase() === computedHex ||
    trimmed === computedBase64 ||
    trimmed.replace(/\s/g, '') === computedBase64
  );
}

// CloudEvents-style event in 2026 array payload
type WebhookEvent = {
  id?: string;
  eventId?: string;
  realmId?: string;
  intuitaccountid?: string;
  name?: string;
  operation?: string;
  [key: string]: unknown;
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('intuit-signature');
  const rawBody = await req.text();

  if (!(await verifySignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let events: WebhookEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const evt of events) {
    const realmId =
      (evt.realmId as string) ??
      (evt.intuitaccountid as string) ??
      (evt as Record<string, unknown>).realm_id as string | undefined;

    if (!realmId) {
      // Cannot map to workspace; still log with workspace_id from first config or skip
      continue;
    }

    const { data: configRow } = await supabase
      .from('qbo_configs')
      .select('workspace_id')
      .eq('realm_id', realmId)
      .single();

    const workspace_id = configRow?.workspace_id ?? null;
    if (!workspace_id) {
      continue;
    }

    const external_event_id =
      (evt.id as string) ?? (evt.eventId as string) ?? undefined;
    const source = (evt.name as string) ?? (evt.source as string) ?? 'qbo';
    const event_type =
      (evt.operation as string) ?? (evt.type as string) ?? 'unknown';

    await supabase.from('qbo_sync_logs').upsert(
      {
        workspace_id,
        external_event_id: external_event_id ?? null,
        source,
        event_type,
        payload: evt as Record<string, unknown>,
        status: 'pending',
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,external_event_id' }
    );
  }

  return new Response(JSON.stringify({ received: events.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
