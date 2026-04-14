/**
 * Email transport core — shared helpers used by all sender modules.
 *
 * Reply-To pattern (no Gmail/OAuth): emails are sent via Resend from a verified
 * app address; reply_to is set to the current user's email so replies go to
 * their inbox. Ensure reply_to is always set from the authenticated user's
 * email when sending on their behalf.
 *
 * @module shared/api/email/core
 */

import 'server-only';
import { Resend } from 'resend';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalTheme, type PortalThemeConfig } from '@/shared/lib/portal-theme';
import { portalThemeToEmailPalette, type EmailPalette } from '@/shared/lib/email-palette';

/** Read at send-time so env is available when server actions run (not only at module load). */
export function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}

export function getFrom() {
  return process.env.EMAIL_FROM ?? 'Unusonic <onboarding@resend.dev>';
}

export const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Extract the email address from "Name <email@domain.com>" or return the string as-is. */
export function fromEmailPart(fromStr: string): string {
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].trim() : fromStr;
}

/**
 * Resolve the portal theme for a workspace as a hex email palette.
 * Returns null on failure — callers fall back to DEFAULT_EMAIL_PALETTE via template defaults.
 */
export async function resolveWorkspaceEmailPalette(workspaceId: string): Promise<EmailPalette | null> {
  try {
    const supabase = await createClient();
    const { data: ws } = await supabase
      .from('workspaces')
      .select('portal_theme_preset, portal_theme_config')
      .eq('id', workspaceId)
      .maybeSingle();
    if (!ws) return null;
    const preset = (ws as { portal_theme_preset?: string | null }).portal_theme_preset ?? null;
    const config = (ws as { portal_theme_config?: PortalThemeConfig | null }).portal_theme_config ?? null;
    const { tokens } = resolvePortalTheme(preset, config);
    return portalThemeToEmailPalette(tokens);
  } catch {
    return null;
  }
}

/**
 * Resolve the From address for a workspace-branded email.
 * If the workspace has a verified custom sending domain, uses it.
 * Otherwise falls back to the global EMAIL_FROM.
 *
 * Only call this for proposal emails. Never call for auth emails.
 */
export async function getWorkspaceFrom(
  workspaceId: string,
  senderName?: string | null,
): Promise<string> {
  if (!workspaceId) {
    throw new Error('getWorkspaceFrom: workspaceId is required. Auth emails must call getFrom() instead.');
  }
  try {
    const supabase = await createClient();
    const { data: ws } = await supabase
      .from('workspaces')
      .select('sending_domain, sending_domain_status, sending_from_name, sending_from_localpart')
      .eq('id', workspaceId)
      .maybeSingle();

    if (ws?.sending_domain_status === 'verified' && ws.sending_domain) {
      const localpart = ws.sending_from_localpart ?? 'hello';
      const displayName =
        senderName?.trim() || ws.sending_from_name?.trim() || 'Unusonic';
      return `${displayName} <${localpart}@${ws.sending_domain}>`;
    }
  } catch {
    // Fall through to global default
  }
  return getFrom();
}
