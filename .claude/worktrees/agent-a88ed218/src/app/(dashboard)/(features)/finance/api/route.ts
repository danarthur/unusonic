import { NextResponse } from 'next/server';
import { getSession } from '@/shared/lib/auth/session';
import { getSystemClient } from '@/shared/api/supabase/system';

type FinanceRow = {
  id: string;
  amount: number | null;
  client_name: string | null;
  status: string | null;
  invoice_number: string | null;
};

function toFinanceRow(row: Record<string, unknown>): FinanceRow {
  return {
    id: String(row.id ?? ''),
    amount: row.amount != null ? Number(row.amount) : row.total_amount != null ? Number(row.total_amount) : row.balance_due != null ? Number(row.balance_due) : null,
    client_name: (row.client_name ?? row.bill_to_name ?? row.billToName ?? null) as string | null,
    status: (row.status ?? 'draft') as string | null,
    invoice_number: (row.invoice_number ?? row.invoiceNumber ?? null) as string | null,
  };
}

export async function GET() {
  try {
    const session = await getSession();
    const workspaceId = session.workspace.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not in generated types
    const sys = getSystemClient() as any;

    try {
      const { data: ledgerData, error: ledgerError } = await sys
        .schema('finance')
        .from('dashboard_ledger')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!ledgerError && Array.isArray(ledgerData) && ledgerData.length > 0) {
        const rows = ledgerData.map((r: Record<string, unknown>) => toFinanceRow(r));
        return NextResponse.json(rows);
      }

      if (ledgerError) {
        console.warn('[Finance API] dashboard_ledger error:', ledgerError.message);
      }

      const { data: outstandingData, error: outstandingError } = await sys
        .schema('finance')
        .from('outstanding_invoices')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('due_date', { ascending: true })
        .limit(5);

      if (!outstandingError && Array.isArray(outstandingData) && outstandingData.length > 0) {
        const rows = outstandingData.map((r: Record<string, unknown>) => toFinanceRow(r));
        return NextResponse.json(rows);
      }

      if (outstandingError) {
        console.warn('[Finance API] outstanding_invoices error:', outstandingError.message);
      }

      return NextResponse.json([]);
    } catch (schemaErr) {
      console.warn('[Finance API] finance schema unavailable:', schemaErr);
      return NextResponse.json([]);
    }
  } catch (err) {
    console.error('❌ Finance API Fatal:', err);
    return NextResponse.json([]);
  }
}
