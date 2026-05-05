export { CallTimeRulesManager } from './ui/CallTimeRulesManager';
export { getCallTimeRules, upsertCallTimeRule, deleteCallTimeRule } from './api/actions';
// Type re-export goes directly to the originating lib module, NOT through
// the 'use server' api/actions file — see the note in api/actions.ts about
// the Next 16 server-action bundler choking on type-only re-exports.
export type { WorkspaceCallTimeRule } from '@/app/(dashboard)/(features)/productions/actions/apply-call-time-rules';
