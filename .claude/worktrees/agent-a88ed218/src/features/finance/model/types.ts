/**
 * Finance feature – DTOs and summary types for gig financials
 * @module features/finance/model/types
 */

// =============================================================================
// Invoice line item (description, amount, cost, quantity for profitability)
// =============================================================================

export interface InvoiceItemDTO {
  id: string;
  invoice_id: string;
  description: string;
  amount: string;
  /** Cost for this line (default 0 if not in DB) */
  cost: number;
  quantity: number;
}

/** Flattened item with invoice context for top-revenue list */
export interface TopRevenueItemDTO {
  id: string;
  description: string;
  amount: number;
  invoice_number: string | null;
}

// =============================================================================
// Invoice with items and computed amountPaid
// =============================================================================

export interface InvoiceDTO {
  id: string;
  event_id: string;
  proposal_id: string | null;
  invoice_number: string | null;
  status: string;
  total_amount: string;
  token: string;
  issue_date: string;
  due_date: string;
  created_at: string;
  invoiceItems: InvoiceItemDTO[];
  /** Sum of succeeded payments for this invoice (server-computed) */
  amountPaid: number;
}

// =============================================================================
// Financial summary for Revenue Ring and header
// =============================================================================

export interface FinancialSummaryDTO {
  /** Total of all invoice totals (revenue), excluding cancelled */
  totalRevenue: number;
  /** Sum of succeeded payments */
  collected: number;
  /** totalRevenue - collected */
  outstanding: number;
  /** (collected / totalRevenue) * 100 when totalRevenue > 0 */
  progress: number;
  /** Alias for progress (0–100) */
  progressPercentage: number;
}

/** Profitability: cost, gross profit, margin (server-computed) */
export interface ProfitabilityDTO {
  /** Sum of item.cost for all items in active (non-cancelled) invoices */
  totalCost: number;
  /** totalRevenue - totalCost */
  grossProfit: number;
  /** (grossProfit / totalRevenue) * 100 when totalRevenue > 0, else 0 */
  margin: number;
  /** Alias for margin (handle div-by-zero) */
  marginPercent: number;
}

/** Timeline bounds for PaymentTimeline (first non-cancelled invoice or fallback) */
export interface PaymentTimelineDTO {
  issueDate: string;
  dueDate: string;
  /** ISO date string */
  today: string;
  /** Outstanding balance; when > 0 and past due, track shows overdue (red) */
  outstanding?: number;
}

// =============================================================================
// Gig financials page payload
// =============================================================================

export interface GigFinancialsDTO {
  eventId: string;
  eventTitle: string;
  invoices: InvoiceDTO[];
  summary: FinancialSummaryDTO;
  /** Cost, gross profit, margin (server-computed) */
  profitability: ProfitabilityDTO;
  /** Top 5 items by amount (for RevenueStream) */
  topRevenueItems: TopRevenueItemDTO[];
  /** Issue/due/today for PaymentTimeline */
  paymentTimeline: PaymentTimelineDTO | null;
  /** Proposals for this gig that can be converted to invoice (e.g. accepted) */
  proposalIds: { id: string; status: string }[];
}

// =============================================================================
// Currency formatting (single source of truth)
// =============================================================================

/** Single source of truth – ALWAYS use for currency in the app */
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}
