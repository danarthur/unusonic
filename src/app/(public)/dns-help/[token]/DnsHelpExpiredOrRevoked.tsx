/**
 * Terminal page state — link is expired or revoked. No retry action.
 */

import { AlertCircle } from 'lucide-react';

export function DnsHelpExpiredOrRevoked({ kind }: { kind: 'expired' | 'revoked' }) {
  const title = kind === 'expired' ? 'This link expired' : 'This link was revoked';
  const body =
    kind === 'expired'
      ? 'Setup links are good for 30 days. Ask the person who sent it to send a new one.'
      : 'The owner of this domain invalidated this link. Ask them for an updated one.';

  return (
    <div className="min-h-dvh bg-[oklch(0.12_0_0)] flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-md">
        <p className="text-xs font-medium tracking-[0.12em] uppercase text-[oklch(1_0_0)]/30 mb-8">
          Unusonic
        </p>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.10)]">
          <AlertCircle size={26} className="text-[oklch(1_0_0)]/45" />
        </div>
        <h1 className="text-lg font-medium tracking-tight text-[oklch(1_0_0)]/85 mb-2">{title}</h1>
        <p className="text-sm text-[oklch(1_0_0)]/55 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
