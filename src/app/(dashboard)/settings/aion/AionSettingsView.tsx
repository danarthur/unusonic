'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { formatRelative } from 'date-fns';
import { Check, X, ShieldAlert } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { cn } from '@/shared/lib/utils';
import { CONSENT_TERMS } from '@/shared/lib/consent';
import { FeatureConsentModal } from '@/app/(dashboard)/(features)/aion/components/FeatureConsentModal';
import { CadenceLearningToggle } from '@/app/(dashboard)/(features)/aion/components/CadenceLearningToggle';
import type { WorkspaceFeatureState } from '@/app/(dashboard)/(features)/aion/actions/consent-actions';
import {
  disableAionCardBeta,
  revokeOwnConsent,
  requestAionCardAccess,
  reviewFeatureRequest,
} from '@/app/(dashboard)/(features)/aion/actions/consent-actions';

type PendingRequest = {
  id: string;
  requested_by: string;
  feature_key: string;
  requested_at: string;
  metadata: Record<string, unknown>;
  requester_name: string;
};

export function AionSettingsView({
  state,
  pendingRequests,
}: {
  state: WorkspaceFeatureState;
  pendingRequests: PendingRequest[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cardTerm = CONSENT_TERMS.aion_card_beta;
  const { cardConsent, cadenceConsent, cardFlagEnabled, cadenceOptIn, isAdmin } = state;

  const needsReconsent = cardConsent.requiresReconsent;
  const canToggleCadence = cardFlagEnabled && cardConsent.accepted && !needsReconsent;

  const handleDisable = () => {
    startTransition(async () => {
      const result = await disableAionCardBeta();
      if (!result.success) {
        toast.error(result.error ?? 'Could not disable.');
        return;
      }
      toast.success('Aion card beta turned off. Members notified.');
      // A full refresh is the cheapest way to re-hydrate server state.
      router.refresh();
    });
  };

  const handleRevokeCard = () => {
    startTransition(async () => {
      const result = await revokeOwnConsent('aion_card_beta');
      if (!result.success) {
        toast.error(result.error ?? 'Could not revoke consent.');
        return;
      }
      toast.success('Consent revoked.');
      router.refresh();
    });
  };

  const handleRequestAccess = () => {
    startTransition(async () => {
      const result = await requestAionCardAccess();
      if (!result.success) {
        toast.error(result.error ?? 'Could not submit request.');
        return;
      }
      toast.success(
        result.alreadyPending
          ? 'Your request is already pending review.'
          : 'Request sent. Your admin will review it.',
      );
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2.5">
          <AionMark size={24} status="idle" />
          <h1 className="text-2xl tracking-tight">Aion</h1>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          Manage the Aion deal card beta and how it learns from your team.
        </p>
      </header>

      {/* Re-consent banner */}
      {isAdmin && needsReconsent && (
        <StagePanel padding="md" stripe="warning" className="flex items-start gap-3">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm">
              The Aion card beta terms have been updated. Re-accept to keep using
              the card.
            </p>
            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={() => setModalOpen(true)}>
                Review updated terms
              </Button>
            </div>
          </div>
        </StagePanel>
      )}

      {/* Main card beta status */}
      <StagePanel padding="md" className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium">Aion deal card — beta</h2>
            <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">
              {cardFlagEnabled
                ? cardConsent.acceptedAt
                  ? `Enabled ${formatRelative(new Date(cardConsent.acceptedAt), new Date())}. Terms version ${cardConsent.acceptedVersion}.`
                  : 'Enabled.'
                : 'Not enabled.'}
            </p>
          </div>
          <StatusDot ok={cardFlagEnabled && !needsReconsent} />
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 pt-2">
            {!cardFlagEnabled && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setModalOpen(true)}
                disabled={isPending}
              >
                <Check />
                Review and turn on
              </Button>
            )}
            {cardFlagEnabled && !needsReconsent && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDisable}
                  disabled={isPending}
                >
                  <X />
                  Turn off
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRevokeCard}
                  disabled={isPending}
                >
                  Revoke my consent
                </Button>
              </>
            )}
          </div>
        )}

        {/* Member view */}
        {!isAdmin && !cardFlagEnabled && (
          <div className="pt-2 space-y-2">
            <p className="text-xs text-[var(--stage-text-secondary)]">
              Your admin hasn&rsquo;t enabled the Aion card beta for this workspace.
            </p>
            {state.ownPendingRequest ? (
              <p className="text-xs text-[var(--stage-text-secondary)]">
                Request pending since{' '}
                {formatRelative(new Date(state.ownPendingRequest.requested_at), new Date())}.
              </p>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRequestAccess}
                disabled={isPending}
              >
                Request access
              </Button>
            )}
          </div>
        )}
      </StagePanel>

      {/* Cadence learning */}
      {canToggleCadence && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Personalization</h3>
          <CadenceLearningToggle initialEnabled={cadenceOptIn} />
          {cadenceOptIn && cadenceConsent.acceptedAt && (
            <p className="text-xs text-[var(--stage-text-secondary)]">
              Consented {formatRelative(new Date(cadenceConsent.acceptedAt), new Date())}
              {' · '}terms version {cadenceConsent.acceptedVersion}.
            </p>
          )}
        </section>
      )}

      {/* Pending requests (admin only) */}
      {isAdmin && pendingRequests.length > 0 && (
        <StagePanel padding="md" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Pending requests ({pendingRequests.length})
            </h3>
            <span className="text-xs text-[var(--stage-text-secondary)]">
              Members asking to enable this beta
            </span>
          </div>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <PendingRequestRow key={req.id} req={req} />
            ))}
          </ul>
        </StagePanel>
      )}

      {/* Footer — term version */}
      <p className="text-xs text-[var(--stage-text-tertiary,var(--stage-text-secondary))]">
        Current terms version: {cardTerm.version}
      </p>

      <FeatureConsentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={needsReconsent ? 'reconsent' : 'first_run'}
        cadencePreviouslyAccepted={cadenceConsent.accepted}
      />
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 rounded-full mt-1.5 shrink-0',
        ok ? 'bg-[var(--color-unusonic-success,oklch(0.65_0.18_145))]' : 'bg-[var(--stage-edge-subtle)]',
      )}
    />
  );
}

function PendingRequestRow({ req }: { req: PendingRequest }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const review = (decision: 'approved' | 'denied') => {
    startTransition(async () => {
      const result = await reviewFeatureRequest(req.id, decision);
      if (!result.success) {
        toast.error(result.error ?? 'Could not update request.');
        return;
      }
      toast.success(decision === 'approved' ? 'Approved.' : 'Denied.');
      router.refresh();
    });
  };

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
        'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate">{req.requester_name}</p>
        <p className="text-xs text-[var(--stage-text-secondary)]">
          Requested {formatRelative(new Date(req.requested_at), new Date())}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => review('denied')}
          disabled={isPending}
        >
          Deny
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => review('approved')}
          disabled={isPending}
        >
          Approve
        </Button>
      </div>
    </li>
  );
}
