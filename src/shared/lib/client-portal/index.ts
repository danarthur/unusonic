/**
 * Client portal server helpers — public surface.
 *
 * All members are server-only. Import from here in server components,
 * server actions, and route handlers. See client-portal-design.md §16.3.
 *
 * @module shared/lib/client-portal
 */
import 'server-only';

export {
  CLIENT_PORTAL_SESSION_COOKIE,
  CLIENT_PORTAL_STEP_UP_COOKIE,
  CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS,
  CLIENT_PORTAL_STEP_UP_TTL_SECONDS,
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  readStepUpCookie,
  setStepUpCookie,
  clearStepUpCookie,
} from './cookies';

export { computeDeviceIdHash, compareDeviceHashes } from './device';

export {
  logAccess,
  type ClientPortalResource,
  type ClientPortalAction,
  type ClientPortalActorKind,
  type ClientPortalAuthMethod,
  type ClientPortalOutcome,
  type LogAccessInput,
} from './audit';

export {
  mintClientPortalSession,
  type MintSessionInput,
  type MintSessionResult,
} from './mint-session';

export {
  rotateClientPortalSession,
  type RotateResult,
} from './rotate-session';

export {
  getClientPortalContext,
  getRequestIp,
  type ClientPortalContext,
  type ClientPortalContextKind,
  type ClientPortalEntitySummary,
} from './context';

export {
  checkRateLimit,
  hashEmailKey,
  type RateLimitScope,
  type RateLimitResult,
} from './rate-limit';

export {
  issueOtpChallenge,
  verifyOtpChallenge,
  type OtpPurpose,
  type IssueOtpInput,
  type IssueOtpResult,
  type VerifyOtpInput,
  type VerifyOtpResult,
} from './otp';

export {
  requireStepUp,
  stepUpRequiredResponse,
  type StepUpMethod,
  type StepUpRequirement,
  type StepUpDenial,
  type StepUpApproval,
} from './step-up';

export { computeClientSessionExpiry } from './session-expiry';

export {
  resolveClientEntityForProposal,
  type ResolvedProposalEntity,
} from './resolve-proposal-entity';

export {
  resolveDealContact,
  type ResolvedDealContact,
  type DealContactSource,
} from './resolve-deal-contact';
