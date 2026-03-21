-- Add signer_name and signed_ip to proposals for audit trail
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signed_ip text;
