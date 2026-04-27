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

import { useMemo, useState, useTransition } from 'react';
import { Check, Copy, Send, AlertCircle, Mail, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import { sendDnsRecordsToHelper } from '@/features/org-management/api/rescue-handoff-actions';
import { detectRecipientKind } from '@/shared/api/sms/validation';

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

  // Live-detect channel as the user types so the UI can hint the right
  // affordances (icon, microcopy, message-field availability for SMS).
  const detected = useMemo(() => detectRecipientKind(recipient), [recipient]);
  const recipientKind = detected.kind === 'invalid' ? null : detected.kind;
  const isSms = recipientKind === 'sms';

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendDnsRecordsToHelper({
        recipient,
        recipientName: recipientName || null,
        // The SMS body has no room for a custom note in one segment, so we
        // only forward it for email recipients. Owner can re-send via email
        // if they want the note included.
        message: isSms ? null : message || null,
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
            <ComposeStage
              recipient={recipient}
              setRecipient={setRecipient}
              recipientName={recipientName}
              setRecipientName={setRecipientName}
              message={message}
              setMessage={setMessage}
              recipientKind={recipientKind}
              isSms={isSms}
              error={error}
            />
          ) : (
            <SuccessStage
              recipient={stage.recipient}
              setupUrl={stage.setupUrl}
              copied={copied}
              onCopy={() => handleCopyUrl(stage.setupUrl)}
            />
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

// ── Sub-stages ────────────────────────────────────────────────────────────────

interface ComposeStageProps {
  recipient: string;
  setRecipient: (v: string) => void;
  recipientName: string;
  setRecipientName: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  recipientKind: 'email' | 'sms' | null;
  isSms: boolean;
  error: string | null;
}

function ComposeStage({
  recipient,
  setRecipient,
  recipientName,
  setRecipientName,
  message,
  setMessage,
  recipientKind,
  isSms,
  error,
}: ComposeStageProps) {
  return (
    <>
      <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
        We&apos;ll send a setup link to whoever handles your domain — your web designer, IT contact, or someone at your registrar&apos;s support line. They can do it in about 5 minutes.
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
            Their email or phone
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="mike@example.com  or  555-123-4567"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full pl-3 pr-9 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)] transition-[border-color,box-shadow]"
              autoComplete="off"
            />
            {recipientKind ? (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--stage-text-secondary)]"
                title={isSms ? 'Will send as SMS' : 'Will send as email'}
              >
                {isSms ? <MessageSquare className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
              </span>
            ) : null}
          </div>
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

        {!isSms ? (
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
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--stage-text-secondary)] leading-relaxed">
        {isSms
          ? 'The text comes from a Unusonic number. Reply STOP to opt out. The link works for 30 days.'
          : 'The email comes from your name (so it doesn\u2019t look like spam). Replies go to you. The link works for 30 days.'}
      </p>

      <p className="text-[11px] text-[var(--stage-text-secondary)]/70 leading-relaxed">
        By sending, you confirm this person has agreed to receive {isSms ? 'a text' : 'an email'} from your business. See our{' '}
        <a
          href={isSms ? '/legal/sms' : '/legal/terms'}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors underline underline-offset-2 decoration-[oklch(1_0_0_/_0.15)]"
        >
          {isSms ? 'SMS Policy' : 'Terms'}
        </a>
        .
      </p>
    </>
  );
}

interface SuccessStageProps {
  recipient: string;
  setupUrl: string;
  copied: boolean;
  onCopy: () => void;
}

function SuccessStage({ recipient, setupUrl, copied, onCopy }: SuccessStageProps) {
  return (
    <>
      <div className="flex items-center gap-2 text-[var(--color-unusonic-success)]">
        <Check className="w-4 h-4" />
        <span className="text-sm font-medium">Sent to {recipient}</span>
      </div>

      <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
        If the message doesn&apos;t arrive, you can share this link with them directly. It works for 30 days.
      </p>

      <div className="flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={setupUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-xs font-mono text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-border-focus)]"
        />
        <button
          onClick={onCopy}
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
  );
}
