'use client';

import React from 'react';
import { FileText, BookMarked } from 'lucide-react';

export interface ProposalActionsFooterProps {
  total: number;
  lineItemCount: number;
  saving: boolean;
  isPending: boolean;
  saveToCatalogPending: boolean;
  saveToCatalogMessage: string | null;
  showDraftSaved: boolean;
  sendError: string | null;
  sentUrl: string | null;
  signingName: string;
  signingEmail: string;
  onSaveToCatalog: () => void;
  onSaveDraft: () => void;
}

export function ProposalActionsFooter({
  total,
  lineItemCount,
  saving,
  isPending,
  saveToCatalogPending,
  saveToCatalogMessage,
  showDraftSaved,
  sendError,
  sentUrl,
  signingName,
  signingEmail,
  onSaveToCatalog,
  onSaveDraft,
}: ProposalActionsFooterProps) {
  return (
    <div className="shrink-0 pt-6 mt-6 border-t border-[var(--stage-edge-subtle)]">
      <div className="flex items-center justify-between gap-4 mb-4">
        <span className="text-sm font-medium uppercase tracking-wide text-[var(--stage-text-secondary)]">
          Total
        </span>
        <span className="text-xl font-semibold text-[var(--stage-text-primary)] tabular-nums">
          ${total.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSaveToCatalog}
          disabled={lineItemCount === 0 || saveToCatalogPending}
          className="stage-btn stage-btn-secondary inline-flex items-center gap-2 disabled:opacity-45 disabled:pointer-events-none"
        >
          <BookMarked className="w-4 h-4" />
          {saveToCatalogPending ? 'Saving\u2026' : 'Save to catalog'}
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={lineItemCount === 0 || saving || isPending}
          className="stage-btn stage-btn-secondary inline-flex items-center gap-2 disabled:opacity-45 disabled:pointer-events-none"
        >
          <FileText className="w-4 h-4" />
          Save draft
        </button>
      </div>
      {saveToCatalogMessage && (
        <p className="mt-2 text-sm text-[var(--stage-text-secondary)]" role="status">
          {saveToCatalogMessage}
        </p>
      )}
      {showDraftSaved && (
        <p className="mt-2 text-sm text-[var(--stage-accent)]" role="status">
          Draft saved
        </p>
      )}
      {sendError && (
        <p className="mt-3 text-sm text-[var(--color-unusonic-error)]" role="alert">
          {sendError}
        </p>
      )}
      {sentUrl && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-[var(--stage-accent)]" role="status">
            Sent to {signingName || signingEmail}.
          </p>
          <a
            href={sentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] underline hover:text-[var(--stage-text-primary)]"
          >
            View proposal link
          </a>
        </div>
      )}
    </div>
  );
}
