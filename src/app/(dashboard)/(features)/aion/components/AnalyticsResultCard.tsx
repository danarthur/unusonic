'use client';

/**
 * AnalyticsResultCard — Phase 3.1 renderer for the `analytics_result` content type.
 *
 * Locked renderer contract: docs/reference/pages/reports-analytics-result-design.md
 *  - Outer chrome: StagePanel elevated, padding md.
 *  - Layout: header, value block, optional full chart, pills row, provenance footer.
 *  - Pin button is reserved for Phase 3.2 — slot marked with a TODO only.
 *
 * Pill edits dispatch synthetic `[arg-edit] <metricId> <argKey>=<newValue>` user
 * messages through the existing Aion chat pipeline. The route short-circuits
 * these and re-runs callMetric without invoking the LLM.
 *
 * @module app/(dashboard)/(features)/aion/components/AnalyticsResultCard
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Pin,
  PinOff,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Sparkline } from '@/widgets/global-pulse/ui/Sparkline';
import { DataFreshnessBadge } from '@/widgets/shared/ui/DataFreshnessBadge';
import { cn } from '@/shared/lib/utils';
import { ChartCard } from './ChartCard';
import { savePin, type PinCadence } from '../actions/pin-actions';
import type {
  AnalyticsResult,
  AnalyticsResultComparison,
  AnalyticsResultPill,
} from '../lib/aion-chat-types';

// ── Sentiment → icon + color map ────────────────────────────────────────────
const SENTIMENT_COLOR: Record<AnalyticsResultComparison['sentiment'], string> = {
  positive: 'var(--color-unusonic-success)',
  negative: 'var(--color-unusonic-error)',
  neutral: 'var(--stage-text-tertiary)',
};

function DirectionIcon({ direction, size = 13 }: { direction: AnalyticsResultComparison['direction']; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  if (direction === 'up') return <TrendingUp {...props} aria-hidden />;
  if (direction === 'down') return <TrendingDown {...props} aria-hidden />;
  return <Minus {...props} aria-hidden />;
}

// ── Period choice set (Phase 3.1 supports period + year only) ──────────────
function today() {
  return new Date();
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

type PeriodChoice = { label: string; period_start: string; period_end: string };

function buildPeriodChoices(): PeriodChoice[] {
  const now = today();
  const last7 = { label: 'Last 7 days', period_start: iso(addDays(now, -7)), period_end: iso(now) };
  const last30 = { label: 'Last 30 days', period_start: iso(addDays(now, -30)), period_end: iso(now) };
  const last90 = { label: 'Last 90 days', period_start: iso(addDays(now, -90)), period_end: iso(now) };
  const thisMonth = { label: 'This month', period_start: iso(startOfMonth(now)), period_end: iso(now) };
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonth = {
    label: 'Last month',
    period_start: iso(lastMonthStart),
    period_end: iso(endOfMonth(lastMonthStart)),
  };
  const ytd = { label: 'Year to date', period_start: `${now.getFullYear()}-01-01`, period_end: iso(now) };
  const lastYear = {
    label: 'Last year',
    period_start: `${now.getFullYear() - 1}-01-01`,
    period_end: `${now.getFullYear() - 1}-12-31`,
  };
  return [last7, last30, last90, thisMonth, lastMonth, ytd, lastYear];
}

function buildYearChoices(): Array<{ label: string; year: number }> {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2, y - 3].map((year) => ({ label: String(year), year }));
}

// ── Copy metric ID on click (footer) ────────────────────────────────────────
function CopyableMetricId({ metricId }: { metricId: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(() => {
    try {
      navigator.clipboard.writeText(metricId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silent
    }
  }, [metricId]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Metric ID — copy to clipboard"
      className={cn(
        'inline-flex items-center gap-1',
        'text-xs font-mono tabular-nums',
        'text-[var(--stage-text-tertiary)]',
        'hover:text-[var(--stage-text-secondary)] transition-colors',
        'cursor-pointer select-none',
      )}
    >
      <span>{metricId}</span>
      {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden className="opacity-0 group-hover:opacity-60" />}
    </button>
  );
}

// ── Pill button ─────────────────────────────────────────────────────────────
interface PillButtonProps {
  pill: AnalyticsResultPill;
  onOpen: (pill: AnalyticsResultPill, anchor: HTMLButtonElement) => void;
}

function PillButton({ pill, onOpen }: PillButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  // Phase 3.1: we support period + year only. Other choice-sets are disabled.
  const supported = pill.editable && (pill.choiceSetKey === 'period' || pill.choiceSetKey === 'year');
  const disabledEditable = pill.editable && !supported;

  const baseClass = cn(
    'inline-flex items-center gap-1.5',
    'px-2.5 py-1 rounded-full',
    'text-xs tabular-nums',
    'border border-[oklch(1_0_0_/_0.08)]',
    'bg-[var(--stage-surface-elevated)]',
    'text-[var(--stage-text-secondary)]',
    'min-h-[28px]',
    'select-none',
  );

  if (supported) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen(pill, ref.current!)}
        className={cn(
          baseClass,
          'hover:bg-[var(--stage-surface-raised)] hover:text-[var(--stage-text-primary)]',
          'transition-colors cursor-pointer',
        )}
        data-testid="analytics-pill-editable"
        data-pill-key={pill.key}
      >
        <span>{pill.label}</span>
        <ChevronDown size={11} aria-hidden strokeWidth={1.75} />
      </button>
    );
  }

  if (disabledEditable) {
    return (
      <span
        title="Not editable in this release"
        className={cn(baseClass, 'opacity-70 cursor-default')}
        data-testid="analytics-pill-unsupported"
      >
        <span>{pill.label}</span>
      </span>
    );
  }

  // Non-editable (e.g. pinned workspace context).
  return (
    <span
      className={cn(baseClass, 'opacity-70 cursor-default')}
      data-testid="analytics-pill-locked"
    >
      <span>{pill.label}</span>
    </span>
  );
}

// ── Pill edit popover (inline, portal-less — Popover from shared/ui/popover is portaled already) ──

interface PillEditPopoverProps {
  pill: AnalyticsResultPill;
  onPick: (argKey: string, newValue: unknown) => void;
  onClose: () => void;
  anchor: HTMLElement;
}

function PillEditPopover({ pill, onPick, onClose, anchor }: PillEditPopoverProps) {
  const [pos, setPos] = React.useState<{ top: number; left: number; flip: boolean } | null>(null);

  React.useEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const vh = window.innerHeight;
    const estimatedHeight = 240;
    const flip = rect.bottom + estimatedHeight > vh;
    setPos({
      top: flip ? rect.top + window.scrollY - 8 : rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      flip,
    });
  }, [anchor]);

  React.useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!pos) return null;

  const hasPeriod = pill.choiceSetKey === 'period';
  const hasYear = pill.choiceSetKey === 'year';
  const periodChoices = hasPeriod ? buildPeriodChoices() : [];
  const yearChoices = hasYear ? buildYearChoices() : [];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        style={{ background: 'transparent' }}
        aria-hidden
      />
      <div
        role="menu"
        className={cn(
          'absolute z-50 min-w-[180px]',
          'rounded-lg border border-[oklch(1_0_0_/_0.08)]',
          'bg-[var(--stage-surface-raised)]',
          'shadow-[0_8px_32px_-8px_oklch(0_0_0/0.4)]',
          'p-1',
        )}
        style={{
          top: pos.flip ? pos.top - 240 : pos.top,
          left: pos.left,
        }}
      >
        {hasPeriod
          ? periodChoices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                role="menuitem"
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-md',
                  'text-sm text-[var(--stage-text-secondary)]',
                  'hover:bg-[var(--stage-surface-hover)] hover:text-[var(--stage-text-primary)]',
                  'transition-colors',
                )}
                onClick={() => {
                  // Emit both period_start and period_end as a single compound arg-edit.
                  onPick('period', { period_start: choice.period_start, period_end: choice.period_end });
                }}
              >
                {choice.label}
              </button>
            ))
          : null}
        {hasYear
          ? yearChoices.map((choice) => (
              <button
                key={choice.year}
                type="button"
                role="menuitem"
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-md',
                  'text-sm text-[var(--stage-text-secondary)]',
                  'hover:bg-[var(--stage-surface-hover)] hover:text-[var(--stage-text-primary)]',
                  'transition-colors',
                )}
                onClick={() => onPick('year', choice.year)}
              >
                {choice.label}
              </button>
            ))
          : null}
        {periodChoices.length === 0 && yearChoices.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--stage-text-tertiary)]">
            No choices available.
          </div>
        ) : null}
      </div>
    </>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────
export function AnalyticsResultSkeleton() {
  return (
    <StagePanel elevated padding="md">
      <div className="space-y-3 animate-pulse" aria-label="Loading analytics result">
        <div className="h-3 w-32 bg-[var(--stage-surface-hover)] rounded" />
        <div className="h-9 w-40 bg-[var(--stage-surface-hover)] rounded" />
        <div className="h-3 w-24 bg-[var(--stage-surface-hover)] rounded" />
      </div>
    </StagePanel>
  );
}

// ── Main card ───────────────────────────────────────────────────────────────

interface AnalyticsResultCardProps {
  result: AnalyticsResult;
  /**
   * Called when the user picks a pill value. Wire to the Aion chat's
   * `sendChatMessage` — the route detects `[arg-edit] ...` and short-circuits
   * to a re-run of callMetric.
   */
  onArgEdit?: (message: string) => void;
  /**
   * Read-only mode — used when the card renders inside the Lobby's "Your pins"
   * widget. In this mode pills are non-interactive, the confirm row is hidden,
   * and the header action flips from "Pin" to "Open in Aion".
   */
  readOnly?: boolean;
  /**
   * Called when the read-only card's "Open in Aion" button is clicked.
   * Phase 3.3 wires the pin → Aion re-open flow; Phase 3.2 just exposes the
   * handler so Lobby pin tiles can route correctly.
   */
  onOpenInAion?: () => void;
}

export function AnalyticsResultCard({
  result,
  onArgEdit,
  readOnly = false,
  onOpenInAion,
}: AnalyticsResultCardProps) {
  const [openPill, setOpenPill] = React.useState<{ pill: AnalyticsResultPill; anchor: HTMLElement } | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pinSaved, setPinSaved] = React.useState<boolean>(Boolean(result.pinId));

  const dispatchArgEdit = React.useCallback(
    (argKey: string, newValue: unknown) => {
      // Serialize compound values as JSON so the route can parse them.
      const valueStr =
        typeof newValue === 'string' || typeof newValue === 'number' || typeof newValue === 'boolean'
          ? String(newValue)
          : JSON.stringify(newValue);
      const message = `[arg-edit] ${result.metricId} ${argKey}=${valueStr}`;
      if (onArgEdit) {
        try {
          onArgEdit(message);
        } catch (err) {
          toast.error('Could not update the metric. Try again.');
          if (process.env.NODE_ENV !== 'production') {
            console.error('[analytics_result] arg-edit dispatch failed', err);
          }
        }
        return;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics_result] no dispatcher wired; arg-edit dropped:', message);
      }
    },
    [onArgEdit, result.metricId],
  );

  const handlePillPick = (argKey: string, newValue: unknown) => {
    dispatchArgEdit(argKey, newValue);
    setOpenPill(null);
  };

  // ── Render paths: error / empty / normal ─────────────────────────────────

  if (result.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_LIGHT}
      >
        <StagePanel elevated stripe="error" padding="md" className="flex flex-col gap-2" role="article">
          <HeaderRow
            title={result.title}
            pinEnabled={result.pinEnabled}
            pinnable={result.pinnable}
            pinSaved={pinSaved}
            hasPinId={Boolean(result.pinId)}
            readOnly={readOnly}
            onPinClick={() => setConfirmOpen((v) => !v)}
            onOpenInAion={onOpenInAion}
          />
          <p className="text-sm text-[var(--stage-text-primary)]">
            {result.error.message}
          </p>
          <div className="flex items-center gap-2 pt-1">
            {result.error.recoveryUrl ? (
              <a
                href={result.error.recoveryUrl}
                className={cn(
                  'inline-flex items-center px-3 py-1 rounded-full',
                  'text-xs border border-[oklch(1_0_0_/_0.1)]',
                  'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
                  'hover:bg-[var(--stage-surface-raised)] transition-colors',
                )}
              >
                Open reconciliation
              </a>
            ) : null}
          </div>
        </StagePanel>
      </motion.div>
    );
  }

  const empty = result.empty;
  const hasChart = !!result.chart;
  const showSparkline = !hasChart && result.sparkline && result.sparkline.length >= 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel
        elevated
        padding="md"
        className="flex flex-col gap-3"
        role="article"
        aria-label={`${result.title}: ${result.value.primary}${result.comparison ? ` — ${result.comparison.delta} ${result.comparison.label}` : ''}`}
      >
        <HeaderRow
          title={result.title}
          pinEnabled={result.pinEnabled}
          pinnable={result.pinnable}
          pinSaved={pinSaved}
          hasPinId={Boolean(result.pinId)}
          readOnly={readOnly}
          onPinClick={() => setConfirmOpen((v) => !v)}
          onOpenInAion={onOpenInAion}
        />

        {empty ? (
          <EmptyBlock title={empty.title} body={empty.body} cta={empty.cta} />
        ) : (
          <ValueBlock result={result} showSparkline={!!showSparkline} />
        )}

        {hasChart && result.chart ? (
          <StagePanel nested padding="sm">
            <ChartCard
              bare
              chartType={result.chart.chartType}
              data={result.chart.data}
              valuePrefix={result.chart.valuePrefix}
              valueSuffix={result.chart.valueSuffix}
            />
          </StagePanel>
        ) : null}

        {result.pills.length > 0 && !readOnly ? (
          <div className="flex flex-wrap gap-2 items-center pt-1">
            {result.pills.map((pill) => (
              <PillButton
                key={pill.key}
                pill={pill}
                onOpen={(p, anchor) => setOpenPill({ pill: p, anchor })}
              />
            ))}
          </div>
        ) : null}

        {/* Phase 4.3 — conversational follow-ups. Tap dispatches a synthetic
            chat turn asking for the related metric. Hidden in read-only mode
            (pinned cards on the Lobby) — follow-ups are chat-surface affordance. */}
        {result.followUps && result.followUps.length > 0 && !readOnly ? (
          <div
            className="flex flex-wrap gap-2 items-center pt-1"
            data-testid="analytics-follow-ups"
          >
            <span className="stage-label font-mono text-[var(--stage-text-tertiary)]">
              Try next
            </span>
            {result.followUps.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => onArgEdit?.(chip.value)}
                className="px-3 py-1 text-xs rounded-full bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)] text-[var(--stage-text-secondary)] hover:bg-[var(--stage-surface-raised)] hover:text-[var(--stage-text-primary)] transition-colors"
                data-testid="analytics-follow-up-chip"
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        {confirmOpen && !readOnly && result.pinEnabled && result.pinnable ? (
          <PinConfirmRow
            defaultTitle={result.title}
            hasPinId={Boolean(result.pinId)}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={async (title, cadence) => {
              try {
                await savePin({
                  title,
                  metricId: result.metricId,
                  args: result.args,
                  cadence,
                  initialValue: {
                    primary: result.value.primary,
                    unit: result.value.unit,
                    secondary: result.value.secondary,
                  },
                });
                setPinSaved(true);
                setConfirmOpen(false);
                toast.success(
                  result.pinId ? 'Pin updated' : 'Pinned to Lobby',
                  { duration: 2000 },
                );
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : 'Could not pin';
                toast.error(message);
              }
            }}
          />
        ) : null}

        <FooterRow
          metricId={result.metricId}
          computedAt={result.freshness.computedAt}
          cadence={result.freshness.cadence}
        />
      </StagePanel>

      {openPill ? (
        <PillEditPopover
          pill={openPill.pill}
          anchor={openPill.anchor}
          onClose={() => setOpenPill(null)}
          onPick={handlePillPick}
        />
      ) : null}
    </motion.div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface HeaderRowProps {
  title: string;
  pinEnabled?: boolean;
  pinnable?: boolean;
  pinSaved: boolean;
  hasPinId: boolean;
  readOnly: boolean;
  onPinClick: () => void;
  onOpenInAion?: () => void;
}

function HeaderRow({
  title,
  pinEnabled,
  pinnable,
  pinSaved,
  hasPinId,
  readOnly,
  onPinClick,
  onOpenInAion,
}: HeaderRowProps) {
  // Read-only mode: swap Pin → Open in Aion. Gate still requires pinEnabled so
  // disabling the flag on an already-pinned card hides the action cleanly.
  const showOpenInAion = readOnly && pinEnabled;
  const showPinButton = !readOnly && pinEnabled && pinnable;
  const pinLabel = hasPinId || pinSaved ? 'Update pin' : 'Pin to Lobby';
  const PinIcon = pinSaved || hasPinId ? PinOff : Pin;

  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <p className="stage-label font-mono select-none truncate text-[var(--stage-text-primary)]">
        {title}
      </p>
      <div className="flex items-center gap-2">
        {showOpenInAion ? (
          <button
            type="button"
            onClick={onOpenInAion}
            title="Open in Aion"
            aria-label="Open in Aion"
            className={cn(
              'inline-flex items-center justify-center',
              'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
              'transition-colors cursor-pointer',
            )}
            data-testid="analytics-open-in-aion"
          >
            <MessageSquare size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        {showPinButton ? (
          <button
            type="button"
            onClick={onPinClick}
            title={pinLabel}
            aria-label={pinLabel}
            className={cn(
              'inline-flex items-center justify-center',
              'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
              'transition-colors cursor-pointer',
            )}
            data-testid="analytics-pin-button"
            data-pin-state={pinSaved || hasPinId ? 'pinned' : 'unpinned'}
          >
            <PinIcon size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Pin confirm row (inline, not a modal — per design §4.1) ───────────────

interface PinConfirmRowProps {
  defaultTitle: string;
  hasPinId: boolean;
  onCancel: () => void;
  onConfirm: (title: string, cadence: PinCadence) => void | Promise<void>;
}

function PinConfirmRow({
  defaultTitle,
  hasPinId,
  onCancel,
  onConfirm,
}: PinConfirmRowProps) {
  const [title, setTitle] = React.useState(defaultTitle);
  const [cadence, setCadence] = React.useState<PinCadence>('hourly');
  const [submitting, setSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    const clean = title.trim();
    if (!clean) {
      toast.error('Pin title required');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(clean, cadence);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmLabel = hasPinId ? 'Update pin' : 'Pin';

  return (
    <StagePanel nested padding="sm" className="flex flex-col gap-2" data-testid="analytics-pin-confirm">
      <p className="text-xs text-[var(--stage-text-secondary)]">
        {hasPinId ? 'Update pin' : 'Pin to Lobby'}
      </p>
      <label className="flex flex-col gap-1 text-xs text-[var(--stage-text-tertiary)]">
        <span className="stage-label">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={submitting}
          className={cn(
            'w-full px-2 py-1 rounded-md',
            'text-sm text-[var(--stage-text-primary)]',
            'bg-[var(--ctx-well,var(--stage-surface))]',
            'border border-[oklch(1_0_0_/_0.08)]',
            'focus:outline-none focus:border-[oklch(1_0_0_/_0.16)]',
          )}
          data-testid="analytics-pin-title-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--stage-text-tertiary)]">
        <span className="stage-label">Refresh</span>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as PinCadence)}
          disabled={submitting}
          className={cn(
            'w-full px-2 py-1 rounded-md',
            'text-sm text-[var(--stage-text-primary)]',
            'bg-[var(--ctx-well,var(--stage-surface))]',
            'border border-[oklch(1_0_0_/_0.08)]',
          )}
          data-testid="analytics-pin-cadence-select"
        >
          <option value="live">Live</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={cn(
            'px-3 py-1 rounded-full',
            'text-xs text-[var(--stage-text-secondary)]',
            'hover:text-[var(--stage-text-primary)] transition-colors',
          )}
          data-testid="analytics-pin-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={cn(
            'inline-flex items-center px-3 py-1 rounded-full',
            'text-xs border border-[oklch(1_0_0_/_0.1)]',
            'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)]',
            'hover:bg-[var(--stage-surface-raised)] transition-colors',
            submitting && 'opacity-60 cursor-wait',
          )}
          data-testid="analytics-pin-confirm-btn"
        >
          {submitting ? 'Pinning…' : confirmLabel}
        </button>
      </div>
    </StagePanel>
  );
}

function ValueBlock({ result, showSparkline }: { result: AnalyticsResult; showSparkline: boolean }) {
  const comp = result.comparison;
  const sentimentColor = comp ? SENTIMENT_COLOR[comp.sentiment] : 'var(--stage-text-tertiary)';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-3xl font-medium tabular-nums tracking-tight leading-none text-[var(--stage-text-primary)]"
          data-testid="analytics-hero-value"
        >
          {result.value.primary}
        </span>

        {comp ? (
          <span
            className="inline-flex items-center gap-1 text-sm tabular-nums"
            style={{ color: sentimentColor }}
            data-testid="analytics-comparison-delta"
            data-sentiment={comp.sentiment}
          >
            <DirectionIcon direction={comp.direction} />
            <span>{comp.delta}</span>
            <span className="stage-label text-[var(--stage-text-tertiary)]">{comp.label}</span>
          </span>
        ) : null}

        {showSparkline && result.sparkline ? (
          <Sparkline
            values={result.sparkline}
            width={64}
            height={24}
            stroke={sentimentColor}
            opacity={0.6}
          />
        ) : null}
      </div>

      {result.value.secondary ? (
        <span className="text-sm text-[var(--stage-text-secondary)] tabular-nums leading-snug">
          {result.value.secondary}
        </span>
      ) : null}
    </div>
  );
}

function EmptyBlock({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-lg font-medium text-[var(--stage-text-primary)] leading-tight">
        {title}
      </span>
      <span className="text-sm text-[var(--stage-text-secondary)] leading-snug">
        {body}
      </span>
      {cta ? (
        <a
          href={cta.href}
          className={cn(
            'inline-flex items-center self-start px-3 py-1 rounded-full mt-1',
            'text-xs border border-[oklch(1_0_0_/_0.1)]',
            'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
            'hover:bg-[var(--stage-surface-raised)] transition-colors',
          )}
        >
          {cta.label}
        </a>
      ) : null}
    </div>
  );
}

function FooterRow({
  metricId,
  computedAt,
  cadence,
}: {
  metricId: string;
  computedAt: string;
  cadence: AnalyticsResult['freshness']['cadence'];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-[var(--stage-text-tertiary)] pt-1">
      <CopyableMetricId metricId={metricId} />
      <span aria-hidden>·</span>
      <DataFreshnessBadge timestamp={computedAt} label="Computed" />
      <span aria-hidden>·</span>
      <span className="tabular-nums">{cadence}</span>
    </div>
  );
}

