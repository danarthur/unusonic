import type { AionConfig } from '../actions/aion-config-actions';

// =============================================================================
// Structured message content types
// =============================================================================

export type SuggestionChip = {
  label: string;
  /** Sent as user message when tapped */
  value: string;
};

export type QueuePreviewItem = {
  dealId: string;
  dealTitle: string;
  reason: string;
  priority: number;
};

export type ScorecardMetric = {
  label: string;
  value: string;
  detail?: string;
  trend?: 'up' | 'down' | 'flat';
  sparkline?: number[];
};

export type ChartDataPoint = {
  label: string;
  value: number;
  color?: string;
};

export type DataTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
};

// =============================================================================
// analytics_result content type (Phase 3.1)
// Wire format locked in docs/reference/pages/reports-analytics-result-design.md §1.
// =============================================================================

export type AnalyticsResultPill = {
  /** Stable arg key matching the metric RPC parameter (e.g. 'period_start', 'client_id'). */
  key: string;
  /** Human-readable chip label (e.g. 'Last 30 days', 'Live Nation'). */
  label: string;
  /** The actual arg value passed to the RPC. Typed as unknown to support all RPC arg types. */
  value: unknown;
  /** False when the pill represents a pinned-context arg the user can't change (e.g. workspace_id). */
  editable: boolean;
  /**
   * When editable, the choices the user can swap to. Resolved at render time from the metric
   * registry's argsSchema — Aion doesn't enumerate them, the registry does.
   */
  choiceSetKey?: 'period' | 'client' | 'crew_member' | 'event' | 'tag' | 'year';
};

export type AnalyticsResultComparison = {
  /** Human-readable label: 'vs last month', 'vs same period last year', 'vs target'. */
  label: string;
  /** Pre-formatted delta string: '+12.4%', '-$3,200', 'flat'. */
  delta: string;
  /** Direction for the arrow icon. */
  direction: 'up' | 'down' | 'flat';
  /**
   * Business-meaning sentiment. Up isn't always good (overdue invoices going up = bad).
   * The metric registry sets this; Aion doesn't infer it.
   */
  sentiment: 'positive' | 'negative' | 'neutral';
};

export type AnalyticsResultValue = {
  /** Pre-formatted hero number: '$128,400', '12 shows', '41.7%'. Always ready for tabular-nums display. */
  primary: string;
  /** Unit hint for accessibility/screen readers. Not always rendered visibly. */
  unit: 'currency' | 'count' | 'percent' | 'duration' | 'timestamp' | 'ratio';
  /** Optional secondary line: '$8,200 avg', '3 of 12 paid'. */
  secondary?: string;
};

export type AnalyticsResultFreshness = {
  /** ISO timestamp of when the underlying RPC was called. */
  computedAt: string;
  /** Registry-defined refresh cadence. */
  cadence: 'live' | 'hourly' | 'daily' | 'manual';
};

export type AnalyticsResult = {
  type: 'analytics_result';
  /** Short conversational intro (1 sentence max). */
  text: string;
  /** Stable registry ID. Pin store and refresh cron resolve metadata from this. */
  metricId: string;
  /** Display title from the registry (e.g. 'Revenue collected'). */
  title: string;
  /** Snapshot of the args used to produce this result. Identical to what gets stored on a pin. */
  args: Record<string, unknown>;
  /** The hero number the user looks at first. Required. */
  value: AnalyticsResultValue;
  /** Optional period-comparison line. Omit if registry entry has no comparison. */
  comparison?: AnalyticsResultComparison;
  /**
   * Optional sparkline values, oldest → newest. Render only if length >= 7.
   * A null/undefined sparkline means the metric simply doesn't have one.
   */
  sparkline?: number[];
  /**
   * Optional full chart payload. When present, the sparkline is hidden.
   */
  chart?: {
    chartType: 'bar' | 'line' | 'area' | 'donut';
    data: ChartDataPoint[];
    valuePrefix?: string;
    valueSuffix?: string;
  };
  /** Editable arg pills. Always include at least the period if the metric is period-bound. */
  pills: AnalyticsResultPill[];
  /** False when the metric isn't pinnable (e.g. a one-off computation). */
  pinnable: boolean;
  /**
   * Phase 3.2: mirrors the `reports.aion_pin` feature flag at the time the
   * payload was built server-side. Client respects this as the UI gate; the
   * savePin server action re-checks the flag, so disabling it mid-render
   * downgrades gracefully.
   */
  pinEnabled?: boolean;
  /** Present when this card was opened from an existing pin. */
  pinId?: string;
  /** Freshness info for the provenance footer. */
  freshness: AnalyticsResultFreshness;
  /** When set, renders the error-stripe variant with this copy instead of the value block. */
  error?: { message: string; recoveryUrl?: string };
  /** When set, renders the registry's empty-state copy instead of the value block. */
  empty?: { title: string; body: string; cta?: { label: string; href: string } };
  /**
   * Phase 4.3 — follow-up chips rendered beneath the card. Each chip, when
   * tapped, dispatches a synthetic chat turn asking for the related metric.
   * Server resolves via RELATED_METRICS + capability filter, so anything that
   * appears here is safe for the viewer to call.
   */
  followUps?: SuggestionChip[];
};

// =============================================================================
// refusal content type (Phase 3.4)
// Sibling of analytics_result — used when Aion can't answer because the metric
// isn't in the registry. See docs/reference/pages/reports-analytics-result-design.md §3.4.
// =============================================================================

export type Refusal = {
  type: 'refusal';
  /** Short user-facing prose. One sentence — "I don't have a defined metric for that." */
  text: string;
  /**
   * Machine-readable reason. Common values:
   *   'metric_not_in_registry' | 'insufficient_capability' | 'ambiguous_arg' | 'other'.
   */
  reason: string;
  /** Registry ID of the closest near-match, when Aion almost matched but no. */
  attemptedMetricId?: string;
  /**
   * Display title for the near-match. Resolved from the registry at tool-emit
   * time so the renderer never has to re-resolve it.
   */
  attemptedMetricTitle?: string;
  /** 2-3 alternatives the user can pick from. Reuses the shared SuggestionChip shape. */
  suggestions?: SuggestionChip[];
};

export type AionMessageContent =
  | { type: 'text'; text: string }
  | { type: 'suggestions'; text: string; chips: SuggestionChip[] }
  | { type: 'draft_preview'; text: string; draft: string; dealId: string; dealTitle: string; channel: 'sms' | 'email' }
  | { type: 'learned_summary'; text: string; rules: string[] }
  | { type: 'follow_up_queue'; text: string; items: QueuePreviewItem[] }
  | { type: 'scorecard'; text: string; title: string; metrics: ScorecardMetric[] }
  | { type: 'chart'; text: string; title: string; chartType: 'bar' | 'line' | 'area' | 'donut'; data: ChartDataPoint[]; valuePrefix?: string; valueSuffix?: string }
  | { type: 'data_table'; text: string; title: string; columns: DataTableColumn[]; rows: Record<string, string | number>[] }
  | AnalyticsResult
  | Refusal;

// =============================================================================
// Chat route request / response
// =============================================================================

export type AionChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AionPageContext = {
  type: string | null;
  entityId: string | null;
  label: string | null;
  secondaryId?: string | null;
  secondaryType?: string | null;
};

export type AionModelMode = 'auto' | 'fast' | 'thinking';

export type AionChatRequest = {
  messages: AionChatMessage[];
  workspaceId: string;
  sessionId?: string;
  pageContext?: AionPageContext;
  modelMode?: AionModelMode;
};

export type AionChatResponse = {
  messages: AionMessageContent[];
  configUpdates?: Partial<AionConfig>;
};

// =============================================================================
// Onboarding state machine
// =============================================================================

export type OnboardingState =
  | 'no_voice'
  | 'no_example'
  | 'no_guardrails'
  | 'needs_test_draft'
  | 'configured';

/**
 * Derive the onboarding state from the current aion_config.
 * Maps to the 5-state machine from the design doc:
 *   1. no_voice → ask about communication style
 *   2. no_example → ask for example message
 *   3. no_guardrails → ask about rules
 *   4. needs_test_draft → offer to generate a test draft
 *   5. configured → surface queue or idle
 */
export function getOnboardingState(config: AionConfig): OnboardingState {
  const v = config.voice;
  if (!v?.description) return 'no_voice';
  if (!v?.example_message) return 'no_example';
  if (!v?.guardrails) return 'no_guardrails';
  // If all three are set, check if onboarding was explicitly completed
  // For now, having all fields counts as configured
  if (config.onboarding_state === 'complete') return 'configured';
  return 'needs_test_draft';
}
