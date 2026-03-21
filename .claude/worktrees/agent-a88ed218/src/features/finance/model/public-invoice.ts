/**
 * Finance feature – Public invoice (client payment portal) DTOs
 * @module features/finance/model/public-invoice
 */

// =============================================================================
// Public invoice line item (Description | Qty | Price | Total)
// =============================================================================

export interface PublicInvoiceItemDTO {
  id: string;
  invoice_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
  sort_order: number;
}

// =============================================================================
// Public invoice payload (workspace, event, invoice + items, amountPaid, balanceDue)
// =============================================================================

export interface PublicInvoiceDTO {
  invoice: {
    id: string;
    invoice_number: string | null;
    status: string;
    total_amount: string;
    token: string;
    issue_date: string;
    due_date: string;
  };
  items: PublicInvoiceItemDTO[];
  workspace: {
    id: string;
    name: string;
    logo_url: string | null;
  };
  event: {
    id: string;
    title: string;
    starts_at: string | null;
  };
  /** Sum of succeeded payments (server-computed) */
  amountPaid: number;
  /** total_amount - amountPaid */
  balanceDue: number;
}
