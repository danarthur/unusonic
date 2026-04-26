'use client';

/**
 * Rescue handoff dialog — owner sends DNS records to "their tech person."
 *
 * Sits inside the BYO wizard's pending state. After successful send, swaps
 * to a confirmation pane (recipient + setup URL) so the owner can copy/share
 * the link manually if the email is delayed.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import { useState, useTransition } from 'react';
import { Check, Copy, Send, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import { sendDnsRecordsToHelper } from '@/features/org-management/api/rescue-handoff-actions';

interface RescueHandoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

type Stage =
  | { kind: 'compose' }
  | { kind: 'success'; recipient: string; setupUrl: string };

export function RescueHandoffDialog({ open, onOpenChange, onSent }: RescueHandoffDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'compose' });
  const [recipient, setRecipient] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStage({ kind: 'compose' });
    setRecipient('');
    setRecipientName('');
    setMessage('');
    setError(null);
    setCopied(false);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendDnsRecordsToHelper({
        recipientEmail: recipient,
        recipientName: recipientName || null,
        message: message || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStage({ kind: 'success', recipient, setupUrl: result.setupUrl });
      onSent?.();
    });
  }

  function handleCopyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {stage.kind === 'compose' ? 'Send to your tech person' : 'Sent'}
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {stage.kind === 'compose' ? (
            <>
              <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                We&apos;ll send the DNS records and a setup link to whoever handles your domain — your web designer, IT contact, or someone at your registrar&apos;s support line. They can do it in about 5 minutes.
              </p>

              {error ? (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-unusonic-error)]/10 border border-[var(--color-unusonic-error)]/20 text-xs text-[var(--color-unusonic-error)]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                    Their email
                  </label>
                  <input
                    type="email"
                    placeholder="mike@example.com"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow]"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                    Their name <span className="text-[var(--stage-text-secondary)]/70">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Mike"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow]"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--stage-text-secondary)] mb-1.5 tracking-tight">
                    Add a note <span className="text-[var(--stage-text-secondary)]/70">(optional)</span>
                  </label>
                  <textarea
                    placeholder="Hey, no rush — but ideally before Saturday."
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow] resize-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-[var(--stage-text-secondary)] leading-relaxed">
                The email comes from your name (so it doesn&apos;t look like spam). Replies go to you. The link works for 30 days.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[var(--color-unusonic-success)]">
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Sent to {stage.recipient}</span>
              </div>

              <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                If the email doesn&apos;t arrive, you can share this link with them directly. It works for 30 days.
              </p>

              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={stage.setupUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-xs font-mono text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)]"
                />
                <button
                  onClick={() => handleCopyUrl(stage.setupUrl)}
                  className="shrink-0 px-3 py-2 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] border border-[var(--stage-border)] transition-colors"
                >
                  {copied ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-[var(--color-unusonic-success)]" /> Copied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Copy className="w-3 h-3" /> Copy link
                    </span>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-[var(--stage-text-secondary)] leading-relaxed">
                You&apos;ll see a record in the history list below. We&apos;ll notify you when the records are verified.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[oklch(1_0_0_/_0.06)] px-6 py-3">
          {stage.kind === 'compose' ? (
            <>
              <button
                onClick={() => handleClose(false)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!recipient.trim() || isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight stage-btn stage-btn-primary disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3 h-3" />
                {isPending ? 'Sending…' : 'Send'}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleClose(false)}
              className="px-3 py-1.5 rounded-[var(--stage-radius-button)] text-xs font-medium tracking-tight stage-btn stage-btn-primary transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
