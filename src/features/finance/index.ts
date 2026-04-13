/**
 * Finance feature – Invoices, payments, gig financials dashboard
 * @module features/finance
 */

export { formatCurrency } from './model/types';
export type {
  InvoiceDTO,
  InvoiceItemDTO,
  FinancialSummaryDTO,
  GigFinancialsDTO,
} from './model/types';
export {
  generateInvoiceFromProposal,
  recordManualPayment,
} from './api/invoice-actions';
export { getFinancials } from './api/get-gig-financials';
export { RevenueRing, InvoiceListWidget, QuickActions, SetupBilling } from './ui';