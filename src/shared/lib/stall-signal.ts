export type StallSignal = {
  stalled: boolean;
  daysInStage: number;
  threshold: number;
  urgent: boolean;
  stageName: string;
  suggestion: string;
};

/**
 * Computes whether a deal is stalling in its current pipeline stage.
 * Accepts typed objects (for client-side use in React components).
 */
export function computeStallSignal(
  deal: { created_at: string; proposed_date: string | null },
  proposal: { created_at?: string; updated_at?: string } | null,
  currentStage: number,
): StallSignal | null {
  return computeStallSignalFromRaw({
    status: '', // not used internally — stage is passed directly
    createdAt: deal.created_at,
    proposalCreatedAt: proposal?.created_at ?? null,
    proposalUpdatedAt: proposal?.updated_at ?? null,
    proposedDate: deal.proposed_date,
    currentStage,
  });
}

/**
 * Computes whether a deal is stalling in its current pipeline stage.
 * Accepts scalar params (for server-side cron use).
 */
export function computeStallSignalFromRaw(params: {
  status: string;
  createdAt: string;
  proposalCreatedAt: string | null;
  proposalUpdatedAt: string | null;
  proposedDate: string | null;
  currentStage: number;
}): StallSignal | null {
  const { createdAt, proposalCreatedAt, proposalUpdatedAt, proposedDate, currentStage } = params;
  const now = Date.now();
  const eventDate = proposedDate ? new Date(proposedDate + 'T00:00:00').getTime() : null;
  const daysUntilEvent = eventDate ? Math.ceil((eventDate - now) / 86400000) : null;
  const urgent = daysUntilEvent !== null && daysUntilEvent <= 60;

  let stageStartMs: number | null = null;
  let threshold: number;
  let stageName: string;
  let suggestion: string;

  if (currentStage === 0) {
    stageStartMs = new Date(createdAt).getTime();
    threshold = urgent ? 4 : 7;
    stageName = 'Inquiry';
    suggestion = 'Build a proposal to move this forward.';
  } else if (currentStage === 1) {
    stageStartMs = proposalCreatedAt ? new Date(proposalCreatedAt).getTime() : null;
    threshold = urgent ? 7 : 14;
    stageName = 'Proposal';
    suggestion = 'Send the proposal to the client.';
  } else if (currentStage === 2) {
    stageStartMs = proposalUpdatedAt ? new Date(proposalUpdatedAt).getTime() : null;
    threshold = urgent ? 3 : 5;
    stageName = 'Contract sent';
    suggestion = 'Follow up — the client may need a nudge.';
  } else {
    return null;
  }

  if (stageStartMs === null) return null;
  const daysInStage = Math.floor((now - stageStartMs) / 86400000);
  if (daysInStage < 0) return null;

  return { stalled: daysInStage >= threshold, daysInStage, threshold, urgent, stageName, suggestion };
}
