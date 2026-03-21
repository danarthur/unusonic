/**
 * Sales feature – Deal Room, proposals, contracts
 * @module features/sales
 */

export { getGigDealRoom } from './api/get-deal-room';
export { DealDashboard } from './ui/deal-dashboard';
export { PipelineTracker } from './ui/pipeline-tracker';
export { PIPELINE_STAGES } from './model/types';
export type { DealRoomDTO, DealRoomPipeline, PipelineStageLabel } from './model/types';
