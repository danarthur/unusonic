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
          className="text-field-label text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors flex items-center justify-center gap-1 mx-auto"
        >
          {showTechnical ? 'Hide technical details' : 'See what went wrong'}
          <ChevronDown
            className="w-3 h-3 transition-transform"
            strokeWidth={1.5}
            style={{ transform: showTechnical ? 'rotate(180deg)' : undefined }}
          />
        </button>
      )}
      {showToggle && showTechnical && (
        <p className="text-field-label text-[var(--stage-text-secondary)] font-mono break-all text-left px-2 py-1.5 rounded-lg bg-[var(--ctx-card)]">
          {display.technical}
        </p>
      )}
    </div>
  );
}
