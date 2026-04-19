/**
 * Guardian deferral warning — full-screen confirmation the owner sees when
 * they click "I'll set this up later" on the non-skippable guardian setup
 * gate (§3 of the Phase 5 spec).
 *
 * Frankness-over-politeness copy. This is the one place in the product where
 * raised urgency is earned — Unusonic's sovereign-identity model means there
 * is no central password reset and no Supabase-support back channel. Without
 * guardians, a lost device is a permanent lockout for owners.
 *
 * ### Non-skippable discipline
 *
 *   - ESC does **not** dismiss. Keyboard escape would defeat the gate.
 *   - Backdrop click does **not** dismiss. Same reason.
 *   - The only exits are "Go back" (cancel) and "Skip anyway" (explicit
 *     deferral, logs through `recordGuardianDeferral`).
 *
 * ### Stacking context
 *
 * Rendered via `createPortal` to `document.body` to escape any stacking
 * context owned by the onboarding shell. The shell uses
 * `viewTransitionName` + a `grain-overlay`, and past CLAUDE.md lore calls
 * out that `backdrop-filter` / view-transitions create stacking contexts
 * that swallow `fixed inset-0` children. Portal-ing sidesteps that.
 *
 * @module features/onboarding/ui/guardian-deferral-warning
 */

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, Loader2 } from 'lucide-react';
import {
  STAGE_HEAVY,
  M3_EASING_ENTER,
  M3_EASING_EXIT,
} from '@/shared/lib/motion-constants';

interface GuardianDeferralWarningProps {
  /** True renders the modal. False hides it (AnimatePresence handles exit). */
  open: boolean;
  /** Pending state for the "Skip anyway" call — disables both buttons + shows spinner. */
  submitting?: boolean;
  /** Called when the owner clicks "Go back" — closes the modal. */
  onCancel: () => void;
  /** Called when the owner clicks "Skip anyway". */
  onConfirmSkip: () => void;
}

/**
 * Modal variant of the deferral warning. Stateless otherwise — the wizard
 * owns the decision + the submitting flag.
 *
 * Focus is moved to the "Go back" button on open (safer default than the
 * destructive "Skip anyway"). Focus return is handled by the parent's own
 * focus management, not this component.
 */
export function GuardianDeferralWarning({
  open,
  submitting = false,
  onCancel,
  onConfirmSkip,
}: GuardianDeferralWarningProps) {
  // Lazy initializer keeps the SSR guard intact without a setState-in-effect
  // cascade — the value is resolved once during mount and never changes.
  const [portalTarget] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.body : null,
  );

  // Hard block of any keyboard shortcut that could close the modal — ESC,
  // backspace while not focused on an input, etc. ESC is the only key the
  // browser might map to "dismiss", so we preventDefault it explicitly.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    // `capture: true` so we beat any library-level shortcut handler that
    // might try to interpret Escape as a dismiss.
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [open]);

  // Trap scroll on the page while the warning is open — tiny UX polish that
  // stops the onboarding shell from scrolling behind the modal on small
  // viewports.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="guardian-deferral-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: M3_EASING_EXIT }}
          // inert-to-backdrop-click: the scrim itself swallows clicks but does
          // NOT call onCancel, so tapping outside is a no-op. We intentionally
          // do NOT set aria-hidden on the scrim — that would hide the nested
          // alertdialog from the accessibility tree.
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[oklch(0_0_0_/_0.82)]"
          role="presentation"
        >
          <motion.div
            key="guardian-deferral-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="guardian-deferral-title"
            aria-describedby="guardian-deferral-body"
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ ...STAGE_HEAVY, ease: M3_EASING_ENTER }}
            // Clicks inside the card bubble to here, not the scrim. Opposite
            // of the typical pattern — we don't call onCancel on scrim click,
            // so this guard is defensive in case a future refactor adds one.
            onClick={(e) => e.stopPropagation()}
            className="stage-panel relative mx-4 w-full max-w-lg rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.14)] bg-[var(--stage-surface)] p-8"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert
                className="h-6 w-6 text-[var(--color-unusonic-warning)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <h2
                id="guardian-deferral-title"
                className="text-lg font-medium text-[var(--stage-text-primary)]"
              >
                If you lose your device, we can&rsquo;t help you recover.
              </h2>
            </div>
            <div
              id="guardian-deferral-body"
              className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--stage-text-secondary)]"
            >
              <p>
                Unusonic gives you sovereign control of your identity. There&rsquo;s no
                central password reset, and no support team with a back door into your
                account.
              </p>
              <p>
                Without guardians, a lost phone or laptop is a permanent lockout. Your
                workspace, your deals, your people &mdash; gone, with no way back in.
              </p>
              <p className="text-[var(--stage-text-primary)]/75">
                Crew and employees have a separate safety net: you can reset their
                sign-in from the members page. You are your own workspace&rsquo;s safety
                net.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                autoFocus
                className="stage-btn stage-btn-primary px-5"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={onConfirmSkip}
                disabled={submitting}
                className="stage-btn stage-btn-ghost px-5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                    Skipping&hellip;
                  </>
                ) : (
                  'Skip anyway'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    portalTarget,
  );
}
