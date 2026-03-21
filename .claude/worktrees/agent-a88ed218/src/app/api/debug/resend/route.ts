/**
 * Diagnostic: whether RESEND_API_KEY is visible to the server.
 * GET /api/debug/resend — open in browser or curl. Remove or protect in production.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.RESEND_API_KEY;
  const configured = !!key?.trim();
  const cwd = process.cwd();
  return NextResponse.json({
    configured,
    cwd,
    hint: configured
      ? 'RESEND_API_KEY is set. If send still fails, check Resend dashboard and from address.'
      : `RESEND_API_KEY is missing. Next.js loads .env.local from the folder above (cwd). Put .env.local in that folder with a single line: RESEND_API_KEY=re_xxxx (no quotes, no spaces). Restart dev server.`,
  });
}
