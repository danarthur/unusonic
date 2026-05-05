import Link from 'next/link';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { StagePanel } from '@/shared/ui/stage-panel';
import { AlertTriangle, Inbox, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * /events/unmatched-replies — inbound email that the webhook couldn't route.
 *
 * Surfaces rows from ops.inbound_raw_payloads where parse_status is a
 * non-terminal-success state (unmatched_alias, parse_failed, auth_failed,
 * etc.). Pilot-user workflow: the owner scans this page the morning after
 * a pipeline hiccup and sees every message that didn't make it onto a
 * deal thread.
 *
 * Phase 1 scope: read-only surface + raw payload drill-in. Manual reassign-
 * to-thread lands in Phase 1.5 (requires thread picker UI + mint of an
 * ops.messages row from the raw payload).
 *
 * Ship context: this page exists because one missed reply is the pilot-
 * ending failure (User Advocate §3). Without it, parse failures and
 * unmatched aliases fall through silently — the DLQ row persists, but
 * the owner has no surface to see it.
 */

type RawPayloadRow = {
  id: string;
  received_at: string;
  provider: string;
  provider_message_id: string | null;
  parse_status: string;
  parse_reason: string | null;
  thread_id: string | null;
  message_id: string | null;
  raw_payload: {
    From?: string;
    FromName?: string;
    Subject?: string;
    TextBody?: string;
    StrippedTextReply?: string;
    __parseError?: string;
  };
};

type Section = {
  label: string;
  description: string;
  rows: RawPayloadRow[];
};

async function loadUnmatched(): Promise<{ sections: Section[]; totalCount: number; error: string | null }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { sections: [], totalCount: 0, error: 'No active workspace.' };

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .schema('ops')
    .from('inbound_raw_payloads')
    .select('id, received_at, provider, provider_message_id, parse_status, parse_reason, thread_id, message_id, raw_payload')
    .eq('workspace_id', workspaceId)
    .in('parse_status', ['unmatched_alias', 'parse_failed', 'auth_failed', 'unverified_sender'])
    .order('received_at', { ascending: false })
    .limit(200);

  if (error) {
    return { sections: [], totalCount: 0, error: error.message };
  }

  const rows = (data ?? []) as RawPayloadRow[];

  // Group by status for readable presentation. Order: auth_failed first
  // (security), unmatched_alias next (user-actionable), parse_failed last
  // (needs engineering attention).
  const byStatus: Record<string, RawPayloadRow[]> = {
    auth_failed: [],
    unmatched_alias: [],
    parse_failed: [],
    unverified_sender: [],
  };
  for (const row of rows) {
    (byStatus[row.parse_status] ??= []).push(row);
  }

  const sections: Section[] = [];
  if (byStatus.auth_failed?.length) {
    sections.push({
      label: 'Auth failures',
      description:
        'Unauthorized POSTs to the inbound webhook. Usually a misconfigured webhook URL after a credential rotation. If you did not rotate recently, this may be an attacker probing the endpoint — review the raw payloads.',
      rows: byStatus.auth_failed,
    });
  }
  if (byStatus.unmatched_alias?.length) {
    sections.push({
      label: 'Unmatched threads',
      description:
        'The sender addressed an alias that no longer exists in this workspace. The most common cause is a reply to a thread that was deleted or a forwarded alias from outside your workspace. Open the raw payload to decide whether to manually attach or archive.',
      rows: byStatus.unmatched_alias,
    });
  }
  if (byStatus.parse_failed?.length) {
    sections.push({
      label: 'Parse failures',
      description:
        'The webhook accepted the message but something downstream (RPC, sender resolution, body extraction) failed. These need engineering follow-up.',
      rows: byStatus.parse_failed,
    });
  }
  if (byStatus.unverified_sender?.length) {
    sections.push({
      label: 'Unverified senders',
      description:
        'Sender did not pass SPF/DKIM/DMARC checks. Review the raw payload before trusting content — potential spoofing.',
      rows: byStatus.unverified_sender,
    });
  }

  return { sections, totalCount: rows.length, error: null };
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function previewBody(row: RawPayloadRow): string {
  const p = row.raw_payload;
  const body = p.StrippedTextReply?.trim() || p.TextBody?.trim() || '';
  return body.slice(0, 180);
}

export default async function UnmatchedRepliesPage() {
  const { sections, totalCount, error } = await loadUnmatched();

  return (
    <div className="mx-auto w-full max-w-4xl py-8" style={{ padding: '32px 24px' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            <ArrowLeft size={12} /> CRM
          </Link>
          <h1
            className="mt-1 text-2xl tracking-tight"
            style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}
          >
            Unmatched replies
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--stage-text-secondary)' }}>
            {totalCount > 0
              ? `${totalCount} inbound message${totalCount === 1 ? '' : 's'} that didn\u2019t reach a deal thread.`
              : 'No unmatched inbound in the last 200 payloads \u2014 pipeline healthy.'}
          </p>
        </div>
      </div>

      {error && (
        <StagePanel style={{ padding: '16px', marginBottom: '16px' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-unusonic-error)' }}>
            <AlertTriangle size={14} />
            {error}
          </div>
        </StagePanel>
      )}

      {!error && sections.length === 0 && (
        <StagePanel elevated style={{ padding: '32px', textAlign: 'center' }}>
          <Inbox size={32} style={{ color: 'var(--stage-text-tertiary)', margin: '0 auto 12px' }} />
          <p className="text-sm" style={{ color: 'var(--stage-text-secondary)' }}>
            Every recent inbound message landed on its deal thread cleanly.
          </p>
        </StagePanel>
      )}

      <div className="flex flex-col" style={{ gap: '16px' }}>
        {sections.map((section) => (
          <StagePanel key={section.label} elevated style={{ padding: '16px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h2
                className="text-sm tracking-tight"
                style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}
              >
                {section.label}
                <span style={{ color: 'var(--stage-text-tertiary)', fontWeight: 400 }}>
                  {' \u00b7 '}
                  {section.rows.length}
                </span>
              </h2>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: 'var(--stage-text-tertiary)', maxWidth: '62ch' }}
              >
                {section.description}
              </p>
            </div>
            <div className="flex flex-col" style={{ gap: '8px' }}>
              {section.rows.map((row) => (
                <UnmatchedRow key={row.id} row={row} />
              ))}
            </div>
          </StagePanel>
        ))}
      </div>
    </div>
  );
}

function UnmatchedRow({ row }: { row: RawPayloadRow }) {
  const from =
    row.raw_payload.FromName
      ? `${row.raw_payload.FromName} <${row.raw_payload.From ?? 'unknown'}>`
      : row.raw_payload.From ?? 'unknown sender';
  const subject = row.raw_payload.Subject ?? '(no subject)';
  const preview = previewBody(row);

  return (
    <div
      className="flex flex-col"
      style={{
        padding: '12px',
        borderRadius: '8px',
        background: 'var(--ctx-well)',
        border: '1px solid var(--stage-edge-subtle)',
        gap: '6px',
      }}
      data-surface="well"
    >
      <div className="flex items-center justify-between" style={{ gap: '8px' }}>
        <span
          className="text-sm truncate"
          style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}
        >
          {subject}
        </span>
        <span
          className="text-xs shrink-0 tabular-nums"
          style={{ color: 'var(--stage-text-tertiary)' }}
          title={new Date(row.received_at).toLocaleString()}
        >
          {formatTimeAgo(row.received_at)}
        </span>
      </div>
      <span className="text-xs truncate" style={{ color: 'var(--stage-text-secondary)' }}>
        {from}
      </span>
      {preview && (
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--stage-text-tertiary)' }}
        >
          {preview}
        </p>
      )}
      {row.parse_reason && (
        <span
          className="text-xs mt-1"
          style={{ color: 'var(--stage-text-tertiary)', fontStyle: 'italic' }}
        >
          Reason: {row.parse_reason}
        </span>
      )}
    </div>
  );
}
