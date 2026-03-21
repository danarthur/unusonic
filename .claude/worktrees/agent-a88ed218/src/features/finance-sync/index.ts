/**
 * Finance Sync Feature
 * QuickBooks integration and invoice management (workspace-scoped)
 * @module features/finance-sync
 */

// UI Components
export { QuickBooksConnectButton } from './ui/connect-button';

// Server Actions (safe to import in client components - they're just async functions)
export {
  initiateQuickBooksOAuth,
  handleQuickBooksCallback,
  disconnectQuickBooks,
  createInvoice,
  updateInvoice,
  recordAllocation,
  syncInvoiceToQuickBooks,
  getFinanceDashboardData,
  getQuickBooksConnection,
} from './api/actions';

// NOTE: qbClient is NOT exported here because it uses 'server-only'
// Import it directly in server-side code: import { qbClient } from '@/features/finance-sync/model/qb-client'

// Types
export type {
  Invoice,
  InvoiceStatus,
  InvoiceType,
  BankTransaction,
  TransactionAllocation,
  ReconciliationStatus,
  QuickBooksConnection,
  QuickBooksTokens,
  MonthlyRevenue,
  OutstandingInvoice,
  FinanceDashboardData,
  OAuthActionState,
  CallbackActionState,
  SyncActionState,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  RecordPaymentInput,
} from './model/types';

// Schemas
export {
  createInvoiceSchema,
  updateInvoiceSchema,
  createAllocationSchema,
  oauthCallbackSchema,
  invoiceStatusSchema,
  invoiceTypeSchema,
  reconciliationStatusSchema,
} from './model/schema';
