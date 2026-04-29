/**
 * Shared types for aion-deal-card.tsx + its split sub-modules.
 *
 * Lifted out of the main card file so the signals helper, footer cluster,
 * and conversation thread can reference them without circular imports.
 */

import type { OutboundRow, PipelineRow } from '../../actions/get-aion-card-for-deal';
import type { Message as SessionMessage } from '@/shared/ui/providers/SessionContext';

/** Discriminated union — primary recommendation is either an outbound nudge
 *  (a follow-up the user hasn't sent yet) or a pipeline advance (the deal is
 *  ready to move to the next stage). The card surfaces exactly one. */
export type PrimaryRecommendation =
  | { kind: 'outbound'; row: OutboundRow }
  | { kind: 'pipeline'; row: PipelineRow };

/** Chat conversation message shape — uses SessionContext's Message type so
 *  the card renders the same thread rows the Aion tab does. Role can be
 *  'user' | 'assistant' | 'system'; the card's MessageBubble treats anything
 *  non-'user' as Aion-authored. */
export type AionChatMessage = SessionMessage;
