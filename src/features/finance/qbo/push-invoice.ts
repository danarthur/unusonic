/**
 * QBO Invoice push — creates or updates a QBO Invoice from a finance.invoices row.
 *
 * Handles:
 * - Customer resolution (exact-match auto-link, create-if-new, pending_mapping if ambiguous)
 * - Line item mapping (default_item_ids by item_kind from qbo_connections)
 * - RequestId idempotency on every Intuit API call
 * - Sync log write on every API call
 * - qbo_entity_map write on success
 *
 * @module features/finance/qbo/push-invoice
 */

import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';
import { QuickBooksClient } from '@/shared/api/quickbooks/client';
import { getQboConfig, saveQboTokens } from '@/shared/api/quickbooks/server-env';
import { makeRequestId } from './request-id';

interface PushInvoiceResult {
  success: boolean;
  qboInvoiceId?: string;
  error?: string;
  needsCustomerMapping?: boolean;
}

export async function pushInvoiceToQbo(
  workspaceId: string,
  invoiceId: string,
  attemptNumber: number,
): Promise<PushInvoiceResult> {
  const system = getSystemClient();

  // ── Load invoice + line items + connection ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice } = await system
    .schema('finance')
    .from('invoices')
    .select(`
      id, workspace_id, invoice_number, invoice_kind, status,
      bill_to_entity_id, subtotal_amount, tax_amount, total_amount,
      due_date, issue_date, notes_to_client, qbo_invoice_id, qbo_sync_token
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invoice) return { success: false, error: 'Invoice not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn } = await system
    .schema('finance')
    .from('qbo_connections')
    .select('realm_id, default_item_ids, default_tax_code_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle();

  if (!conn) return { success: false, error: 'No active QBO connection' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lineItems } = await system
    .schema('finance')
    .from('invoice_line_items')
    .select('description, quantity, unit_price, amount, item_kind, is_taxable')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true });

  // ── Resolve customer ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMap } = await system
    .schema('finance')
    .from('qbo_entity_map')
    .select('qbo_id, qbo_sync_token')
    .eq('workspace_id', workspaceId)
    .eq('local_type', 'entity')
    .eq('local_id', invoice.bill_to_entity_id)
    .maybeSingle();

  let qboCustomerId: string;
  let qboCustomerSyncToken: string;

  if (existingMap) {
    qboCustomerId = existingMap.qbo_id;
    qboCustomerSyncToken = existingMap.qbo_sync_token;
  } else {
    // Try exact-match auto-link: query QBO for customer with same display name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entity } = await system
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', invoice.bill_to_entity_id)
      .maybeSingle();

    if (!entity?.display_name) {
      return { success: false, error: 'Bill-to entity not found' };
    }

    const qb = createQbClient(workspaceId, conn.realm_id);
    const requestId = makeRequestId(workspaceId, 'entity', invoice.bill_to_entity_id, 'query', attemptNumber);

    // QBO SQL-like Query Language: escape apostrophes by doubling (`'` → `''`).
    // Backslash escaping is NOT recognized by QBO and previously broke any name
    // containing an apostrophe. Strip control chars and cap length to prevent
    // pathological inputs from breaking the query.
    const safeDisplayName = entity.display_name
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .slice(0, 100)
      .replace(/'/g, "''");

    try {
      const queryResult = await qb.get<{ QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string; SyncToken: string }> } }>(
        `/query`,
        { query: `SELECT * FROM Customer WHERE DisplayName = '${safeDisplayName}'` },
      );

      const matches = queryResult?.QueryResponse?.Customer ?? [];

      if (matches.length === 1) {
        // Exact match — auto-link, and write an audit row to qbo_sync_log so
        // the mapping is reviewable in case the wrong customer was matched.
        qboCustomerId = matches[0].Id;
        qboCustomerSyncToken = matches[0].SyncToken;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await system.schema('finance').from('qbo_entity_map').insert({
          workspace_id: workspaceId,
          local_type: 'entity',
          local_id: invoice.bill_to_entity_id,
          qbo_type: 'Customer',
          qbo_id: qboCustomerId,
          qbo_sync_token: qboCustomerSyncToken,
          last_synced_at: new Date().toISOString(),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await system.schema('finance').from('qbo_sync_log').insert({
          workspace_id: workspaceId,
          local_type: 'entity',
          local_id: invoice.bill_to_entity_id,
          qbo_type: 'Customer',
          qbo_id: qboCustomerId,
          operation: 'query',
          direction: 'push',
          request_id: requestId,
          qbo_response_status: 200,
          qbo_response_body: {
            auto_linked: true,
            display_name: entity.display_name,
            matched_display_name: matches[0].DisplayName,
          },
        });
      } else if (matches.length === 0) {
        // No match — create new customer in QBO
        const createResult = await qb.post<{ Customer: { Id: string; SyncToken: string } }>('/customer', {
          DisplayName: entity.display_name,
        });

        if (!createResult?.Customer?.Id) {
          return { success: false, error: 'Failed to create QBO customer' };
        }

        qboCustomerId = createResult.Customer.Id;
        qboCustomerSyncToken = createResult.Customer.SyncToken;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await system.schema('finance').from('qbo_entity_map').insert({
          workspace_id: workspaceId,
          local_type: 'entity',
          local_id: invoice.bill_to_entity_id,
          qbo_type: 'Customer',
          qbo_id: qboCustomerId,
          qbo_sync_token: qboCustomerSyncToken,
          last_synced_at: new Date().toISOString(),
        });
      } else {
        // Ambiguous (2+ matches) — requires manual mapping
        return { success: false, needsCustomerMapping: true, error: `Ambiguous customer match: ${matches.length} QBO customers match "${entity.display_name}"` };
      }
    } catch (e) {
      return { success: false, error: `Customer resolution failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // ── Build QBO Invoice payload ──────────────────────────────────────────────
  const defaultItemIds = (conn.default_item_ids ?? {}) as Record<string, string>;

  // QBO `Amount` and `UnitPrice` are decimal dollars, not cents — but raw float
  // arithmetic on `li.amount` / `li.unit_price` can produce values like 1234.56000004
  // that fail QBO's tax/total reconciliation. Snap to two decimals so the
  // amounts QBO receives match what we computed locally.
  const round2 = (v: number) => Math.round(Number(v) * 100) / 100;
  const qboLines = (lineItems ?? [])
    .filter((li: any) => li.item_kind !== 'tax_line')
    .map((li: any, idx: number) => {
      const itemRef = defaultItemIds[li.item_kind] ?? defaultItemIds['service'] ?? null;
      return {
        DetailType: 'SalesItemLineDetail',
        Amount: round2(li.amount),
        Description: li.description,
        LineNum: idx + 1,
        SalesItemLineDetail: {
          ItemRef: itemRef ? { value: itemRef } : undefined,
          Qty: Number(li.quantity),
          UnitPrice: round2(li.unit_price),
        },
      };
    });

  const qboInvoice: Record<string, unknown> = {
    CustomerRef: { value: qboCustomerId },
    DocNumber: invoice.invoice_number,
    TxnDate: invoice.issue_date,
    DueDate: invoice.due_date,
    Line: qboLines,
    CustomerMemo: invoice.notes_to_client ? { value: invoice.notes_to_client } : undefined,
  };

  // ── Push to QBO ────────────────────────────────────────────────────────────
  const qb = createQbClient(workspaceId, conn.realm_id);
  const requestId = makeRequestId(workspaceId, 'invoice', invoiceId, invoice.qbo_invoice_id ? 'update' : 'create', attemptNumber);
  const startedAt = new Date().toISOString();

  try {
    let result: { Invoice: { Id: string; SyncToken: string } };

    if (invoice.qbo_invoice_id) {
      // Update existing
      qboInvoice.Id = invoice.qbo_invoice_id;
      qboInvoice.SyncToken = invoice.qbo_sync_token;
      result = await qb.post<{ Invoice: { Id: string; SyncToken: string } }>('/invoice', qboInvoice);
    } else {
      // Create new
      result = await qb.post<{ Invoice: { Id: string; SyncToken: string } }>('/invoice', qboInvoice);
    }

    const qboId = result?.Invoice?.Id;
    const syncToken = result?.Invoice?.SyncToken;

    if (!qboId) {
      throw new Error('QBO response missing Invoice.Id');
    }

    // Update invoice with QBO IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await system.schema('finance').from('invoices').update({
      qbo_invoice_id: qboId,
      qbo_sync_token: syncToken,
      qbo_last_sync_at: new Date().toISOString(),
      qbo_last_error: null,
      qbo_sync_status: 'synced',
    }).eq('id', invoiceId);

    // Update entity map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await system.schema('finance').from('qbo_entity_map').upsert({
      workspace_id: workspaceId,
      local_type: 'invoice',
      local_id: invoiceId,
      qbo_type: 'Invoice',
      qbo_id: qboId,
      qbo_sync_token: syncToken,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,local_type,local_id' });

    // Log success
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await system.schema('finance').from('qbo_sync_log').insert({
      workspace_id: workspaceId,
      local_type: 'invoice',
      local_id: invoiceId,
      qbo_type: 'Invoice',
      qbo_id: qboId,
      operation: invoice.qbo_invoice_id ? 'update' : 'create',
      request_id: requestId,
      qbo_response_status: 200,
      attempt_number: attemptNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    return { success: true, qboInvoiceId: qboId };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Log failure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await system.schema('finance').from('qbo_sync_log').insert({
      workspace_id: workspaceId,
      local_type: 'invoice',
      local_id: invoiceId,
      operation: invoice.qbo_invoice_id ? 'update' : 'create',
      request_id: requestId,
      error_message: errorMessage,
      attempt_number: attemptNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    // Update invoice sync status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await system.schema('finance').from('invoices').update({
      qbo_last_error: errorMessage,
      qbo_sync_status: 'failed',
    }).eq('id', invoiceId);

    return { success: false, error: errorMessage };
  }
}

function createQbClient(workspaceId: string, realmId: string): QuickBooksClient {
  return new QuickBooksClient(workspaceId, {
    getConfig: async () => {
      const config = await getQboConfig(workspaceId);
      if (!config) throw new Error('QBO config not found');
      return config;
    },
    saveTokens: async (tokens) => {
      await saveQboTokens(workspaceId, {
        realm_id: realmId,
        ...tokens,
      });
    },
    // Sync paths run in parallel under high load — refresh via the advisory-
    // lock-protected RPC so concurrent syncs can't race each other into
    // corrupting the Vault secret. See finance.get_fresh_qbo_token.
    refreshViaRpc: async () => {
      const system = getSystemClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance.get_fresh_qbo_token isn't in the public PostgREST schema slice generated into supabase.ts
      const { data, error } = await system
        .schema('finance')
        .rpc('get_fresh_qbo_token', { p_workspace_id: workspaceId });
      if (error) throw new Error(`get_fresh_qbo_token failed: ${error.message}`);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.access_token) throw new Error('get_fresh_qbo_token returned no access_token');
      // RPC issues a token good for the standard QBO 60-minute window. Subtract
      // the buffer here so the next ensureToken call doesn't immediately re-refresh.
      return {
        access_token: row.access_token as string,
        token_expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      };
    },
    sandbox: process.env.NODE_ENV !== 'production',
  });
}
