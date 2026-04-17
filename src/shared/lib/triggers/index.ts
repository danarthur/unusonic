export type {
  TriggerTier,
  TriggerContext,
  TriggerResult,
  TriggerPrimitive,
} from './types';

export {
  registerPrimitive,
  getPrimitive,
  listAllPrimitives,
  listByTier,
} from './registry';

export { normalizeTriggers } from './normalize';
export type { TriggerEntry } from './normalize';
