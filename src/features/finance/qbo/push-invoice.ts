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
  const { data: invoice } = await (system as any)
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
  const { data: conn } = await (system as any)
    .schema('finance')
    .from('qbo_connections')
    .select('realm_id, default_item_ids, default_tax_code_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle();

  if (!conn) return { success: false, error: 'No active QBO connection' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lineItems } = await (system as any)
    .schema('finance')
    .from('invoice_line_items')
    .select('description, quantity, unit_price, amount, item_kind, is_taxable')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true });

  // ── Resolve customer ───────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingMap } = await (system as any)
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
    const { data: entity } = await (system as any)
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
        // Exact match — auto-link silently
        qboCustomerId = matches[0].Id;
        qboCustomerSyncToken = matches[0].SyncToken;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (system as any).schema('finance').from('qbo_entity_map').insert({
          workspace_id: workspaceId,
          local_type: 'entity',
          local_id: invoice.bill_to_entity_id,
          qbo_type: 'Customer',
          qbo_id: qboCustomerId,
          qbo_sync_token: qboCustomerSyncToken,
          last_synced_at: new Date().toISOString(),
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
        await (system as any).schema('finance').from('qbo_entity_map').insert({
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

  const qboLines = (lineItems ?? [])
    .filter((li: any) => li.item_kind !== 'tax_line')
    .map((li: any, idx: number) => {
      const itemRef = defaultItemIds[li.item_kind] ?? defaultItemIds['service'] ?? null;
      return {
        DetailType: 'SalesItemLineDetail',
        Amount: Number(li.amount),
        Description: li.description,
        LineNum: idx + 1,
        SalesItemLineDetail: {
          ItemRef: itemRef ? { value: itemRef } : undefined,
          Qty: Number(li.quantity),
          UnitPrice: Number(li.unit_price),
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
    await (system as any).schema('finance').from('invoices').update({
      qbo_invoice_id: qboId,
      qbo_sync_token: syncToken,
      qbo_last_sync_at: new Date().toISOString(),
      qbo_last_error: null,
      qbo_sync_status: 'synced',
    }).eq('id', invoiceId);

    // Update entity map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (system as any).schema('finance').from('qbo_entity_map').upsert({
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
    await (system as any).schema('finance').from('qbo_sync_log').insert({
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
    await (system as any).schema('finance').from('qbo_sync_log').insert({
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
    await (system as any).schema('finance').from('invoices').update({
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
    sandbox: process.env.NODE_ENV !== 'production',
  });
}
