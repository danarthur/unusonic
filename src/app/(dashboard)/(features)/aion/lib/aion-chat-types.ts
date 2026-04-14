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

export type AionMessageContent =
  | { type: 'text'; text: string }
  | { type: 'suggestions'; text: string; chips: SuggestionChip[] }
  | { type: 'draft_preview'; text: string; draft: string; dealId: string; dealTitle: string; channel: 'sms' | 'email' }
  | { type: 'learned_summary'; text: string; rules: string[] }
  | { type: 'follow_up_queue'; text: string; items: QueuePreviewItem[] }
  | { type: 'scorecard'; text: string; title: string; metrics: ScorecardMetric[] }
  | { type: 'chart'; text: string; title: string; chartType: 'bar' | 'line' | 'donut'; data: ChartDataPoint[]; valuePrefix?: string; valueSuffix?: string }
  | { type: 'data_table'; text: string; title: string; columns: DataTableColumn[]; rows: Record<string, string | number>[] };

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
