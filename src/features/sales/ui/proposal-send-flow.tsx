'use client';

import React from 'react';
import { Plus, Mail, Send } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ProposalContact } from './proposal-builder';

export interface ProposalSendFlowProps {
  contacts: ProposalContact[];
  signingEmail: string;
  signingName: string;
  selectedSignerContactId: string | null;
  showCustomEmailForm: boolean;
  sending: boolean;
  isPending: boolean;
  clientAttached: boolean;
  lineItemCount: number;
  onSelectContact: (contactId: string, name: string, email: string) => void;
  onDeselectContact: () => void;
  onToggleCustomEmail: () => void;
  onSigningNameChange: (value: string) => void;
  onSigningEmailChange: (value: string) => void;
  onSend: () => void;
}

export function ProposalSendFlow({
  contacts,
  signingEmail,
  signingName,
  selectedSignerContactId,
  showCustomEmailForm,
  sending,
  isPending,
  clientAttached,
  lineItemCount,
  onSelectContact,
  onDeselectContact,
  onToggleCustomEmail,
  onSigningNameChange,
  onSigningEmailChange,
  onSend,
}: ProposalSendFlowProps) {
  return (
    <div className="shrink-0 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="stage-label text-[var(--stage-text-secondary)]">
          Send to
        </p>
        {lineItemCount === 0 && clientAttached !== false && (
          <p className="stage-label text-[var(--stage-text-tertiary)]">Add at least one line item</p>
        )}
      </div>

      {/* Contact pills */}
      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (selectedSignerContactId === c.id) {
                  onDeselectContact();
                } else {
                  onSelectContact(c.id, c.name, c.email);
                }
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[var(--stage-radius-input)] border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                selectedSignerContactId === c.id
                  ? 'border-[var(--stage-accent)]/60 bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                  : 'border-[var(--stage-border)] hover:bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]'
              )}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              {c.name}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleCustomEmail}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[var(--stage-radius-input)] border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              showCustomEmailForm
                ? 'border-[var(--stage-border-focus)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-primary)]'
                : 'border-[var(--stage-border)] hover:bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]'
            )}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Other email
          </button>
        </div>
      )}

      {/* Email form -- shown when "Other email" toggled or when no contacts exist */}
      {(showCustomEmailForm || contacts.length === 0) && (
        <div className="space-y-2">
          <input
            type="text"
            value={signingName}
            onChange={(e) => onSigningNameChange(e.target.value)}
            placeholder="Recipient name"
            className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
          />
          <input
            type="email"
            value={signingEmail}
            onChange={(e) => onSigningEmailChange(e.target.value)}
            placeholder="Recipient email"
            className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
          />
        </div>
      )}

      {/* Send button */}
      <button
        type="button"
        onClick={onSend}
        disabled={!signingEmail.trim() || lineItemCount === 0 || sending || isPending || clientAttached === false}
        className="w-full stage-btn stage-btn-primary py-2.5 h-auto disabled:opacity-45"
      >
        <Send className="w-4 h-4" />
        {sending ? 'Sending\u2026' : 'Send proposal'}
      </button>
      {clientAttached === false && (
        <p className="text-xs text-[var(--color-unusonic-error)]">Attach a client to this deal before sending.</p>
      )}
    </div>
  );
}
