/**
 * QuickBooks OAuth Callback Route
 * Handles the OAuth redirect from QuickBooks authorization
 * @module app/api/finance/quickbooks/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleQuickBooksCallback } from '@/features/finance-sync';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const params = {
    code: searchParams.get('code') || undefined,
    realmId: searchParams.get('realmId') || undefined,
    state: searchParams.get('state') || undefined,
    error: searchParams.get('error') || undefined,
  };
  
  const result = await handleQuickBooksCallback(params);
  
  // Build redirect URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUrl = new URL('/finance', baseUrl);
  
  if (result.success) {
    redirectUrl.searchParams.set('qb_connected', 'true');
    if (result.companyName) {
      redirectUrl.searchParams.set('company', result.companyName);
    }
  } else {
    redirectUrl.searchParams.set('qb_error', result.error || 'Connection failed');
  }
  
  return NextResponse.redirect(redirectUrl);
}
