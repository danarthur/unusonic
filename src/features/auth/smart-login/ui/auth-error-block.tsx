/**
 * Auth error display with optional "See technical details" toggle.
 * Shared between SignInCard and SignUpFlow.
 * @module features/auth/smart-login/ui/auth-error-block
 */

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAuthErrorDisplay, shouldShowTechnicalDetails } from '../lib/auth-error-message';

export function AuthErrorBlock({ error }: { error: string }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const display = getAuthErrorDisplay(error);
  const showToggle = shouldShowTechnicalDetails(display);

  return (
    <div className="space-y-2">
      <p className="text-sm text-unusonic-error text-center">{display.friendly}</p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setShowTechnical((s) => !s)}
          aria-expanded={showTechnical}
          className="text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors flex items-center justify-center gap-1 mx-auto"
        >
          {showTechnical ? 'Hide technical details' : 'See what went wrong'}
          <ChevronDown
            className="w-3 h-3 transition-transform"
            style={{ transform: showTechnical ? 'rotate(180deg)' : undefined }}
          />
        </button>
      )}
      {showToggle && showTechnical && (
        <p className="text-[11px] text-[var(--stage-text-secondary)] font-mono break-all text-left px-2 py-1.5 rounded-lg bg-[oklch(1_0_0_/_0.10)]">
          {display.technical}
        </p>
      )}
    </div>
  );
}
