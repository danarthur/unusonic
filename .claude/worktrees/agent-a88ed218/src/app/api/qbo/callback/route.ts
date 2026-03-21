/**
 * QBO OAuth callback. Receives code, state, realmId; exchanges and redirects.
 */

import { NextRequest } from 'next/server';
import { exchangeCode } from '@/features/auth/qbo-connect/api/actions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const realmId = searchParams.get('realmId');
  const errorParam = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectBase = `${base}/settings`;

  if (errorParam) {
    return Response.redirect(`${redirectBase}?error=qbo_auth_failed`);
  }

  if (!code || !state || !realmId) {
    return Response.redirect(`${redirectBase}?error=qbo_auth_failed`);
  }

  const result = await exchangeCode(code, realmId, state);

  if (result.success) {
    return Response.redirect(`${redirectBase}?success=true`);
  }

  return Response.redirect(`${redirectBase}?error=qbo_auth_failed`);
}
