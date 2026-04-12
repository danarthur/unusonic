/**
 * Finance dashboard shared types
 * @module app/(features)/finance/types
 */

export interface FinanceDashboardData {
  invoices: Array<{
    id: string;
    invoice_number: string | null;
    invoice_kind: string;
    status: string;
    total_amount: number;
    paid_amount: number;
    due_date: string | null;
    issue_date: string | null;
    public_token: string | null;
    qbo_sync_status: string | null;
    event_id: string | null;
    deal_id: string | null;
    bill_to_snapshot: { display_name: string; [key: string]: unknown } | null;
    balance_due: number;
    days_overdue: number;
    line_items: Array<{
      id: string;
      invoice_id: string;
      description: string;
      quantity: number;
      unit_price: number;
      amount: number;
      item_kind: string;
    }>;
  }>;
  stats: {
    outstandingTotal: number;
    revenueThisMonth: number;
    statusCounts: Record<string, number>;
    agingBuckets: {
      current: number;
      days1to30: number;
      days31to60: number;
      days61to90: number;
      days90plus: number;
    };
  };
}
