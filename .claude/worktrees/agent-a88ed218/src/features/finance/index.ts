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
export type { PublicInvoiceDTO, PublicInvoiceItemDTO } from './model/public-invoice';
export {
  generateInvoiceFromProposal,
  recordManualPayment,
} from './api/invoice-actions';
export { getFinancials } from './api/get-gig-financials';
export { getPublicInvoice } from './api/get-public-invoice';
export { submitPublicPayment } from './api/public-payment-actions';
export type { PublicPaymentMethod } from './api/public-payment-actions';
export { RevenueRing, InvoiceList, QuickActions, SetupBilling } from './ui';
export { PublicInvoiceView } from './ui/public';