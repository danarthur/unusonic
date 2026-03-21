/**
 * Finance Sync Feature - Server Actions
 * Handles QuickBooks OAuth flow and invoice sync operations
 * Workspace-scoped to match existing schema
 * @module features/finance-sync/api/actions
 */

'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { oauthCallbackSchema, oauthStateSchema, createInvoiceSchema, updateInvoiceSchema, createAllocationSchema } from '../model/schema';
import { qbClient, clearTokenCache } from '../model/qb-client';
import type { 
  OAuthActionState, 
  CallbackActionState, 
  SyncActionState, 
  Invoice, 
  OutstandingInvoice,
  MonthlyRevenue,
  TransactionAllocation,
} from '../model/types';

// ============================================================================
// OAuth Configuration
// ============================================================================

const QB_OAUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_SCOPES = 'com.intuit.quickbooks.accounting';

function getRedirectUri(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/finance/quickbooks/callback`;
}

// ============================================================================
// OAuth Actions (Workspace-scoped)
// ============================================================================

/**
 * Initiates the QuickBooks OAuth flow for a workspace
 */
export async function initiateQuickBooksOAuth(workspaceId: string): Promise<OAuthActionState> {
  const supabase = await createClient();
  
  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in to connect QuickBooks' };
  }
  
  // Verify user has access to this workspace
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();
  
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { success: false, error: 'You must be a workspace admin to connect QuickBooks' };
  }
  
  // Generate cryptographically secure state
  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({
    returnUrl: '/finance',
    workspaceId,
    nonce,
    timestamp: Date.now(),
  })).toString('base64url');
  
  // Store state in HTTP-only cookie for CSRF protection
  const cookieStore = await cookies();
  cookieStore.set('qb_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });
  
  // Build authorization URL
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    response_type: 'code',
    scope: QB_SCOPES,
    redirect_uri: getRedirectUri(),
    state,
  });
  
  const authUrl = `${QB_OAUTH_URL}?${params.toString()}`;
  
  return { success: true, authUrl };
}

/**
 * Handles the OAuth callback from QuickBooks
 */
export async function handleQuickBooksCallback(
  searchParams: { code?: string; realmId?: string; state?: string; error?: string }
): Promise<CallbackActionState> {
  // Check for OAuth errors
  if (searchParams.error) {
    return { success: false, error: `QuickBooks authorization failed: ${searchParams.error}` };
  }
  
  // Validate callback parameters
  const parsed = oauthCallbackSchema.safeParse(searchParams);
  if (!parsed.success) {
    return { success: false, error: 'Invalid callback parameters' };
  }
  
  const { code, realmId, state } = parsed.data;
  
  // Verify CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('qb_oauth_state')?.value;
  
  if (!storedState || storedState !== state) {
    return { success: false, error: 'Invalid state parameter. Please try connecting again.' };
  }
  
  // Clear state cookie
  cookieStore.delete('qb_oauth_state');
  
  // Parse and validate state
  let stateData: { workspaceId: string; timestamp: number };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    const validatedState = oauthStateSchema.safeParse(stateData);
    if (!validatedState.success) {
      return { success: false, error: 'Invalid state format' };
    }
    
    // Check expiry (10 minutes)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      return { success: false, error: 'Authorization expired. Please try again.' };
    }
  } catch {
    return { success: false, error: 'Invalid state format' };
  }
  
  const workspaceId = stateData.workspaceId;
  
  // Exchange code for tokens
  try {
    const tokenResponse = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[QB OAuth] Token exchange failed:', errorText);
      return { success: false, error: 'Failed to complete QuickBooks authorization' };
    }
    
    const tokens = await tokenResponse.json();
    
    // Get company info from QuickBooks
    const companyResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Accept': 'application/json',
        },
      }
    );
    
    let companyName = null;
    if (companyResponse.ok) {
      const companyData = await companyResponse.json();
      companyName = companyData.CompanyInfo?.CompanyName;
    }
    
    // Store tokens securely in Supabase Vault
    const supabase = await createClient();
    const { error: storeError } = await supabase.rpc('set_quickbooks_tokens', {
      p_workspace_id: workspaceId,
      p_realm_id: realmId,
      p_company_name: companyName,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_in_seconds: tokens.expires_in,
    });
    
    if (storeError) {
      console.error('[QB OAuth] Failed to store tokens:', storeError);
      return { success: false, error: 'Failed to save QuickBooks connection' };
    }
    
    // Clear token cache
    clearTokenCache();
    
    return { success: true, companyName: companyName || 'QuickBooks Company' };
  } catch (error) {
    console.error('[QB OAuth] Error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Disconnects QuickBooks integration for a workspace
 */
export async function disconnectQuickBooks(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase.rpc('disconnect_quickbooks', {
    p_workspace_id: workspaceId,
  });
  
  if (error) {
    console.error('[QB] Disconnect failed:', error);
    return { success: false, error: 'Failed to disconnect QuickBooks' };
  }
  
  // Clear token cache
  clearTokenCache();
  
  return { success: true };
}

// ============================================================================
// Invoice Actions (Using existing finance.invoices)
// ============================================================================

/**
 * Creates a new invoice
 */
export async function createInvoice(
  _prevState: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string; invoice?: Invoice }> {
  const raw = Object.fromEntries(formData);
  const parsed = createInvoiceSchema.safeParse({
    ...raw,
    subtotalAmount: parseFloat(raw.subtotalAmount as string),
    taxAmount: raw.taxAmount ? parseFloat(raw.taxAmount as string) : 0,
  });
  
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  
  const supabase = await createClient();
  
  // Calculate total
  const totalAmount = parsed.data.subtotalAmount + (parsed.data.taxAmount || 0);
  
  const { data, error } = await supabase
    .schema('finance')
    .from('invoices')
    .insert({
      workspace_id: parsed.data.workspaceId,
      event_id: parsed.data.eventId,
      bill_to_id: parsed.data.billToId,
      subtotal_amount: parsed.data.subtotalAmount,
      tax_amount: parsed.data.taxAmount || 0,
      total_amount: totalAmount,
      invoice_type: parsed.data.invoiceType,
      due_date: parsed.data.dueDate?.toISOString().split('T')[0],
      status: 'draft',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Finance] Create invoice failed:', error);
    return { success: false, error: 'Failed to create invoice' };
  }
  
  return { success: true, invoice: transformInvoice(data) };
}

/**
 * Updates an existing invoice
 */
export async function updateInvoice(
  _prevState: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string; invoice?: Invoice }> {
  const raw = Object.fromEntries(formData);
  const parsed = updateInvoiceSchema.safeParse({
    ...raw,
    subtotalAmount: raw.subtotalAmount ? parseFloat(raw.subtotalAmount as string) : undefined,
    taxAmount: raw.taxAmount ? parseFloat(raw.taxAmount as string) : undefined,
  });
  
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  
  const supabase = await createClient();
  
  // Build update object
  const updateData: Record<string, unknown> = {};
  if (parsed.data.subtotalAmount !== undefined) {
    updateData.subtotal_amount = parsed.data.subtotalAmount;
  }
  if (parsed.data.taxAmount !== undefined) {
    updateData.tax_amount = parsed.data.taxAmount;
  }
  if (parsed.data.status) {
    updateData.status = parsed.data.status;
  }
  if (parsed.data.invoiceType) {
    updateData.invoice_type = parsed.data.invoiceType;
  }
  if (parsed.data.dueDate) {
    updateData.due_date = parsed.data.dueDate.toISOString().split('T')[0];
  }
  
  // Recalculate total if amounts changed
  if (parsed.data.subtotalAmount !== undefined || parsed.data.taxAmount !== undefined) {
    // Fetch current values to calculate new total
    const { data: current } = await supabase
      .schema('finance')
      .from('invoices')
      .select('subtotal_amount, tax_amount')
      .eq('id', parsed.data.id)
      .single();
    
    if (current) {
      const subtotal = parsed.data.subtotalAmount ?? parseFloat(current.subtotal_amount);
      const tax = parsed.data.taxAmount ?? parseFloat(current.tax_amount);
      updateData.total_amount = subtotal + tax;
    }
  }
  
  const { data, error } = await supabase
    .schema('finance')
    .from('invoices')
    .update(updateData)
    .eq('id', parsed.data.id)
    .select()
    .single();
  
  if (error) {
    console.error('[Finance] Update invoice failed:', error);
    return { success: false, error: 'Failed to update invoice' };
  }
  
  return { success: true, invoice: transformInvoice(data) };
}

/**
 * Records a payment allocation against an invoice
 */
export async function recordAllocation(
  _prevState: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string; allocation?: TransactionAllocation }> {
  const raw = Object.fromEntries(formData);
  const parsed = createAllocationSchema.safeParse({
    ...raw,
    amountAllocated: parseFloat(raw.amountAllocated as string),
  });
  
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .schema('finance')
    .from('transaction_allocations')
    .insert({
      workspace_id: parsed.data.workspaceId,
      transaction_id: parsed.data.transactionId,
      invoice_id: parsed.data.invoiceId,
      amount_allocated: parsed.data.amountAllocated,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Finance] Record allocation failed:', error);
    return { success: false, error: 'Failed to record allocation' };
  }
  
  return { success: true, allocation: transformAllocation(data) };
}

// ============================================================================
// Sync Actions
// ============================================================================

/**
 * Syncs an invoice to QuickBooks
 */
export async function syncInvoiceToQuickBooks(
  workspaceId: string,
  invoiceId: string
): Promise<SyncActionState> {
  const supabase = await createClient();
  
  // Fetch invoice with related data
  const { data: invoice, error: fetchError } = await supabase
    .schema('finance')
    .from('invoices')
    .select(`
      *,
      gigs(title),
      events(name),
      people:bill_to_id(display_name, email)
    `)
    .eq('id', invoiceId)
    .single();
  
  if (fetchError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }
  
  // Get or create customer in QuickBooks
  const clientName = invoice.people?.display_name || 'Unknown Client';
  const clientEmail = invoice.people?.email;
  let customerId: string;
  
  const { data: existingCustomers, error: searchError } = await qbClient.findCustomer(workspaceId, clientName);
  if (searchError) {
    return { success: false, error: searchError };
  }
  
  if (existingCustomers && existingCustomers.length > 0) {
    customerId = existingCustomers[0].Id;
  } else {
    const { data: newCustomer, error: createError } = await qbClient.createCustomer(
      workspaceId, 
      clientName, 
      clientEmail
    );
    if (createError || !newCustomer) {
      return { success: false, error: createError || 'Failed to create customer' };
    }
    customerId = newCustomer.Id;
  }
  
  // Create invoice in QuickBooks
  const { data: qbInvoice, error: qbError } = await qbClient.createInvoice(
    workspaceId,
    transformInvoice(invoice),
    customerId
  );
  
  if (qbError || !qbInvoice) {
    // Update sync status with error
    await supabase
      .schema('finance')
      .from('invoices')
      .update({
        quickbooks_sync_status: 'error',
        quickbooks_error: qbError,
      })
      .eq('id', invoiceId);
    
    return { success: false, error: qbError || 'Failed to create invoice in QuickBooks' };
  }
  
  // Update invoice with QuickBooks ID
  await supabase
    .schema('finance')
    .from('invoices')
    .update({
      quickbooks_invoice_id: qbInvoice.Id,
      quickbooks_sync_status: 'synced',
      quickbooks_last_synced_at: new Date().toISOString(),
      quickbooks_error: null,
    })
    .eq('id', invoiceId);
  
  return { success: true, syncedCount: 1 };
}

// ============================================================================
// Query Actions (for Server Components)
// ============================================================================

const EMPTY_DASHBOARD = {
  currentMonthRevenue: 0,
  previousMonthRevenue: 0,
  outstandingAmount: 0,
  outstandingCount: 0,
  monthlyTrend: [] as MonthlyRevenue[],
  outstandingInvoices: [] as OutstandingInvoice[],
  quickbooksConnection: null as { company_name: string | null; is_connected: boolean; last_sync_at: string | null } | null,
};

/**
 * Fetches dashboard data for the finance overview.
 * Returns zeros/empty when finance schema or views are missing.
 */
export async function getFinanceDashboardData(workspaceId: string) {
  try {
    const supabase = await createClient();

    // Get monthly revenue
    const { data: monthlyData } = await supabase
      .schema('finance')
      .from('monthly_revenue')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('month', { ascending: false })
      .limit(12);

    // Get outstanding invoices
    const { data: outstandingData } = await supabase
      .schema('finance')
      .from('outstanding_invoices')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('due_date', { ascending: true });

    // Get QuickBooks connection status
    const { data: qbConnection } = await supabase
      .schema('finance')
      .from('quickbooks_connections')
      .select('company_name, is_connected, last_sync_at')
      .eq('workspace_id', workspaceId)
      .single();

    const currentMonth = monthlyData?.[0];
    const previousMonth = monthlyData?.[1];

    return {
      currentMonthRevenue: parseFloat(currentMonth?.revenue) || 0,
      previousMonthRevenue: parseFloat(previousMonth?.revenue) || 0,
      outstandingAmount: parseFloat(currentMonth?.outstanding) || 0,
      outstandingCount: currentMonth?.pending_count ?? 0,
      monthlyTrend: (monthlyData || []).map(transformMonthlyRevenue),
      outstandingInvoices: (outstandingData || []).map(transformOutstandingInvoice),
      quickbooksConnection: qbConnection ?? null,
    };
  } catch (err) {
    console.warn('[Finance] getFinanceDashboardData failed (schema may not exist):', err);
    return EMPTY_DASHBOARD;
  }
}

/**
 * Gets QuickBooks connection status for a workspace
 */
export async function getQuickBooksConnection(workspaceId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .schema('finance')
    .from('quickbooks_connections')
    .select('id, company_name, is_connected, last_sync_at')
    .eq('workspace_id', workspaceId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return {
    id: data.id,
    companyName: data.company_name,
    isConnected: data.is_connected,
    lastSyncAt: data.last_sync_at ? new Date(data.last_sync_at) : null,
  };
}

// ============================================================================
// Transform Helpers
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
function transformInvoice(data: any): Invoice {
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    eventId: data.event_id,
    gigId: data.event_id ?? data.gig_id,
    billToId: data.bill_to_id,
    invoiceNumber: data.invoice_number,
    subtotalAmount: parseFloat(data.subtotal_amount),
    taxAmount: parseFloat(data.tax_amount || 0),
    totalAmount: parseFloat(data.total_amount),
    status: data.status,
    invoiceType: data.invoice_type,
    dueDate: data.due_date ? new Date(data.due_date) : null,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
    quickbooksInvoiceId: data.quickbooks_invoice_id,
    quickbooksSyncStatus: data.quickbooks_sync_status,
    quickbooksLastSyncedAt: data.quickbooks_last_synced_at ? new Date(data.quickbooks_last_synced_at) : null,
    quickbooksError: data.quickbooks_error,
  };
}

function transformOutstandingInvoice(data: any): OutstandingInvoice {
  return {
    ...transformInvoice(data),
    gigTitle: data.event_title ?? data.gig_title,
    eventName: data.event_name,
    billToName: data.bill_to_name,
    amountPaid: parseFloat(data.amount_paid || 0),
    balanceDue: parseFloat(data.balance_due),
    urgency: data.urgency,
  };
}

function transformMonthlyRevenue(data: any): MonthlyRevenue {
  return {
    workspaceId: data.workspace_id,
    month: new Date(data.month),
    revenue: parseFloat(data.revenue || 0),
    outstanding: parseFloat(data.outstanding || 0),
    paidCount: data.paid_count || 0,
    pendingCount: data.pending_count || 0,
    totalCount: data.total_count || 0,
  };
}

function transformAllocation(data: any): TransactionAllocation {
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    transactionId: data.transaction_id,
    invoiceId: data.invoice_id,
    amountAllocated: parseFloat(data.amount_allocated),
    createdAt: new Date(data.created_at),
  };
}
