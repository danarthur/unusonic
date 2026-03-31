-- Add docuseal_embed_src to proposals table.
-- Stores the DocuSeal submitter embed URL returned at submission creation time.
-- Required so the public proposal portal (/p/[token]) can render the DocuSeal
-- iframe without a round-trip back to the DocuSeal API.
-- The embed_src is a submitter-scoped token URL that remains valid until the
-- submission is completed or explicitly cancelled.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS docuseal_embed_src text;
