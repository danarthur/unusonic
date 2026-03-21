/**
 * ION Suggested Actions — Next Best Action cards.
 * Stub data until ION API returns real suggestions.
 */

export type SuggestedAction = {
  id: string;
  title: string;
  detail: string;
  cta: string;
  /** e.g. "follow_up" | "contract" | "invoice" */
  type: string;
  /** Optional entity id for deep link */
  entityId?: string;
};

/** Placeholder actions for Action Stream. Replace with API/ION when ready. */
export const STUB_SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    id: '1',
    title: 'Contract for Allegra pending 3 days',
    detail: 'Send ION follow-up?',
    cta: 'Send follow-up',
    type: 'follow_up',
    entityId: undefined,
  },
  {
    id: '2',
    title: 'Invoice #1042 overdue',
    detail: 'Client has not responded.',
    cta: 'Have ION draft reminder',
    type: 'invoice',
    entityId: undefined,
  },
  {
    id: '3',
    title: 'New lead: Summit Events',
    detail: 'Initial outreach not yet sent.',
    cta: 'Draft outreach',
    type: 'lead',
    entityId: undefined,
  },
];
