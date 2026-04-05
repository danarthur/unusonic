import { NextRequest, NextResponse } from 'next/server';

/**
 * .well-known/passkey-endpoints
 * Enables credential managers (1Password, iCloud Keychain, Bitwarden) to link
 * directly to Unusonic's passkey management page from within their UI.
 * @see https://developer.apple.com/documentation/authenticationservices/supporting-passkeys
 */
export function GET(request: NextRequest) {
  const origin = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://unusonic.com';
  return NextResponse.json({
    enroll: `${origin}/settings/security`,
    manage: `${origin}/settings/security`,
  });
}
