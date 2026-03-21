/**
 * Finance Sync Feature - Zod Validation Schemas
 * Aligned with existing production finance schema
 * @module features/finance-sync/model/schema
 */

import { z } from 'zod';

// ============================================================================
// OAuth Schemas
// ============================================================================

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  realmId: z.string().min(1, 'Realm ID is required'),
  state: z.string().min(1, 'State parameter is required'),
});

export const oauthStateSchema = z.object({
  returnUrl: z.string(),
  workspaceId: z.string().uuid('Invalid workspace ID'),
  nonce: z.string().min(16, 'Nonce must be at least 16 characters'),
  timestamp: z.number().positive('Invalid timestamp'),
});

// ============================================================================
// Invoice Schemas (Matching existing finance.invoices)
// ============================================================================

export const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'void', 'overdue']);
export const invoiceTypeSchema = z.enum(['deposit', 'final', 'adjustment']);
export const reconciliationStatusSchema = z.enum(['unreconciled', 'partial', 'reconciled']);

export const createInvoiceSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID'),
  eventId: z.string().uuid('Invalid event ID'),
  gigId: z.string().uuid('Invalid gig ID').optional(),
  billToId: z.string().uuid('Invalid bill-to ID'),
  subtotalAmount: z.number().positive('Subtotal must be positive'),
  taxAmount: z.number().nonnegative('Tax cannot be negative').default(0),
  invoiceType: invoiceTypeSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateInvoiceSchema = z.object({
  id: z.string().uuid('Invalid invoice ID'),
  subtotalAmount: z.number().positive().optional(),
  taxAmount: z.number().nonnegative().optional(),
  status: invoiceStatusSchema.optional(),
  invoiceType: invoiceTypeSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

// ============================================================================
// Transaction Allocation Schemas (Matching existing finance.transaction_allocations)
// ============================================================================

export const createAllocationSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID'),
  transactionId: z.string().uuid('Invalid transaction ID'),
  invoiceId: z.string().uuid('Invalid invoice ID'),
  amountAllocated: z.number().positive('Amount must be positive'),
});

// ============================================================================
// Sync Schemas
// ============================================================================

export const syncInvoiceSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice ID'),
  workspaceId: z.string().uuid('Invalid workspace ID'),
});

export const batchSyncSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID'),
  invoiceIds: z.array(z.string().uuid()).min(1, 'At least one invoice ID required'),
});

// Type exports
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateAllocationInput = z.infer<typeof createAllocationSchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
