'use server';

/**
 * Sync event financials from QuickBooks into finance_invoices / finance_expenses.
 * Uses qbo_project_mappings to resolve event -> qbo_project_id; never query QBO from UI.
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { QuickBooksClient } from '@/shared/api/quickbooks/client';
import { getQboConfig, saveQboTokens } from '@/shared/api/quickbooks/server-env';

export type SyncEventFinancialsResult =
  | { status: 'ok'; invoicesSynced: number; expensesSynced: number }
  | { status: 'unmapped' }
  | { status: 'not_connected' }
  | { status: 'error'; error: string };

interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  DueDate?: string;
  CurrencyRef?: { value?: string };
  TxnDate?: string;
  CustomerRef?: { value?: string };
  [key: string]: unknown;
}

interface QboQueryResponse<T> {
  QueryResponse?: {
    [key: string]: T[] | number | undefined;
    totalCount?: number;
    startPosition?: number;
    maxResults?: number;
  };
}

/**
 * Lookup qbo_project_id for eventId; fetch QBO invoices (and expenses if supported);
 * transform and upsert into finance_invoices and finance_expenses.
 */
export async function syncEventFinancials(
  workspaceId: string,
  eventId: string
): Promise<SyncEventFinancialsResult> {
  const supabase = await createClient();

  const { data: mapping } = await supabase
    .from('qbo_project_mappings')
    .select('qbo_project_id')
    .eq('workspace_id', workspaceId)
    .eq('internal_event_id', eventId)
    .single();

  if (!mapping?.qbo_project_id) {
    return { status: 'unmapped' };
  }

  const qboProjectId = mapping.qbo_project_id;
  const config = await getQboConfig(workspaceId);
  if (!config) {
    return { status: 'not_connected' };
  }

  const getConfig = () => getQboConfig(workspaceId).then((c) => c!);
  const client = new QuickBooksClient(workspaceId, {
    getConfig,
    saveTokens: (tokens) =>
      saveQboTokens(workspaceId, {
        realm_id: config.realm_id,
        ...tokens,
      }),
  });

  try {
    const query = `select * from Invoice where CustomerRef = '${qboProjectId.replace(/'/g, "''")}'`;
    const res = (await client.get<QboQueryResponse<QboInvoice>>('/query', {
      query,
    })) as QboQueryResponse<QboInvoice>;

    const raw = res?.QueryResponse?.Invoice;
    const invoices: QboInvoice[] = Array.isArray(raw) ? raw : [];
    const rows: Array<{
      workspace_id: string;
      event_id: string;
      qbo_id: string;
      qbo_doc_number: string | null;
      amount: number;
      balance: number;
      status: string;
      due_date: string | null;
      currency: string | null;
      updated_at: string;
    }> = [];

    for (const inv of invoices) {
      const totalAmt = Number(inv.TotalAmt ?? 0);
      const balance = Number(inv.Balance ?? 0);
      let status = 'open';
      if (balance <= 0 && totalAmt > 0) status = 'paid';
      else if (inv.DueDate && new Date(inv.DueDate) < new Date()) status = 'overdue';

      rows.push({
        workspace_id: workspaceId,
        event_id: eventId,
        qbo_id: String(inv.Id),
        qbo_doc_number: inv.DocNumber ?? null,
        amount: totalAmt,
        balance,
        status,
        due_date: inv.DueDate ?? null,
        currency: inv.CurrencyRef?.value ?? 'USD',
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('finance_invoices').upsert(rows, {
        onConflict: 'workspace_id,qbo_id',
      });
      if (error) {
        return { status: 'error', error: error.message };
      }
    }

    // QBO Purchase/Bill do not support CustomerRef filter; expenses sync would require
    // different strategy (e.g. all purchases + client-side filter by project). Skip for now.
    const expensesSynced = 0;

    return {
      status: 'ok',
      invoicesSynced: rows.length,
      expensesSynced,
    };
  } catch (e) {
    return {
      status: 'error',
      error: e instanceof Error ? e.message : 'Sync failed',
    };
  }
}
