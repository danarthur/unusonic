/**
 * Shared row shapes for the Aion admin telemetry dashboard.
 * Mirror the RETURNS TABLE shape of each `aion.metric_*` RPC.
 */

export type DismissRateRow = {
  signal_type: string;
  total_emitted: number;
  not_useful_count: number;
  not_useful_rate: number;
  above_threshold: boolean;
};

export type HitRateRow = {
  signal_type: string;
  total_emitted: number;
  already_handled_count: number;
  hit_rate: number;
  meets_min_sample: boolean;
};

export type ToolDepthRow = {
  total_turns: number;
  avg_depth: number;
  p95_depth: number;
  threshold_exceeded: boolean;
};

export type ClickThroughRow = {
  total_emits: number;
  total_clicks: number;
  click_through_rate: number;
};

export type KillMetricRow = {
  workspace_id: string;
  user_id: string;
  total_opens: number;
  max_in_window: number;
  first_open: string;
  last_open: string;
};
