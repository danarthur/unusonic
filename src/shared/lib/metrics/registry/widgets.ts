/**
 * Widget-kind metric entries — Phase 2.1 library manifest.
 *
 * Extracted from registry.ts (Phase 0.5-style split, 2026-04-29).
 *
 * IDs use the `lobby.` namespace; `widgetKey` matches the folder under
 * `src/widgets/`. These cards own their own data fetch; the registry entry
 * only exists so the library picker + role-default resolver can reason about
 * them. Grouped by domain for review. Spread into the canonical METRICS map
 * by registry.ts.
 */

import type { MetricDefinition } from '../types';
import { noArgsSchema } from './schemas';

export const WIDGET_METRICS: Record<string, MetricDefinition> = {
  // ── Widget-kind entries (Phase 2.1 library manifest) ───────────────────────
  // IDs use the `lobby.` namespace; `widgetKey` matches the folder under
  // `src/widgets/`. These cards own their own data fetch; the registry entry
  // only exists so the library picker + role-default resolver can reason about
  // them. Grouped by domain for review.

  // Finance / revenue cards -------------------------------------------------

  'lobby.financial_pulse': {
    id: 'lobby.financial_pulse',
    kind: 'widget',
    widgetKey: 'financial-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Financial pulse',
    description: 'Outstanding receivables, money in, money out. Rolling snapshot.',
    emptyState: {
      title: 'No financial activity yet',
      body: 'Once you issue your first invoice or receive a payment, this card will surface receivables and cash movement.',
    },
  },

  'lobby.revenue_trend': {
    id: 'lobby.revenue_trend',
    kind: 'widget',
    widgetKey: 'revenue-trend',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Revenue trend',
    description: 'Revenue booked by month, trailing window. Tracks the slope of the business.',
    emptyState: {
      title: 'Not enough history',
      body: 'Revenue trend appears once you have at least two months of paid invoices.',
    },
  },

  'lobby.payment_health': {
    id: 'lobby.payment_health',
    kind: 'widget',
    widgetKey: 'payment-health',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Payment health',
    description: 'On-time vs late invoice mix for the workspace. High-signal signal for AR risk.',
    emptyState: {
      title: 'No invoices issued yet',
      body: 'Payment health lights up after your first issued invoice matures.',
    },
  },

  'lobby.client_concentration': {
    id: 'lobby.client_concentration',
    kind: 'widget',
    widgetKey: 'client-concentration',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view', 'deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Top clients',
    description: 'Revenue share by top accounts. Surfaces single-client risk.',
    emptyState: {
      title: 'No billable clients yet',
      body: 'Once deals close and invoice, your top clients will rank here.',
    },
  },

  'lobby.event_roi_snapshot': {
    id: 'lobby.event_roi_snapshot',
    kind: 'widget',
    widgetKey: 'event-roi-snapshot',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin', 'pm'],
    title: 'Event ROI',
    description: 'Revenue vs cost per event. Flags margin drift show-over-show.',
    emptyState: {
      title: 'No completed events with costs',
      body: 'ROI appears once an event has both billed revenue and recorded costs.',
    },
  },

  // Pipeline / sales cards --------------------------------------------------

  'lobby.deal_pipeline': {
    id: 'lobby.deal_pipeline',
    kind: 'widget',
    widgetKey: 'deal-pipeline',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin'],
    title: 'Pipeline',
    description: 'Open deals by stage, weighted value, and stage counts.',
    emptyState: {
      title: 'Pipeline is clear',
      body: 'Create a deal to see your pipeline take shape.',
    },
  },

  'lobby.pipeline_velocity': {
    id: 'lobby.pipeline_velocity',
    kind: 'widget',
    widgetKey: 'pipeline-velocity',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Pipeline velocity',
    description: 'Average time deals spend in each stage. Bottleneck detector.',
    emptyState: {
      title: 'Not enough stage history',
      body: 'Once deals have moved through multiple stages, their cadence appears here.',
    },
  },

  'lobby.passive_pipeline_feed': {
    id: 'lobby.passive_pipeline_feed',
    kind: 'widget',
    widgetKey: 'passive-pipeline-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Pipeline feed',
    description: 'Low-attention feed of recent pipeline movement — stage changes, proposal sends, new deals.',
    emptyState: {
      title: 'Quiet in the pipeline',
      body: 'Activity shows up here as deals move.',
    },
  },

  // Schedule / ops cards ----------------------------------------------------

  'lobby.today_schedule': {
    id: 'lobby.today_schedule',
    kind: 'widget',
    widgetKey: 'today-schedule',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Today',
    description: 'Events, calls, and load-ins scheduled for today in workspace timezone.',
    emptyState: {
      title: 'Nothing on today',
      body: 'Your workspace has no events scheduled for today.',
    },
  },

  'lobby.week_strip': {
    id: 'lobby.week_strip',
    kind: 'widget',
    widgetKey: 'week-strip',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'This week',
    description: 'Seven-day strip of scheduled events and major calls.',
    emptyState: {
      title: 'No events this week',
      body: 'Events scheduled in the next seven days will appear here.',
    },
  },

  'lobby.urgency_strip': {
    id: 'lobby.urgency_strip',
    kind: 'widget',
    widgetKey: 'urgency-strip',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Urgency',
    description: 'Deals, events, and invoices that need attention now.',
    emptyState: {
      title: 'Nothing urgent',
      body: 'Urgent items will surface at the top of your lobby when they appear.',
    },
  },

  'lobby.action_queue': {
    id: 'lobby.action_queue',
    kind: 'widget',
    widgetKey: 'action-queue',
    argsSchema: noArgsSchema,
    // Action items cut across domains; we show the card to anyone who can see
    // the lobby. Data fetcher filters by what the viewer is allowed to act on.
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Actions',
    description: 'Outstanding tasks assigned to you across deals, proposals, and shows.',
    emptyState: {
      title: 'Inbox zero',
      body: 'Nothing is waiting on you right now.',
    },
    notes: 'No required capability — data fetcher scopes to the viewer.',
  },

  'lobby.todays_brief': {
    id: 'lobby.todays_brief',
    kind: 'widget',
    widgetKey: 'todays-brief',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'daily',
    roles: ['owner', 'pm', 'finance_admin'],
    title: "Today's brief",
    description: 'Aion daily brief with actionable insights. Surfaces follow-ups, crew gaps, and stale deals. Kill-switch aware.',
    emptyState: {
      title: 'No briefing yet',
      body: 'The daily brief generates overnight. Check back tomorrow.',
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.1',
  },

  'lobby.owed_today': {
    id: 'lobby.owed_today',
    kind: 'widget',
    widgetKey: 'owed-today',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Owed today',
    description: 'Ranked worklist of deals waiting on you. Phone-first — log calls, snooze, dismiss inline.',
    emptyState: {
      title: 'Nothing owed today',
      body: 'Two deals are cooling — glance at Gone Quiet when you have a minute.',
    },
    notes: 'Replaces the post-it stack. Spec: docs/reference/sales-dashboard-design.md §5.2',
  },

  'lobby.this_week': {
    id: 'lobby.this_week',
    kind: 'widget',
    widgetKey: 'this-week',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator', 'employee'],
    title: 'This week',
    description: 'Five-day calendar ribbon. Confirmed shows + tentative date holds from open deals.',
    emptyState: {
      title: 'Nothing on the books this week',
      body: 'Good time to reach out.',
    },
    notes: 'Sales/ops cohabitation card. Spec: docs/reference/sales-dashboard-design.md §5.3',
  },

  'lobby.awaiting_signature': {
    id: 'lobby.awaiting_signature',
    kind: 'widget',
    widgetKey: 'awaiting-signature',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin'],
    title: 'Awaiting signature / deposit',
    description: 'Accepted proposals not yet signed + signed contracts with overdue deposits.',
    emptyState: {
      title: 'All current',
      body: 'All signatures and deposits are current.',
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.4',
  },

  'lobby.gone_quiet': {
    id: 'lobby.gone_quiet',
    kind: 'widget',
    widgetKey: 'gone-quiet',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Gone quiet',
    description: 'Stalled deals + dormant clients the post-it wall can\'t track. Capped at 5.',
    emptyState: {
      title: 'All active',
      body: "No one's fallen off — you're on top of it.",
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.5',
  },

  'lobby.recent_replies': {
    id: 'lobby.recent_replies',
    kind: 'widget',
    widgetKey: 'recent-replies',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Recent replies',
    description: 'Cross-deal feed of latest inbound client messages. One tap deep-links into the right deal\'s Replies card. Auto-replies aggregated to a muted footer row.',
    emptyState: {
      title: 'Nothing in the last 24 hours',
      body: 'When clients write back, you\'ll see it here first.',
    },
    notes: 'Closes the discoverability gap on the per-deal Replies card. Spec: docs/reference/replies-card-v2-design.md §6 PR #22.',
  },

  'lobby.weekly_tally': {
    id: 'lobby.weekly_tally',
    kind: 'widget',
    widgetKey: 'weekly-tally',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'This week',
    description: 'Outcome counts: proposals sent, deposits in, follow-ups logged, deals won. Never activity metrics.',
    emptyState: {
      title: 'New week',
      body: 'Activity will tally as the week progresses.',
    },
    notes: 'Cross-off card. Spec: docs/reference/sales-dashboard-design.md §5.6',
  },

  'lobby.activity_feed': {
    id: 'lobby.activity_feed',
    kind: 'widget',
    widgetKey: 'activity-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator'],
    title: 'Recent activity',
    description: 'Workspace-wide event stream — edits, sends, assignments, payments.',
    emptyState: {
      title: 'No activity yet',
      body: 'Activity will populate as you and your team work in Unusonic.',
    },
    notes: 'No required capability — fetcher filters rows to what the viewer can see.',
  },

  'lobby.action_stream': {
    id: 'lobby.action_stream',
    kind: 'widget',
    widgetKey: 'action-stream',
    argsSchema: noArgsSchema,
    // Suggested actions are Aion-driven.
    requiredCapabilities: ['tier:aion:active'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Action stream',
    description: 'Aion-suggested next actions based on what changed in your workspace.',
    emptyState: {
      title: 'No suggestions right now',
      body: 'Aion surfaces suggested actions as deals, shows, and invoices change.',
    },
    notes: 'Aion feature — gated on tier:aion:active.',
  },

  'lobby.event_type_dist': {
    id: 'lobby.event_type_dist',
    kind: 'widget',
    widgetKey: 'event-type-dist',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Event types',
    description: 'Mix of event types in the current window — festival, private, corporate, etc.',
    emptyState: {
      title: 'No events classified yet',
      body: 'Event-type distribution appears once you have tagged shows.',
    },
  },

  // Live production cards ---------------------------------------------------

  'lobby.live_gig_monitor': {
    id: 'lobby.live_gig_monitor',
    kind: 'widget',
    widgetKey: 'live-gig-monitor',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view', 'ros:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Live gig monitor',
    description: 'Countdown and status for the next show — load-in, doors, set times.',
    emptyState: {
      title: 'No upcoming shows',
      body: 'Your next show will appear here once scheduled.',
    },
  },

  'lobby.active_production': {
    id: 'lobby.active_production',
    kind: 'widget',
    widgetKey: 'active-production',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Active production',
    description: 'What is in production right now — crew on call, shows in motion.',
    emptyState: {
      title: 'Nothing in production',
      body: 'When crews are on call or shows are live, they show here.',
    },
  },

  'lobby.real_time_logistics': {
    id: 'lobby.real_time_logistics',
    kind: 'widget',
    widgetKey: 'real-time-logistics',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Real-time logistics',
    description: 'Transport status, crew arrivals, gear moves across today.',
    emptyState: {
      title: 'No logistics events today',
      body: 'Load-ins, transport, and crew check-ins appear here as they happen.',
    },
  },

  'lobby.production_timeline': {
    id: 'lobby.production_timeline',
    kind: 'widget',
    widgetKey: 'production-timeline',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Production timeline',
    description: 'Horizontal timeline across deals and events — milestones, critical dates.',
    emptyState: {
      title: 'Nothing on the timeline',
      body: 'Milestones appear here as you add deals and schedule shows.',
    },
  },

  'lobby.run_of_show': {
    id: 'lobby.run_of_show',
    kind: 'widget',
    widgetKey: 'run-of-show',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['ros:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Run of show',
    description: 'Cue-by-cue production timeline for an individual show.',
    emptyState: {
      title: 'No run of show yet',
      body: 'Create or import cues on the show page to build a run of show.',
    },
    notes: 'Typically embedded in the show page rather than picked standalone; present here for completeness. Employee persona uses run_of_show_feed (live, scoped) instead.',
  },

  'lobby.run_of_show_feed': {
    id: 'lobby.run_of_show_feed',
    kind: 'widget',
    widgetKey: 'run-of-show-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['ros:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator', 'employee'],
    title: 'Run-of-show feed',
    description: 'Live cue feed during a show — what is happening, what is next.',
    emptyState: {
      title: 'No active show',
      body: 'When a show is in live mode, cues stream here.',
    },
  },

  // Workspace / health cards ------------------------------------------------

  'lobby.global_pulse': {
    id: 'lobby.global_pulse',
    kind: 'widget',
    widgetKey: 'global-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Global pulse',
    description: 'Top-level business health at a glance — pipeline, cash, people, shows.',
    emptyState: {
      title: 'Pulse warming up',
      body: 'Health metrics appear once you have some deals and shows on the books.',
    },
    notes: 'No required capability — composite card; individual metrics gate themselves.',
  },

  'lobby.sentiment_pulse': {
    id: 'lobby.sentiment_pulse',
    kind: 'widget',
    widgetKey: 'sentiment-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['tier:aion:active'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Sentiment pulse',
    description: 'Aion-summarized signal across client comms, proposals, and show debriefs.',
    emptyState: {
      title: 'Sentiment is still building',
      body: 'Aion needs a few proposals and show debriefs before it can read signal.',
    },
    notes: 'Aion feature — gated on tier:aion:active.',
  },

  // Network / directory cards -----------------------------------------------

  'lobby.network': {
    id: 'lobby.network',
    kind: 'widget',
    widgetKey: 'network',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network',
    description: 'People, venues, and companies in your directory. The relationship graph.',
    emptyState: {
      title: 'Network is empty',
      body: 'Add a contact or summon a ghost to start building your network.',
    },
    notes: 'No required capability — reads directory.entities scoped to workspace.',
  },

  'lobby.network_detail': {
    id: 'lobby.network_detail',
    kind: 'widget',
    widgetKey: 'network-detail',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network detail',
    description: 'Deep-dive sheet for a single person or organization — trade ledger, notes, roster.',
    emptyState: {
      title: 'Pick a contact',
      body: 'Select someone from your network to open their dossier.',
    },
    notes: 'Sheet surface, not a standalone lobby card. Present so Aion can reference it.',
  },

  'lobby.network_stream': {
    id: 'lobby.network_stream',
    kind: 'widget',
    widgetKey: 'network-stream',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network stream',
    description: 'Membrane-style stream of directory activity — new contacts, recent touches.',
    emptyState: {
      title: 'No network activity yet',
      body: 'As contacts are added and touched, the stream fills in.',
    },
    notes: 'Layout surface for the network page, not a lobby card.',
  },

  'lobby.org_dashboard': {
    id: 'lobby.org_dashboard',
    kind: 'widget',
    widgetKey: 'org-dashboard',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['workspace:team:manage'],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Organization settings',
    description: 'Workspace-level org profile — name, logo, defaults.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Settings sheet, not a pickable lobby card. Exposed to the library so role-default resolver can show it to owners only.',
  },

  // Onboarding / nudge cards ------------------------------------------------

  'lobby.onboarding': {
    id: 'lobby.onboarding',
    kind: 'widget',
    widgetKey: 'onboarding',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Claim wizard',
    description: 'Guided flow for a new user claiming a ghost or completing onboarding.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Claim flow at /claim/[token]; not a lobby card. Catalogued for completeness.',
  },

  'lobby.passkey_nudge_banner': {
    id: 'lobby.passkey_nudge_banner',
    kind: 'widget',
    widgetKey: 'passkey-nudge-banner',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Passkey nudge',
    description: 'Banner prompting the viewer to add a passkey if none is enrolled.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Global layout banner, not picker-selectable. Registered so the library is exhaustive.',
  },

  'lobby.recovery_backup_prompt': {
    id: 'lobby.recovery_backup_prompt',
    kind: 'widget',
    widgetKey: 'recovery-backup-prompt',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Recovery backup',
    description: 'Prompt to back up the sovereign-recovery phrase + Shamir shards.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Security nudge banner, not a pickable card. Registered for completeness.',
  },

  'lobby.guardian_setup_reminder': {
    id: 'lobby.guardian_setup_reminder',
    kind: 'widget',
    widgetKey: 'guardian-setup-reminder',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    // Owner + admin only in practice — the widget itself gates on role — but
    // the library registry catalog these entries against the presets, so the
    // intersection holds.
    roles: ['owner'],
    title: 'Guardian setup reminder',
    description: 'Nudge to finish the Phase 5 non-skippable guardian gate when the user deferred or is below the Shamir threshold.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Global layout banner rendered from src/app/(dashboard)/layout.tsx. Not a library-pickable card; registered for exhaustiveness.',
  },

  // Dev / design surfaces ---------------------------------------------------

  'lobby.design_showcase': {
    id: 'lobby.design_showcase',
    kind: 'widget',
    widgetKey: 'design-showcase',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['workspace:owner'],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Identity lab',
    description: 'Internal design-system showcase. Not exposed to end users.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Dev-only surface. Gated to owners; will likely be removed from the library in a later phase.',
  },

  // Pinned answers (Phase 3.2) ----------------------------------------------

  'lobby.pinned_answers': {
    id: 'lobby.pinned_answers',
    kind: 'widget',
    widgetKey: 'pinned-answers',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Your pins',
    description: 'Answers you pinned from Aion. Refresh on cadence; click to re-open in Aion.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Rendered by the Lobby when the user has ≥1 pin. Not library-pickable; the page gates the section directly on pin count + feature flag.',
  },

  // Phase 5.1 — touring coordinator table-backed widgets --------------------
  // The scalar pairs (ops.crew_utilization, finance.revenue_yoy) live in the
  // RPC metric entries the parallel Phase 4.2+5.4 agent adds — they don't
  // need a separate widget entry. These three ride the underlying
  // ops.settlement_variance / ops.vendor_payment_status / ops.multi_stop_rollup
  // table metrics but surface as dedicated Lobby cards with tour-coordinator
  // empty-state copy per the role-default spec's catalog-gap notes.

  'lobby.settlement_tracking': {
    id: 'lobby.settlement_tracking',
    kind: 'widget',
    widgetKey: 'settlement-tracking',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Settlement tracking',
    description:
      'Largest variance between expected and actual settlement per show on the active tour.',
    emptyState: {
      title: 'No settlements to track',
      body: 'Settlement variance appears here once tour shows have received payments.',
    },
    notes:
      'Reads the ops.settlement_variance table metric and clips to the top 3 rows by absolute variance.',
  },

  'lobby.vendor_payment_status': {
    id: 'lobby.vendor_payment_status',
    kind: 'widget',
    widgetKey: 'vendor-payment-status',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Vendor payments',
    description:
      'Top vendors with outstanding balances on the active tour, with overdue counts.',
    emptyState: {
      title: 'All vendors paid up',
      body: 'No outstanding vendor balances on the active tour.',
    },
    notes:
      'Reads the ops.vendor_payment_status table metric and clips to the top 3 rows by outstanding amount.',
  },

  'lobby.multi_stop_rollup': {
    id: 'lobby.multi_stop_rollup',
    kind: 'widget',
    widgetKey: 'multi-stop-rollup',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Tour rollup',
    description:
      'Next 3–5 markets on the active tour with advance/load-in status per stop.',
    emptyState: {
      title: 'Not on tour',
      body: 'When a tour is active, upcoming markets and their status appear here.',
    },
    notes:
      'Reads the ops.multi_stop_rollup table metric; falls back to a stub shape (event_id, event_title, event_date, status) if the richer city column is not yet wired.',
  },

  // Event command-grid ------------------------------------------------------

  'lobby.event_dashboard': {
    id: 'lobby.event_dashboard',
    kind: 'widget',
    widgetKey: 'event-dashboard',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Event command',
    description: 'Full-page command grid for a single event — logistics, crew, financials.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Event page grid, not a lobby card. Registered so Aion/library can reference it.',
  },
};
