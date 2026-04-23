-- Migration: Add custom sending domain fields to workspaces
-- Session: Email Domain (Layer 2 white-label)
-- Allows each workspace to configure their own Resend sending domain.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS sending_domain        text NULL,
  ADD COLUMN IF NOT EXISTS resend_domain_id      text NULL,
  ADD COLUMN IF NOT EXISTS sending_domain_status text NULL
    CHECK (sending_domain_status IN ('not_started','pending','verified','temporary_failure','failure')),
  ADD COLUMN IF NOT EXISTS sending_from_name     text NULL,
  ADD COLUMN IF NOT EXISTS sending_from_localpart text NULL DEFAULT 'hello',
  ADD COLUMN IF NOT EXISTS dmarc_status          text NULL
    CHECK (dmarc_status IN ('not_configured','configured'));

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_sending_domain_unique UNIQUE (id, sending_domain)
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.workspaces.sending_domain IS 'Custom sending subdomain, e.g. mail.example.com. NULL = use Signal shared domain.';
COMMENT ON COLUMN public.workspaces.resend_domain_id IS 'Resend domain object ID. Required for verify/delete calls.';
COMMENT ON COLUMN public.workspaces.sending_domain_status IS 'Cached Resend verification status. Refresh via verifySendingDomain().';
COMMENT ON COLUMN public.workspaces.sending_from_name IS 'Display name in From header, e.g. Invisible Touch Events.';
COMMENT ON COLUMN public.workspaces.sending_from_localpart IS 'Local-part before @, e.g. hello or events. Default: hello.';
COMMENT ON COLUMN public.workspaces.dmarc_status IS 'Whether _dmarc record detected on the sending domain.';
