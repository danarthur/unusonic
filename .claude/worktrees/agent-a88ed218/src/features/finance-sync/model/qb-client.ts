/**
 * QuickBooks Online API Client
 * Singleton client that fetches decrypted tokens from Supabase Vault
 * Uses workspace_id scoping to match existing schema
 * @module features/finance-sync/model/qb-client
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { QuickBooksTokens, Invoice } from './types';

// ============================================================================
// Configuration
// ============================================================================

const QB_BASE_URL = process.env.QUICKBOOKS_API_BASE_URL || 'https://quickbooks.api.intuit.com';
const QB_MINOR_VERSION = '65'; // QuickBooks API minor version

// ============================================================================
// Token Management (Workspace-scoped)
// ============================================================================

interface TokenCache {
  tokens: QuickBooksTokens | null;
  workspaceId: string | null;
  fetchedAt: number;
}

// In-memory cache with 5-minute TTL
let tokenCache: TokenCache = { tokens: null, workspaceId: null, fetchedAt: 0 };
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches decrypted QuickBooks tokens from Supabase Vault for a workspace
 * Uses caching to minimize database calls
 */
async function getTokens(workspaceId: string): Promise<QuickBooksTokens | null> {
  const now = Date.now();
  
  // Return cached tokens if still valid and for same workspace
  if (
    tokenCache.tokens && 
    tokenCache.workspaceId === workspaceId &&
    (now - tokenCache.fetchedAt) < TOKEN_CACHE_TTL
  ) {
    // Check if tokens are expired
    if (tokenCache.tokens.isExpired) {
      const refreshed = await refreshTokens(workspaceId);
      if (refreshed) {
        return refreshed;
      }
    }
    return tokenCache.tokens;
  }
  
  const supabase = await createClient();
  
  // Call the Vault RPC function to get decrypted tokens
  const { data, error } = await supabase.rpc('get_quickbooks_tokens', {
    p_workspace_id: workspaceId,
  });
  
  if (error) {
    console.error('[QB Client] Failed to fetch tokens:', error);
    return null;
  }
  
  if (!data || data.length === 0) {
    return null;
  }
  
  const row = data[0];
  const tokens: QuickBooksTokens = {
    realmId: row.realm_id,
    companyName: row.company_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: new Date(row.token_expires_at),
    isExpired: row.is_expired,
  };
  
  // Update cache
  tokenCache = { tokens, workspaceId, fetchedAt: now };
  
  return tokens;
}

/**
 * Refreshes expired tokens using the refresh token
 */
async function refreshTokens(workspaceId: string): Promise<QuickBooksTokens | null> {
  const cached = tokenCache.tokens;
  if (!cached?.refreshToken || tokenCache.workspaceId !== workspaceId) return null;
  
  try {
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: cached.refreshToken,
      }),
    });
    
    if (!response.ok) {
      console.error('[QB Client] Token refresh failed:', await response.text());
      return null;
    }
    
    const data = await response.json();
    
    // Store new tokens in Vault
    const supabase = await createClient();
    await supabase.rpc('set_quickbooks_tokens', {
      p_workspace_id: workspaceId,
      p_realm_id: cached.realmId,
      p_company_name: cached.companyName,
      p_access_token: data.access_token,
      p_refresh_token: data.refresh_token,
      p_expires_in_seconds: data.expires_in,
    });
    
    // Clear cache to force refresh
    tokenCache = { tokens: null, workspaceId: null, fetchedAt: 0 };
    
    // Fetch fresh tokens
    return getTokens(workspaceId);
  } catch (error) {
    console.error('[QB Client] Token refresh error:', error);
    return null;
  }
}

/**
 * Clears the token cache (call when workspace context changes)
 */
export function clearTokenCache(): void {
  tokenCache = { tokens: null, workspaceId: null, fetchedAt: 0 };
}

// ============================================================================
// QuickBooks API Client
// ============================================================================

class QuickBooksClient {
  private static instance: QuickBooksClient;
  
  private constructor() {}
  
  static getInstance(): QuickBooksClient {
    if (!QuickBooksClient.instance) {
      QuickBooksClient.instance = new QuickBooksClient();
    }
    return QuickBooksClient.instance;
  }
  
  /**
   * Makes an authenticated request to the QuickBooks API
   */
  private async request<T>(
    workspaceId: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string }> {
    const tokens = await getTokens(workspaceId);
    
    if (!tokens) {
      return { error: 'QuickBooks not connected. Please connect your account.' };
    }
    
    if (tokens.isExpired) {
      const refreshed = await refreshTokens(workspaceId);
      if (!refreshed) {
        return { error: 'QuickBooks session expired. Please reconnect.' };
      }
    }
    
    const currentTokens = tokenCache.tokens!;
    const url = `${QB_BASE_URL}/v3/company/${currentTokens.realmId}${endpoint}?minorversion=${QB_MINOR_VERSION}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${currentTokens.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[QB Client] API error:', response.status, errorText);
        
        if (response.status === 401) {
          // Token might be invalid, try refresh
          await refreshTokens(workspaceId);
          return { error: 'Authentication failed. Please try again.' };
        }
        
        return { error: `QuickBooks API error: ${response.status}` };
      }
      
      const data = await response.json();
      return { data };
    } catch (error) {
      console.error('[QB Client] Request failed:', error);
      return { error: 'Failed to communicate with QuickBooks' };
    }
  }
  
  /**
   * Check if QuickBooks is connected for a workspace
   */
  async isConnected(workspaceId: string): Promise<boolean> {
    const tokens = await getTokens(workspaceId);
    return tokens !== null && !tokens.isExpired;
  }
  
  /**
   * Get company info for a workspace
   */
  async getCompanyInfo(workspaceId: string): Promise<{ data?: { companyName: string; realmId: string }; error?: string }> {
    const tokens = await getTokens(workspaceId);
    if (!tokens) {
      return { error: 'Not connected to QuickBooks' };
    }
    
    return {
      data: {
        companyName: tokens.companyName || 'Unknown Company',
        realmId: tokens.realmId,
      },
    };
  }
  
  /**
   * Create an invoice in QuickBooks
   * Uses existing invoice.id UUID from finance.invoices
   */
  async createInvoice(
    workspaceId: string,
    invoice: Invoice, 
    customerRef: string
  ): Promise<{ data?: { Id: string }; error?: string }> {
    const qbInvoice = {
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          Amount: invoice.totalAmount,
          Description: `Invoice ${invoice.invoiceNumber}`,
          SalesItemLineDetail: {
            ItemRef: { value: '1' }, // Default service item
          },
        },
      ],
      CustomerRef: { value: customerRef },
      DocNumber: invoice.invoiceNumber,
      TxnDate: invoice.createdAt.toISOString().split('T')[0],
      DueDate: invoice.dueDate?.toISOString().split('T')[0],
      // Store our internal UUID as a private note for reference
      PrivateNote: `Signal Invoice ID: ${invoice.id}`,
    };
    
    return this.request<{ Invoice: { Id: string } }>(workspaceId, '/invoice', {
      method: 'POST',
      body: JSON.stringify(qbInvoice),
    }).then(({ data, error }) => {
      if (error) return { error };
      return { data: { Id: data!.Invoice.Id } };
    });
  }
  
  /**
   * Query customers by name
   */
  async findCustomer(
    workspaceId: string,
    displayName: string
  ): Promise<{ data?: { Id: string; DisplayName: string }[]; error?: string }> {
    const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName LIKE '%${displayName}%'`);
    return this.request<{ QueryResponse: { Customer?: { Id: string; DisplayName: string }[] } }>(
      workspaceId,
      `/query?query=${query}`
    ).then(({ data, error }) => {
      if (error) return { error };
      return { data: data?.QueryResponse.Customer || [] };
    });
  }
  
  /**
   * Create a customer in QuickBooks
   */
  async createCustomer(
    workspaceId: string,
    displayName: string, 
    email?: string
  ): Promise<{ data?: { Id: string }; error?: string }> {
    const customer = {
      DisplayName: displayName,
      PrimaryEmailAddr: email ? { Address: email } : undefined,
    };
    
    return this.request<{ Customer: { Id: string } }>(workspaceId, '/customer', {
      method: 'POST',
      body: JSON.stringify(customer),
    }).then(({ data, error }) => {
      if (error) return { error };
      return { data: { Id: data!.Customer.Id } };
    });
  }
  
  /**
   * Record a payment in QuickBooks
   */
  async createPayment(
    workspaceId: string,
    invoiceQbId: string,
    amount: number,
    paymentDate: Date
  ): Promise<{ data?: { Id: string }; error?: string }> {
    const payment = {
      TotalAmt: amount,
      TxnDate: paymentDate.toISOString().split('T')[0],
      Line: [
        {
          Amount: amount,
          LinkedTxn: [
            {
              TxnId: invoiceQbId,
              TxnType: 'Invoice',
            },
          ],
        },
      ],
    };
    
    return this.request<{ Payment: { Id: string } }>(workspaceId, '/payment', {
      method: 'POST',
      body: JSON.stringify(payment),
    }).then(({ data, error }) => {
      if (error) return { error };
      return { data: { Id: data!.Payment.Id } };
    });
  }
  
  /**
   * Get invoice by QuickBooks ID
   */
  async getInvoice(
    workspaceId: string,
    qbInvoiceId: string
  ): Promise<{ data?: { Id: string; Balance: number; TotalAmt: number }; error?: string }> {
    return this.request<{ Invoice: { Id: string; Balance: number; TotalAmt: number } }>(
      workspaceId,
      `/invoice/${qbInvoiceId}`
    ).then(({ data, error }) => {
      if (error) return { error };
      return { data: data!.Invoice };
    });
  }
}

// Export singleton instance
export const qbClient = QuickBooksClient.getInstance();
