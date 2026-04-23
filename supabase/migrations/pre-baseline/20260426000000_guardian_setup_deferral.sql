-- Phase 5 (login redesign): track the "I'll set this up later" decision on the
-- non-skippable guardian setup gate. Two additive columns on public.profiles
-- so the lobby reminder card can re-surface + so we have an audit trail of
-- when (if ever) the owner explicitly deferred the gate.
--
-- No new tables. No RLS change — profiles already has
-- `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`, which covers both
-- columns.
--
-- See: docs/reference/login-redesign-design.md §8
-- See: docs/reference/login-redesign-implementation-plan.md Phase 5

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guardian_setup_deferred boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guardian_setup_decision_at timestamptz;

-- Also add an optional display name to public.guardians so the setup step
-- can collect "name + email" without forcing a separate table. Email is still
-- the authoritative identifier (unique per owner), the display name is for
-- humanizing the outgoing invite email and the SecuritySection list.
ALTER TABLE public.guardians
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.profiles.guardian_setup_deferred IS
  'Phase 5 login redesign: true when the owner clicked "Skip anyway" on the '
  'non-skippable guardian setup warning. Lobby reminder card reads this to '
  'decide whether to resurface the prompt. Reset to false automatically when '
  'the user later reaches the threshold via /settings/security.';

COMMENT ON COLUMN public.profiles.guardian_setup_decision_at IS
  'Phase 5 login redesign: timestamp of the last explicit guardian-setup '
  'decision (either accepted = threshold met, or deferred). Null until the '
  'user has made a first-time decision. Audit-only; no RLS implications.';
