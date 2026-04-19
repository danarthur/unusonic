'use client';

/**
 * Claim card — the invite surface at `/claim/[token]`.
 *
 * Renders the workspace / inviter / role trio and lets the user accept the
 * invite. Two flows:
 *
 *   1. Authenticated — call `acceptEmployeeInvite` (or `claimOrganization`
 *      for org-owner invites) and redirect on success.
 *   2. Unauthenticated — send a magic link to the invited email, land back
 *      here in a fresh session, then the parent page re-renders with
 *      `isAuthenticated === true`.
 *
 * Design spec: `docs/reference/login-redesign-design.md` §5.
 * Conformance: Stage Engineering — `stage-panel padding="lg"`, `stage-btn`,
 * `strokeWidth={1.5}`, weight-based springs, no legacy glass,
 * no tertiary-on-readable, no raw `ring-*` focus.
 *
 * @module features/network/ui/ClaimView
 */

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, ArrowRight, Mail, AlertCircle } from 'lucide-react';
import { claimOrganization } from '@/features/onboarding/api/actions';
import { acceptEmployeeInvite } from '@/features/team-invite/api/actions';
import { sendMagicLinkAction } from '@/features/auth/smart-login/api/actions';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { getDeviceCopy } from '@/shared/lib/auth/device-copy';
import { STAGE_HEAVY, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { DeviceCapability, InvitationSummary } from '@/entities/auth/model/types';

interface ClaimViewProps {
  token: string;
  summary: InvitationSummary;
  isAuthenticated: boolean;
  isEmployeeInvite: boolean;
  userEmail: string | null;
  deviceCapability: DeviceCapability;
}

export function ClaimView({
  token,
  summary,
  isAuthenticated,
  isEmployeeInvite,
  userEmail,
  deviceCapability,
}: ClaimViewProps) {
  const copy = getDeviceCopy(deviceCapability);

  const emailMismatch = !!(
    isAuthenticated &&
    userEmail &&
    userEmail.toLowerCase() !== summary.email.toLowerCase()
  );

  const [isAccepting, setIsAccepting] = React.useState(false);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [acceptedSuccess, setAcceptedSuccess] = React.useState(false);

  const [isSendingLink, setIsSendingLink] = React.useState(false);
  const [linkSent, setLinkSent] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const handleAcceptAuthed = React.useCallback(async () => {
    setIsAccepting(true);
    setAcceptError(null);
    try {
      if (isEmployeeInvite) {
        const result = await acceptEmployeeInvite(token);
        if (result.ok) {
          setAcceptedSuccess(true);
        } else {
          setAcceptError(result.error);
        }
      } else {
        const formData = new FormData();
        formData.set('token', token);
        const result = await claimOrganization(null, formData);
        if (result.ok) {
          setAcceptedSuccess(true);
        } else {
          setAcceptError(result.error);
        }
      }
    } finally {
      setIsAccepting(false);
    }
  }, [token, isEmployeeInvite]);

  const handleSendMagicLink = React.useCallback(async () => {
    setIsSendingLink(true);
    setLinkError(null);
    try {
      // Personalization behind the tokenized boundary is allowed —
      // `/claim/[token]` is a redemption URL the user already passed a
      // mailbox-possession gate to reach. The bare-email `/login` surface
      // is where enumeration guards apply.
      const result = await sendMagicLinkAction(summary.email);
      if (result.ok) {
        setLinkSent(true);
      } else {
        setLinkError(result.error);
      }
    } finally {
      setIsSendingLink(false);
    }
  }, [summary.email]);

  // ─── Email-mismatch state ────────────────────────────────────────────────
  if (emailMismatch) {
    return (
      <CardShell>
        <Logo />
        <div className="mt-6 flex justify-center">
          <div
            className="flex size-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
              borderWidth: '1px',
              borderColor: 'color-mix(in oklch, var(--color-unusonic-warning) 24%, transparent)',
            }}
          >
            <AlertCircle
              className="size-7 text-[var(--color-unusonic-warning)]"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
        </div>
        <h1 className="mt-5 text-center text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Wrong account
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--stage-text-secondary)]">
          This invite was sent to{' '}
          <span className="font-medium text-[var(--stage-text-primary)]">{summary.email}</span>.
          You are signed in as{' '}
          <span className="font-medium text-[var(--stage-text-primary)]">{userEmail}</span>.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a href={`/signout?next=${encodeURIComponent(`/claim/${token}`)}`} className="stage-btn stage-btn-primary w-full">
            Sign out and try again
          </a>
        </div>
      </CardShell>
    );
  }

  // ─── Success state ───────────────────────────────────────────────────────
  if (acceptedSuccess) {
    return (
      <CardShell>
        <Logo />
        <div className="mt-6 flex justify-center">
          <CheckCircle2
            className="size-10 text-[var(--color-unusonic-success)]"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
        <h1 className="mt-5 text-center text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          You&apos;re all set
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--stage-text-secondary)]">
          {isEmployeeInvite ? (
            <>
              You&apos;ve joined{' '}
              <span className="font-medium text-[var(--stage-text-primary)]">
                {summary.workspaceName}
              </span>.
            </>
          ) : (
            <>
              You now manage{' '}
              <span className="font-medium text-[var(--stage-text-primary)]">
                {summary.workspaceName}
              </span>.
            </>
          )}
        </p>
        <Link
          href={isEmployeeInvite ? '/' : '/'}
          className="stage-btn stage-btn-primary mt-6 w-full"
        >
          Continue
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </CardShell>
    );
  }

  // ─── Magic-link-sent state ───────────────────────────────────────────────
  if (linkSent) {
    return (
      <CardShell>
        <Logo />
        <div className="mt-6 flex justify-center">
          <Mail
            className="size-10 text-[var(--stage-text-primary)]"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
        <h1 className="mt-5 text-center text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Check your email
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--stage-text-secondary)]">
          We sent a sign-in link to{' '}
          <span className="font-medium text-[var(--stage-text-primary)]">
            {summary.email}
          </span>
          . Open it on this device — the link is good for 60 minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            setLinkSent(false);
            setLinkError(null);
          }}
          className="stage-btn stage-btn-ghost mt-6 w-full"
        >
          Back
        </button>
      </CardShell>
    );
  }

  // ─── Primary state — accept the invite ───────────────────────────────────
  return (
    <CardShell>
      <WorkspaceLogo summary={summary} />

      <h1 className="mt-6 text-center text-[length:22px] leading-tight font-medium tracking-tight text-[var(--stage-text-primary)]">
        <span className="font-semibold">{summary.inviterDisplayName}</span>{' '}
        invited you to{' '}
        <span className="font-semibold">{summary.workspaceName}</span>
      </h1>
      <p className="mt-3 text-center text-sm text-[var(--stage-text-secondary)]">
        as {summary.role.label}
      </p>

      <AnimatePresence>
        {acceptError ? (
          <motion.div
            key="accept-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_HEAVY}
            className="overflow-hidden"
          >
            <div className="stage-panel-nested stage-stripe-error mt-5 p-3">
              <p role="alert" className="text-sm text-[var(--stage-text-primary)]">
                {acceptError}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {linkError ? (
          <motion.div
            key="link-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_HEAVY}
            className="overflow-hidden"
          >
            <div className="stage-panel-nested stage-stripe-error mt-5 p-3">
              <p role="alert" className="text-sm text-[var(--stage-text-primary)]">
                {linkError}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {isAuthenticated ? (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAcceptAuthed}
            disabled={isAccepting || isSendingLink}
            className="stage-btn stage-btn-primary w-full"
            data-testid="claim-accept"
          >
            {isAccepting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                Accepting…
              </>
            ) : (
              <>
                Accept invite
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSendMagicLink}
            disabled={isSendingLink}
            className="stage-btn stage-btn-primary w-full"
            data-testid="claim-primary-cta"
          >
            {isSendingLink ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                Sending link…
              </>
            ) : (
              <>
                {copy.claimPrimaryCta}
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleSendMagicLink}
            disabled={isSendingLink}
            className="stage-btn stage-btn-ghost w-full"
            data-testid="claim-magic-link"
          >
            Accept and use magic link
          </button>
        </div>
      )}

      <p className="mt-5 text-center text-sm text-[var(--stage-text-secondary)]">
        <span className="font-medium text-[var(--stage-text-primary)]">{summary.email}</span>
      </p>
    </CardShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

/**
 * Card shell — `stage-panel` with responsive padding resolved via the
 * `--stage-padding` token. Entrance animation uses `STAGE_HEAVY` per the
 * motion-system spec for full-panel transitions.
 */
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={STAGE_HEAVY}
      className="stage-panel w-full max-w-md p-[var(--stage-padding)]"
      data-surface="surface"
    >
      {children}
    </motion.div>
  );
}

/** Unusonic living mark in idle state — used in success / sent / mismatch states. */
function Logo() {
  return (
    <div className="mx-auto flex items-center justify-center">
      <LivingLogo size="md" status="idle" />
    </div>
  );
}

/**
 * Workspace logo in a rounded tile — falls back to the Unusonic Phase Mark
 * when no avatar is on file. Sized to anchor the hero line below it.
 */
function WorkspaceLogo({ summary }: { summary: InvitationSummary }) {
  if (summary.workspaceLogoUrl) {
    return (
      <motion.div
        layout
        transition={STAGE_MEDIUM}
        className="mx-auto flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- workspace avatar URLs are remote and may not be whitelisted in next/image config; this is a pre-auth tokenized page */}
        <img
          src={summary.workspaceLogoUrl}
          alt=""
          className="size-full object-contain"
          aria-hidden
        />
      </motion.div>
    );
  }
  return (
    <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]">
      <LivingLogo size="md" status="idle" />
    </div>
  );
}
