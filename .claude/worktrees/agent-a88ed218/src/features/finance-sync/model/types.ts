/**
 * Finance Sync Feature - Type Definitions
 * Aligned with existing production finance schema
 * @module features/finance-sync/model/types
 */

// ============================================================================
// QuickBooks OAuth Types
// ============================================================================

export interface QuickBooksTokens {
  realmId: string;
  companyName: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  isExpired: boolean;
}

export interface QuickBooksConnection {
  id: string;
  workspaceId: string;
  realmId: string;
  companyName: string | null;
  isConnected: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthCallbackParams {
  code: string;
  realmId: string;
  state: string;
}

export interface OAuthState {
  returnUrl: string;
  workspaceId: string;
  nonce: string;
  timestamp: number;
}

// ============================================================================
// Invoice Types (Matching existing finance.invoices schema)
// ============================================================================

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void' | 'overdue';
export type InvoiceType = 'deposit' | 'final' | 'adjustment';
export type QuickBooksSyncStatus = 'pending' | 'synced' | 'error';
export type ReconciliationStatus = 'unreconciled' | 'partial' | 'reconciled';

export interface Invoice {
  id: string;
  workspaceId: string;
  eventId: string;
  gigId: string | null;
  billToId: string;
  invoiceNumber: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  invoiceType: InvoiceType | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // QuickBooks sync fields
  quickbooksInvoiceId: string | null;
  quickbooksSyncStatus: QuickBooksSyncStatus | null;
  quickbooksLastSyncedAt: Date | null;
  quickbooksError: string | null;
}

// ============================================================================
// Bank Transaction Types (Matching existing finance.bank_transactions)
// ============================================================================

export interface BankTransaction {
  id: string;
  workspaceId: string;
  externalId: string | null;
  rawDescription: string;
  amount: number;
  transactionDate: Date;
  reconciliationStatus: ReconciliationStatus;
  createdAt: Date;
}

// ============================================================================
// Transaction Allocation Types (Matching existing finance.transaction_allocations)
// ============================================================================

export interface TransactionAllocation {
  id: string;
  workspaceId: string;
  transactionId: string;
  invoiceId: string;
  amountAllocated: number;
  createdAt: Date;
}

// ============================================================================
// Dashboard Types (Using existing schema relationships)
// ============================================================================

export interface MonthlyRevenue {
  workspaceId: string;
  month: Date;
  revenue: number;
  outstanding: number;
  paidCount: number;
  pendingCount: number;
  totalCount: number;
}

export interface OutstandingInvoice extends Invoice {
  gigTitle: string | null;
  eventName: string | null;
  billToName: string | null;
  amountPaid: number;
  balanceDue: number;
  urgency: 'overdue' | 'due_soon' | 'on_track';
}

export interface FinanceDashboardData {
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  outstandingAmount: number;
  outstandingCount: number;
  monthlyTrend: MonthlyRevenue[];
  outstandingInvoices: OutstandingInvoice[];
}

// ============================================================================
// Action States
// ============================================================================

export interface OAuthActionState {
  success: boolean;
  error?: string;
  authUrl?: string;
}

export interface CallbackActionState {
  success: boolean;
  error?: string;
  companyName?: string;
}

export interface SyncActionState {
  success: boolean;
  error?: string;
  syncedCount?: number;
}

// ============================================================================
// Create/Update Input Types
// ============================================================================

export interface CreateInvoiceInput {
  workspaceId: string;
  eventId: string;
  gigId?: string;
  billToId: string;
  subtotalAmount: number;
  taxAmount?: number;
  invoiceType?: InvoiceType;
  dueDate?: Date;
}

export interface UpdateInvoiceInput {
  id: string;
  subtotalAmount?: number;
  taxAmount?: number;
  status?: InvoiceStatus;
  invoiceType?: InvoiceType;
  dueDate?: Date;
}

export interface RecordPaymentInput {
  workspaceId: string;
  transactionId: string;
  invoiceId: string;
  amountAllocated: number;
}
