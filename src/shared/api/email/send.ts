/**
 * Courier — transactional email public API.
 *
 * Server-only. Uses Resend via the Reply-To pattern: emails are sent from a
 * verified app address; reply_to is set to the current user's email so replies
 * go to their inbox. Never use Gmail API / OAuth.
 *
 * Auth emails always use the global EMAIL_FROM (spoof risk to workspace-brand
 * them). Proposal + billing-reminder emails are workspace-aware and use a
 * verified custom sending domain when configured.
 *
 * This file is the public API — all callers import from '@/shared/api/email/send'.
 * Implementations live in ./senders/ and ./core.ts.
 *
 * @module shared/api/email/send
 */

import 'server-only';

// Core — only getWorkspaceFrom is called directly by non-send.ts callers.
export { getWorkspaceFrom } from './core';

// Auth + invite emails (global EMAIL_FROM, never workspace-branded).
export {
  sendSummonEmail,
  sendGuardianInviteEmail,
  sendRecoveryVetoEmail,
  sendEmployeeInviteEmail,
  sendMagicLinkEmail,
  sendMagicLinkSignIn,
  sendOtpEmail,
  sendPasskeyResetEmail,
  sendGhostClaimEmail,
  sendUnknownEmailSignupEmail,
} from './senders/auth';

// Proposal emails (workspace-branded).
export {
  buildProposalSubjectLine,
  sendProposalLinkEmail,
  sendProposalAcceptedEmail,
  sendProposalReminderEmail,
  sendProposalSignedNotificationEmail,
  type SendProposalLinkSenderOptions,
} from './senders/proposal';

// Billing emails.
export { sendTrialEndingEmail, sendPaymentReminderEmail } from './senders/billing';
