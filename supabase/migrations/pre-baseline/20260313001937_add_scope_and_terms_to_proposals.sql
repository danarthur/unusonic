-- Migration: add scope_notes and terms_and_conditions to proposals
-- Task 5.1 / 5.2 — proposal builder upgrade plan

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS scope_notes text,
  ADD COLUMN IF NOT EXISTS terms_and_conditions text;
