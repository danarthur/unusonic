-- ============================================================================
-- Unusonic baseline schema — captured from prod 2026-04-23
-- ============================================================================
-- This file is a one-time capture of the prod schema as of commit b175560.
-- Source: pg_dump 18.3 from postgres 17.6 (Supabase project wlhmgtnelqhzqyrphadd).
--
-- Purpose: bootstrap a fresh CI database with the baseline Unusonic schema so
-- pgTAP tests can run. Prod has this version recorded in
-- supabase_migrations.schema_migrations; prod will NEVER re-apply this file.
--
-- Historical migrations that produced this state live in
-- supabase/migrations/pre-baseline/ (moved at the same time). New migrations
-- authored after 2026-04-23 go in supabase/migrations/ on top of this
-- baseline.
--
-- Re-capturing the baseline: run `supabase db dump --schema-only --no-owner
-- --schema public,ops,directory,cortex,finance,catalog` against prod, strip
-- `\restrict`/`\unrestrict` directives, prepend this header.
-- ============================================================================

-- Extensions (Supabase local dev usually pre-installs these; idempotent guards
-- keep us safe on any fresh DB). The `extensions` schema is pre-created by
-- Supabase's init but we defensively ensure it exists for non-Supabase Postgres
-- targets too.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: catalog; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS catalog;


--
-- Name: cortex; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS cortex;


--
-- Name: directory; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS directory;


--
-- Name: finance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS finance;


--
-- Name: ops; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS ops;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: affiliation_access_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.affiliation_access_level AS ENUM (
    'admin',
    'member',
    'read_only'
);


--
-- Name: area_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.area_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: confidentiality_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.confidentiality_level AS ENUM (
    'public',
    'private',
    'secret'
);


--
-- Name: contract_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contract_status AS ENUM (
    'draft',
    'sent',
    'signed'
);


--
-- Name: cue_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cue_type AS ENUM (
    'stage',
    'audio',
    'lighting',
    'video',
    'logistics'
);


--
-- Name: deal_stakeholder_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_stakeholder_role AS ENUM (
    'bill_to',
    'planner',
    'venue_contact',
    'vendor',
    'host',
    'day_of_poc',
    'booker',
    'principal',
    'representative',
    'deal_poc'
);


--
-- Name: employment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employment_status AS ENUM (
    'internal_employee',
    'external_contractor'
);


--
-- Name: event_lifecycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_lifecycle_status AS ENUM (
    'lead',
    'tentative',
    'confirmed',
    'production',
    'live',
    'post',
    'archived',
    'cancelled'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'planned',
    'confirmed',
    'completed',
    'canceled',
    'booked',
    'hold',
    'cancelled'
);


--
-- Name: guardian_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.guardian_status AS ENUM (
    'pending',
    'active'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


--
-- Name: org_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_category AS ENUM (
    'vendor',
    'venue',
    'coordinator',
    'client'
);


--
-- Name: org_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_member_role AS ENUM (
    'owner',
    'admin',
    'member',
    'restricted'
);


--
-- Name: org_relationship_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_relationship_tier AS ENUM (
    'standard',
    'preferred',
    'strategic'
);


--
-- Name: org_relationship_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.org_relationship_type AS ENUM (
    'vendor',
    'venue',
    'client',
    'partner'
);


--
-- Name: organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_type AS ENUM (
    'solo',
    'agency',
    'venue'
);


--
-- Name: package_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.package_category AS ENUM (
    'service',
    'rental',
    'talent',
    'package',
    'retail_sale',
    'fee'
);


--
-- Name: TYPE package_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.package_category IS 'Package, Service, Rental, Talent, Retail/Sale (merchandise), Fee (admin/digital).';


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'credit_card',
    'wire',
    'check',
    'cash',
    'stripe'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'succeeded',
    'pending',
    'failed'
);


--
-- Name: person_relationship; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.person_relationship AS ENUM (
    'family',
    'friend',
    'client',
    'vendor',
    'partner',
    'lead',
    'team',
    'other'
);


--
-- Name: priority_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_level AS ENUM (
    'p0',
    'p1',
    'p2',
    'p3'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);


--
-- Name: proposal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.proposal_status AS ENUM (
    'draft',
    'sent',
    'viewed',
    'accepted',
    'rejected'
);


--
-- Name: qbo_sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qbo_sync_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: relationship_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.relationship_type AS ENUM (
    'vendor',
    'venue',
    'client_company',
    'partner'
);


--
-- Name: skill_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.skill_level AS ENUM (
    'junior',
    'mid',
    'senior',
    'lead'
);


--
-- Name: source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.source_type AS ENUM (
    'manual',
    'ios_shortcut',
    'email',
    'sms',
    'web',
    'calendar',
    'n8n',
    'notion',
    'import',
    'agent'
);


--
-- Name: spine_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.spine_item_status AS ENUM (
    'inbox',
    'active',
    'waiting',
    'scheduled',
    'someday',
    'reference',
    'archived',
    'deleted'
);


--
-- Name: spine_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.spine_item_type AS ENUM (
    'note',
    'task',
    'event',
    'person',
    'project',
    'area',
    'decision',
    'idea',
    'file',
    'link',
    'message',
    'journal',
    'finance_data'
);


--
-- Name: subscription_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_tier AS ENUM (
    'foundation',
    'growth',
    'studio'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'inbox',
    'next',
    'doing',
    'waiting',
    'done',
    'dropped'
);


--
-- Name: user_persona; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_persona AS ENUM (
    'solo_professional',
    'agency_team',
    'venue_brand'
);


--
-- Name: _pin_args_hash(jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex._pin_args_hash(p_args jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_temp'
    AS $$
  SELECT md5(COALESCE(p_args::text, '{}'));
$$;


--
-- Name: _pin_assert_membership(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex._pin_assert_membership(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: archive_aion_session(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.archive_aion_session(p_session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_sessions
     SET archived_at = now()
   WHERE id          = p_session_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: FUNCTION archive_aion_session(p_session_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.archive_aion_session(p_session_id uuid) IS 'Soft-delete an Aion session by stamping archived_at. Caller must own the session. Pair with the existing delete_aion_session for permanent removal.';


--
-- Name: claim_memory_pending_batch(integer); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.claim_memory_pending_batch(p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, workspace_id uuid, source_type text, source_id text, content_text text, content_header text, entity_ids uuid[], metadata jsonb, attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex'
    AS $$
BEGIN
  RETURN QUERY
    UPDATE cortex.memory_pending p
    SET last_attempted_at = now(),
        attempts = p.attempts + 1
    WHERE p.id IN (
      SELECT q.id
      FROM cortex.memory_pending q
      WHERE q.next_attempt_after <= now()
        AND q.attempts < 6
      ORDER BY q.enqueued_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      p.id, p.workspace_id, p.source_type, p.source_id,
      p.content_text, p.content_header, p.entity_ids, p.metadata,
      p.attempts;
END;
$$;


--
-- Name: create_aion_session(uuid, uuid, uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.create_aion_session(p_workspace_id uuid, p_user_id uuid, p_id uuid DEFAULT gen_random_uuid(), p_preview text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  INSERT INTO cortex.aion_sessions (id, workspace_id, user_id, preview)
  VALUES (p_id, p_workspace_id, p_user_id, p_preview);
  RETURN p_id;
END;
$$;


--
-- Name: create_new_aion_session_for_scope(uuid, text, uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.create_new_aion_session_for_scope(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public', 'ops'
    AS $$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id' USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type USING ERRCODE = '22023';
  END IF;
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    RAISE EXCEPTION 'event-scoped sessions are not yet available' USING ERRCODE = '0A000';
  END IF;
  INSERT INTO cortex.aion_sessions (workspace_id, user_id, scope_type, scope_entity_id, title)
  VALUES (p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title)
  RETURNING id INTO v_session_id;
  RETURN v_session_id;
END;
$$;


--
-- Name: delete_aion_session(uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.delete_aion_session(p_session_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  DELETE FROM cortex.aion_sessions
    WHERE id = p_session_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;


--
-- Name: delete_lobby_pin(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.delete_lobby_pin(p_pin_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
BEGIN
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM cortex._pin_assert_membership(v_workspace_id);

  IF auth.uid() IS NOT NULL AND v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete another user''s pin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM cortex.aion_memory WHERE id = p_pin_id;
END;
$$;


--
-- Name: FUNCTION delete_lobby_pin(p_pin_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.delete_lobby_pin(p_pin_id uuid) IS 'Delete a Lobby pin. Authenticated callers may only delete their own pins.';


--
-- Name: delete_memory_embedding(text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.delete_memory_embedding(p_source_type text, p_source_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  DELETE FROM cortex.memory
    WHERE source_type = p_source_type AND source_id = p_source_id;
  RETURN FOUND;
END;
$$;


--
-- Name: delete_referral(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.delete_referral(p_referral_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_workspace uuid;
  v_created_by uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, created_by INTO v_workspace, v_created_by
    FROM cortex.referrals WHERE id = p_referral_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  -- Must be a workspace member. Any member can delete — referrals are shared.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  DELETE FROM cortex.referrals WHERE id = p_referral_id;
  RETURN TRUE;
END;
$$;


--
-- Name: dismiss_aion_insight(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.dismiss_aion_insight(p_insight_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  UPDATE cortex.aion_insights SET status = 'dismissed', dismissed_at = now() WHERE id = p_insight_id AND status IN ('pending', 'surfaced');
  RETURN FOUND;
END; $$;


--
-- Name: dismiss_aion_proactive_line(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.dismiss_aion_proactive_line(p_line_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id     uuid;
  v_workspace   uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT pl.workspace_id INTO v_workspace
    FROM cortex.aion_proactive_lines pl
   WHERE pl.id = p_line_id
     AND pl.dismissed_at IS NULL;
  IF v_workspace IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = v_workspace
       AND wm.user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_proactive_lines
     SET dismissed_at = now(),
         dismissed_by = v_user_id
   WHERE id = p_line_id
     AND dismissed_at IS NULL;

  RETURN FOUND;
END;
$$;


--
-- Name: FUNCTION dismiss_aion_proactive_line(p_line_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.dismiss_aion_proactive_line(p_line_id uuid) IS 'User-initiated dismiss for a proactive line. Workspace-member-gated. Writes dismissed_by for throttle tracking.';


--
-- Name: dismiss_capture(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.dismiss_capture(p_capture_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET status = 'dismissed', dismissed_at = now()
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;


--
-- Name: dismiss_ui_notice(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.dismiss_ui_notice(p_notice_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
BEGIN
  UPDATE cortex.ui_notices
     SET seen_at = now()
   WHERE id = p_notice_id
     AND user_id = auth.uid()
     AND seen_at IS NULL;
  RETURN FOUND;
END;
$$;


--
-- Name: due_lobby_pins(integer); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.due_lobby_pins(p_limit integer DEFAULT 200) RETURNS TABLE(pin_id uuid, workspace_id uuid, user_id uuid, metric_id text, args jsonb, cadence text, last_refreshed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'cortex', 'pg_temp'
    AS $$
  WITH due AS (
    SELECT m.id, m.workspace_id, m.user_id, m.metadata
    FROM cortex.aion_memory m
    WHERE m.scope = 'lobby_pin'
      AND (
        (m.metadata->>'refresh_cadence' = 'hourly'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '55 minutes')
        OR
        (m.metadata->>'refresh_cadence' = 'daily'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '23 hours')
        OR
        (m.metadata->>'refresh_cadence' = 'live'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '5 minutes')
      )
    ORDER BY COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz) ASC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT
    d.id AS pin_id,
    d.workspace_id,
    d.user_id,
    (d.metadata->>'metric_id')::text AS metric_id,
    COALESCE(d.metadata->'args', '{}'::jsonb) AS args,
    (d.metadata->>'refresh_cadence')::text AS cadence,
    NULLIF(d.metadata->>'last_refreshed_at', '')::timestamptz AS last_refreshed_at
  FROM due d;
$$;


--
-- Name: FUNCTION due_lobby_pins(p_limit integer); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.due_lobby_pins(p_limit integer) IS 'Returns up to p_limit lobby pins due for refresh (hourly, daily, live cadences). Oldest last_refreshed_at first. Service role only — used by the pin-refresh cron.';


--
-- Name: emit_aion_proactive_line(uuid, uuid, text, text, jsonb, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_id       uuid;
  v_enabled  boolean;
BEGIN
  SELECT COALESCE(d.aion_proactive_enabled, true) INTO v_enabled
    FROM public.deals d
   WHERE d.id = p_deal_id AND d.workspace_id = p_workspace_id;
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  INSERT INTO cortex.aion_proactive_lines (
    workspace_id, deal_id, signal_type, headline, artifact_ref, payload
  )
  VALUES (
    p_workspace_id, p_deal_id, p_signal_type, p_headline, p_artifact_ref, COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (workspace_id, deal_id, created_date_local) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb) IS 'Service-role entry point for the proactive-line evaluator cron. Idempotent per workspace-local day via unique index. Honors public.deals.aion_proactive_enabled.';


--
-- Name: enqueue_memory_pending(uuid, text, text, text, text, uuid[], jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text DEFAULT NULL::text, p_entity_ids uuid[] DEFAULT '{}'::uuid[], p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.memory_pending (
    workspace_id, source_type, source_id, content_text, content_header,
    entity_ids, metadata
  )
  VALUES (
    p_workspace_id, p_source_type, p_source_id, p_content_text, p_content_header,
    p_entity_ids, p_metadata
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    content_text       = EXCLUDED.content_text,
    content_header     = EXCLUDED.content_header,
    entity_ids         = EXCLUDED.entity_ids,
    metadata           = EXCLUDED.metadata,
    attempts           = 0,
    next_attempt_after = now(),
    last_error         = NULL,
    last_attempted_at  = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_entity_ids uuid[], p_metadata jsonb); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_entity_ids uuid[], p_metadata jsonb) IS 'Service-role-only enqueue. source_id is text to support composite activity-log chunk keys (e.g. <deal_uuid>:YYYYMM).';


--
-- Name: fanout_ui_notice(uuid, text, jsonb, timestamp with time zone); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.fanout_ui_notice(p_workspace_id uuid, p_notice_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
DECLARE
  v_role text;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fanout_ui_notice requires an authenticated caller';
  END IF;
  v_role := public.get_member_role_slug(p_workspace_id);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only owners and admins can fan out notices';
  END IF;
  INSERT INTO cortex.ui_notices (workspace_id, user_id, notice_type, payload, expires_at)
  SELECT p_workspace_id, wm.user_id, p_notice_type, p_payload, p_expires_at
    FROM public.workspace_members wm
   WHERE wm.workspace_id = p_workspace_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: get_proactive_line_dismiss_rates(uuid, integer, integer); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer DEFAULT 7, p_min_sample integer DEFAULT 3) RETURNS TABLE(signal_type text, total_emitted integer, total_dismissed integer, dismiss_rate numeric, above_threshold boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
  WITH stats AS (
    SELECT
      pl.signal_type,
      COUNT(*)::int                                                   AS total_emitted,
      COUNT(*) FILTER (WHERE pl.dismissed_at IS NOT NULL)::int        AS total_dismissed
    FROM cortex.aion_proactive_lines pl
    WHERE pl.workspace_id = p_workspace_id
      AND pl.created_at   >= now() - make_interval(days => GREATEST(1, p_window_days))
    GROUP BY pl.signal_type
  )
  SELECT
    s.signal_type,
    s.total_emitted,
    s.total_dismissed,
    CASE WHEN s.total_emitted > 0
         THEN ROUND(s.total_dismissed::numeric / s.total_emitted::numeric, 4)
         ELSE 0::numeric
    END                                                               AS dismiss_rate,
    (
      s.total_emitted >= GREATEST(1, p_min_sample)
      AND (s.total_dismissed::numeric / NULLIF(s.total_emitted, 0)::numeric) > 0.35
    )                                                                 AS above_threshold
  FROM stats s;
$$;


--
-- Name: FUNCTION get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer) IS 'Phase 2 Sprint 2 telemetry: per-signal-type dismiss rate over a rolling window. above_threshold flags types with > 35% dismiss rate on >= p_min_sample emissions. Called by the evaluator cron to auto-disable noisy signals.';


--
-- Name: hybrid_search(text, extensions.vector, integer, double precision, double precision, integer); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.hybrid_search(query_text text, query_embedding extensions.vector, match_count integer DEFAULT 10, full_text_weight double precision DEFAULT 1, semantic_weight double precision DEFAULT 1, rrf_k integer DEFAULT 50) RETURNS TABLE(id uuid, entity_id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE sql SECURITY DEFINER
    AS $$
WITH full_text AS (
    -- 1. Keyword Search
    SELECT 
        m.id, 
        ROW_NUMBER() OVER(ORDER BY ts_rank(m.fts_vector, websearch_to_tsquery('english', query_text)) DESC) AS rank_ix
    FROM cortex.memory m
    WHERE m.fts_vector @@ websearch_to_tsquery('english', query_text)
),
semantic AS (
    -- 2. Vector Search
    SELECT 
        m.id, 
        ROW_NUMBER() OVER(ORDER BY m.embedding <=> query_embedding) AS rank_ix
    FROM cortex.memory m
)
-- 3. Merge and Score (Reciprocal Rank Fusion)
SELECT 
    m.id,
    m.entity_id,
    m.content,
    m.metadata,
    -- The RRF Formula
    COALESCE(1.0 / (rrf_k + f.rank_ix), 0.0) * full_text_weight +
    COALESCE(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight AS similarity
FROM full_text f
FULL OUTER JOIN semantic s ON f.id = s.id
JOIN cortex.memory m ON m.id = COALESCE(f.id, s.id)
ORDER BY similarity DESC
LIMIT match_count;
$$;


--
-- Name: list_lobby_pin_health(uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid) RETURNS TABLE(pin_id uuid, last_viewed_at timestamp with time zone, last_error_message text, last_error_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22004';
  END IF;
  PERFORM cortex._pin_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    m.id AS pin_id,
    NULLIF(m.metadata->>'last_viewed_at', '')::timestamptz AS last_viewed_at,
    NULLIF(m.metadata#>>'{last_error,message}', '')::text AS last_error_message,
    NULLIF(m.metadata#>>'{last_error,at}', '')::timestamptz AS last_error_at
  FROM cortex.aion_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = p_user_id
    AND m.scope = 'lobby_pin';
END;
$$;


--
-- Name: FUNCTION list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid) IS 'Returns (last_viewed_at, last_error) sidecar data for a users pins. Used by the Lobby widget to compute staleness and render the refresh-error chip.';


--
-- Name: list_lobby_pins(uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.list_lobby_pins(p_workspace_id uuid, p_user_id uuid) RETURNS TABLE(pin_id uuid, title text, metric_id text, args jsonb, cadence text, last_value jsonb, last_refreshed_at timestamp with time zone, "position" integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22004';
  END IF;
  PERFORM cortex._pin_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    m.id AS pin_id,
    m.fact AS title,
    (m.metadata->>'metric_id')::text AS metric_id,
    COALESCE(m.metadata->'args', '{}'::jsonb) AS args,
    COALESCE(m.metadata->>'refresh_cadence', 'manual')::text AS cadence,
    COALESCE(m.metadata->'last_value', '{}'::jsonb) AS last_value,
    NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz AS last_refreshed_at,
    COALESCE((m.metadata->>'position')::int, 0) AS position
  FROM cortex.aion_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = p_user_id
    AND m.scope = 'lobby_pin'
  ORDER BY COALESCE((m.metadata->>'position')::int, 0) ASC, m.created_at ASC;
END;
$$;


--
-- Name: FUNCTION list_lobby_pins(p_workspace_id uuid, p_user_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.list_lobby_pins(p_workspace_id uuid, p_user_id uuid) IS 'Return Lobby pins for a given (workspace, user) in position order.';


--
-- Name: log_referral(uuid, text, uuid, text, uuid, uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.log_referral(p_workspace_id uuid, p_direction text, p_counterparty_entity_id uuid, p_client_name text DEFAULT NULL::text, p_client_entity_id uuid DEFAULT NULL::uuid, p_related_deal_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_direction NOT IN ('received', 'sent') THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Counterparty must live in the same workspace.
  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_counterparty_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Optional client_entity must live in the same workspace if provided.
  IF p_client_entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_client_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  -- Optional deal must live in the same workspace if provided.
  IF p_related_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_related_deal_id AND workspace_id = p_workspace_id
  ) THEN RETURN NULL; END IF;

  INSERT INTO cortex.referrals (
    workspace_id, direction, counterparty_entity_id,
    client_name, client_entity_id, related_deal_id, note,
    created_by
  ) VALUES (
    p_workspace_id, p_direction, p_counterparty_entity_id,
    NULLIF(p_client_name, ''), p_client_entity_id, p_related_deal_id,
    NULLIF(p_note, ''),
    v_user_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: mark_lobby_pin_failure(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone DEFAULT now()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE cortex.aion_memory
  SET metadata = metadata || jsonb_build_object(
    'last_error', jsonb_build_object(
      'message', COALESCE(p_error_message, ''),
      'at', p_error_at
    )
  )
  WHERE id = p_pin_id AND scope = 'lobby_pin';
END;
$$;


--
-- Name: FUNCTION mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone) IS 'Record a refresh failure on a pin as metadata.last_error without touching last_value. Service role only (used by Phase 3.3 pin-refresh cron).';


--
-- Name: mark_memory_pending_result(uuid, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.mark_memory_pending_result(p_id uuid, p_status text, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex'
    AS $$
DECLARE
  v_attempts int;
  v_backoff_min int;
BEGIN
  IF p_status = 'success' THEN
    DELETE FROM cortex.memory_pending WHERE id = p_id;
    RETURN;
  END IF;

  IF p_status <> 'failure' THEN
    RAISE EXCEPTION 'mark_memory_pending_result: status must be success or failure';
  END IF;

  SELECT attempts INTO v_attempts FROM cortex.memory_pending WHERE id = p_id;
  IF v_attempts IS NULL THEN
    RETURN;
  END IF;

  v_backoff_min := LEAST(64, POWER(2, v_attempts)::int);

  UPDATE cortex.memory_pending
  SET next_attempt_after = now() + (v_backoff_min || ' minutes')::interval,
      last_error         = p_error
  WHERE id = p_id;
END;
$$;


--
-- Name: FUNCTION mark_memory_pending_result(p_id uuid, p_status text, p_error text); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.mark_memory_pending_result(p_id uuid, p_status text, p_error text) IS 'Drain-cron callback. success deletes; failure backs off exponentially up to 6 attempts, then freezes the row for manual recovery.';


--
-- Name: match_memory(uuid, extensions.vector, integer, double precision, text[], uuid[]); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer DEFAULT 5, p_match_threshold double precision DEFAULT 0.3, p_source_types text[] DEFAULT NULL::text[], p_entity_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(id uuid, content_text text, content_header text, source_type text, source_id text, metadata jsonb, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'cortex', 'public', 'extensions'
    AS $$
  SELECT
    m.id,
    m.content_text,
    m.content_header,
    m.source_type,
    m.source_id,
    m.metadata,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM cortex.memory m
  WHERE m.workspace_id = p_workspace_id
    AND 1 - (m.embedding <=> p_query_embedding) > p_match_threshold
    AND (p_source_types IS NULL OR m.source_type = ANY(p_source_types))
    AND (p_entity_ids IS NULL OR m.entity_ids && p_entity_ids)
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT least(p_match_count, 50);
$$;


--
-- Name: FUNCTION match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer, p_match_threshold double precision, p_source_types text[], p_entity_ids uuid[]); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer, p_match_threshold double precision, p_source_types text[], p_entity_ids uuid[]) IS 'Semantic search over workspace knowledge embeddings. RLS applies via SECURITY INVOKER. source_id returned as text to carry both UUID rows and composite activity-log chunk keys.';


--
-- Name: pin_aion_session(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.pin_aion_session(p_session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public'
    AS $$
DECLARE
  v_user_id         uuid;
  v_workspace_id    uuid;
  v_scope_type      text;
  v_scope_entity_id uuid;
  v_pinned_count    int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT workspace_id, scope_type, scope_entity_id
    INTO v_workspace_id, v_scope_type, v_scope_entity_id
    FROM cortex.aion_sessions
   WHERE id = p_session_id AND user_id = v_user_id AND archived_at IS NULL;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Session not found or not owned by caller' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_pinned_count
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = v_workspace_id
     AND scope_type      = v_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM v_scope_entity_id
     AND is_pinned       = true
     AND archived_at     IS NULL
     AND id              <> p_session_id;
  IF v_pinned_count >= 3 THEN
    RAISE EXCEPTION 'Pin cap reached: unpin an existing thread first (max 3 per scope)' USING ERRCODE = '23505';
  END IF;
  UPDATE cortex.aion_sessions
     SET is_pinned = true, pinned_at = now(), updated_at = now()
   WHERE id = p_session_id;
END;
$$;


--
-- Name: reassign_capture(uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.reassign_capture(p_capture_id uuid, p_new_entity_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  IF p_new_entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_new_entity_id AND owner_workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET resolved_entity_id = p_new_entity_id
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;


--
-- Name: record_consent(uuid, text, text, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.record_consent(p_workspace_id uuid, p_term_key text, p_term_version text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_consent requires an authenticated caller';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of workspace %', p_workspace_id;
  END IF;
  INSERT INTO cortex.consent_log (workspace_id, user_id, term_key, term_version, metadata)
  VALUES (p_workspace_id, auth.uid(), p_term_key, p_term_version, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: record_lobby_pin_view(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user_id THEN
    RAISE EXCEPTION 'Not authorized to record view on pin %', p_pin_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_memory
  SET metadata = metadata || jsonb_build_object('last_viewed_at', now())
  WHERE id = p_pin_id AND scope = 'lobby_pin';
END;
$$;


--
-- Name: FUNCTION record_lobby_pin_view(p_pin_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid) IS 'Record a view timestamp on a Lobby pin. Ownership enforced via auth.uid(); silent no-op on missing pin.';


--
-- Name: record_refusal(uuid, uuid, text, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;

  IF p_question IS NULL OR length(btrim(p_question)) = 0 THEN
    RAISE EXCEPTION 'question must be non-empty' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason must be non-empty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO cortex.aion_refusal_log
    (workspace_id, user_id, question, reason, attempted_metric_id)
  VALUES
    (p_workspace_id, p_user_id, p_question, p_reason, p_attempted_metric_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text) IS 'Append a refusal event to cortex.aion_refusal_log. Workspace-membership enforced; service_role bypasses. SECURITY DEFINER — sole writer.';


--
-- Name: relink_capture_production(uuid, uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.relink_capture_production(p_capture_id uuid, p_linked_deal_id uuid DEFAULT NULL::uuid, p_linked_event_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF p_linked_deal_id IS NOT NULL AND p_linked_event_id IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  IF p_linked_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_linked_deal_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  IF p_linked_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ops.events
    WHERE id = p_linked_event_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET linked_deal_id  = p_linked_deal_id,
        linked_event_id = p_linked_event_id
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;


--
-- Name: reorder_lobby_pins(uuid, uuid, uuid[]); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
  v_idx int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22004';
  END IF;
  PERFORM cortex._pin_assert_membership(p_workspace_id);

  FOREACH v_id IN ARRAY p_ids LOOP
    UPDATE cortex.aion_memory
       SET metadata = metadata || jsonb_build_object('position', v_idx),
           updated_at = now()
     WHERE id = v_id
       AND workspace_id = p_workspace_id
       AND user_id = p_user_id
       AND scope = 'lobby_pin';
    v_idx := v_idx + 1;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]) IS 'Rewrite metadata.position for each of the given pin ids.';


--
-- Name: request_feature_access(uuid, text, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.request_feature_access(p_workspace_id uuid, p_feature_key text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_feature_access requires an authenticated caller';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of workspace %', p_workspace_id;
  END IF;
  SELECT id INTO v_id
    FROM cortex.feature_access_requests
   WHERE workspace_id = p_workspace_id
     AND requested_by = auth.uid()
     AND feature_key = p_feature_key
     AND status = 'pending'
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO cortex.feature_access_requests
    (workspace_id, requested_by, feature_key, metadata)
  VALUES (p_workspace_id, auth.uid(), p_feature_key, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: reset_member_passkey(uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex', 'directory'
    AS $$
DECLARE
  v_caller_user_id     uuid;
  v_caller_entity_id   uuid;
  v_target_entity_id   uuid;
  v_target_email       text;
  v_deleted            int;
BEGIN
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = p_member_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF p_member_user_id = v_caller_user_id THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.passkeys
   WHERE user_id = p_member_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT id INTO v_caller_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = v_caller_user_id
   LIMIT 1;

  SELECT id INTO v_target_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = p_member_user_id
   LIMIT 1;

  SELECT email INTO v_target_email
    FROM auth.users
   WHERE id = p_member_user_id;

  IF v_caller_entity_id IS NOT NULL AND v_target_entity_id IS NOT NULL THEN
    INSERT INTO cortex.relationships (
      source_entity_id,
      target_entity_id,
      relationship_type,
      context_data,
      created_at
    )
    VALUES (
      v_caller_entity_id,
      v_target_entity_id,
      'ADMIN_ACTION',
      jsonb_build_object(
        'action',           'reset_member_passkey',
        'actor_user_id',    v_caller_user_id,
        'target_user_id',   p_member_user_id,
        'workspace_id',     p_workspace_id,
        'passkeys_deleted', v_deleted,
        'at',               now(),
        'history',          jsonb_build_array(
          jsonb_build_object(
            'action',           'reset_member_passkey',
            'workspace_id',     p_workspace_id,
            'passkeys_deleted', v_deleted,
            'at',               now()
          )
        )
      ),
      now()
    )
    ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
    DO UPDATE SET
      context_data = jsonb_build_object(
        'action',           'reset_member_passkey',
        'actor_user_id',    v_caller_user_id,
        'target_user_id',   p_member_user_id,
        'workspace_id',     p_workspace_id,
        'passkeys_deleted', v_deleted,
        'at',               now(),
        'history',
          COALESCE(cortex.relationships.context_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(
            jsonb_build_object(
              'action',           'reset_member_passkey',
              'workspace_id',     p_workspace_id,
              'passkeys_deleted', v_deleted,
              'at',               now()
            )
          )
      );
  END IF;

  RETURN jsonb_build_object(
    'target_user_id',   p_member_user_id,
    'target_email',     v_target_email,
    'passkeys_deleted', v_deleted
  );
END;
$$;


--
-- Name: FUNCTION reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid) IS 'Owner-mediated crew recovery. SECURITY DEFINER — owner or admin of p_workspace_id wipes a fellow member''s public.passkeys rows and writes a cortex.relationships ADMIN_ACTION edge. Returns { target_user_id, target_email, passkeys_deleted }. Caller cannot reset themselves. Never grant EXECUTE to anon. See docs/reference/login-redesign-design.md §9.';


--
-- Name: resolve_aion_insight(text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.resolve_aion_insight(p_trigger_type text, p_entity_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  UPDATE cortex.aion_insights SET status = 'resolved', resolved_at = now()
    WHERE trigger_type = p_trigger_type AND entity_id = p_entity_id AND status IN ('pending', 'surfaced');
  RETURN FOUND;
END; $$;


--
-- Name: resolve_aion_proactive_lines_by_artifact(uuid, text, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE cortex.aion_proactive_lines
     SET resolved_at = now()
   WHERE workspace_id = p_workspace_id
     AND (artifact_ref->>'kind') = p_artifact_kind
     AND (artifact_ref->>'id')   = p_artifact_id::text
     AND dismissed_at IS NULL
     AND resolved_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid) IS 'Service-role expire-on-resolve hook. Called by webhook receivers when the triggering condition clears. Returns count of rows resolved.';


--
-- Name: resolve_aion_proactive_lines_by_deal(uuid, uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE cortex.aion_proactive_lines
     SET resolved_at = now()
   WHERE workspace_id = p_workspace_id
     AND deal_id      = p_deal_id
     AND dismissed_at IS NULL
     AND resolved_at IS NULL
     AND (p_signal_type IS NULL OR signal_type = p_signal_type);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text) IS 'Service-role resolver for deal-anchored signals (primarily dead_silence). Called by inbound/outbound message hooks when silence is broken.';


--
-- Name: resume_or_create_aion_session(uuid, text, uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text) RETURNS TABLE(session_id uuid, is_new boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public', 'ops'
    AS $$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id' USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type USING ERRCODE = '22023';
  END IF;
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    RAISE EXCEPTION 'event-scoped sessions are not yet available' USING ERRCODE = '0A000';
  END IF;
  SELECT id INTO v_session_id
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = p_workspace_id
     AND scope_type      = p_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM p_scope_entity_id
     AND archived_at     IS NULL
   ORDER BY last_message_at DESC
   LIMIT 1;
  IF v_session_id IS NOT NULL THEN
    RETURN QUERY SELECT v_session_id, false;
    RETURN;
  END IF;
  INSERT INTO cortex.aion_sessions (workspace_id, user_id, scope_type, scope_entity_id, title)
  VALUES (p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title)
  RETURNING id INTO v_session_id;
  RETURN QUERY SELECT v_session_id, true;
END;
$$;


--
-- Name: FUNCTION resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) IS 'Resume-or-create an Aion session for the calling user in the given scope. Returns (session_id, is_new). SECURITY DEFINER: caller must be a workspace member and the scope entity must belong to that workspace.';


--
-- Name: review_feature_request(uuid, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.review_feature_request(p_request_id uuid, p_decision text, p_note text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
DECLARE
  v_ws uuid;
  v_role text;
BEGIN
  IF p_decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'decision must be approved or denied';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_feature_request requires an authenticated caller';
  END IF;
  SELECT workspace_id INTO v_ws
    FROM cortex.feature_access_requests WHERE id = p_request_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'request % not found', p_request_id;
  END IF;
  v_role := public.get_member_role_slug(v_ws);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only owners and admins can review feature requests';
  END IF;
  UPDATE cortex.feature_access_requests
     SET status = p_decision, reviewed_by = auth.uid(),
         reviewed_at = now(), reviewer_note = p_note
   WHERE id = p_request_id AND status = 'pending';
  RETURN FOUND;
END;
$$;


--
-- Name: revoke_consent(uuid, text, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.revoke_consent(p_workspace_id uuid, p_term_key text, p_target_user uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'cortex'
    AS $$
DECLARE
  v_target uuid;
  v_role text;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'revoke_consent requires an authenticated caller';
  END IF;
  v_target := COALESCE(p_target_user, auth.uid());
  IF v_target <> auth.uid() THEN
    v_role := public.get_member_role_slug(p_workspace_id);
    IF v_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'only owners and admins can revoke others'' consent';
    END IF;
  END IF;
  UPDATE cortex.consent_log
     SET revoked_at = now()
   WHERE workspace_id = p_workspace_id
     AND user_id = v_target
     AND term_key = p_term_key
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;


--
-- Name: save_aion_memory(uuid, text, text, text, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text DEFAULT 'aion_chat'::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE cortex.aion_memory
    SET updated_at = now(), confidence = LEAST(confidence + 0.1, 1.0)
    WHERE workspace_id = p_workspace_id
      AND scope = p_scope
      AND fact = p_fact
      AND user_id IS NOT DISTINCT FROM p_user_id
    RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO cortex.aion_memory (workspace_id, scope, fact, source, user_id)
  VALUES (p_workspace_id, p_scope, p_fact, p_source, p_user_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid) IS 'Persist a learned fact to Aion memory. p_user_id NULL = workspace-wide, set = personal. Deduplicates identical facts by bumping confidence and updated_at. SECURITY DEFINER — bypasses RLS for writes.';


--
-- Name: save_aion_message(uuid, text, text, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.save_aion_message(p_session_id uuid, p_role text, p_content text, p_structured_content jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.aion_messages (session_id, role, content, structured_content)
  VALUES (p_session_id, p_role, p_content, p_structured_content)
  RETURNING id INTO v_id;
  UPDATE cortex.aion_sessions
     SET updated_at      = now(),
         last_message_at = now()
   WHERE id = p_session_id;
  RETURN v_id;
END;
$$;


--
-- Name: save_lobby_pin(uuid, uuid, text, text, jsonb, text, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_pin_id uuid;
  v_args_hash text;
  v_existing_count int;
  v_next_position int;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'lobby_pin scope requires user_id' USING ERRCODE = '22004';
  END IF;
  IF p_cadence NOT IN ('live', 'hourly', 'daily', 'manual') THEN
    RAISE EXCEPTION 'Invalid cadence %', p_cadence USING ERRCODE = '22023';
  END IF;
  IF COALESCE(trim(p_title), '') = '' THEN
    RAISE EXCEPTION 'Pin title required' USING ERRCODE = '22004';
  END IF;
  IF COALESCE(trim(p_metric_id), '') = '' THEN
    RAISE EXCEPTION 'metric_id required' USING ERRCODE = '22004';
  END IF;

  PERFORM cortex._pin_assert_membership(p_workspace_id);

  v_args_hash := cortex._pin_args_hash(p_args);

  SELECT id INTO v_pin_id
  FROM cortex.aion_memory
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND scope = 'lobby_pin'
    AND metadata->>'metric_id' = p_metric_id
    AND metadata->>'args_hash' = v_args_hash
  LIMIT 1;

  IF v_pin_id IS NOT NULL THEN
    UPDATE cortex.aion_memory
       SET fact = p_title,
           metadata = metadata
             || jsonb_build_object(
               'last_value', p_initial_value,
               'last_refreshed_at', now(),
               'refresh_cadence', p_cadence,
               'args', p_args
             ),
           updated_at = now()
     WHERE id = v_pin_id;
    RETURN v_pin_id;
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM cortex.aion_memory
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND scope = 'lobby_pin';

  IF v_existing_count >= 12 THEN
    RAISE EXCEPTION 'Pin cap reached (12 pins per user)' USING ERRCODE = '23514';
  END IF;

  v_next_position := v_existing_count;

  INSERT INTO cortex.aion_memory (
    workspace_id, user_id, scope, fact, source, metadata
  ) VALUES (
    p_workspace_id,
    p_user_id,
    'lobby_pin',
    p_title,
    'aion_chat',
    jsonb_build_object(
      'metric_id', p_metric_id,
      'args', p_args,
      'args_hash', v_args_hash,
      'refresh_cadence', p_cadence,
      'last_value', p_initial_value,
      'last_refreshed_at', now(),
      'position', v_next_position
    )
  )
  RETURNING id INTO v_pin_id;

  RETURN v_pin_id;
END;
$$;


--
-- Name: FUNCTION save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb) IS 'Upsert a Lobby pin for (workspace, user, metric, args_hash). Caps at 12 pins per user.';


--
-- Name: set_aion_proactive_line_date_local(); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.set_aion_proactive_line_date_local() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  IF NEW.created_date_local IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(NULLIF(w.timezone, ''), 'UTC') INTO v_tz
    FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  NEW.created_date_local := (NEW.created_at AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;
  RETURN NEW;
END;
$$;


--
-- Name: set_aion_session_title(uuid, text, boolean); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.set_aion_session_title(p_session_id uuid, p_title text, p_lock boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_locked  boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT title_locked INTO v_locked
    FROM cortex.aion_sessions
   WHERE id = p_session_id AND user_id = v_user_id;
  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'Session not found or not owned by caller' USING ERRCODE = '42501';
  END IF;
  IF v_locked = true AND p_lock = false THEN
    RETURN;
  END IF;
  UPDATE cortex.aion_sessions
     SET title        = p_title,
         title_locked = CASE WHEN p_lock = true THEN true ELSE title_locked END,
         updated_at   = now()
   WHERE id = p_session_id AND user_id = v_user_id;
END;
$$;


--
-- Name: substrate_counts(uuid, integer); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.substrate_counts(p_workspace_id uuid, p_window_days integer DEFAULT 90) RETURNS TABLE(deals integer, entities integer, messages_in_window integer, notes integer, catalog_items integer, memory_chunks integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'directory', 'ops', 'cortex'
    AS $$
DECLARE
  v_user_id uuid;
  v_window  int;
  v_cutoff  timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  v_window := GREATEST(1, LEAST(COALESCE(p_window_days, 90), 3650));
  v_cutoff := now() - (v_window || ' days')::interval;

  RETURN QUERY
    SELECT
      (SELECT count(*)::int FROM public.deals d
         WHERE d.workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM directory.entities e
         WHERE e.owner_workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM ops.messages m
         WHERE m.workspace_id = p_workspace_id
           AND m.created_at >= v_cutoff),
      (SELECT count(*)::int FROM ops.deal_notes n
         WHERE n.workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM public.packages p
         WHERE p.workspace_id = p_workspace_id
           AND p.is_active    = true),
      (SELECT count(*)::int FROM cortex.memory cm
         WHERE cm.workspace_id = p_workspace_id);
END;
$$;


--
-- Name: FUNCTION substrate_counts(p_workspace_id uuid, p_window_days integer); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.substrate_counts(p_workspace_id uuid, p_window_days integer) IS 'Aion Phase 3 §3.13: per-workspace substrate inventory (deals, entities, messages_in_window, notes, catalog_items, memory_chunks). Consumed by every retrieval tool envelope so empty-state answers can name what was searched.';


--
-- Name: unarchive_aion_session(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.unarchive_aion_session(p_session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_sessions
     SET archived_at = NULL,
         updated_at  = now()
   WHERE id      = p_session_id
     AND user_id = v_user_id
     AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found, not owned, or not archived'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: unpin_aion_session(uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.unpin_aion_session(p_session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE cortex.aion_sessions
     SET is_pinned = false, pinned_at = NULL, updated_at = now()
   WHERE id = p_session_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not owned by caller' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: update_aion_session_summary(uuid, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.update_aion_session_summary(p_session_id uuid, p_summary text, p_summarized_up_to text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
BEGIN
  UPDATE cortex.aion_sessions
    SET conversation_summary = p_summary,
        summarized_up_to = p_summarized_up_to,
        updated_at = now()
    WHERE id = p_session_id;
END;
$$;


--
-- Name: update_capture_content(uuid, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.update_capture_content(p_capture_id uuid, p_transcript text DEFAULT NULL::text, p_parsed_note text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET
      transcript  = COALESCE(p_transcript, transcript),
      parsed_note = CASE WHEN p_parsed_note IS NULL THEN parsed_note
                         WHEN p_parsed_note = ''     THEN NULL
                         ELSE p_parsed_note END
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;


--
-- Name: update_capture_visibility(uuid, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.update_capture_visibility(p_capture_id uuid, p_visibility text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET visibility = p_visibility
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;


--
-- Name: update_lobby_pin_value(uuid, jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.update_lobby_pin_value(p_pin_id uuid, p_value jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'pg_temp'
    AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pin % not found', p_pin_id USING ERRCODE = '02000';
  END IF;

  PERFORM cortex._pin_assert_membership(v_workspace_id);

  UPDATE cortex.aion_memory
     SET metadata = metadata
       || jsonb_build_object(
         'last_value', p_value,
         'last_refreshed_at', now()
       ),
       updated_at = now()
   WHERE id = p_pin_id;
END;
$$;


--
-- Name: FUNCTION update_lobby_pin_value(p_pin_id uuid, p_value jsonb); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.update_lobby_pin_value(p_pin_id uuid, p_value jsonb) IS 'Write a new last_value + last_refreshed_at onto a pin. Used by Phase 3.3 refresh cron.';


--
-- Name: upsert_aion_insight(uuid, text, text, text, text, jsonb, integer, timestamp with time zone); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.upsert_aion_insight(p_workspace_id uuid, p_trigger_type text, p_entity_type text, p_entity_id text, p_title text, p_context jsonb DEFAULT '{}'::jsonb, p_priority integer DEFAULT 0, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE cortex.aion_insights SET title = p_title, context = p_context, priority = p_priority, expires_at = p_expires_at
    WHERE workspace_id = p_workspace_id AND trigger_type = p_trigger_type AND entity_id = p_entity_id AND status IN ('pending', 'surfaced')
    RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO cortex.aion_insights (workspace_id, trigger_type, entity_type, entity_id, title, context, priority, expires_at)
  VALUES (p_workspace_id, p_trigger_type, p_entity_type, p_entity_id, p_title, p_context, p_priority, p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;


--
-- Name: upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.upsert_entity_working_notes(p_workspace_id uuid, p_entity_id uuid, p_communication_style text DEFAULT NULL::text, p_dnr_flagged boolean DEFAULT NULL::boolean, p_dnr_reason text DEFAULT NULL::text, p_dnr_note text DEFAULT NULL::text, p_preferred_channel text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_written_fields text[] := '{}';
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF p_source NOT IN ('manual', 'capture') THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  IF p_dnr_reason IS NOT NULL
     AND p_dnr_reason NOT IN ('paid_late', 'unreliable', 'abuse', 'contractual', 'other', '')
  THEN RETURN FALSE; END IF;
  IF p_preferred_channel IS NOT NULL
     AND p_preferred_channel NOT IN ('call', 'email', 'sms', '')
  THEN RETURN FALSE; END IF;

  -- Which fields does this write touch? Field names we track for source.
  IF p_communication_style IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'communication_style');
  END IF;
  IF p_dnr_flagged IS NOT NULL OR p_dnr_reason IS NOT NULL OR p_dnr_note IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'dnr');
  END IF;
  IF p_preferred_channel IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'preferred_channel');
  END IF;

  INSERT INTO cortex.entity_working_notes (
    workspace_id, entity_id,
    communication_style, dnr_flagged, dnr_reason, dnr_note, preferred_channel,
    updated_at, updated_by,
    auto_filled_fields
  ) VALUES (
    p_workspace_id, p_entity_id,
    NULLIF(p_communication_style, ''),
    COALESCE(p_dnr_flagged, false),
    NULLIF(p_dnr_reason, ''),
    NULLIF(p_dnr_note, ''),
    NULLIF(p_preferred_channel, ''),
    now(), v_user_id,
    CASE WHEN p_source = 'capture' THEN v_written_fields ELSE '{}'::text[] END
  )
  ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
    communication_style = CASE
      WHEN p_communication_style IS NULL THEN cortex.entity_working_notes.communication_style
      WHEN p_communication_style = ''    THEN NULL
      ELSE p_communication_style
    END,
    dnr_flagged = COALESCE(p_dnr_flagged, cortex.entity_working_notes.dnr_flagged),
    dnr_reason = CASE
      WHEN p_dnr_reason IS NULL THEN cortex.entity_working_notes.dnr_reason
      WHEN p_dnr_reason = ''    THEN NULL
      ELSE p_dnr_reason
    END,
    dnr_note = CASE
      WHEN p_dnr_note IS NULL THEN cortex.entity_working_notes.dnr_note
      WHEN p_dnr_note = ''    THEN NULL
      ELSE p_dnr_note
    END,
    preferred_channel = CASE
      WHEN p_preferred_channel IS NULL THEN cortex.entity_working_notes.preferred_channel
      WHEN p_preferred_channel = ''    THEN NULL
      ELSE p_preferred_channel
    END,
    updated_at = now(),
    updated_by = v_user_id,
    auto_filled_fields = CASE
      WHEN p_source = 'capture' THEN
        -- Add each written field to the array, dedup.
        ARRAY(
          SELECT DISTINCT unnest(cortex.entity_working_notes.auto_filled_fields || v_written_fields)
        )
      ELSE
        -- Manual write — remove the touched fields from the auto-filled list.
        ARRAY(
          SELECT x FROM unnest(cortex.entity_working_notes.auto_filled_fields) AS x
          WHERE x <> ALL(v_written_fields)
        )
    END;

  RETURN TRUE;
END;
$$;


--
-- Name: upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text DEFAULT NULL::text, p_embedding extensions.vector DEFAULT NULL::extensions.vector, p_entity_ids uuid[] DEFAULT '{}'::uuid[], p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'extensions'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.memory (
    workspace_id, source_type, source_id, content_text, content_header,
    embedding, entity_ids, metadata
  )
  VALUES (
    p_workspace_id, p_source_type, p_source_id, p_content_text, p_content_header,
    p_embedding, p_entity_ids, p_metadata
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    content_text = EXCLUDED.content_text,
    content_header = EXCLUDED.content_header,
    embedding = EXCLUDED.embedding,
    entity_ids = EXCLUDED.entity_ids,
    metadata = EXCLUDED.metadata,
    updated_at = now(),
    last_rebuilt_at = CASE
      WHEN cortex.memory.embedding IS DISTINCT FROM EXCLUDED.embedding
        THEN now()
      ELSE cortex.memory.last_rebuilt_at
    END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding extensions.vector, p_entity_ids uuid[], p_metadata jsonb); Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON FUNCTION cortex.upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding extensions.vector, p_entity_ids uuid[], p_metadata jsonb) IS 'Upsert a memory row keyed on (source_type, source_id). source_id is text to support composite chunk keys like <deal_uuid>:YYYYMM for activity-log rollups. last_rebuilt_at bumps only when the embedding actually changed — supports targeted re-embed detection.';


--
-- Name: write_capture_confirmed(uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid); Type: FUNCTION; Schema: cortex; Owner: -
--

CREATE FUNCTION cortex.write_capture_confirmed(p_workspace_id uuid, p_transcript text, p_parsed_entity jsonb DEFAULT NULL::jsonb, p_parsed_follow_up jsonb DEFAULT NULL::jsonb, p_parsed_note text DEFAULT NULL::text, p_resolved_entity_id uuid DEFAULT NULL::uuid, p_created_follow_up_queue_id uuid DEFAULT NULL::uuid, p_audio_storage_path text DEFAULT NULL::text, p_visibility text DEFAULT 'user'::text, p_linked_deal_id uuid DEFAULT NULL::uuid, p_linked_event_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'cortex', 'public'
    AS $$
DECLARE
  v_id      uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN RETURN NULL; END IF;

  IF p_linked_deal_id IS NOT NULL AND p_linked_event_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_linked_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_linked_deal_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_linked_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ops.events
    WHERE id = p_linked_event_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO cortex.capture_events (
    workspace_id, user_id, audio_storage_path, transcript,
    parsed_entity, parsed_follow_up, parsed_note,
    resolved_entity_id, created_follow_up_queue_id,
    status, confirmed_at, visibility,
    linked_deal_id, linked_event_id
  ) VALUES (
    p_workspace_id, v_user_id, p_audio_storage_path, p_transcript,
    p_parsed_entity, p_parsed_follow_up, p_parsed_note,
    p_resolved_entity_id, p_created_follow_up_queue_id,
    'confirmed', now(), p_visibility,
    p_linked_deal_id, p_linked_event_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: _copy_proposal_items_to_invoice(uuid, uuid, numeric, numeric, uuid); Type: PROCEDURE; Schema: finance; Owner: -
--

CREATE PROCEDURE finance._copy_proposal_items_to_invoice(IN p_proposal_id uuid, IN p_invoice_id uuid, IN p_tax_amount numeric, IN p_tax_rate numeric, IN p_workspace_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_item record;
  v_position int := 0;
  v_effective_price numeric(14, 2);
  v_multiplier numeric(10, 4);
  v_line_amount numeric(14, 2);
  v_is_taxable boolean;
BEGIN
  FOR v_item IN
    SELECT pi.*, pkg.cost AS pkg_cost
    FROM public.proposal_items pi
    LEFT JOIN public.packages pkg ON pi.package_id = pkg.id
    WHERE pi.proposal_id = p_proposal_id
      AND pi.is_client_visible = true
      AND pi.is_package_header = false
    ORDER BY pi.sort_order
  LOOP
    v_position := v_position + 1;
    v_effective_price := COALESCE(v_item.override_price, v_item.unit_price, 0);
    v_multiplier := COALESCE(v_item.unit_multiplier, 1);
    v_line_amount := v_item.quantity * v_multiplier * v_effective_price;
    v_is_taxable := COALESCE(
      (v_item.definition_snapshot -> 'tax_meta' ->> 'is_taxable')::boolean,
      false
    );

    INSERT INTO finance.invoice_line_items (
      workspace_id, invoice_id, position, item_kind,
      description, quantity, unit_price, amount, cost,
      is_taxable, source_proposal_item_id, source_package_id
    ) VALUES (
      p_workspace_id, p_invoice_id, v_position, 'service',
      COALESCE(v_item.description, v_item.name),
      v_item.quantity, v_effective_price, v_line_amount,
      COALESCE(v_item.actual_cost, (v_item.quantity * COALESCE(v_item.pkg_cost, 0))),
      v_is_taxable, v_item.id, v_item.package_id
    );
  END LOOP;

  IF p_tax_amount > 0 THEN
    v_position := v_position + 1;
    INSERT INTO finance.invoice_line_items (
      workspace_id, invoice_id, position, item_kind,
      description, quantity, unit_price, amount, is_taxable
    ) VALUES (
      p_workspace_id, p_invoice_id, v_position, 'tax_line',
      'Sales tax (' || ROUND(p_tax_rate * 100, 2) || '%)',
      1, p_tax_amount, p_tax_amount, false
    );
  END IF;
END;
$$;


--
-- Name: _guard_invoice_mode_switch(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance._guard_invoice_mode_switch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_existing_mode text;
BEGIN
  IF NEW.billing_mode IS NULL OR NEW.proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT DISTINCT billing_mode INTO v_existing_mode
  FROM finance.invoices
  WHERE proposal_id = NEW.proposal_id
    AND status <> 'void'
    AND billing_mode IS NOT NULL
    AND billing_mode <> NEW.billing_mode
  LIMIT 1;

  IF v_existing_mode IS NOT NULL THEN
    RAISE EXCEPTION
      'invoice_mode_switch_guard: proposal % already has non-void invoices with billing_mode=%. Void them before switching to %',
      NEW.proposal_id, v_existing_mode, NEW.billing_mode
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: _metric_assert_membership(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance._metric_assert_membership(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: _metric_resolve_tz(uuid, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance._metric_resolve_tz(p_workspace_id uuid, p_tz text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(p_tz, (SELECT timezone FROM public.workspaces WHERE id = p_workspace_id), 'UTC');
$$;


--
-- Name: get_fresh_qbo_token(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid) RETURNS TABLE(access_token text, realm_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'vault', 'public', 'pg_temp'
    AS $$
DECLARE
  v_lock_key bigint;
  v_access_token_secret_id uuid;
  v_refresh_token_secret_id uuid;
  v_access_token_expires_at timestamptz;
  v_realm_id text;
  v_status text;
  v_access_token text;
BEGIN
  -- Per-workspace lock. xact_lock releases on transaction end (= end of this
  -- RPC call when invoked via PostgREST). PostgREST holds one transaction
  -- per request, so concurrent invocations from different Edge Function
  -- instances will serialize correctly through this gate.
  v_lock_key := hashtext('qbo_refresh_' || p_workspace_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Read connection state.
  SELECT
    access_token_secret_id,
    refresh_token_secret_id,
    access_token_expires_at,
    realm_id,
    status
  INTO
    v_access_token_secret_id,
    v_refresh_token_secret_id,
    v_access_token_expires_at,
    v_realm_id,
    v_status
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No QBO connection for workspace %', p_workspace_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'QBO connection for workspace % is %, not active', p_workspace_id, v_status
      USING ERRCODE = 'P0002';
  END IF;

  -- If still valid for at least 5 minutes, return current access token.
  IF v_access_token_expires_at > now() + interval '5 minutes' THEN
    SELECT decrypted_secret INTO v_access_token
    FROM vault.decrypted_secrets
    WHERE id = v_access_token_secret_id;

    RETURN QUERY SELECT v_access_token, v_realm_id;
    RETURN;
  END IF;

  -- Refresh path. The actual HTTP call to Intuit's refresh endpoint must be
  -- performed by the caller (Edge Function). This function only manages the
  -- lock + read-current-state pattern. The caller, after fetching new tokens,
  -- calls finance.persist_refreshed_qbo_tokens() inside the SAME RPC chain
  -- (which extends the same transaction and the same advisory lock).
  --
  -- For now we return the current (possibly-stale) token and signal via a
  -- flag column added to the connection. The full refresh choreography is
  -- implemented in PR-CLIENT-5 alongside the OAuth flow.
  SELECT decrypted_secret INTO v_access_token
  FROM vault.decrypted_secrets
  WHERE id = v_access_token_secret_id;

  -- Mark connection as needing refresh — caller will see this and act.
  UPDATE finance.qbo_connections
  SET last_sync_error = 'Access token expired or near expiry; caller must refresh'
  WHERE workspace_id = p_workspace_id;

  RETURN QUERY SELECT v_access_token, v_realm_id;
END;
$$;


--
-- Name: FUNCTION get_fresh_qbo_token(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid) IS 'Advisory-lock-protected token reader. Holds pg_advisory_xact_lock on hashtext(qbo_refresh_<workspace>) for the duration of the RPC call. Service role only. The full refresh-and-persist flow is completed in PR-CLIENT-5 — this function ships in Migration 3 to lock in the lock pattern and column shape.';


--
-- Name: get_public_invoice(text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.get_public_invoice(p_token text) RETURNS TABLE(invoice_id uuid, invoice_number text, invoice_kind text, status text, currency text, subtotal_amount numeric, discount_amount numeric, tax_amount numeric, total_amount numeric, paid_amount numeric, issue_date date, due_date date, issued_at timestamp with time zone, notes_to_client text, po_number text, terms text, bill_to_snapshot jsonb, from_snapshot jsonb, line_items jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Look up the invoice by token. Constant-time? No; the unique index
  -- gives us O(log n) which is acceptable for non-secret-equality.
  -- Tokens are 32 bytes of CSPRNG hex, so brute-force is computationally
  -- infeasible regardless of timing.
  SELECT id INTO v_invoice_id
  FROM finance.invoices
  WHERE public_token = p_token
    AND status IN ('sent', 'viewed', 'partially_paid', 'paid');

  IF v_invoice_id IS NULL THEN
    RETURN;  -- empty rowset; caller renders 404
  END IF;

  -- Mark as viewed on first access
  UPDATE finance.invoices
  SET viewed_at = COALESCE(viewed_at, now())
  WHERE id = v_invoice_id;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.invoice_kind,
    i.status,
    i.currency,
    i.subtotal_amount,
    i.discount_amount,
    i.tax_amount,
    i.total_amount,
    i.paid_amount,
    i.issue_date,
    i.due_date,
    i.issued_at,
    i.notes_to_client,
    i.po_number,
    i.terms,
    i.bill_to_snapshot,
    i.from_snapshot,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'position', li.position,
          'description', li.description,
          'quantity', li.quantity,
          'unit_price', li.unit_price,
          'amount', li.amount,
          'item_kind', li.item_kind
        ) ORDER BY li.position
      )
      FROM finance.invoice_line_items li
      WHERE li.invoice_id = i.id),
      '[]'::jsonb
    ) AS line_items
  FROM finance.invoices i
  WHERE i.id = v_invoice_id;
END;
$$;


--
-- Name: FUNCTION get_public_invoice(p_token text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.get_public_invoice(p_token text) IS 'The ONLY public read path for finance.invoices. RLS denies all SELECT to anon — public viewing routes exclusively through this RPC. Returns denormalized read-only shape; never exposes internal_notes or QBO sync state.';


--
-- Name: metric_1099_worksheet(uuid, integer); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_1099_worksheet(p_workspace_id uuid, p_year integer) RETURNS TABLE(vendor_id uuid, vendor_name text, total_paid numeric, bill_count integer, meets_1099_threshold boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'directory', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  WITH year_bills AS (
    SELECT b.pay_to_entity_id, b.paid_amount
    FROM finance.bills b
    WHERE b.workspace_id = p_workspace_id
      AND b.bill_date IS NOT NULL
      AND EXTRACT(YEAR FROM b.bill_date) = p_year
      AND b.paid_amount > 0
  )
  SELECT
    yb.pay_to_entity_id,
    COALESCE(e.display_name, 'Unknown vendor')::text AS vendor_name,
    COALESCE(SUM(yb.paid_amount), 0)::numeric AS total_paid,
    COUNT(*)::int AS bill_count,
    (COALESCE(SUM(yb.paid_amount), 0) >= 600)::boolean AS meets_1099_threshold
  FROM year_bills yb
  LEFT JOIN directory.entities e ON e.id = yb.pay_to_entity_id
  GROUP BY yb.pay_to_entity_id, e.display_name
  ORDER BY total_paid DESC;
END;
$$;


--
-- Name: FUNCTION metric_1099_worksheet(p_workspace_id uuid, p_year integer); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_1099_worksheet(p_workspace_id uuid, p_year integer) IS 'Table metric: per-vendor 1099 totals for calendar year. AP bills only; freelancer-direct path deferred to Phase 5.';


--
-- Name: metric_ar_aged_60plus(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_ar_aged_60plus(p_workspace_id uuid) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    COALESCE(SUM(balance_due), 0)::numeric,
    CASE WHEN COUNT(*) > 0 THEN COUNT(*)::text || ' invoice' || CASE WHEN COUNT(*) = 1 THEN '' ELSE 's' END ELSE NULL END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[]
  FROM finance.invoice_balances
  WHERE workspace_id = p_workspace_id
    AND days_overdue >= 60
    AND balance_due > 0;
END;
$$;


--
-- Name: FUNCTION metric_ar_aged_60plus(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_ar_aged_60plus(p_workspace_id uuid) IS 'Scalar metric: total balance owed across invoices >= 60 days overdue. As-of-now.';


--
-- Name: metric_budget_vs_actual(uuid, date, date, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(event_id uuid, event_title text, projected_cost numeric, actual_cost numeric, variance numeric, variance_pct numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'ops', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_events AS (
    SELECT
      ev.id,
      COALESCE(ev.title, '(untitled)') AS title,
      ev.deal_id
    FROM ops.events ev
    WHERE ev.workspace_id = p_workspace_id
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  projected AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(pi.actual_cost * COALESCE(pi.quantity, 1)), 0) AS projected_cost
    FROM period_events pe
    LEFT JOIN public.proposals p
      ON p.deal_id = pe.deal_id
     AND p.workspace_id = p_workspace_id
     AND p.status <> 'rejected'
    LEFT JOIN public.proposal_items pi
      ON pi.proposal_id = p.id
     AND pi.actual_cost IS NOT NULL
    GROUP BY pe.id
  ),
  actual AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(b.paid_amount), 0) AS actual_cost
    FROM period_events pe
    LEFT JOIN finance.bills b
      ON b.event_id = pe.id
     AND b.workspace_id = p_workspace_id
     AND b.paid_amount > 0
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.title::text,
    COALESCE(pr.projected_cost, 0)::numeric,
    COALESCE(ac.actual_cost, 0)::numeric,
    (COALESCE(ac.actual_cost, 0) - COALESCE(pr.projected_cost, 0))::numeric,
    CASE
      WHEN COALESCE(pr.projected_cost, 0) = 0 THEN NULL
      ELSE ((COALESCE(ac.actual_cost, 0) - pr.projected_cost) / pr.projected_cost * 100)
    END::numeric
  FROM period_events pe
  LEFT JOIN projected pr ON pr.event_id = pe.id
  LEFT JOIN actual ac    ON ac.event_id = pe.id
  ORDER BY ABS(COALESCE(ac.actual_cost, 0) - COALESCE(pr.projected_cost, 0)) DESC
  LIMIT 500;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Table metric: per-event projected (proposal.actual_cost sum) vs actual (finance.bills.paid_amount) cost. Cap 500 rows.';


--
-- Name: metric_invoice_variance(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_invoice_variance(p_workspace_id uuid) RETURNS TABLE(invoice_id uuid, invoice_number text, status text, local_total numeric, qbo_total numeric, delta numeric, qbo_sync_status text, qbo_last_error text, qbo_last_sync_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.status,
    i.total_amount,
    NULL::numeric AS qbo_total,
    NULL::numeric AS delta,
    i.qbo_sync_status,
    i.qbo_last_error,
    i.qbo_last_sync_at
  FROM finance.invoices i
  WHERE i.workspace_id = p_workspace_id
    AND i.status NOT IN ('draft', 'void')
    AND (
      i.qbo_sync_status IN ('failed', 'dead_letter')
      OR (i.qbo_invoice_id IS NULL AND i.qbo_sync_status NOT IN ('excluded_pre_connection', 'not_synced'))
      OR i.qbo_last_error IS NOT NULL
    )
  ORDER BY i.qbo_last_sync_at DESC NULLS LAST, i.created_at DESC
  LIMIT 500;
END;
$$;


--
-- Name: FUNCTION metric_invoice_variance(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_invoice_variance(p_workspace_id uuid) IS 'Table metric: invoices with QBO sync issues. qbo_total/delta are reserved for Phase 5 live-fetch.';


--
-- Name: metric_qbo_sync_health(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_qbo_sync_health(p_workspace_id uuid) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_conn record;
  v_recent_failures int;
  v_status_text text;
  v_healthy boolean;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  SELECT status, last_refreshed_at, last_sync_at, last_sync_error
  INTO v_conn
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id
  ORDER BY connected_at DESC
  LIMIT 1;

  IF v_conn IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 'Not connected'::text, NULL::numeric, NULL::text, NULL::numeric[];
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_recent_failures
  FROM finance.qbo_sync_log
  WHERE workspace_id = p_workspace_id
    AND started_at >= now() - INTERVAL '24 hours'
    AND qbo_response_status >= 400;

  v_healthy := v_conn.status = 'active'
    AND v_conn.last_refreshed_at IS NOT NULL
    AND v_conn.last_refreshed_at >= now() - INTERVAL '24 hours'
    AND v_recent_failures = 0;

  v_status_text := CASE
    WHEN v_conn.status <> 'active' THEN 'Connection ' || v_conn.status
    WHEN v_conn.last_refreshed_at IS NULL OR v_conn.last_refreshed_at < now() - INTERVAL '24 hours' THEN
      'Token refresh stalled'
    WHEN v_recent_failures > 0 THEN
      v_recent_failures::text || ' sync failure' || CASE WHEN v_recent_failures = 1 THEN '' ELSE 's' END || ' in last 24h'
    ELSE 'Healthy'
  END;

  RETURN QUERY SELECT
    CASE WHEN v_healthy THEN 1 ELSE 0 END::numeric,
    v_status_text,
    NULL::numeric,
    NULL::text,
    NULL::numeric[];
END;
$$;


--
-- Name: FUNCTION metric_qbo_sync_health(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_qbo_sync_health(p_workspace_id uuid) IS 'Scalar metric: QBO connection health. Distinguishes stalled (token refresh) from failed (writes erroring).';


--
-- Name: metric_qbo_variance(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_qbo_variance(p_workspace_id uuid) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_last_sync timestamptz;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  SELECT last_sync_at INTO v_last_sync
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  WITH variance AS (
    SELECT COUNT(*) AS issue_count
    FROM finance.invoices
    WHERE workspace_id = p_workspace_id
      AND status NOT IN ('draft', 'void')
      AND (
        qbo_sync_status IN ('failed', 'dead_letter')
        OR (qbo_invoice_id IS NULL AND qbo_sync_status NOT IN ('excluded_pre_connection', 'not_synced'))
      )
  )
  SELECT
    v.issue_count::numeric,
    CASE
      WHEN v_last_sync IS NULL THEN 'No QBO connection'
      ELSE 'Last sync ' || to_char(v_last_sync AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
    END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[]
  FROM variance v;
END;
$$;


--
-- Name: FUNCTION metric_qbo_variance(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_qbo_variance(p_workspace_id uuid) IS 'Scalar metric: count of invoices with QBO sync issues (failed, dead_letter, or unsynced non-draft).';


--
-- Name: metric_revenue_by_lead_source(uuid, date, date, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(lead_source text, revenue numeric, deal_count integer, paid_invoice_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_invoices AS (
    SELECT
      i.id AS invoice_id,
      i.deal_id,
      i.paid_amount
    FROM finance.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.status NOT IN ('draft', 'void')
      AND i.paid_amount > 0
      AND i.paid_at IS NOT NULL
      AND i.paid_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND i.paid_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    COALESCE(NULLIF(TRIM(d.lead_source), ''), 'Unspecified')::text AS lead_source_label,
    COALESCE(SUM(pi.paid_amount), 0)::numeric AS revenue,
    COUNT(DISTINCT d.id)::int AS deal_count,
    COUNT(DISTINCT pi.invoice_id)::int AS paid_invoice_count
  FROM period_invoices pi
  LEFT JOIN public.deals d
    ON d.id = pi.deal_id AND d.workspace_id = p_workspace_id
  GROUP BY COALESCE(NULLIF(TRIM(d.lead_source), ''), 'Unspecified')
  ORDER BY revenue DESC
  LIMIT 100;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Table metric: paid invoice revenue grouped by public.deals.lead_source over period. Cap 100 rows. Unattributed rolls into Unspecified.';


--
-- Name: metric_revenue_collected(uuid, date, date, text, boolean); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text, p_compare boolean DEFAULT true) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
  v_period_days int;
  v_compare_start date;
  v_compare_end date;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_period_days := (p_period_end - p_period_start) + 1;
  v_compare_start := p_period_start - v_period_days;
  v_compare_end := p_period_start - 1;

  RETURN QUERY
  WITH period_sum AS (
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS payment_count
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  prior_sum AS (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (v_compare_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((v_compare_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    p.total,
    CASE WHEN p.payment_count > 0 THEN p.payment_count::text || ' payments' ELSE NULL END,
    CASE WHEN p_compare THEN (SELECT total FROM prior_sum) ELSE NULL END,
    CASE WHEN p_compare THEN 'vs prior ' || v_period_days || ' days' ELSE NULL END,
    NULL::numeric[]
  FROM period_sum p;
END;
$$;


--
-- Name: FUNCTION metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean) IS 'Scalar metric: revenue collected (net of refunds) in [p_period_start, p_period_end] in workspace TZ.';


--
-- Name: metric_revenue_yoy(uuid, date, date, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
  v_prior_start date;
  v_prior_end date;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_prior_start := (p_period_start - INTERVAL '1 year')::date;
  v_prior_end   := (p_period_end   - INTERVAL '1 year')::date;

  RETURN QUERY
  WITH period_sum AS (
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS payment_count
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  prior_sum AS (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (v_prior_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((v_prior_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    p.total,
    CASE WHEN p.payment_count > 0
      THEN p.payment_count::text || ' payment' || CASE WHEN p.payment_count = 1 THEN '' ELSE 's' END
      ELSE NULL END,
    (SELECT total FROM prior_sum),
    'vs same window last year'::text,
    NULL::numeric[]
  FROM period_sum p;
END;
$$;


--
-- Name: FUNCTION metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Scalar metric: revenue in [period_start, period_end] vs same window one year earlier. Workspace TZ.';


--
-- Name: metric_sales_tax_worksheet(uuid, date, date, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(jurisdiction text, tax_code text, taxable_amount numeric, tax_collected numeric, invoice_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_invoices AS (
    SELECT i.id, i.tax_amount, i.tax_rate_snapshot
    FROM finance.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.status NOT IN ('draft', 'void')
      AND i.issue_date >= p_period_start
      AND i.issue_date <= p_period_end
  ),
  taxable_lines AS (
    SELECT
      li.invoice_id,
      li.qbo_tax_code_id,
      SUM(li.amount) AS taxable_total
    FROM finance.invoice_line_items li
    JOIN period_invoices pi ON pi.id = li.invoice_id
    WHERE li.is_taxable = true
    GROUP BY li.invoice_id, li.qbo_tax_code_id
  ),
  per_jurisdiction AS (
    SELECT
      COALESCE(tr.jurisdiction, 'Unspecified') AS jurisdiction_label,
      COALESCE(tl.qbo_tax_code_id, '—') AS tax_code_label,
      SUM(tl.taxable_total) AS sum_taxable,
      SUM(
        tl.taxable_total
        / NULLIF((SELECT SUM(taxable_total) FROM taxable_lines tl2 WHERE tl2.invoice_id = tl.invoice_id), 0)
        * (SELECT pi.tax_amount FROM period_invoices pi WHERE pi.id = tl.invoice_id)
      ) AS sum_collected,
      COUNT(DISTINCT tl.invoice_id) AS inv_count
    FROM taxable_lines tl
    LEFT JOIN finance.tax_rates tr
      ON tr.workspace_id = p_workspace_id
     AND tr.qbo_tax_code_id = tl.qbo_tax_code_id
    GROUP BY COALESCE(tr.jurisdiction, 'Unspecified'), COALESCE(tl.qbo_tax_code_id, '—')
  )
  SELECT
    pj.jurisdiction_label,
    pj.tax_code_label,
    COALESCE(pj.sum_taxable, 0)::numeric,
    COALESCE(pj.sum_collected, 0)::numeric,
    pj.inv_count::int
  FROM per_jurisdiction pj
  ORDER BY pj.jurisdiction_label, pj.tax_code_label;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Table metric: sales tax by jurisdiction over period. Period bounded on issue_date. Apportions invoice.tax_amount across taxable lines.';


--
-- Name: metric_unreconciled_payments(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.metric_unreconciled_payments(p_workspace_id uuid) RETURNS TABLE(payment_id uuid, invoice_id uuid, invoice_number text, amount numeric, method text, received_at timestamp with time zone, qbo_sync_status text, qbo_last_error text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    p.id,
    p.invoice_id,
    i.invoice_number,
    p.amount,
    p.method,
    p.received_at,
    p.qbo_sync_status,
    p.qbo_last_error
  FROM finance.payments p
  JOIN finance.invoices i ON i.id = p.invoice_id
  WHERE p.workspace_id = p_workspace_id
    AND p.status = 'succeeded'
    AND p.qbo_sync_status NOT IN ('synced', 'excluded_pre_connection')
  ORDER BY p.received_at DESC
  LIMIT 500;
END;
$$;


--
-- Name: FUNCTION metric_unreconciled_payments(p_workspace_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.metric_unreconciled_payments(p_workspace_id uuid) IS 'Table metric: payments succeeded but not synced to QBO. Cap 500 rows.';


--
-- Name: next_invoice_number(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.next_invoice_number(p_workspace_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_prefix text;
  v_next bigint;
  v_pad int;
BEGIN
  -- Atomic UPDATE...RETURNING is the simplest serialization. Under high
  -- contention we may need to add an advisory lock; for v1 this is fine.
  -- The unique index on (workspace_id, invoice_number) catches any race.
  INSERT INTO finance.invoice_number_sequences (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  UPDATE finance.invoice_number_sequences
  SET next_value = next_value + 1
  WHERE workspace_id = p_workspace_id
  RETURNING prefix, next_value - 1, pad_width
  INTO v_prefix, v_next, v_pad;

  RETURN v_prefix || lpad(v_next::text, v_pad, '0');
END;
$$;


--
-- Name: payments_recompute_trigger(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.payments_recompute_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM finance.recompute_invoice_paid(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM finance.recompute_invoice_paid(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: persist_refreshed_qbo_tokens(uuid, text, text, integer, integer); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.persist_refreshed_qbo_tokens(p_workspace_id uuid, p_new_access_token text, p_new_refresh_token text, p_access_expires_in_seconds integer, p_refresh_expires_in_seconds integer DEFAULT 8640000) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'vault', 'public', 'pg_temp'
    AS $$
DECLARE
  v_lock_key bigint;
  v_access_token_secret_id uuid;
  v_refresh_token_secret_id uuid;
BEGIN
  -- Same lock key as get_fresh_qbo_token — caller is expected to invoke both
  -- in the same transaction so the lock is held throughout.
  v_lock_key := hashtext('qbo_refresh_' || p_workspace_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT access_token_secret_id, refresh_token_secret_id
  INTO v_access_token_secret_id, v_refresh_token_secret_id
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id;

  -- Update both Vault secrets in place.
  PERFORM vault.update_secret(v_access_token_secret_id, p_new_access_token);
  PERFORM vault.update_secret(v_refresh_token_secret_id, p_new_refresh_token);

  UPDATE finance.qbo_connections
  SET access_token_expires_at = now() + (p_access_expires_in_seconds || ' seconds')::interval,
      refresh_token_expires_at = now() + (p_refresh_expires_in_seconds || ' seconds')::interval,
      last_refreshed_at = now(),
      last_sync_error = NULL
  WHERE workspace_id = p_workspace_id;
END;
$$;


--
-- Name: recompute_invoice_paid(uuid); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_kind text;
  v_current_status text;
BEGIN
  -- Lock the invoice row before reading. This is the fix for the
  -- "Stripe webhook + manual payment race" — without it, two trigger
  -- executions can compute their respective paid_amounts independently
  -- and the second writer can flip status backwards (paid -> partially_paid).
  SELECT total_amount, invoice_kind, status
  INTO v_total, v_kind, v_current_status
  FROM finance.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  -- Credit notes have their own lifecycle (draft → issued → applied → void)
  -- and are not driven by the payment table. Skip recompute (Critic §2a).
  IF v_kind = 'credit_note' THEN
    RETURN;
  END IF;

  -- Sum only succeeded payments. Pending/failed/refunded do not count toward paid_amount.
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM finance.payments
  WHERE invoice_id = p_invoice_id AND status = 'succeeded';

  UPDATE finance.invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'
        WHEN v_paid > 0 AND v_paid < v_total THEN 'partially_paid'
        WHEN v_paid <= 0 AND v_current_status IN ('paid', 'partially_paid') THEN 'sent'
        ELSE v_current_status  -- preserve draft/sent/viewed if no payments yet
      END,
      paid_at = CASE
        WHEN v_paid >= v_total AND v_total > 0 AND paid_at IS NULL THEN now()
        WHEN v_paid < v_total THEN NULL
        ELSE paid_at
      END
  WHERE id = p_invoice_id;
END;
$$;


--
-- Name: FUNCTION recompute_invoice_paid(p_invoice_id uuid); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid) IS 'Concurrent-safe paid_amount recompute. Uses SELECT FOR UPDATE on the invoice row to prevent the Stripe webhook + manual payment race. Skips credit notes (separate lifecycle). Called only by the payment trigger; never invoke directly from app code.';


--
-- Name: record_payment(uuid, numeric, text, timestamp with time zone, text, text, text, text, text, uuid, uuid, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone DEFAULT now(), p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_stripe_payment_intent_id text DEFAULT NULL::text, p_stripe_charge_id text DEFAULT NULL::text, p_status text DEFAULT 'succeeded'::text, p_recorded_by_user_id uuid DEFAULT NULL::uuid, p_parent_payment_id uuid DEFAULT NULL::uuid, p_attachment_storage_path text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_invoice record;
  v_payment_id uuid;
  v_existing_payment_id uuid;
BEGIN
  -- ── Validate invoice exists ────────────────────────────────────────────────
  SELECT id, workspace_id, status, invoice_kind, total_amount, paid_amount
  INTO v_invoice
  FROM finance.invoices
  WHERE id = p_invoice_id;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id
      USING ERRCODE = 'P0020';
  END IF;

  -- ── Validate invoice is in a payable state ─────────────────────────────────
  -- Positive payments only accepted on sent/viewed/partially_paid invoices.
  -- Negative payments (refunds) only accepted on paid/partially_paid invoices.
  -- Draft invoices cannot receive payments (they haven't been sent yet).
  -- Void/refunded invoices cannot receive payments.
  IF p_amount > 0 THEN
    IF v_invoice.status NOT IN ('sent', 'viewed', 'partially_paid') THEN
      RAISE EXCEPTION 'Cannot record payment on invoice with status "%". Invoice must be sent, viewed, or partially_paid.',
        v_invoice.status
        USING ERRCODE = 'P0021';
    END IF;
  ELSIF p_amount < 0 THEN
    -- Refund
    IF v_invoice.status NOT IN ('paid', 'partially_paid') THEN
      RAISE EXCEPTION 'Cannot record refund on invoice with status "%". Invoice must be paid or partially_paid.',
        v_invoice.status
        USING ERRCODE = 'P0022';
    END IF;
    IF p_parent_payment_id IS NULL THEN
      RAISE EXCEPTION 'Refund (negative amount) requires parent_payment_id to be set'
        USING ERRCODE = 'P0023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Payment amount cannot be zero'
      USING ERRCODE = 'P0024';
  END IF;

  -- ── Validate method ────────────────────────────────────────────────────────
  IF p_method NOT IN ('stripe_card', 'stripe_ach', 'check', 'wire', 'cash', 'bill_dot_com', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_method
      USING ERRCODE = 'P0025';
  END IF;

  -- ── Validate status ────────────────────────────────────────────────────────
  IF p_status NOT IN ('pending', 'succeeded', 'failed', 'refunded') THEN
    RAISE EXCEPTION 'Invalid payment status: %', p_status
      USING ERRCODE = 'P0026';
  END IF;

  -- ── Stripe idempotency guard ───────────────────────────────────────────────
  -- If a stripe_payment_intent_id is provided and a payment already exists
  -- for it, return the existing payment ID (webhook retry safety).
  IF p_stripe_payment_intent_id IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id
    FROM finance.payments
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;

    IF v_existing_payment_id IS NOT NULL THEN
      RETURN v_existing_payment_id;
    END IF;
  END IF;

  -- ── Insert the payment ─────────────────────────────────────────────────────
  -- The AFTER INSERT trigger (finance.payments_recompute_trigger) will
  -- automatically recompute paid_amount and update invoice status.
  INSERT INTO finance.payments (
    workspace_id,
    invoice_id,
    amount,
    method,
    status,
    received_at,
    reference,
    notes,
    attachment_storage_path,
    stripe_payment_intent_id,
    stripe_charge_id,
    parent_payment_id,
    recorded_by_user_id
  ) VALUES (
    v_invoice.workspace_id,
    p_invoice_id,
    p_amount,
    p_method,
    p_status,
    p_received_at,
    p_reference,
    p_notes,
    p_attachment_storage_path,
    p_stripe_payment_intent_id,
    p_stripe_charge_id,
    p_parent_payment_id,
    p_recorded_by_user_id
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;


--
-- Name: FUNCTION record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone, p_reference text, p_notes text, p_stripe_payment_intent_id text, p_stripe_charge_id text, p_status text, p_recorded_by_user_id uuid, p_parent_payment_id uuid, p_attachment_storage_path text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone, p_reference text, p_notes text, p_stripe_payment_intent_id text, p_stripe_charge_id text, p_status text, p_recorded_by_user_id uuid, p_parent_payment_id uuid, p_attachment_storage_path text) IS 'Canonical payment write path. Both Stripe webhook handlers and manual "Record Payment" UI route through this. Validates invoice payability, handles Stripe idempotency via unique payment_intent_id, and lets the recompute trigger handle all status transitions. Service role only.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: spawn_invoices_from_proposal(uuid, text); Type: FUNCTION; Schema: finance; Owner: -
--

CREATE FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text DEFAULT 'deposit_final'::text) RETURNS TABLE(invoice_id uuid, invoice_kind text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_proposal            record;
  v_tax_rate            numeric(8, 6);
  v_subtotal            numeric(14, 2) := 0;
  v_taxable_subtotal    numeric(14, 2) := 0;
  v_tax_amount          numeric(14, 2) := 0;
  v_total               numeric(14, 2) := 0;
  v_deposit_amount      numeric(14, 2) := 0;
  v_final_amount        numeric(14, 2) := 0;
  v_deposit_invoice_id  uuid;
  v_final_invoice_id    uuid;
  v_standalone_invoice_id uuid;
  v_item                record;
  v_position            int;
  v_effective_price     numeric(14, 2);
  v_multiplier          numeric(10, 4);
  v_line_amount         numeric(14, 2);
  v_is_taxable          boolean;
  v_has_deposit         boolean;
  v_bill_to_entity_id   uuid;
  v_event               record;
  v_per_event_total     numeric(14, 2);
  v_per_event_deposit   numeric(14, 2);
  v_per_event_final     numeric(14, 2);
  v_event_count         int;
  v_month               record;
  v_rollup_invoice_id   uuid;
BEGIN
  IF p_mode NOT IN ('lump', 'deposit_final', 'per_event', 'monthly_rollup') THEN
    RAISE EXCEPTION 'spawn_invoices_from_proposal: invalid mode %', p_mode
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM finance.invoices
    WHERE proposal_id = p_proposal_id AND status <> 'void'
  ) THEN
    RETURN QUERY
      SELECT id, finance.invoices.invoice_kind
      FROM finance.invoices
      WHERE proposal_id = p_proposal_id AND status <> 'void';
    RETURN;
  END IF;

  SELECT p.id, p.workspace_id, p.deal_id, p.deposit_percent,
         p.payment_due_days, p.deposit_paid_at, p.stripe_payment_intent_id,
         p.payment_notes, p.terms_and_conditions
  INTO v_proposal
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal % not found', p_proposal_id USING ERRCODE = 'P0010';
  END IF;

  SELECT COALESCE(default_tax_rate, 0)
  INTO v_tax_rate
  FROM public.workspaces
  WHERE id = v_proposal.workspace_id;

  FOR v_item IN
    SELECT pi.*, pkg.cost AS pkg_cost
    FROM public.proposal_items pi
    LEFT JOIN public.packages pkg ON pi.package_id = pkg.id
    WHERE pi.proposal_id = p_proposal_id
      AND pi.is_client_visible = true
      AND pi.is_package_header = false
    ORDER BY pi.sort_order
  LOOP
    v_effective_price := COALESCE(v_item.override_price, v_item.unit_price, 0);
    v_multiplier := COALESCE(v_item.unit_multiplier, 1);
    v_line_amount := v_item.quantity * v_multiplier * v_effective_price;
    v_subtotal := v_subtotal + v_line_amount;

    v_is_taxable := COALESCE(
      (v_item.definition_snapshot -> 'tax_meta' ->> 'is_taxable')::boolean,
      false
    );
    IF v_is_taxable THEN
      v_taxable_subtotal := v_taxable_subtotal + v_line_amount;
    END IF;
  END LOOP;

  IF v_tax_rate > 0 AND v_taxable_subtotal > 0 THEN
    v_tax_amount := ROUND(v_taxable_subtotal * v_tax_rate, 2);
  END IF;

  v_total := v_subtotal + v_tax_amount;

  v_has_deposit := COALESCE(v_proposal.deposit_percent, 0) > 0;
  IF v_has_deposit THEN
    v_deposit_amount := ROUND(v_total * v_proposal.deposit_percent / 100.0, 2);
    v_final_amount := v_total - v_deposit_amount;
  END IF;

  SELECT COALESCE(ds.entity_id, ds.organization_id) INTO v_bill_to_entity_id
  FROM ops.deal_stakeholders ds
  WHERE ds.deal_id = v_proposal.deal_id
    AND ds.role = 'bill_to'::public.deal_stakeholder_role
    AND ds.is_primary = true
  LIMIT 1;

  IF v_bill_to_entity_id IS NULL THEN
    SELECT COALESCE(ds.entity_id, ds.organization_id) INTO v_bill_to_entity_id
    FROM ops.deal_stakeholders ds
    WHERE ds.deal_id = v_proposal.deal_id
      AND ds.role = 'host'::public.deal_stakeholder_role
      AND ds.is_primary = true
    LIMIT 1;
  END IF;

  IF v_bill_to_entity_id IS NULL THEN
    SELECT de.id INTO v_bill_to_entity_id
    FROM directory.entities de
    WHERE de.owner_workspace_id = v_proposal.workspace_id
      AND de.type IN ('company', 'person')
    LIMIT 1;
  END IF;

  IF v_bill_to_entity_id IS NULL THEN
    RAISE EXCEPTION 'spawn_invoices_from_proposal: no bill_to entity resolvable for deal %', v_proposal.deal_id
      USING ERRCODE = 'P0010';
  END IF;

  IF p_mode = 'lump' THEN
    INSERT INTO finance.invoices (
      workspace_id, invoice_number, invoice_kind, status,
      bill_to_entity_id, proposal_id, deal_id,
      billing_mode,
      subtotal_amount, tax_amount, total_amount,
      notes_to_client, terms
    ) VALUES (
      v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
      v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
      'lump',
      v_subtotal, v_tax_amount, v_total,
      v_proposal.payment_notes, v_proposal.terms_and_conditions
    )
    RETURNING id INTO v_standalone_invoice_id;

    CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_standalone_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);
    RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
    RETURN;
  END IF;

  IF p_mode = 'deposit_final' THEN
    IF v_has_deposit THEN
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'deposit', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_deposit_amount, 0, v_deposit_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_deposit_invoice_id, 1, 'fee',
        'Deposit (' || v_proposal.deposit_percent || '% of ' || to_char(v_total, 'FM$999,999,990.00') || ')',
        1, v_deposit_amount, v_deposit_amount, false
      );

      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'final', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_subtotal, v_tax_amount, v_final_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_final_invoice_id;

      CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_final_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);

      SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
      FROM finance.invoice_line_items
      WHERE invoice_id = v_final_invoice_id;
      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_final_invoice_id, v_position, 'fee',
        'Less: deposit applied', 1, -v_deposit_amount, -v_deposit_amount, false
      );

      IF v_proposal.deposit_paid_at IS NOT NULL THEN
        INSERT INTO finance.payments (
          workspace_id, invoice_id, amount, method, status,
          received_at, stripe_payment_intent_id, qbo_sync_status
        ) VALUES (
          v_proposal.workspace_id, v_deposit_invoice_id, v_deposit_amount,
          'stripe_card', 'succeeded',
          v_proposal.deposit_paid_at, v_proposal.stripe_payment_intent_id,
          'excluded_pre_connection'
        );
      END IF;

      RETURN QUERY
        SELECT v_deposit_invoice_id, 'deposit'::text
        UNION ALL
        SELECT v_final_invoice_id, 'final'::text;
      RETURN;
    ELSE
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_subtotal, v_tax_amount, v_total,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_standalone_invoice_id;

      CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_standalone_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);
      RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
      RETURN;
    END IF;
  END IF;

  IF p_mode = 'per_event' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: per_event requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    FOR v_event IN
      SELECT id, starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL
      ORDER BY starts_at
    LOOP
      IF v_has_deposit THEN
        v_per_event_deposit := ROUND(v_per_event_total * v_proposal.deposit_percent / 100.0, 2);
        v_per_event_final := v_per_event_total - v_per_event_deposit;

        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'deposit', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_deposit, 0, v_per_event_deposit,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_deposit_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_deposit_invoice_id, 1, 'fee',
          'Deposit · show ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_deposit, v_per_event_deposit, false
        );

        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'final', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_total - v_per_event_deposit, 0, v_per_event_final,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_final_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_final_invoice_id, 1, 'service',
          'Show on ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_total, v_per_event_total, false
        );
        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_final_invoice_id, 2, 'fee',
          'Less: deposit applied', 1, -v_per_event_deposit, -v_per_event_deposit, false
        );

        RETURN QUERY SELECT v_deposit_invoice_id, 'deposit'::text;
        RETURN QUERY SELECT v_final_invoice_id, 'final'::text;
      ELSE
        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_total, 0, v_per_event_total,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_standalone_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_standalone_invoice_id, 1, 'service',
          'Show on ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_total, v_per_event_total, false
        );

        RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
      END IF;
    END LOOP;

    RETURN;
  END IF;

  IF p_mode = 'monthly_rollup' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: monthly_rollup requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    FOR v_month IN
      SELECT
        date_trunc('month', (starts_at AT TIME ZONE timezone))::date AS period_start,
        (date_trunc('month', (starts_at AT TIME ZONE timezone)) + interval '1 month - 1 day')::date AS period_end,
        count(*) AS event_count,
        min(starts_at) AS first_starts_at,
        max(starts_at) AS last_starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL
      GROUP BY date_trunc('month', (starts_at AT TIME ZONE timezone))
      ORDER BY period_start
    LOOP
      v_line_amount := ROUND(v_month.event_count * v_per_event_total, 2);

      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode, billing_period_start, billing_period_end,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'progress', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'monthly_rollup', v_month.period_start, v_month.period_end,
        v_line_amount, 0, v_line_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_rollup_invoice_id;

      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_rollup_invoice_id, 1, 'service',
        to_char(v_month.period_start, 'FMMonth YYYY') || ' — ' || v_month.event_count || ' show' || CASE WHEN v_month.event_count > 1 THEN 's' ELSE '' END,
        v_month.event_count, v_per_event_total, v_line_amount, false
      );

      RETURN QUERY SELECT v_rollup_invoice_id, 'progress'::text;
    END LOOP;

    RETURN;
  END IF;

  RAISE EXCEPTION 'spawn_invoices_from_proposal: unexpected mode %', p_mode USING ERRCODE = 'P0010';
END;
$_$;


--
-- Name: FUNCTION spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text); Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text) IS 'Fan out invoices from an accepted proposal per p_mode: lump | deposit_final | per_event | monthly_rollup. Idempotent via finance_invoices_spawn_idem partial unique index.';


--
-- Name: _expand_series_rule(jsonb); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops._expand_series_rule(p_series_rule jsonb) RETURNS SETOF date
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT d::date
  FROM (
    SELECT DISTINCT r::date AS d
    FROM jsonb_array_elements_text(COALESCE(p_series_rule -> 'rdates', '[]'::jsonb)) AS r
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p_series_rule -> 'exdates', '[]'::jsonb)) AS x
      WHERE x = r
    )
  ) s
  ORDER BY d;
$$;


--
-- Name: FUNCTION _expand_series_rule(p_series_rule jsonb); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops._expand_series_rule(p_series_rule jsonb) IS 'Returns the effective date list of a series_rule (rdates - exdates, sorted). RRULE is NOT expanded — JS clients expand at write time and persist rdates.';


--
-- Name: advance_deal_stage(uuid, uuid, text[], text[]); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[] DEFAULT NULL::text[], p_only_if_tags_any text[] DEFAULT NULL::text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_deal_workspace_id  uuid;
  v_deal_status        text;
  v_deal_stage_id      uuid;
  v_current_stage_tags text[];
  v_target_workspace   uuid;
  v_updated            int;
BEGIN
  SELECT workspace_id INTO v_target_workspace
  FROM ops.pipeline_stages
  WHERE id = p_new_stage_id;

  IF v_target_workspace IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage: target stage not found: %', p_new_stage_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT workspace_id, status, stage_id
    INTO v_deal_workspace_id, v_deal_status, v_deal_stage_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_deal_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage: deal not found: %', p_deal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_deal_workspace_id <> v_target_workspace THEN
    RAISE EXCEPTION 'advance_deal_stage: stage and deal belong to different workspaces'
      USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = v_deal_workspace_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'advance_deal_stage: not a member of deal workspace'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.member_has_capability(v_deal_workspace_id, 'deals:edit:global') THEN
      RAISE EXCEPTION 'advance_deal_stage: missing capability deals:edit:global'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_deal_status IS NOT NULL
     AND NOT (v_deal_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  IF p_only_if_tags_any IS NOT NULL
     AND array_length(p_only_if_tags_any, 1) IS NOT NULL THEN
    IF v_deal_stage_id IS NULL THEN
      RETURN false;
    END IF;
    SELECT tags INTO v_current_stage_tags
    FROM ops.pipeline_stages
    WHERE id = v_deal_stage_id;
    IF v_current_stage_tags IS NULL
       OR NOT (v_current_stage_tags && p_only_if_tags_any) THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


--
-- Name: FUNCTION advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]) IS 'Phase 3i: canonical user-callable stage-change RPC. Sets public.deals.stage_id; the BEFORE trigger derives status = stage.kind. Enforces workspace membership + deals:edit:global capability for authenticated callers. Supports the same two optional guards as advance_deal_stage_from_webhook (status slug allowlist + tag-overlap). Returns true iff the update landed, false when a guard rejected. Raises on cross-workspace or capability violations.';


--
-- Name: advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[] DEFAULT NULL::text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id       uuid;
  v_current_status     text;
  v_current_stage_id   uuid;
  v_current_stage_tags text[];
  v_updated            int;
BEGIN
  PERFORM p_new_status_slug;

  SELECT workspace_id, status, stage_id
    INTO v_workspace_id, v_current_status, v_current_stage_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage_from_webhook: deal not found: %', p_deal_id;
  END IF;

  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_current_status IS NOT NULL
     AND NOT (v_current_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  IF p_only_if_tags_any IS NOT NULL
     AND array_length(p_only_if_tags_any, 1) IS NOT NULL THEN
    IF v_current_stage_id IS NULL THEN
      RETURN false;
    END IF;
    SELECT tags INTO v_current_stage_tags
    FROM ops.pipeline_stages
    WHERE id = v_current_stage_id;
    IF v_current_stage_tags IS NULL
       OR NOT (v_current_stage_tags && p_only_if_tags_any) THEN
      RETURN false;
    END IF;
  END IF;

  PERFORM set_config('custom_pipelines.webhook_source', p_webhook_source, true);
  PERFORM set_config('custom_pipelines.webhook_event_id', p_webhook_event_id, true);

  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


--
-- Name: FUNCTION advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[]); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[]) IS 'Phase 3i: webhook-initiated stage advance. p_new_status_slug is retained in the signature for call-site compatibility but is IGNORED - the BEFORE trigger derives status from stage.kind. Two optional guards (status-slug allowlist, tag-overlap) preserved from Phase 3h. SET LOCALs custom_pipelines.webhook_source + custom_pipelines.webhook_event_id so record_deal_transition stamps webhook metadata on the inserted deal_transitions row. Service-role only.';


--
-- Name: archive_workspace_event_archetype(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.archive_workspace_event_archetype(p_workspace_id uuid, p_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET archived_at = now(), updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$$;


--
-- Name: claim_pending_transitions(integer); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.claim_pending_transitions(p_batch_size integer DEFAULT 50) RETURNS TABLE(transition_id uuid, workspace_id uuid, deal_id uuid, pipeline_id uuid, from_stage_id uuid, to_stage_id uuid, actor_user_id uuid, actor_kind text, entered_at timestamp with time zone, stage_triggers jsonb, stage_slug text, stage_kind text, stage_tags text[], dedup_skip boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  WITH claimed AS (
    SELECT t.id
    FROM ops.deal_transitions t
    JOIN public.workspaces w ON w.id = t.workspace_id
    WHERE t.triggers_dispatched_at IS NULL
      AND t.triggers_failed_at IS NULL
      AND (w.feature_flags ->> 'pipelines.triggers_enabled')::boolean IS TRUE
    ORDER BY t.entered_at ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE OF t SKIP LOCKED
  )
  SELECT
    t.id                                        AS transition_id,
    t.workspace_id,
    t.deal_id,
    t.pipeline_id,
    t.from_stage_id,
    t.to_stage_id,
    t.actor_user_id,
    t.actor_kind,
    t.entered_at,
    COALESCE(t.triggers_snapshot, s.triggers)   AS stage_triggers,
    s.slug                                      AS stage_slug,
    s.kind                                      AS stage_kind,
    s.tags                                      AS stage_tags,
    EXISTS (
      SELECT 1
      FROM ops.deal_transitions prior
      WHERE prior.deal_id     = t.deal_id
        AND prior.to_stage_id = t.to_stage_id
        AND prior.id         <> t.id
        AND prior.entered_at <  t.entered_at
        AND prior.entered_at >= t.entered_at - interval '5 seconds'
    )                                           AS dedup_skip
  FROM claimed c
  JOIN ops.deal_transitions t ON t.id = c.id
  JOIN ops.pipeline_stages  s ON s.id = t.to_stage_id
  ORDER BY t.entered_at ASC;
$$;


--
-- Name: FUNCTION claim_pending_transitions(p_batch_size integer); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.claim_pending_transitions(p_batch_size integer) IS 'P0 update: returns COALESCE(t.triggers_snapshot, s.triggers) so snapshot wins when present, live stage config is the fallback. Also exposes stage_tags so primitives can gate on semantic identifiers (proposal_sent, awaiting_signature) rather than slug/label. Otherwise unchanged from Phase 3c.';


--
-- Name: create_pipeline_stage(uuid, text, text, text[], integer, text, boolean, boolean, boolean); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[] DEFAULT ARRAY[]::text[], p_rotting_days integer DEFAULT NULL::integer, p_color_token text DEFAULT NULL::text, p_requires_confirmation boolean DEFAULT false, p_opens_handoff_wizard boolean DEFAULT false, p_hide_from_portal boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_next_sort integer;
  v_new_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM ops.pipelines
  WHERE id = p_pipeline_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline not found: %', p_pipeline_id;
  END IF;

  IF NOT public.member_has_capability(v_workspace_id, 'pipelines:manage') THEN
    RAISE EXCEPTION 'Missing capability: pipelines:manage';
  END IF;

  -- Basic input validation
  IF COALESCE(trim(p_label), '') = '' THEN
    RAISE EXCEPTION 'Stage label cannot be empty';
  END IF;
  IF COALESCE(trim(p_slug), '') = '' THEN
    RAISE EXCEPTION 'Stage slug cannot be empty';
  END IF;

  -- End-of-working insert position
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next_sort
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id AND kind = 'working' AND is_archived = false;

  -- Shift won/lost stages down by 1 (deferrable constraint allows the
  -- intermediate value before the insert).
  UPDATE ops.pipeline_stages
  SET sort_order = sort_order + 1
  WHERE pipeline_id = p_pipeline_id
    AND kind IN ('won', 'lost');

  -- Insert new working stage
  INSERT INTO ops.pipeline_stages (
    pipeline_id, workspace_id, label, slug, sort_order, kind, tags,
    rotting_days, requires_confirmation, opens_handoff_wizard,
    hide_from_portal, color_token
  ) VALUES (
    p_pipeline_id, v_workspace_id, p_label, p_slug, v_next_sort, 'working',
    COALESCE(p_tags, ARRAY[]::text[]),
    p_rotting_days, p_requires_confirmation, p_opens_handoff_wizard,
    p_hide_from_portal, p_color_token
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


--
-- Name: FUNCTION create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean) IS 'Creates a new kind=working stage at end-of-working position, shifting won/lost down. Gated on pipelines:manage.';


--
-- Name: crew_confirmation_drift_check_trg(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.crew_confirmation_drift_check_trg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'ops', 'public'
    AS $$
DECLARE
  v_dc_confirmed timestamptz;
  v_dc_exists boolean;
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT')
     AND NEW.status = 'confirmed'
     AND NEW.entity_id IS NOT NULL
     AND NEW.event_id IS NOT NULL THEN

    SELECT dc.confirmed_at, true
      INTO v_dc_confirmed, v_dc_exists
    FROM ops.deal_crew dc
    JOIN ops.events e ON e.deal_id = dc.deal_id
    WHERE e.id = NEW.event_id
      AND dc.entity_id = NEW.entity_id
    LIMIT 1;

    IF v_dc_exists IS NOT TRUE THEN
      RAISE EXCEPTION
        'crew_assignments.status=confirmed rejected: no matching deal_crew row for event_id=% entity_id=%. The partner row must be created via the Production Team Card before the portal can confirm.',
        NEW.event_id, NEW.entity_id
        USING ERRCODE = 'check_violation',
              HINT = 'Use respondToCrewAssignment() which mirrors deal_crew.confirmed_at first.';
    END IF;

    IF v_dc_confirmed IS NULL THEN
      RAISE EXCEPTION
        'crew_assignments.status=confirmed rejected: partner deal_crew.confirmed_at is NULL for event_id=% entity_id=%. Writer must mirror both rows.',
        NEW.event_id, NEW.entity_id
        USING ERRCODE = 'check_violation',
              HINT = 'Use respondToCrewAssignment() in src/features/ops/actions/respond-to-crew-assignment.ts which mirrors both tables.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: evaluate_dwell_sla(integer); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.evaluate_dwell_sla(p_batch_size integer DEFAULT 100) RETURNS TABLE(transition_id uuid, workspace_id uuid, deal_id uuid, pipeline_id uuid, to_stage_id uuid, stage_tags text[], trigger_payload jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  WITH latest AS (
    SELECT DISTINCT ON (t.deal_id)
           t.id           AS transition_id,
           t.workspace_id,
           t.deal_id,
           t.pipeline_id,
           t.to_stage_id,
           t.entered_at,
           t.triggers_snapshot,
           s.triggers     AS live_triggers,
           s.tags         AS stage_tags
      FROM ops.deal_transitions t
      JOIN ops.pipeline_stages  s ON s.id = t.to_stage_id
      JOIN public.deals         d ON d.id = t.deal_id
      JOIN public.workspaces    w ON w.id = t.workspace_id
     WHERE d.archived_at IS NULL
       AND d.status = 'working'
       AND (w.feature_flags ->> 'pipelines.triggers_enabled')::boolean IS TRUE
     ORDER BY t.deal_id, t.entered_at DESC
  ),
  expanded AS (
    SELECT l.transition_id,
           l.workspace_id,
           l.deal_id,
           l.pipeline_id,
           l.to_stage_id,
           l.stage_tags,
           l.entered_at,
           trg
      FROM latest l,
           LATERAL jsonb_array_elements(
             COALESCE(l.triggers_snapshot, l.live_triggers)
           ) AS trg
     WHERE trg->>'event' = 'dwell_sla'
       AND (trg->>'dwell_days')::int IS NOT NULL
       AND l.entered_at <= now() - make_interval(days => (trg->>'dwell_days')::int)
  )
  SELECT e.transition_id,
         e.workspace_id,
         e.deal_id,
         e.pipeline_id,
         e.to_stage_id,
         e.stage_tags,
         e.trg AS trigger_payload
    FROM expanded e
   WHERE NOT EXISTS (
           SELECT 1
             FROM ops.follow_up_queue q
            WHERE q.originating_transition_id = e.transition_id
              AND q.primitive_key = 'sla:' || (e.trg->>'primitive_key')
         )
   ORDER BY e.entered_at ASC
   LIMIT GREATEST(p_batch_size, 1);
$$;


--
-- Name: FUNCTION evaluate_dwell_sla(p_batch_size integer); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.evaluate_dwell_sla(p_batch_size integer) IS 'P0: returns deals whose current stage has a dwell_sla trigger past its dwell_days threshold and has not yet been enrolled. Idempotent via ops.follow_up_queue.originating_transition_id + primitive_key (prefixed sla:). Service-role only.';


--
-- Name: event_status_pair_valid(text, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.event_status_pair_valid(p_status text, p_lifecycle text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_status IS NULL THEN false
    WHEN p_status = 'planned' THEN
      p_lifecycle IS NULL
        OR p_lifecycle IN ('lead','tentative','confirmed','production')
    WHEN p_status = 'in_progress' THEN p_lifecycle = 'live'
    WHEN p_status = 'completed'   THEN p_lifecycle = 'post'
    WHEN p_status = 'cancelled'   THEN p_lifecycle = 'cancelled'
    WHEN p_status = 'archived'    THEN p_lifecycle = 'archived'
    ELSE false
  END;
$$;


--
-- Name: FUNCTION event_status_pair_valid(p_status text, p_lifecycle text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.event_status_pair_valid(p_status text, p_lifecycle text) IS 'Pass 3 Phase 0: pure mapping function used by the events_status_pair_check trigger to reject status/lifecycle_status drift. Canonical writers: mark-show-state.ts (start/end/undo) and delete-event.ts (cancel).';


--
-- Name: events_status_pair_check_trg(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.events_status_pair_check_trg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT ops.event_status_pair_valid(NEW.status, NEW.lifecycle_status) THEN
    RAISE EXCEPTION
      'ops.events status/lifecycle_status drift: status=% lifecycle_status=%',
      NEW.status, NEW.lifecycle_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_crew_equipment_verification_columns(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.guard_crew_equipment_verification_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If verification columns are being changed and caller is not a SECURITY DEFINER context,
  -- block the change. SECURITY DEFINER RPCs set session variable to bypass this.
  IF (NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason)
     AND current_setting('app.bypass_verification_guard', true) IS DISTINCT FROM 'true'
  THEN
    -- Revert verification columns to their old values
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.verified_by := OLD.verified_by;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: has_primitive_fired(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.has_primitive_fired(p_transition_id uuid, p_primitive text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ops.deal_activity_log l
    WHERE l.trigger_type = p_primitive
      AND l.status = 'success'
      AND (l.metadata ->> 'transition_id')::uuid = p_transition_id
  );
$$;


--
-- Name: FUNCTION has_primitive_fired(p_transition_id uuid, p_primitive text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.has_primitive_fired(p_transition_id uuid, p_primitive text) IS 'Second-line idempotency check for primitives. Returns true if ops.deal_activity_log already has a success row for (transition_id, trigger_type). Service-role only.';


--
-- Name: log_deal_activity(uuid, text, text, text, uuid, uuid, text, text, jsonb, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_trigger_type text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_undo_token text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_new_id       uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'ops.log_deal_activity: deal_id % not found', p_deal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO ops.deal_activity_log (
    workspace_id,
    deal_id,
    pipeline_stage_id,
    actor_user_id,
    actor_kind,
    trigger_type,
    action_summary,
    status,
    error_message,
    metadata,
    undo_token
  ) VALUES (
    v_workspace_id,
    p_deal_id,
    p_pipeline_stage_id,
    p_actor_user_id,
    p_actor_kind,
    p_trigger_type,
    p_action_summary,
    p_status,
    p_error_message,
    COALESCE(p_metadata, '{}'::jsonb),
    p_undo_token
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


--
-- Name: FUNCTION log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid, p_actor_user_id uuid, p_trigger_type text, p_error_message text, p_metadata jsonb, p_undo_token text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid, p_actor_user_id uuid, p_trigger_type text, p_error_message text, p_metadata jsonb, p_undo_token text) IS 'Append a row to ops.deal_activity_log. Called by the Phase 3c trigger dispatcher after a primitive fires. workspace_id is resolved from the deal. Raises if the deal does not exist.';


--
-- Name: mark_deal_activity_undone(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.mark_deal_activity_undone(p_activity_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_activity_log
  SET status    = 'undone',
      undone_at = now()
  WHERE id = p_activity_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_deal_activity_undone: activity_id % not found', p_activity_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: FUNCTION mark_deal_activity_undone(p_activity_id uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.mark_deal_activity_undone(p_activity_id uuid) IS 'Mark a deal_activity_log row as undone (status=undone, undone_at=now()). Called by the Phase 3f undo toast. Raises if the row does not exist.';


--
-- Name: mark_transition_dispatched(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.mark_transition_dispatched(p_transition_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_transitions
  SET triggers_dispatched_at = now()
  WHERE id = p_transition_id
    AND triggers_dispatched_at IS NULL
    AND triggers_failed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_transition_dispatched: transition_id % not found or already processed', p_transition_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: FUNCTION mark_transition_dispatched(p_transition_id uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.mark_transition_dispatched(p_transition_id uuid) IS 'Phase 3c: stamp a deal_transitions row as dispatched. Called by the TS dispatcher after a primitive runs (or immediately for no-trigger/dedup-skip rows). Service-role only.';


--
-- Name: mark_transition_failed(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.mark_transition_failed(p_transition_id uuid, p_error text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_transitions
  SET triggers_failed_at = now(),
      triggers_error     = p_error
  WHERE id = p_transition_id
    AND triggers_dispatched_at IS NULL
    AND triggers_failed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_transition_failed: transition_id % not found or already processed', p_transition_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: FUNCTION mark_transition_failed(p_transition_id uuid, p_error text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.mark_transition_failed(p_transition_id uuid, p_error text) IS 'Phase 3c: stamp a deal_transitions row as failed. Called by the TS dispatcher when an unrecoverable error prevents primitive processing (e.g. log-RPC failure). Consumes the row so the dispatcher doesn''t spin on it. Design doc §10: trigger failure never blocks the stage change. Service-role only.';


--
-- Name: merge_workspace_event_archetypes(uuid, text, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.merge_workspace_event_archetypes(p_workspace_id uuid, p_source_slug text, p_target_slug text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_source record;
  v_target record;
  v_moved int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Admin gate — only owners and admins merge. Members can create but not
  -- destructively rename/merge.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id
      AND workspace_id = p_workspace_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: admin required' USING ERRCODE = '42501';
  END IF;

  IF p_source_slug = p_target_slug THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: source and target are the same' USING ERRCODE = '22023';
  END IF;

  -- Source must be a custom (non-system) row in this workspace.
  SELECT id, slug, label, is_system, archived_at INTO v_source
  FROM ops.workspace_event_archetypes
  WHERE slug = p_source_slug
    AND workspace_id = p_workspace_id
    AND is_system = false
  LIMIT 1;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: source slug % not found as custom type', p_source_slug USING ERRCODE = 'P0001';
  END IF;

  -- Target may be either system or a custom row for this workspace.
  SELECT id, slug, label, is_system, archived_at INTO v_target
  FROM ops.workspace_event_archetypes
  WHERE slug = p_target_slug
    AND (workspace_id = p_workspace_id OR is_system = true)
    AND archived_at IS NULL
  LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: target slug % not found', p_target_slug USING ERRCODE = 'P0001';
  END IF;

  -- Move all deals that reference the source slug to the target.
  UPDATE public.deals
  SET event_archetype = v_target.slug, updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND event_archetype = v_source.slug;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- Also move ops.events that denormalize event_archetype on the row.
  UPDATE ops.events
  SET event_archetype = v_target.slug, updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND event_archetype = v_source.slug;

  -- Archive source.
  UPDATE ops.workspace_event_archetypes
  SET archived_at = now(), updated_at = now()
  WHERE id = v_source.id;

  RETURN jsonb_build_object(
    'moved_deals', v_moved,
    'source_slug', v_source.slug,
    'target_slug', v_target.slug
  );
END;
$$;


--
-- Name: metric_aion_refusal_rate(uuid, integer); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_aion_refusal_rate(p_workspace_id uuid, p_days integer DEFAULT 30) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'cortex', 'public', 'ops', 'pg_temp'
    AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
  v_now timestamptz := now();
  v_curr_start timestamptz := v_now - make_interval(days => v_days);
  v_prev_start timestamptz := v_curr_start - make_interval(days => v_days);

  v_refusals_curr bigint;
  v_refusals_prev bigint;
  v_turns_curr bigint;
  v_turns_prev bigint;

  v_rate_curr numeric;
  v_rate_prev numeric;
  v_secondary text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_refusals_curr
    FROM cortex.aion_refusal_log
    WHERE workspace_id = p_workspace_id
      AND created_at >= v_curr_start
      AND created_at <  v_now;

  SELECT count(*) INTO v_refusals_prev
    FROM cortex.aion_refusal_log
    WHERE workspace_id = p_workspace_id
      AND created_at >= v_prev_start
      AND created_at <  v_curr_start;

  SELECT count(*) INTO v_turns_curr
    FROM cortex.aion_messages m
    JOIN cortex.aion_sessions s ON s.id = m.session_id
    WHERE s.workspace_id = p_workspace_id
      AND m.role = 'user'
      AND m.created_at >= v_curr_start
      AND m.created_at <  v_now;

  SELECT count(*) INTO v_turns_prev
    FROM cortex.aion_messages m
    JOIN cortex.aion_sessions s ON s.id = m.session_id
    WHERE s.workspace_id = p_workspace_id
      AND m.role = 'user'
      AND m.created_at >= v_prev_start
      AND m.created_at <  v_curr_start;

  v_rate_curr := CASE
    WHEN v_turns_curr > 0 THEN (v_refusals_curr::numeric / v_turns_curr::numeric)
    ELSE 0
  END;
  v_rate_prev := CASE
    WHEN v_turns_prev > 0 THEN (v_refusals_prev::numeric / v_turns_prev::numeric)
    ELSE 0
  END;

  v_secondary := CASE
    WHEN v_turns_curr = 0 THEN 'No Aion activity in the last ' || v_days || ' days'
    ELSE v_refusals_curr || ' of ' || v_turns_curr || ' turns refused'
  END;

  RETURN QUERY SELECT
    v_rate_curr AS primary_value,
    v_secondary AS secondary_text,
    CASE WHEN v_turns_prev > 0 OR v_refusals_prev > 0 THEN v_rate_prev ELSE NULL END
      AS comparison_value,
    CASE WHEN v_turns_prev > 0 OR v_refusals_prev > 0
         THEN 'vs prior ' || v_days || ' days'
         ELSE NULL END AS comparison_label,
    NULL::numeric[] AS sparkline_values;
END;
$$;


--
-- Name: FUNCTION metric_aion_refusal_rate(p_workspace_id uuid, p_days integer); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_aion_refusal_rate(p_workspace_id uuid, p_days integer) IS 'Aion refusal rate over the last p_days window. Numerator: cortex.aion_refusal_log rows. Denominator: user-role messages in cortex.aion_messages. SECURITY DEFINER.';


--
-- Name: metric_crew_utilization(uuid, date, date, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(primary_value numeric, secondary_text text, comparison_value numeric, comparison_label text, sparkline_values numeric[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'ops', 'finance', 'directory', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
  v_period_days int;
  v_business_days int;
  v_available_hours_per_person numeric;
  v_active_crew int;
  v_top_name text;
  v_top_pct numeric;
  v_avg numeric;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_period_days := (p_period_end - p_period_start) + 1;

  v_business_days := GREATEST(1, (v_period_days * 5) / 7);
  v_available_hours_per_person := v_business_days * 8.0;

  SELECT COUNT(DISTINCT ca.entity_id) INTO v_active_crew
  FROM ops.crew_assignments ca
  JOIN directory.entities e
    ON e.id = ca.entity_id AND e.type = 'person'
  WHERE ca.workspace_id = p_workspace_id
    AND ca.entity_id IS NOT NULL;

  IF COALESCE(v_active_crew, 0) = 0 OR v_available_hours_per_person = 0 THEN
    RETURN QUERY SELECT
      0::numeric,
      'No crew assignments yet'::text,
      NULL::numeric,
      NULL::text,
      NULL::numeric[];
    RETURN;
  END IF;

  WITH assigned AS (
    SELECT
      ca.entity_id,
      COALESCE(e.display_name, 'Unknown') AS name,
      SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)) AS hours
    FROM ops.crew_assignments ca
    JOIN ops.events ev ON ev.id = ca.event_id
    LEFT JOIN directory.entities e ON e.id = ca.entity_id
    WHERE ca.workspace_id = p_workspace_id
      AND ca.entity_id IS NOT NULL
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
    GROUP BY ca.entity_id, e.display_name
    HAVING SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)) > 0
  )
  SELECT
    LEAST(1.0, a.hours / v_available_hours_per_person),
    a.name
  INTO v_top_pct, v_top_name
  FROM assigned a
  ORDER BY a.hours DESC
  LIMIT 1;

  SELECT LEAST(1.0,
    COALESCE(SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)), 0)
    / (v_active_crew * v_available_hours_per_person))
  INTO v_avg
  FROM ops.crew_assignments ca
  JOIN ops.events ev ON ev.id = ca.event_id
  WHERE ca.workspace_id = p_workspace_id
    AND ca.entity_id IS NOT NULL
    AND ev.archived_at IS NULL
    AND ev.starts_at IS NOT NULL
    AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
    AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY SELECT
    COALESCE(v_avg, 0)::numeric,
    CASE
      WHEN v_top_name IS NULL THEN v_active_crew::text || ' crew, 0 assigned'
      ELSE v_top_name || ' ' || to_char(v_top_pct * 100, 'FM990') || '%'
    END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[];
END;
$$;


--
-- Name: FUNCTION metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Scalar metric: workspace crew utilization in the period (assigned / available hours, 0-1 ratio). Available hours approximated as 8h * business days.';


--
-- Name: metric_multi_stop_rollup(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_multi_stop_rollup(p_workspace_id uuid, p_tz text DEFAULT NULL::text) RETURNS TABLE(event_id uuid, event_title text, event_date timestamp with time zone, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'ops', 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
  v_project_id uuid;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  SELECT p.id INTO v_project_id
  FROM ops.projects p
  WHERE p.workspace_id = p_workspace_id
    AND (p.status IS NULL OR p.status NOT IN ('archived', 'cancelled'))
    AND (
      SELECT COUNT(*) FROM ops.events ev
      WHERE ev.project_id = p.id AND ev.archived_at IS NULL
    ) >= 2
  ORDER BY COALESCE(p.start_date, p.created_at) DESC NULLS LAST
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ev.id,
    COALESCE(ev.title, COALESCE(NULLIF(ev.location_name, ''), '(untitled)'))::text,
    ev.starts_at,
    COALESCE(NULLIF(ev.lifecycle_status, ''), NULLIF(ev.status, ''), 'planned')::text
  FROM ops.events ev
  WHERE ev.project_id = v_project_id
    AND ev.workspace_id = p_workspace_id
    AND ev.archived_at IS NULL
  ORDER BY ev.starts_at NULLS LAST, ev.created_at;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_multi_stop_rollup(p_workspace_id uuid, p_tz text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_multi_stop_rollup(p_workspace_id uuid, p_tz text) IS 'Table metric: per-market status roll-up for the workspace''s most recent multi-event project. Advance/crew/venue/payments booleans pending data model expansion.';


--
-- Name: metric_owner_cadence_profile(uuid, uuid, text, integer); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer DEFAULT 180) RETURNS TABLE(sample_size integer, typical_days_proposal_to_first_followup numeric, stddev_days_proposal_to_first_followup numeric, typical_days_between_followups numeric, stddev_days_between_followups numeric, preferred_channel_by_stage_tag jsonb, oldest_sample_age_days integer, computed_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'ops'
    AS $$
  WITH lookback AS (
    SELECT (now() - (GREATEST(p_lookback_days, 30)::text || ' days')::interval) AS cutoff
  ),
  scope_deals AS (
    SELECT
      d.id AS deal_id,
      CASE
        WHEN lower(COALESCE(d.event_archetype, '')) IN ('wedding', 'corporate', 'tour')
          THEN lower(d.event_archetype)
        ELSE 'other'
      END AS archetype
    FROM public.deals d, lookback
    WHERE d.workspace_id = p_workspace_id
      AND d.owner_user_id = p_user_id
      AND d.created_at >= lookback.cutoff
      AND (
        CASE
          WHEN lower(COALESCE(d.event_archetype, '')) IN ('wedding', 'corporate', 'tour')
            THEN lower(d.event_archetype)
          ELSE 'other'
        END
      ) = p_archetype
  ),
  human_acts AS (
    SELECT
      l.deal_id,
      l.actor_user_id,
      l.action_type,
      l.channel,
      l.created_at,
      sd.archetype
    FROM ops.follow_up_log l
    JOIN scope_deals sd ON sd.deal_id = l.deal_id
    LEFT JOIN ops.follow_up_queue q ON q.id = l.queue_item_id
    WHERE l.workspace_id = p_workspace_id
      AND l.actor_user_id = p_user_id
      AND l.action_type IN ('email_sent', 'sms_sent', 'call_logged', 'note_added')
      AND (q.id IS NULL OR q.linked_insight_id IS NULL)
  ),
  proposal_send AS (
    SELECT DISTINCT ON (p.deal_id)
      p.deal_id,
      COALESCE(p.email_delivered_at, p.created_at) AS sent_at
    FROM public.proposals p
    JOIN scope_deals sd ON sd.deal_id = p.deal_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('sent', 'viewed', 'accepted', 'rejected')
    ORDER BY p.deal_id, p.created_at ASC
  ),
  first_followup AS (
    SELECT
      ps.deal_id,
      ps.sent_at,
      MIN(ha.created_at) AS first_act_at,
      EXTRACT(EPOCH FROM (MIN(ha.created_at) - ps.sent_at)) / 86400.0 AS days_delta
    FROM proposal_send ps
    JOIN human_acts ha ON ha.deal_id = ps.deal_id
    WHERE ha.created_at > ps.sent_at
    GROUP BY ps.deal_id, ps.sent_at
  ),
  act_gaps AS (
    SELECT
      ha.deal_id,
      ha.created_at,
      EXTRACT(EPOCH FROM (
        ha.created_at - LAG(ha.created_at) OVER (PARTITION BY ha.deal_id ORDER BY ha.created_at)
      )) / 86400.0 AS gap_days
    FROM human_acts ha
  ),
  channel_by_stage AS (
    SELECT
      COALESCE(s.tags, ARRAY[]::text[]) AS stage_tags,
      ha.channel,
      COUNT(*) AS n
    FROM human_acts ha
    JOIN public.deals d ON d.id = ha.deal_id
    LEFT JOIN ops.pipeline_stages s ON s.id = d.stage_id
    WHERE ha.channel IS NOT NULL
    GROUP BY COALESCE(s.tags, ARRAY[]::text[]), ha.channel
  ),
  channel_winner_per_tag AS (
    SELECT
      tag,
      channel,
      n,
      ROW_NUMBER() OVER (PARTITION BY tag ORDER BY n DESC) AS rnk
    FROM (
      SELECT unnest(stage_tags) AS tag, channel, n FROM channel_by_stage
    ) t
  ),
  preferred_channels AS (
    SELECT COALESCE(jsonb_object_agg(tag, channel), '{}'::jsonb) AS m
    FROM channel_winner_per_tag
    WHERE rnk = 1
  )
  SELECT
    COALESCE((SELECT COUNT(*)::integer FROM human_acts), 0) AS sample_size,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY days_delta)
     FROM first_followup WHERE days_delta IS NOT NULL) AS typical_days_proposal_to_first_followup,
    (SELECT stddev_pop(days_delta) FROM first_followup WHERE days_delta IS NOT NULL)
      AS stddev_days_proposal_to_first_followup,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_days)
     FROM act_gaps WHERE gap_days IS NOT NULL) AS typical_days_between_followups,
    (SELECT stddev_pop(gap_days) FROM act_gaps WHERE gap_days IS NOT NULL)
      AS stddev_days_between_followups,
    (SELECT m FROM preferred_channels) AS preferred_channel_by_stage_tag,
    COALESCE(
      (SELECT EXTRACT(DAY FROM (now() - MIN(created_at)))::integer FROM human_acts),
      0
    ) AS oldest_sample_age_days,
    now() AS computed_at;
$$;


--
-- Name: FUNCTION metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer) IS 'Owner-cadence analytics per user+archetype. Human-initiated only (feedback-loop guard). Service-role only. See docs/reference/aion-deal-card-unified-design.md §20.';


--
-- Name: metric_settlement_variance(uuid, date, date, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(event_id uuid, event_title text, event_date timestamp with time zone, expected_settlement numeric, actual_settlement numeric, variance numeric, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'ops', 'finance', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_events AS (
    SELECT
      ev.id,
      COALESCE(ev.title, '(untitled)') AS title,
      ev.starts_at,
      ev.deal_id
    FROM ops.events ev
    WHERE ev.workspace_id = p_workspace_id
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  expected AS (
    SELECT
      pe.id AS event_id,
      COALESCE(d.budget_estimated, 0) AS expected
    FROM period_events pe
    LEFT JOIN public.deals d
      ON d.id = pe.deal_id AND d.workspace_id = p_workspace_id
  ),
  actual AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(pay.amount), 0) AS actual
    FROM period_events pe
    LEFT JOIN finance.invoices i
      ON i.event_id = pe.id AND i.workspace_id = p_workspace_id
    LEFT JOIN finance.payments pay
      ON pay.invoice_id = i.id
     AND pay.workspace_id = p_workspace_id
     AND pay.status = 'succeeded'
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.title::text,
    pe.starts_at,
    COALESCE(ex.expected, 0)::numeric,
    COALESCE(ac.actual, 0)::numeric,
    (COALESCE(ac.actual, 0) - COALESCE(ex.expected, 0))::numeric,
    (CASE
      WHEN COALESCE(ex.expected, 0) = 0 AND COALESCE(ac.actual, 0) = 0 THEN 'no_settlement'
      WHEN COALESCE(ac.actual, 0) = 0 THEN 'uncollected'
      WHEN COALESCE(ac.actual, 0) >= COALESCE(ex.expected, 0) THEN 'settled'
      WHEN COALESCE(ac.actual, 0) >= COALESCE(ex.expected, 0) * 0.9 THEN 'short_minor'
      ELSE 'short_major'
    END)::text
  FROM period_events pe
  LEFT JOIN expected ex ON ex.event_id = pe.id
  LEFT JOIN actual ac   ON ac.event_id = pe.id
  ORDER BY pe.starts_at DESC
  LIMIT 500;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Table metric: per-show settlement tracking. Expected = deal.budget_estimated, actual = paid invoice amounts. Proxy until finance.settlements ships.';


--
-- Name: metric_vendor_payment_status(uuid, date, date, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text DEFAULT NULL::text) RETURNS TABLE(vendor_id uuid, vendor_name text, total_billed numeric, total_paid numeric, outstanding numeric, overdue_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'finance', 'directory', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_bills AS (
    SELECT
      b.pay_to_entity_id,
      b.total_amount,
      b.paid_amount,
      b.due_date,
      b.status
    FROM finance.bills b
    WHERE b.workspace_id = p_workspace_id
      AND b.bill_date IS NOT NULL
      AND b.bill_date >= p_period_start
      AND b.bill_date <= p_period_end
      AND b.pay_to_entity_id IS NOT NULL
  )
  SELECT
    pb.pay_to_entity_id,
    COALESCE(e.display_name, 'Unknown vendor')::text,
    COALESCE(SUM(pb.total_amount), 0)::numeric,
    COALESCE(SUM(pb.paid_amount), 0)::numeric,
    COALESCE(SUM(pb.total_amount - COALESCE(pb.paid_amount, 0)), 0)::numeric,
    COUNT(*) FILTER (
      WHERE pb.due_date IS NOT NULL
        AND pb.due_date < CURRENT_DATE
        AND COALESCE(pb.paid_amount, 0) < pb.total_amount
    )::int
  FROM period_bills pb
  LEFT JOIN directory.entities e
    ON e.id = pb.pay_to_entity_id
   AND e.owner_workspace_id = p_workspace_id
  GROUP BY pb.pay_to_entity_id, e.display_name
  ORDER BY COALESCE(SUM(pb.total_amount - COALESCE(pb.paid_amount, 0)), 0) DESC,
           COALESCE(SUM(pb.total_amount), 0) DESC
  LIMIT 200;

  PERFORM v_tz;
END;
$$;


--
-- Name: FUNCTION metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) IS 'Table metric: per-vendor billed/paid/outstanding + overdue count from finance.bills in the period. Cap 200 rows.';


--
-- Name: normalize_event_archetype_label(text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.normalize_event_archetype_label(p_label text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  -- 1. Normalize unicode to NFKC via pg's normalize (PG 13+), trim, collapse
  -- whitespace, lowercase, strip chars that aren't alnum/space/hyphen,
  -- collapse hyphens and spaces to single underscore, collapse runs of _.
  -- 2. Trailing -s/-es singularized when the stem is 4+ chars AND the stem
  -- is not in a small stopword allowlist ("business", "process", "focus").
  -- 3. Final trim of leading/trailing underscores.
  WITH a AS (
    SELECT trim(lower(regexp_replace(normalize(p_label, NFKC), '\s+', ' ', 'g'))) AS s
  ),
  b AS (
    SELECT regexp_replace(s, '[^a-z0-9 \-]+', '', 'g') AS s FROM a
  ),
  c AS (
    SELECT regexp_replace(s, '[ \-]+', '_', 'g') AS s FROM b
  ),
  d AS (
    SELECT regexp_replace(trim(s, '_'), '_+', '_', 'g') AS s FROM c
  ),
  e AS (
    -- Singularize trailing "s" or "es" when safe. Match patterns:
    --   ending in "sses" → keep "ss" (business → business)
    --   ending in "ies"  → "y"  (parties → party)
    --   ending in "es" but not "ses/xes/zes/shes/ches" → drop "s" (launches → launch)
    --   ending in "s" but not "ss" AND stem ≥ 4 chars → drop "s" (weddings → wedding)
    -- Stopword guard: if stem in {'business','process','focus','gas','plus','jazz','miss'} keep.
    SELECT
      CASE
        WHEN s ~ '(ss|us|is)es$' THEN regexp_replace(s, 'es$', '')
        WHEN s ~ 'ies$' AND length(s) >= 5 THEN regexp_replace(s, 'ies$', 'y')
        WHEN s ~ '(ch|sh|x|z)es$' THEN regexp_replace(s, 'es$', '')
        WHEN s ~ 's$'
             AND s !~ 'ss$'
             AND length(s) >= 5
             AND s NOT IN ('business','process','focus','gas','plus','jazz','miss','boss','cross')
        THEN regexp_replace(s, 's$', '')
        ELSE s
      END AS s
    FROM d
  )
  SELECT s FROM e;
$_$;


--
-- Name: patch_event_ros_data(uuid, jsonb); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.patch_event_ros_data(p_event_id uuid, p_patch jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'ops'
    AS $$
BEGIN
  UPDATE ops.events
  SET run_of_show_data = COALESCE(run_of_show_data, '{}'::jsonb) || p_patch,
      updated_at = now()
  WHERE id = p_event_id;
END;
$$;


--
-- Name: record_deal_transition_with_actor(uuid, uuid, text, uuid, text, uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_suggestion_insight_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'cortex'
    AS $$
DECLARE
  v_transition_id uuid;
  v_current_stage uuid;
  v_workspace_id  uuid;
BEGIN
  IF p_actor_kind NOT IN ('user', 'aion', 'system') THEN
    RAISE EXCEPTION 'invalid actor_kind %; must be user|aion|system', p_actor_kind;
  END IF;
  IF p_actor_kind = 'user' AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_kind=user requires p_actor_id';
  END IF;

  SELECT stage_id, workspace_id
    INTO v_current_stage, v_workspace_id
    FROM public.deals
   WHERE id = p_deal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal % not found', p_deal_id;
  END IF;

  IF v_current_stage IS NOT DISTINCT FROM p_to_stage_id THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('unusonic.actor_kind_override', p_actor_kind, true);
  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('unusonic.actor_user_id_override', p_actor_id::text, true);
  END IF;
  IF p_suggestion_insight_id IS NOT NULL THEN
    PERFORM set_config('unusonic.aion_suggestion_id', p_suggestion_insight_id::text, true);
  END IF;

  UPDATE public.deals
     SET stage_id = p_to_stage_id
   WHERE id = p_deal_id;

  SELECT id INTO v_transition_id
    FROM ops.deal_transitions
   WHERE deal_id = p_deal_id
     AND to_stage_id = p_to_stage_id
     AND entered_at >= now() - interval '5 seconds'
   ORDER BY entered_at DESC
   LIMIT 1;

  IF p_reason IS NOT NULL AND v_transition_id IS NOT NULL THEN
    UPDATE ops.deal_transitions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
     WHERE id = v_transition_id;
  END IF;

  RETURN v_transition_id;
END;
$$;


--
-- Name: FUNCTION record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid, p_reason text, p_suggestion_insight_id uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid, p_reason text, p_suggestion_insight_id uuid) IS 'Explicit-actor wrapper for stage advancement. Used by server actions accepting Aion stage-advance suggestions. Validates actor, short-circuits if already at target stage (returns NULL), sets session GUCs that the record_deal_transition trigger reads. Service-role only.';


--
-- Name: record_inbound_message(jsonb); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.record_inbound_message(p_payload jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'directory'
    AS $$
DECLARE
  v_workspace_id       uuid  := (p_payload->>'workspace_id')::uuid;
  v_provider_msg_id    text  := p_payload->>'provider_message_id';
  v_provider_thread    text  := p_payload->>'provider_thread_key';
  v_channel            text  := p_payload->>'channel';
  v_subject            text  := p_payload->>'subject';
  v_from_address       text  := p_payload->>'from_address';
  v_to_addresses       text[];
  v_cc_addresses       text[];
  v_body_text          text  := p_payload->>'body_text';
  v_body_html          text  := p_payload->>'body_html';
  v_attachments        jsonb := COALESCE(p_payload->'attachments', '[]'::jsonb);
  v_deal_id            uuid  := NULLIF(p_payload->>'deal_id', '')::uuid;
  v_in_reply_to        uuid  := NULLIF(p_payload->>'in_reply_to_message_id', '')::uuid;
  v_thread_id          uuid;
  v_from_entity_id     uuid;
  v_message_id         uuid;
  v_existing_message_id uuid;
  v_urgency_keyword    text;
  v_needs_resolution   boolean := false;
  v_pending_queue_id   uuid;
  v_urgency_keywords   text[] := ARRAY['deposit', 'confirmed', 'booked', 'cancel', 'decline', 'contract'];
BEGIN
  IF v_workspace_id IS NULL OR v_provider_msg_id IS NULL OR v_provider_thread IS NULL THEN
    RAISE EXCEPTION 'record_inbound_message: workspace_id, provider_message_id, and provider_thread_key are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_channel NOT IN ('email', 'sms', 'call_note') THEN
    RAISE EXCEPTION 'record_inbound_message: invalid channel %', v_channel
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT ARRAY(SELECT jsonb_array_elements_text(p_payload->'to_addresses'))
    INTO v_to_addresses;
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'cc_addresses', '[]'::jsonb)))
    INTO v_cc_addresses;

  SELECT id INTO v_existing_message_id
  FROM ops.messages
  WHERE provider_message_id = v_provider_msg_id;

  IF v_existing_message_id IS NOT NULL THEN
    RETURN v_existing_message_id;
  END IF;

  SELECT id INTO v_thread_id
  FROM ops.message_threads
  WHERE workspace_id = v_workspace_id
    AND provider_thread_key = v_provider_thread;

  IF v_thread_id IS NULL THEN
    INSERT INTO ops.message_threads (
      workspace_id, provider_thread_key, channel, subject, deal_id, last_message_at, needs_resolution
    ) VALUES (
      v_workspace_id, v_provider_thread, v_channel, v_subject, v_deal_id, now(), false
    )
    RETURNING id INTO v_thread_id;
  ELSE
    UPDATE ops.message_threads
    SET last_message_at = now(),
        deal_id = COALESCE(deal_id, v_deal_id)
    WHERE id = v_thread_id;
  END IF;

  IF v_channel = 'email' AND v_from_address IS NOT NULL THEN
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'email' = lower(v_from_address)
    LIMIT 1;
  ELSIF v_channel = 'sms' AND v_from_address IS NOT NULL THEN
    SELECT id INTO v_from_entity_id
    FROM directory.entities
    WHERE owner_workspace_id = v_workspace_id
      AND attributes->>'phone' = v_from_address
    LIMIT 1;
  END IF;

  IF v_from_entity_id IS NULL THEN
    v_needs_resolution := true;
  END IF;

  IF v_from_entity_id IS NOT NULL THEN
    UPDATE ops.message_threads
    SET primary_entity_id = COALESCE(primary_entity_id, v_from_entity_id)
    WHERE id = v_thread_id;
  END IF;

  IF v_needs_resolution OR v_deal_id IS NULL THEN
    UPDATE ops.message_threads
    SET needs_resolution = true
    WHERE id = v_thread_id;
  END IF;

  IF v_body_text IS NOT NULL THEN
    SELECT kw INTO v_urgency_keyword
    FROM unnest(v_urgency_keywords) AS kw
    WHERE v_body_text ILIKE '%' || kw || '%'
    LIMIT 1;
  END IF;

  INSERT INTO ops.messages (
    workspace_id, thread_id, direction, channel, provider_message_id, in_reply_to,
    from_entity_id, from_address, to_addresses, cc_addresses, body_text, body_html,
    attachments, urgency_keyword_match
  ) VALUES (
    v_workspace_id, v_thread_id, 'inbound', v_channel, v_provider_msg_id, v_in_reply_to,
    v_from_entity_id, v_from_address, v_to_addresses, v_cc_addresses, v_body_text, v_body_html,
    v_attachments, v_urgency_keyword
  )
  RETURNING id INTO v_message_id;

  IF v_deal_id IS NOT NULL THEN
    SELECT id INTO v_pending_queue_id
    FROM ops.follow_up_queue
    WHERE deal_id = v_deal_id
      AND workspace_id = v_workspace_id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_queue_id IS NOT NULL THEN
      PERFORM ops.resolve_follow_up_on_reply(v_pending_queue_id, v_message_id);
    END IF;
  END IF;

  RETURN v_message_id;
END;
$$;


--
-- Name: FUNCTION record_inbound_message(p_payload jsonb); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.record_inbound_message(p_payload jsonb) IS 'Inbound message ingress. Idempotent on provider_message_id. Matches thread, resolves sender, flips follow_up_queue, runs urgency heuristics. Returns message id.';


--
-- Name: record_outbound_message_draft(uuid, uuid, text, text[], text[], text, text, text, jsonb, uuid, uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_thread_workspace uuid;
  v_from_address     text;
  v_message_id       uuid;
BEGIN
  SELECT workspace_id INTO v_thread_workspace
  FROM ops.message_threads
  WHERE id = p_thread_id;

  IF v_thread_workspace IS NULL OR v_thread_workspace != p_workspace_id THEN
    RAISE EXCEPTION 'record_outbound_message_draft: thread not found or workspace mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_from_address := 'thread-' || p_thread_id::text || '@replies.unusonic.com';

  INSERT INTO ops.messages (
    workspace_id, thread_id, direction, channel, provider_message_id, in_reply_to,
    from_entity_id, from_address, to_addresses, cc_addresses, body_text, body_html,
    attachments, sent_by_user_id
  ) VALUES (
    p_workspace_id, p_thread_id, 'outbound', p_channel, NULL, p_in_reply_to,
    NULL, v_from_address, COALESCE(p_to_addresses, '{}'), COALESCE(p_cc_addresses, '{}'),
    p_body_text, p_body_html, COALESCE(p_attachments, '[]'::jsonb), p_sent_by_user_id
  )
  RETURNING id INTO v_message_id;

  UPDATE ops.message_threads
  SET last_message_at = now(),
      subject = COALESCE(subject, p_subject)
  WHERE id = p_thread_id;

  RETURN v_message_id;
END;
$$;


--
-- Name: FUNCTION record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid) IS 'Insert-first step of the outbound pipeline. Composer calls this BEFORE Resend send, stamps provider_message_id after via stamp_outbound_provider_id.';


--
-- Name: record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (p_workspace_id IN (SELECT public.get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'forbidden: not a workspace member';
  END IF;

  INSERT INTO ops.proposal_builder_events (
    workspace_id, deal_id, user_id, session_id, variant, type, payload
  ) VALUES (
    p_workspace_id, p_deal_id, v_user_id, p_session_id, p_variant, p_type,
    coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;


--
-- Name: FUNCTION record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb) IS 'Phase 1 writer for ops.proposal_builder_events. Enforces auth.uid() workspace membership. Called from the /crm proposal-builder route; see src/features/sales/api/proposal-builder-events.ts.';


--
-- Name: rename_workspace_event_archetype(uuid, text, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.rename_workspace_event_archetype(p_workspace_id uuid, p_slug text, p_new_label text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_label text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  v_label := trim(coalesce(p_new_label, ''));
  IF length(v_label) = 0 OR length(v_label) > 80 THEN
    RAISE EXCEPTION 'label must be 1–80 chars' USING ERRCODE = '22023';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET label = v_label, updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$$;


--
-- Name: reorder_pipeline_stages(uuid, uuid[]); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_existing_count integer;
  v_received_count integer;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM ops.pipelines
  WHERE id = p_pipeline_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline not found: %', p_pipeline_id;
  END IF;

  IF NOT public.member_has_capability(v_workspace_id, 'pipelines:manage') THEN
    RAISE EXCEPTION 'Missing capability: pipelines:manage';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id AND is_archived = false;

  v_received_count := COALESCE(array_length(p_stage_ids, 1), 0);

  IF v_received_count <> v_existing_count THEN
    RAISE EXCEPTION 'Reorder list must cover every non-archived stage: pipeline has %, received %',
      v_existing_count, v_received_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_stage_ids) AS input_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ops.pipeline_stages
      WHERE id = input_id AND pipeline_id = p_pipeline_id AND is_archived = false
    )
  ) THEN
    RAISE EXCEPTION 'One or more stage ids do not belong to this pipeline or are archived';
  END IF;

  UPDATE ops.pipeline_stages s
  SET sort_order = arr.pos
  FROM unnest(p_stage_ids) WITH ORDINALITY AS arr(id, pos)
  WHERE s.id = arr.id;
END;
$$;


--
-- Name: FUNCTION reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]) IS 'Atomic drag-reorder for pipeline stages. Requires pipelines:manage capability. Uses the deferrable unique constraint on (pipeline_id, sort_order).';


--
-- Name: resolve_follow_up_on_reply(uuid, uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.resolve_follow_up_on_reply(p_queue_item_id uuid, p_message_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_deal_id      uuid;
BEGIN
  SELECT workspace_id, deal_id INTO v_workspace_id, v_deal_id
  FROM ops.follow_up_queue
  WHERE id = p_queue_item_id AND status = 'pending';

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE ops.follow_up_queue
  SET status  = 'acted',
      acted_at = now(),
      acted_by = NULL,
      escalation_count = 0
  WHERE id = p_queue_item_id;

  INSERT INTO ops.follow_up_log (
    workspace_id, deal_id, actor_user_id, action_type, channel, summary, content, queue_item_id
  ) VALUES (
    v_workspace_id, v_deal_id, NULL, 'reply_received', 'email',
    'Auto-resolved by inbound reply', p_message_id::text, p_queue_item_id
  );

  UPDATE ops.follow_up_queue
  SET status = 'dismissed',
      dismissal_reason = 'superseded_by_reply',
      superseded_at = now()
  WHERE deal_id = v_deal_id
    AND status = 'pending'
    AND id != p_queue_item_id;
END;
$$;


--
-- Name: resolve_stage_by_tag(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.resolve_stage_by_tag(p_pipeline_id uuid, p_tag text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  SELECT id
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id
    AND p_tag = ANY (tags)
    AND is_archived = false
  LIMIT 1;
$$;


--
-- Name: FUNCTION resolve_stage_by_tag(p_pipeline_id uuid, p_tag text); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.resolve_stage_by_tag(p_pipeline_id uuid, p_tag text) IS 'Resolves a semantic stage tag (e.g. ''deposit_received'') to the workspace''s pipeline stage id.';


--
-- Name: revoke_public_exec_on_new_function(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.revoke_public_exec_on_new_function() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
  v_target_schemas text[] := ARRAY['public','directory','ops','finance','cortex'];
BEGIN
  FOR obj IN
    SELECT object_identity, schema_name, object_type
    FROM pg_event_trigger_ddl_commands()
    WHERE object_type IN ('function', 'procedure')
      AND schema_name = ANY(v_target_schemas)
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON %s %s FROM PUBLIC',
        CASE obj.object_type WHEN 'procedure' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
        obj.object_identity
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        '[revoke_public_exec_on_new_function] failed to revoke PUBLIC on %.%: %',
        obj.schema_name, obj.object_identity, SQLERRM;
    END;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION revoke_public_exec_on_new_function(); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.revoke_public_exec_on_new_function() IS 'Rescan §2.0 companion: event-trigger helper that auto-REVOKEs EXECUTE ON FUNCTION ... FROM PUBLIC for new functions in public/directory/ops/finance/cortex. Installed by trigger revoke_public_on_new_function. Wrapped in EXCEPTION WHEN OTHERS so a bug can never block DDL.';


--
-- Name: seed_default_pipeline(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.seed_default_pipeline(p_workspace_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  SELECT id INTO v_pipeline_id
  FROM ops.pipelines
  WHERE workspace_id = p_workspace_id AND slug = 'sales'
  LIMIT 1;

  IF v_pipeline_id IS NOT NULL THEN
    RETURN v_pipeline_id;
  END IF;

  INSERT INTO ops.pipelines (workspace_id, name, slug, is_default)
  VALUES (p_workspace_id, 'Sales', 'sales', true)
  RETURNING id INTO v_pipeline_id;

  INSERT INTO ops.pipeline_stages (
    pipeline_id, workspace_id, label, slug, sort_order, kind, tags,
    rotting_days, requires_confirmation, opens_handoff_wizard
  ) VALUES
    (v_pipeline_id, p_workspace_id, 'Inquiry',            'inquiry',          1, 'working', ARRAY['initial_contact'],                             7,    false, false),
    (v_pipeline_id, p_workspace_id, 'Proposal Sent',      'proposal',         2, 'working', ARRAY['proposal_sent'],                               14,   false, false),
    (v_pipeline_id, p_workspace_id, 'Contract Sent',      'contract_sent',    3, 'working', ARRAY['contract_out'],                                5,    false, false),
    (v_pipeline_id, p_workspace_id, 'Contract Signed',    'contract_signed',  4, 'working', ARRAY['contract_signed'],                             NULL, true,  false),
    (v_pipeline_id, p_workspace_id, 'Deposit Received',   'deposit_received', 5, 'working', ARRAY['deposit_received', 'ready_for_handoff'],       NULL, true,  true),
    (v_pipeline_id, p_workspace_id, 'Won',                'won',              6, 'won',     ARRAY['won'],                                         NULL, true,  false),
    (v_pipeline_id, p_workspace_id, 'Lost',               'lost',             7, 'lost',    ARRAY['lost'],                                        NULL, false, false);

  RETURN v_pipeline_id;
END;
$$;


--
-- Name: FUNCTION seed_default_pipeline(p_workspace_id uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.seed_default_pipeline(p_workspace_id uuid) IS 'Idempotent: creates the default Sales pipeline + 7 stages for a workspace. Invoked by the AFTER INSERT trigger on public.workspaces.';


--
-- Name: seed_default_pipeline_on_workspace_insert(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.seed_default_pipeline_on_workspace_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
BEGIN
  PERFORM ops.seed_default_pipeline(NEW.id);
  PERFORM ops.seed_default_triggers(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: seed_default_triggers(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.seed_default_triggers(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage       RECORD;
  v_new_trigs   jsonb;
  v_existing    jsonb;
  v_merged      jsonb;
BEGIN
  SELECT id INTO v_pipeline_id
    FROM ops.pipelines
   WHERE workspace_id = p_workspace_id
     AND slug = 'sales'
     AND is_default = true
   LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_stage IN
    SELECT id, tags, triggers
      FROM ops.pipeline_stages
     WHERE pipeline_id = v_pipeline_id
  LOOP
    v_new_trigs := NULL;

    IF v_stage.tags @> ARRAY['initial_contact']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:nudge_client',
          'config', jsonb_build_object(
            'reason_type', 'nudge_client',
            'dwell_days', 3,
            'channel', 'email'
          )
        )
      );
    END IF;

    IF v_stage.tags @> ARRAY['proposal_sent']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:check_in',
          'config', jsonb_build_object(
            'reason_type', 'check_in',
            'dwell_days', 7,
            'channel', 'email'
          )
        ),
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'dwell_sla',
          'dwell_days', 14,
          'primitive_key', 'seed:gone_quiet',
          'config', jsonb_build_object(
            'reason_type', 'gone_quiet',
            'dwell_days', 14,
            'priority_boost', 20
          )
        )
      );
    END IF;

    IF v_stage.tags @> ARRAY['contract_out']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'create_task',
          'event', 'on_enter',
          'primitive_key', 'seed:confirm_contract_sent',
          'config', jsonb_build_object(
            'title', 'Confirm contract sent',
            'assignee_rule', 'owner'
          )
        )
      );
    END IF;

    IF v_stage.tags @> ARRAY['deposit_received']::text[]
       OR v_stage.tags @> ARRAY['ready_for_handoff']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'trigger_handoff',
          'event', 'on_enter',
          'primitive_key', 'seed:open_handoff_wizard',
          'config', jsonb_build_object('open_wizard', true)
        )
      );
    END IF;

    IF v_stage.tags @> ARRAY['won']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:thank_you',
          'config', jsonb_build_object(
            'reason_type', 'thank_you',
            'dwell_days', 1,
            'hide_from_portal', false
          )
        )
      );
    END IF;

    IF v_new_trigs IS NULL THEN
      CONTINUE;
    END IF;

    v_existing := COALESCE(v_stage.triggers, '[]'::jsonb);
    v_merged := v_existing;

    FOR i IN 0..(jsonb_array_length(v_new_trigs) - 1) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_merged) ex
        WHERE ex->>'primitive_key' = v_new_trigs->i->>'primitive_key'
      ) THEN
        v_merged := v_merged || jsonb_build_array(v_new_trigs->i);
      END IF;
    END LOOP;

    IF v_merged IS DISTINCT FROM v_existing THEN
      UPDATE ops.pipeline_stages
         SET triggers = v_merged,
             updated_at = now()
       WHERE id = v_stage.id;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION seed_default_triggers(p_workspace_id uuid); Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON FUNCTION ops.seed_default_triggers(p_workspace_id uuid) IS 'P0: seed default follow-up triggers on the workspace sales pipeline. Matches stages by tags (not slug/label), so renamed or customized stages that still carry the semantic tag receive the trigger. Workspaces that deleted a tagged stage are silently skipped (no recreation). Idempotent: re-running merges on primitive_key without duplicating.';


--
-- Name: set_crew_equipment_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_crew_equipment_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_crew_skills_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_crew_skills_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_event_expenses_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_event_expenses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_kit_templates_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_kit_templates_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_pipeline_stages_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_pipeline_stages_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_pipelines_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_pipelines_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_ros_template_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_ros_template_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: stamp_outbound_provider_id(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.stamp_outbound_provider_id(p_message_id uuid, p_provider_message_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
BEGIN
  UPDATE ops.messages
  SET provider_message_id = p_provider_message_id
  WHERE id = p_message_id
    AND direction = 'outbound'
    AND provider_message_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stamp_outbound_provider_id: no matching unstamped outbound message %', p_message_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: unarchive_workspace_event_archetype(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET archived_at = NULL, updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$$;


--
-- Name: upsert_workspace_event_archetype(uuid, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.upsert_workspace_event_archetype(p_workspace_id uuid, p_label text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_slug text;
  v_label_trimmed text;
  v_existing record;
  v_inserted record;
  v_was_created boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: not a workspace member' USING ERRCODE = '42501';
  END IF;

  v_label_trimmed := trim(coalesce(p_label, ''));
  IF length(v_label_trimmed) = 0 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_label_trimmed) > 80 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label too long (80 chars max)' USING ERRCODE = '22023';
  END IF;

  v_slug := ops.normalize_event_archetype_label(v_label_trimmed);
  IF length(v_slug) = 0 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label normalized to empty slug' USING ERRCODE = '22023';
  END IF;

  -- 1. System row takes priority — never shadow.
  SELECT id, slug, label, is_system INTO v_existing
  FROM ops.workspace_event_archetypes
  WHERE slug = v_slug AND is_system = true AND archived_at IS NULL
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'slug', v_existing.slug,
      'label', v_existing.label,
      'is_system', v_existing.is_system,
      'was_created', false
    );
  END IF;

  -- 2. Existing custom row for this workspace.
  SELECT id, slug, label, is_system INTO v_existing
  FROM ops.workspace_event_archetypes
  WHERE slug = v_slug AND workspace_id = p_workspace_id AND archived_at IS NULL
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'slug', v_existing.slug,
      'label', v_existing.label,
      'is_system', v_existing.is_system,
      'was_created', false
    );
  END IF;

  -- 3. Insert new custom row. Partial unique index covers race.
  INSERT INTO ops.workspace_event_archetypes (
    workspace_id, slug, label, is_system, created_by_user_id
  )
  VALUES (p_workspace_id, v_slug, v_label_trimmed, false, v_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id, slug, label, is_system INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    v_was_created := true;
  ELSE
    -- Another concurrent caller inserted first — re-read and return it.
    SELECT id, slug, label, is_system INTO v_inserted
    FROM ops.workspace_event_archetypes
    WHERE slug = v_slug AND workspace_id = p_workspace_id AND archived_at IS NULL
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'slug', v_inserted.slug,
    'label', v_inserted.label,
    'is_system', v_inserted.is_system,
    'was_created', v_was_created
  );
END;
$$;


--
-- Name: _sync_deal_proposed_date_from_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_deal_proposed_date_from_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_deal_ids uuid[] := ARRAY[]::uuid[];
  v_deal_id uuid;
  v_new_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, OLD.deal_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, NEW.deal_id);
    END IF;
  ELSE
    IF NEW.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, NEW.deal_id);
    END IF;
    IF OLD.deal_id IS DISTINCT FROM NEW.deal_id AND OLD.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, OLD.deal_id);
    END IF;
  END IF;

  FOREACH v_deal_id IN ARRAY v_deal_ids LOOP
    SELECT MIN(starts_at)::date INTO v_new_date
    FROM ops.events
    WHERE deal_id = v_deal_id AND archived_at IS NULL;

    IF v_new_date IS NOT NULL THEN
      UPDATE public.deals
      SET proposed_date = v_new_date
      WHERE id = v_deal_id
        AND proposed_date IS DISTINCT FROM v_new_date;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;


--
-- Name: add_books_for_edge(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_person_workspace uuid;
  v_company_workspace uuid;
  v_company_type text;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_books_for_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_books_for_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  SELECT owner_workspace_id INTO v_person_workspace FROM directory.entities WHERE id = p_person_id;
  SELECT owner_workspace_id, type INTO v_company_workspace, v_company_type
    FROM directory.entities WHERE id = p_company_id;

  IF v_person_workspace IS DISTINCT FROM p_workspace_id OR v_company_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_books_for_edge: both endpoints must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF v_company_type IS DISTINCT FROM 'company' THEN
    RAISE EXCEPTION 'add_books_for_edge: target % is not a company entity (got %)', p_company_id, v_company_type
      USING ERRCODE = '22023';
  END IF;

  v_ctx := jsonb_build_object('since', p_since);

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_person_id, p_company_id, 'BOOKS_FOR', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'person', p_person_id, 'company', p_company_id);
END;
$$;


--
-- Name: FUNCTION add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text) IS 'Writes a BOOKS_FOR edge: person is the booking contact for a corporate client. context_data: {since}. First caller lands in P1.';


--
-- Name: add_catalog_item_assignee(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_catalog_item_assignee(p_package_id uuid, p_entity_id uuid, p_role_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'catalog'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.packages
    WHERE id = p_package_id AND workspace_id IN (SELECT get_my_workspace_ids())
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO catalog.item_assignees (package_id, entity_id, role_note)
  VALUES (p_package_id, p_entity_id, p_role_note)
  ON CONFLICT (package_id, entity_id) WHERE entity_id IS NOT NULL
  DO UPDATE SET role_note = EXCLUDED.role_note
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: add_catalog_role_assignee(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_catalog_role_assignee(p_package_id uuid, p_role_note text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'catalog'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.packages
    WHERE id = p_package_id AND workspace_id IN (SELECT get_my_workspace_ids())
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO catalog.item_assignees (package_id, entity_id, role_note)
  VALUES (p_package_id, NULL, p_role_note)
  ON CONFLICT (package_id, role_note) WHERE entity_id IS NULL AND role_note IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  -- Fetch existing row if duplicate
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM catalog.item_assignees
    WHERE package_id = p_package_id AND entity_id IS NULL AND role_note = p_role_note;
  END IF;

  RETURN v_id;
END;
$$;


--
-- Name: add_co_host_edge(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text DEFAULT 'romantic'::text, p_anniversary text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_a_workspace uuid;
  v_b_workspace uuid;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_co_host_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_co_host_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_partner_a_id = p_partner_b_id THEN
    RAISE EXCEPTION 'add_co_host_edge: partner_a and partner_b must be different entities'
      USING ERRCODE = '22023';
  END IF;

  IF p_pairing NOT IN ('romantic', 'co_host', 'family') THEN
    RAISE EXCEPTION 'add_co_host_edge: invalid pairing %', p_pairing
      USING ERRCODE = '22023';
  END IF;

  SELECT owner_workspace_id INTO v_a_workspace FROM directory.entities WHERE id = p_partner_a_id;
  SELECT owner_workspace_id INTO v_b_workspace FROM directory.entities WHERE id = p_partner_b_id;

  IF v_a_workspace IS DISTINCT FROM p_workspace_id OR v_b_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_co_host_edge: both partners must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_ctx := jsonb_build_object(
    'pairing', p_pairing,
    'anniversary_date', p_anniversary
  );

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_a_id, p_partner_b_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_b_id, p_partner_a_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'a', p_partner_a_id, 'b', p_partner_b_id);
END;
$$;


--
-- Name: FUNCTION add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text) IS 'Writes a directed-pair CO_HOST edge between two person entities in the same workspace. context_data: {pairing, anniversary_date}. Always query as WHERE source_entity_id = $1 AND relationship_type = ''CO_HOST'' — the directed-pair convention means UNIONing both directions returns duplicates.';


--
-- Name: add_contact_to_ghost_org(uuid, uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_ghost_org_entity_id uuid; v_entity_id uuid; v_rel_id uuid;
  v_email_trim text := nullif(trim(coalesce(p_email, '')), '');
  v_email_final text; v_first text; v_last text;
BEGIN
  SELECT id INTO v_ghost_org_entity_id FROM directory.entities
  WHERE legacy_org_id = p_ghost_org_id
    AND (attributes->>'created_by_org_id')::uuid = p_creator_org_id
    AND (attributes->>'is_ghost')::boolean = true LIMIT 1;
  IF v_ghost_org_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ghost organization not found or you are not the creator.');
  END IF;
  v_email_final := coalesce(v_email_trim, 'ghost-' || p_ghost_org_id::text || '@signal.local');
  v_first := coalesce(nullif(trim(p_first_name), ''), split_part(v_email_final, '@', 1));
  v_last := coalesce(nullif(trim(p_last_name), ''), '');
  SELECT id INTO v_entity_id FROM directory.entities
  WHERE attributes->>'email' = v_email_final AND claimed_by_user_id IS NULL LIMIT 1;
  IF v_entity_id IS NULL THEN
    INSERT INTO directory.entities (type, display_name, owner_workspace_id, attributes)
    VALUES ('person', v_first, p_workspace_id,
      jsonb_build_object('email', v_email_final, 'is_ghost', true, 'first_name', v_first, 'last_name', v_last))
    RETURNING id INTO v_entity_id;
  END IF;
  SELECT id INTO v_rel_id FROM cortex.relationships
  WHERE source_entity_id = v_entity_id AND target_entity_id = v_ghost_org_entity_id
    AND relationship_type = 'ROSTER_MEMBER' LIMIT 1;
  IF v_rel_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_rel_id); END IF;
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (v_entity_id, v_ghost_org_entity_id, 'MEMBER',
    jsonb_build_object('status', 'active', 'access_level', 'member'))
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (v_entity_id, v_ghost_org_entity_id, 'ROSTER_MEMBER',
    jsonb_build_object('role', 'member', 'employment_status', 'internal_employee', 'default_hourly_rate', 0,
      'first_name', v_first, 'last_name', v_last))
  RETURNING id INTO v_rel_id;
  RETURN jsonb_build_object('ok', true, 'id', v_rel_id);
END;
$$;


--
-- Name: add_contact_to_ghost_org(uuid, uuid, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text, p_job_title text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_ghost_org_entity_id uuid;
  v_entity_id uuid;
  v_rel_id uuid;
  v_email_trim text := nullif(trim(coalesce(p_email, '')), '');
  v_email_final text;
  v_first text;
  v_last text;
  v_role text := coalesce(nullif(trim(p_role), ''), 'member');
  v_job text := nullif(trim(coalesce(p_job_title, '')), '');
  v_access text := CASE WHEN v_role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END;
BEGIN
  -- Lookup by legacy_org_id first, fall back to direct entity id.
  -- The creator org check is the authority gate — is_ghost is not required
  -- because native ghost entities may not carry that attribute consistently.
  SELECT id INTO v_ghost_org_entity_id
  FROM directory.entities
  WHERE (legacy_org_id = p_ghost_org_id OR id = p_ghost_org_id)
    AND (attributes->>'created_by_org_id')::uuid = p_creator_org_id
  LIMIT 1;

  IF v_ghost_org_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ghost organization not found or you are not the creator.');
  END IF;

  v_email_final := coalesce(v_email_trim, 'ghost-' || p_ghost_org_id::text || '@unusonic.local');
  v_first := coalesce(nullif(trim(p_first_name), ''), split_part(v_email_final, '@', 1));
  v_last  := coalesce(nullif(trim(p_last_name), ''), '');

  -- Reuse existing person entity if same email exists (idempotent)
  SELECT id INTO v_entity_id
  FROM directory.entities
  WHERE attributes->>'email' = v_email_final AND claimed_by_user_id IS NULL
  LIMIT 1;

  IF v_entity_id IS NULL THEN
    INSERT INTO directory.entities (type, display_name, owner_workspace_id, attributes)
    VALUES (
      'person',
      CASE WHEN v_last <> '' THEN v_first || ' ' || v_last ELSE v_first END,
      p_workspace_id,
      jsonb_build_object(
        'email', v_email_final,
        'is_ghost', true,
        'first_name', v_first,
        'last_name', v_last,
        'job_title', v_job
      )
    )
    RETURNING id INTO v_entity_id;
  END IF;

  -- Idempotent: don't create a duplicate ROSTER_MEMBER edge
  SELECT id INTO v_rel_id
  FROM cortex.relationships
  WHERE source_entity_id = v_entity_id
    AND target_entity_id = v_ghost_org_entity_id
    AND relationship_type = 'ROSTER_MEMBER'
  LIMIT 1;

  IF v_rel_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_rel_id);
  END IF;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (
    v_entity_id, v_ghost_org_entity_id, 'MEMBER',
    jsonb_build_object('status', 'active', 'role_label', v_job, 'access_level', v_access)
  )
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (
    v_entity_id, v_ghost_org_entity_id, 'ROSTER_MEMBER',
    jsonb_build_object(
      'role', v_role,
      'job_title', v_job,
      'employment_status', 'external_contractor',
      'default_hourly_rate', 0,
      'first_name', v_first,
      'last_name', v_last
    )
  )
  RETURNING id INTO v_rel_id;

  RETURN jsonb_build_object('ok', true, 'id', v_rel_id);
END;
$$;


--
-- Name: add_ghost_member(uuid, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_ghost_member(p_org_id uuid, p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_entity_id uuid;
  v_org_entity_id uuid;
  v_entity_id uuid;
  v_rel_id uuid;
  v_created_ghost boolean := false;
  v_email_trim text := trim(p_email);
  v_first text := coalesce(nullif(trim(p_first_name), ''), split_part(v_email_trim, '@', 1));
  v_last text := coalesce(nullif(trim(p_last_name), ''), '');
  v_role text := coalesce(nullif(trim(p_role), ''), 'member');
  v_job text := nullif(trim(coalesce(p_job_title, '')), '');
BEGIN
  IF v_email_trim IS NULL OR v_email_trim = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email is required.');
  END IF;
  v_my_entity_id := public.get_my_entity_id();
  IF v_my_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your account is not linked to an organization.');
  END IF;
  SELECT id INTO v_org_entity_id FROM directory.entities WHERE legacy_org_id = p_org_id LIMIT 1;
  IF v_org_entity_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cortex.relationships
    WHERE source_entity_id = v_my_entity_id AND target_entity_id = v_org_entity_id
      AND relationship_type IN ('ROSTER_MEMBER', 'MEMBER')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not have permission to add members to this organization.');
  END IF;
  SELECT id INTO v_entity_id FROM directory.entities
  WHERE attributes->>'email' = v_email_trim AND claimed_by_user_id IS NULL LIMIT 1;
  IF v_entity_id IS NULL THEN
    INSERT INTO directory.entities (type, display_name, owner_workspace_id, attributes)
    VALUES ('person', v_first, p_workspace_id,
      jsonb_build_object('email', v_email_trim, 'is_ghost', true, 'first_name', v_first,
        'last_name', v_last, 'job_title', v_job, 'phone', null))
    RETURNING id INTO v_entity_id;
    v_created_ghost := true;
  END IF;
  SELECT id INTO v_rel_id FROM cortex.relationships
  WHERE source_entity_id = v_entity_id AND target_entity_id = v_org_entity_id
    AND relationship_type = 'ROSTER_MEMBER' LIMIT 1;
  IF v_rel_id IS NOT NULL THEN
    IF v_created_ghost THEN DELETE FROM directory.entities WHERE id = v_entity_id; END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'This person is already in this organization.');
  END IF;
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (v_entity_id, v_org_entity_id, 'MEMBER',
    jsonb_build_object('status', 'active', 'role_label', v_job,
      'access_level', CASE WHEN v_role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END))
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (v_entity_id, v_org_entity_id, 'ROSTER_MEMBER',
    jsonb_build_object('role', v_role, 'job_title', v_job, 'employment_status', 'internal_employee',
      'default_hourly_rate', 0, 'first_name', v_first, 'last_name', v_last))
  RETURNING id INTO v_rel_id;
  RETURN jsonb_build_object('ok', true, 'id', v_rel_id, 'entity_id', v_entity_id,
    'first_name', v_first, 'last_name', v_last, 'role', v_role,
    'email', v_email_trim, 'job_title', v_job, 'name', trim(v_first || ' ' || v_last));
END;
$$;


--
-- Name: add_represents_edge(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text DEFAULT 'planning'::text, p_since text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_rep_workspace uuid;
  v_principal_workspace uuid;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_represents_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_represents_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_representative_id = p_principal_id THEN
    RAISE EXCEPTION 'add_represents_edge: representative and principal must differ'
      USING ERRCODE = '22023';
  END IF;

  IF p_scope NOT IN ('planning', 'operations', 'full') THEN
    RAISE EXCEPTION 'add_represents_edge: invalid scope %', p_scope
      USING ERRCODE = '22023';
  END IF;

  SELECT owner_workspace_id INTO v_rep_workspace FROM directory.entities WHERE id = p_representative_id;
  SELECT owner_workspace_id INTO v_principal_workspace FROM directory.entities WHERE id = p_principal_id;

  IF v_rep_workspace IS DISTINCT FROM p_workspace_id OR v_principal_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_represents_edge: both endpoints must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_ctx := jsonb_build_object(
    'scope', p_scope,
    'since', p_since
  );

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_representative_id, p_principal_id, 'REPRESENTS', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'representative', p_representative_id, 'principal', p_principal_id);
END;
$$;


--
-- Name: FUNCTION add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text) IS 'Writes a single REPRESENTS edge: representative acts on behalf of principal. context_data: {scope, since}.';


--
-- Name: add_roster_member(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org_workspace_id uuid;
  v_id               uuid;
BEGIN
  -- 1. Resolve target (org) entity's workspace
  SELECT owner_workspace_id INTO v_org_workspace_id
  FROM directory.entities
  WHERE id = p_org_entity_id;

  IF v_org_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: org entity not found';
  END IF;

  -- 2. Caller must have access to that workspace and be owner or admin
  IF v_org_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: org not in caller workspace';
  END IF;
  IF NOT public.user_has_workspace_role(v_org_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in org workspace';
  END IF;

  -- 3. Insert or update ROSTER_MEMBER edge (no updated_at column on cortex.relationships)
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_person_entity_id, p_org_entity_id, 'ROSTER_MEMBER', COALESCE(p_context_data, '{}'::jsonb))
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb) IS 'Creates or updates a ROSTER_MEMBER edge. SECURITY DEFINER — caller must hold owner or admin in the target (org) workspace. Use when adding a person to an org roster (source person may be ghost or from another workspace).';


--
-- Name: aion_lookup_catalog(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text DEFAULT 'any'::text, p_limit integer DEFAULT 5) RETURNS TABLE(id uuid, name text, category text, price numeric, description text, kind text, rank integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_cap     int;
  v_kind    text;
  v_query   text;
  v_pattern text;
BEGIN
  -- Auth + membership gate. Service-role callers are not permitted — the
  -- tool-handler path is always an authenticated user session.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id      = v_user_id
  ) THEN
    -- Don't differentiate "workspace doesn't exist" from "caller isn't a
    -- member" — avoids an enumeration oracle.
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  -- Hard-cap the limit (plan §3.1.2: cap 8). Bounded here so the tool can't
  -- pass a ridiculous limit and Sonnet can't accidentally blow token budget.
  v_cap := GREATEST(1, LEAST(COALESCE(p_limit, 5), 8));

  -- Normalize kind. Anything we don't recognise collapses to 'any'.
  v_kind := lower(COALESCE(NULLIF(trim(p_kind), ''), 'any'));
  IF v_kind NOT IN ('package', 'item', 'any') THEN
    v_kind := 'any';
  END IF;

  -- Trimmed query. Empty queries return the most recently updated active
  -- packages — still useful for "what do we sell" browse-style asks.
  v_query   := COALESCE(NULLIF(trim(p_query), ''), '');
  v_pattern := '%' || v_query || '%';

  RETURN QUERY
    SELECT
      p.id,
      p.name,
      p.category::text                                    AS category,
      p.price,
      p.description,
      CASE WHEN p.category = 'package' THEN 'package' ELSE 'item' END AS kind,
      CASE
        WHEN v_query = ''                                   THEN 0
        WHEN p.name ILIKE v_query                           THEN 3  -- exact name
        WHEN p.name ILIKE v_pattern                         THEN 2  -- name contains
        WHEN COALESCE(p.description,'') ILIKE v_pattern     THEN 1  -- description contains
        ELSE 0
      END                                                 AS rank
    FROM public.packages p
    WHERE p.workspace_id = p_workspace_id
      AND p.is_active    = true
      AND (
            v_kind = 'any'
         OR (v_kind = 'package' AND p.category  = 'package')
         OR (v_kind = 'item'    AND p.category <> 'package')
          )
      AND (
            v_query = ''
         OR p.name                       ILIKE v_pattern
         OR COALESCE(p.description,'')   ILIKE v_pattern
          )
    ORDER BY rank DESC NULLS LAST, p.updated_at DESC
    LIMIT v_cap;
END;
$$;


--
-- Name: FUNCTION aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer) IS 'Aion Phase 2: workspace-scoped catalog search over public.packages. SECURITY DEFINER with explicit workspace-member check. Called by the lookup_catalog tool in the Aion chat route.';


--
-- Name: bulk_approve_pending_equipment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_approve_pending_equipment(p_workspace_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_user_role text;
  v_count integer;
BEGIN
  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  PERFORM set_config('app.bypass_verification_guard', 'true', true);

  UPDATE ops.crew_equipment
  SET verification_status = 'approved',
      verified_at = now(),
      verified_by = auth.uid()
  WHERE workspace_id = p_workspace_id
    AND verification_status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: check_bridge_pair_rate_limit(inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_bridge_pair_rate_limit(p_client_ip inet) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
  v_limit constant int := 10;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.bridge_pair_attempts
  WHERE client_ip = p_client_ip
    AND attempted_at > now() - interval '1 hour';

  IF v_count >= v_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.bridge_pair_attempts (client_ip) VALUES (p_client_ip);
  RETURN true;
END;
$$;


--
-- Name: check_seat_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_seat_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_current integer;
  v_limit integer;
  v_role_slug text;
BEGIN
  SELECT slug INTO v_role_slug FROM ops.workspace_roles WHERE id = NEW.role_id;
  IF v_role_slug = 'employee' THEN RETURN NEW; END IF;
  SELECT count_team_seats(NEW.workspace_id) INTO v_current;
  SELECT get_workspace_seat_limit(NEW.workspace_id) INTO v_limit;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Seat limit reached (% of %)', v_current, v_limit;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: claim_ghost_entities_for_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_ghost_entities_for_user() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id    uuid;
  v_email      text;
  client_role_id uuid;
  claimed_count  integer := 0;
  ghost_row      record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO client_role_id
  FROM ops.workspace_roles
  WHERE slug = 'client'
    AND is_system = true
    AND workspace_id IS NULL
  LIMIT 1;

  IF client_role_id IS NULL THEN
    RAISE EXCEPTION 'client system role not found';
  END IF;

  FOR ghost_row IN
    SELECT DISTINCT e.id AS entity_id, e.owner_workspace_id
    FROM directory.entities e
    INNER JOIN cortex.relationships r
      ON r.target_entity_id = e.id
      AND r.relationship_type = 'CLIENT'
      AND r.context_data->>'deleted_at' IS NULL
    WHERE lower(e.attributes->>'email') = lower(v_email)
      AND e.claimed_by_user_id IS NULL
      AND e.owner_workspace_id IS NOT NULL
  LOOP
    UPDATE directory.entities
    SET claimed_by_user_id = v_user_id
    WHERE id = ghost_row.entity_id
      AND claimed_by_user_id IS NULL;

    IF FOUND THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role, role_id)
      VALUES (ghost_row.owner_workspace_id, v_user_id, 'client', client_role_id)
      ON CONFLICT (workspace_id, user_id) DO NOTHING;

      claimed_count := claimed_count + 1;
    END IF;
  END LOOP;

  RETURN claimed_count;
END;
$$;


--
-- Name: FUNCTION claim_ghost_entities_for_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_ghost_entities_for_user() IS 'Claims ghost entities matching the authenticated user''s email that have CLIENT relationship edges. Creates workspace memberships with client role. Called during onboarding after passkey registration.';


--
-- Name: claim_ghost_entity_workspace(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: workspace not in caller scope';
  END IF;

  UPDATE directory.entities
  SET owner_workspace_id = p_workspace_id
  WHERE id = p_entity_id
    AND claimed_by_user_id IS NULL
    AND owner_workspace_id IS NULL;
END;
$$;


--
-- Name: FUNCTION claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid) IS 'Sets owner_workspace_id on a ghost entity (null claimed_by_user_id, null owner_workspace_id). SECURITY DEFINER — caller must be in the target workspace.';


--
-- Name: cleanup_webauthn_challenges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_webauthn_challenges() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE rv integer;
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE created_at < now() - interval '5 minutes';
  GET DIAGNOSTICS rv = ROW_COUNT;
  RETURN rv;
END;
$$;


--
-- Name: FUNCTION cleanup_webauthn_challenges(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_webauthn_challenges() IS 'Deletes webauthn_challenges older than 5 minutes. Call from pg_cron or Edge Function.';


--
-- Name: client_check_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer) RETURNS TABLE(allowed boolean, current_count integer, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count        integer;
  v_oldest       timestamptz;
  v_retry_after  integer;
BEGIN
  SELECT count(*), min(action_at)
    INTO v_count, v_oldest
  FROM public.client_portal_rate_limits
  WHERE scope = p_scope
    AND key = p_key
    AND action_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    v_retry_after := GREATEST(
      0,
      p_window_seconds - EXTRACT(EPOCH FROM (now() - v_oldest))::integer
    );
    RETURN QUERY SELECT false, v_count, v_retry_after;
    RETURN;
  END IF;

  INSERT INTO public.client_portal_rate_limits (scope, key, action_at)
  VALUES (p_scope, p_key, now());

  RETURN QUERY SELECT true, v_count + 1, 0;
END;
$$;


--
-- Name: FUNCTION client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer) IS 'Sliding window rate limiter. Writes on check. Returns { allowed, current_count, retry_after_seconds }. See §15.6.';


--
-- Name: client_claim_entity(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_claim_entity(p_entity_id uuid, p_auth_user_id uuid) RETURNS TABLE(ok boolean, reason text, claimed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT claimed_by_user_id INTO v_existing
  FROM directory.entities
  WHERE id = p_entity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'entity_not_found'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_existing IS NOT NULL AND v_existing <> p_auth_user_id THEN
    RETURN QUERY SELECT false, 'already_claimed_by_other'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_existing = p_auth_user_id THEN
    RETURN QUERY SELECT true, 'already_claimed_by_self'::text, now();
    RETURN;
  END IF;

  UPDATE directory.entities
     SET claimed_by_user_id = p_auth_user_id,
         updated_at = now()
   WHERE id = p_entity_id;

  RETURN QUERY SELECT true, 'ok'::text, now();
END;
$$;


--
-- Name: FUNCTION client_claim_entity(p_entity_id uuid, p_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_claim_entity(p_entity_id uuid, p_auth_user_id uuid) IS 'Atomic ghost → claimed promotion. Requires the caller to have just verified an OTP (invariant §14.6(3)). Double-claim safe: idempotent when the entity is already claimed by the same user.';


--
-- Name: client_is_workspace_client(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cortex.relationships r
    JOIN directory.entities src ON src.id = r.source_entity_id
    WHERE r.relationship_type = 'CLIENT'
      AND r.context_data->>'deleted_at' IS NULL
      AND src.owner_workspace_id = p_workspace_id
      AND r.target_entity_id = p_entity_id
  );
$$;


--
-- Name: FUNCTION client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid) IS 'Authoritative is-this-entity-a-client-of-this-workspace check. Wraps the cortex.relationships CLIENT edge query. Source = vendor root entity, target = client. See client-portal-design.md §14.2.1.';


--
-- Name: client_issue_otp_challenge(uuid, text, text, inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet DEFAULT NULL::inet) RETURNS TABLE(challenge_id uuid, code_raw text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_code_raw   text;
  v_code_hash  text;
  v_challenge_id uuid;
  v_expires_at timestamptz;
  v_bytes      bytea;
BEGIN
  v_bytes := gen_random_bytes(4);
  v_code_raw := lpad(
    ((get_byte(v_bytes, 0) * 16777216
      + get_byte(v_bytes, 1) * 65536
      + get_byte(v_bytes, 2) * 256
      + get_byte(v_bytes, 3)) % 1000000)::text,
    6, '0'
  );
  v_code_hash := encode(digest(v_code_raw, 'sha256'), 'hex');
  v_expires_at := now() + interval '10 minutes';

  INSERT INTO public.client_portal_otp_challenges (
    entity_id, email, code_hash, purpose, expires_at, created_ip
  )
  VALUES (
    p_entity_id, lower(p_email), v_code_hash, p_purpose, v_expires_at, p_ip
  )
  RETURNING id INTO v_challenge_id;

  RETURN QUERY SELECT v_challenge_id, v_code_raw, v_expires_at;
END;
$$;


--
-- Name: FUNCTION client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet) IS 'Creates a new OTP challenge. Raw code is returned once. 10-minute expiry, 5-attempt lockout enforced by client_verify_otp. See §15.2.';


--
-- Name: client_log_access(uuid, uuid, text, text, text, text, uuid, text, uuid, text, text, inet, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid DEFAULT NULL::uuid, p_request_id text DEFAULT NULL::text, p_resource_id uuid DEFAULT NULL::uuid, p_actor_id text DEFAULT NULL::text, p_auth_method text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.client_portal_access_log (
    session_id, request_id, entity_id, workspace_id,
    resource_type, resource_id, action,
    actor_kind, actor_id, auth_method, outcome,
    ip, user_agent, metadata
  )
  VALUES (
    p_session_id, p_request_id, p_entity_id, p_workspace_id,
    p_resource_type, p_resource_id, p_action,
    p_actor_kind, p_actor_id, p_auth_method, p_outcome,
    p_ip, p_user_agent, p_metadata
  );
$$;


--
-- Name: FUNCTION client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid, p_request_id text, p_resource_id uuid, p_actor_id text, p_auth_method text, p_ip inet, p_user_agent text, p_metadata jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid, p_request_id text, p_resource_id uuid, p_actor_id text, p_auth_method text, p_ip inet, p_user_agent text, p_metadata jsonb) IS 'Centralized audit log writer. All client portal access events route through here.';


--
-- Name: client_lookup_entity_by_email(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_lookup_entity_by_email(p_email_lower text, p_workspace_hint uuid DEFAULT NULL::uuid) RETURNS TABLE(entity_id uuid, workspace_id uuid, is_claimed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.id AS entity_id,
      e.owner_workspace_id AS workspace_id,
      (e.claimed_by_user_id IS NOT NULL) AS is_claimed
    FROM directory.entities e
    WHERE lower(e.attributes->>'email') = p_email_lower
    ORDER BY
      CASE WHEN p_workspace_hint IS NOT NULL
           AND e.owner_workspace_id = p_workspace_hint
           THEN 0 ELSE 1 END,
      e.created_at ASC
    LIMIT 1;
END;
$$;


--
-- Name: client_mint_session_token(uuid, text, uuid, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet DEFAULT NULL::inet, p_device_id_hash text DEFAULT NULL::text) RETURNS TABLE(token_id uuid, token_raw text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_token_raw   text;
  v_token_hash  text;
  v_expires_at  timestamptz;
  v_token_id    uuid;
BEGIN
  v_token_raw  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token_raw, 'sha256'), 'hex');
  v_expires_at := public.compute_client_session_expiry(p_entity_id);

  INSERT INTO public.client_portal_tokens (
    entity_id, token_hash, source_kind, source_id,
    device_id_hash, expires_at, created_ip
  )
  VALUES (
    p_entity_id, v_token_hash, p_source_kind, p_source_id,
    p_device_id_hash, v_expires_at, p_ip
  )
  RETURNING id INTO v_token_id;

  RETURN QUERY SELECT v_token_id, v_token_raw, v_expires_at;
END;
$$;


--
-- Name: FUNCTION client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet, p_device_id_hash text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet, p_device_id_hash text) IS 'Creates a new client portal session token. Raw token is returned once — never stored. See client-portal-design.md §15.1.';


--
-- Name: client_portal_cascade_revoke_on_proposal_token_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.public_token IS DISTINCT FROM NEW.public_token THEN
    UPDATE public.client_portal_tokens
       SET revoked_at = now(),
           revoked_reason = 'source_revoked'
     WHERE source_kind = 'proposal'
       AND source_id = OLD.id
       AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: client_portal_rate_limit_prune(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_portal_rate_limit_prune() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.client_portal_rate_limits
  WHERE action_at < now() - interval '48 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: FUNCTION client_portal_rate_limit_prune(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_portal_rate_limit_prune() IS 'Prunes client_portal_rate_limits rows older than 48h. Scheduled via pg_cron in a follow-up migration.';


--
-- Name: client_resolve_proposal_entity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_resolve_proposal_entity(p_public_token uuid) RETURNS TABLE(proposal_id uuid, deal_id uuid, event_id uuid, client_entity_id uuid, workspace_id uuid, proposal_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    p.id                  AS proposal_id,
    p.deal_id             AS deal_id,
    d.event_id            AS event_id,
    e.client_entity_id    AS client_entity_id,
    p.workspace_id        AS workspace_id,
    p.status::text        AS proposal_status
  FROM public.proposals p
  LEFT JOIN public.deals d ON d.id = p.deal_id
  LEFT JOIN ops.events e ON e.id = d.event_id
  WHERE p.public_token = p_public_token
  LIMIT 1;
$$;


--
-- Name: FUNCTION client_resolve_proposal_entity(p_public_token uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_resolve_proposal_entity(p_public_token uuid) IS 'Resolves a proposal public_token to its client entity in one round-trip. SECURITY DEFINER so it can read ops.events, which has no service_role grant. Returns proposal_status so callers can gate on viewable states without a second query. See client-portal-design.md §14.4.';


--
-- Name: client_revoke_all_for_entity(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text DEFAULT 'vendor_kick'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_revoked_count integer;
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at     = now(),
         revoked_reason = p_reason,
         revoked_by     = p_revoked_by
   WHERE entity_id = p_entity_id
     AND revoked_at IS NULL
     AND EXISTS (
       SELECT 1 FROM directory.entities e
       WHERE e.id = p_entity_id
         AND e.owner_workspace_id = p_workspace_id
     );

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
  RETURN v_revoked_count;
END;
$$;


--
-- Name: FUNCTION client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text) IS 'Vendor-initiated bulk revoke for an entity. Only effective when the caller workspace owns the entity.';


--
-- Name: client_revoke_session_token(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_revoke_session_token(p_token_hash text, p_reason text DEFAULT 'client_logout'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, p_reason)
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;


--
-- Name: FUNCTION client_revoke_session_token(p_token_hash text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_revoke_session_token(p_token_hash text, p_reason text) IS 'Client-initiated logout. Revokes the session identified by token_hash. Idempotent.';


--
-- Name: client_revoke_session_token_device(uuid, uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text DEFAULT 'vendor_kick'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at     = now(),
         revoked_reason = p_reason,
         revoked_by     = p_revoked_by
   WHERE id = p_session_id
     AND entity_id = p_entity_id
     AND revoked_at IS NULL
     AND EXISTS (
       SELECT 1 FROM directory.entities e
       WHERE e.id = p_entity_id
         AND e.owner_workspace_id = p_workspace_id
     );

  RETURN FOUND;
END;
$$;


--
-- Name: FUNCTION client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text) IS 'Vendor-initiated single-device kick. Surgical alternative to client_revoke_all_for_entity.';


--
-- Name: client_rotate_session_token(text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_rotate_session_token(p_token_hash text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS TABLE(ok boolean, reason text, entity_id uuid, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_row         public.client_portal_tokens;
  v_new_expiry  timestamptz;
BEGIN
  SELECT * INTO v_row
  FROM public.client_portal_tokens
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'revoked'::text, v_row.entity_id, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'expired'::text, v_row.entity_id, v_row.expires_at;
    RETURN;
  END IF;

  v_new_expiry := public.compute_client_session_expiry(v_row.entity_id);

  UPDATE public.client_portal_tokens
     SET last_used_at = now(),
         last_used_ip = p_ip,
         last_used_ua = p_user_agent,
         expires_at   = v_new_expiry
   WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'ok'::text, v_row.entity_id, v_new_expiry;
END;
$$;


--
-- Name: FUNCTION client_rotate_session_token(p_token_hash text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_rotate_session_token(p_token_hash text, p_ip inet, p_user_agent text) IS 'Silent session rotation on every use. Recomputes event-lifetime expiry. See §15.1.';


--
-- Name: client_songs_add_request(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text DEFAULT ''::text, p_special_moment_label text DEFAULT NULL::text, p_spotify_id text DEFAULT NULL::text, p_apple_music_id text DEFAULT NULL::text, p_isrc text DEFAULT NULL::text, p_artwork_url text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_preview_url text DEFAULT NULL::text, p_requested_by_label text DEFAULT NULL::text) RETURNS TABLE(ok boolean, reason text, entry_id uuid, requested_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'cortex', 'extensions'
    AS $$
DECLARE
  v_allowed_tiers     text[] := ARRAY['must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_allowed_labels    text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
  v_title             text   := trim(COALESCE(p_title, ''));
  v_artist            text   := trim(COALESCE(p_artist, ''));
  v_notes             text   := COALESCE(p_notes, '');
  v_event_row         ops.events%ROWTYPE;
  v_workspace_id      uuid;
  v_current_count     int;
  v_new_entry_id      uuid;
  v_requested_at      timestamptz := now();
  v_is_late_add       boolean := false;
  v_new_entry         jsonb;
  v_fact_text         text;
BEGIN
  IF p_tier IS NULL OR NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_tier = 'special_moment' THEN
    IF p_special_moment_label IS NULL OR NOT (p_special_moment_label = ANY (v_allowed_labels)) THEN
      RETURN QUERY SELECT false, 'invalid_special_moment_label'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF length(v_title) < 1 OR length(v_title) > 200 THEN
    RETURN QUERY SELECT false, 'invalid_title'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(v_artist) > 200 THEN
    RETURN QUERY SELECT false, 'invalid_artist'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(v_notes) > 500 THEN
    RETURN QUERY SELECT false, 'invalid_notes'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text,
      NULL::uuid,
      NULL::timestamptz;
    RETURN;
  END IF;

  v_workspace_id := v_event_row.workspace_id;

  IF v_event_row.starts_at IS NOT NULL
     AND v_event_row.starts_at > now()
     AND v_event_row.starts_at <= now() + interval '24 hours' THEN
    v_is_late_add := true;
  END IF;

  v_current_count := COALESCE(
    jsonb_array_length(v_event_row.run_of_show_data -> 'client_song_requests'),
    0
  );

  IF v_current_count >= 100 THEN
    RETURN QUERY SELECT false, 'too_many'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  v_new_entry_id := gen_random_uuid();

  v_new_entry := jsonb_build_object(
    'id',                         v_new_entry_id::text,
    'title',                      v_title,
    'artist',                     v_artist,
    'tier',                       p_tier,
    'assigned_moment_id',         NULL,
    'sort_order',                 0,
    'notes',                      v_notes,
    'added_by',                   'couple',
    'requested_by_label',         p_requested_by_label,
    'requested_at',               v_requested_at,
    'is_late_add',                v_is_late_add,
    'acknowledged_at',            NULL,
    'acknowledged_moment_label',  NULL,
    'special_moment_label',       p_special_moment_label,
    'spotify_id',                 p_spotify_id,
    'apple_music_id',             p_apple_music_id,
    'isrc',                       p_isrc,
    'artwork_url',                p_artwork_url,
    'duration_ms',                p_duration_ms,
    'preview_url',                p_preview_url
  );

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        COALESCE(run_of_show_data -> 'client_song_requests', '[]'::jsonb) || v_new_entry,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  BEGIN
    v_fact_text := format(
      '[%s] %s%s%s',
      p_tier,
      CASE WHEN v_artist <> '' THEN v_artist || ' — ' ELSE '' END,
      v_title,
      CASE WHEN v_notes <> '' THEN ' (' || v_notes || ')' ELSE '' END
    );

    PERFORM cortex.save_aion_memory(
      v_workspace_id,
      'episodic',
      v_fact_text,
      'client_portal_songs'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT true, NULL::text, v_new_entry_id, v_requested_at;
END;
$$;


--
-- Name: FUNCTION client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text, p_special_moment_label text, p_spotify_id text, p_apple_music_id text, p_isrc text, p_artwork_url text, p_duration_ms integer, p_preview_url text, p_requested_by_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text, p_special_moment_label text, p_spotify_id text, p_apple_music_id text, p_isrc text, p_artwork_url text, p_duration_ms integer, p_preview_url text, p_requested_by_label text) IS 'Append a couple-authored song request to ops.events.run_of_show_data.client_song_requests. See docs/reference/client-portal-songs-design.md §5.1. SECURITY DEFINER, service_role only.';


--
-- Name: client_songs_delete_request(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid) RETURNS TABLE(ok boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'extensions'
    AS $$
DECLARE
  v_event_row       ops.events%ROWTYPE;
  v_current_array   jsonb;
  v_found_entry     jsonb;
  v_new_array       jsonb;
BEGIN
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text;
    RETURN;
  END IF;

  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text;
    RETURN;
  END IF;

  v_current_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_found_entry
    FROM jsonb_array_elements(v_current_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_found_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_mine'::text;
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem
  WHERE elem ->> 'id' <> p_entry_id::text;

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;


--
-- Name: FUNCTION client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid) IS 'Remove a couple-authored song request. Blocks deletion of non-couple entries as defense in depth. See §5.3. SECURITY DEFINER, service_role only.';


--
-- Name: client_songs_update_request(uuid, uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_requested_by_label text DEFAULT NULL::text, p_special_moment_label text DEFAULT NULL::text) RETURNS TABLE(ok boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'cortex', 'extensions'
    AS $$
DECLARE
  v_allowed_tiers   text[] := ARRAY['must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_allowed_labels  text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
  v_event_row       ops.events%ROWTYPE;
  v_current_array   jsonb;
  v_found_entry     jsonb;
  v_updated_entry   jsonb;
  v_new_array       jsonb;
  v_effective_tier  text;
  v_fact_text       text;
BEGIN
  IF p_tier IS NOT NULL AND NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text;
    RETURN;
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
    RETURN QUERY SELECT false, 'invalid_notes'::text;
    RETURN;
  END IF;

  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text;
    RETURN;
  END IF;

  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text;
    RETURN;
  END IF;

  v_current_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_found_entry
    FROM jsonb_array_elements(v_current_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_found_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_mine'::text;
    RETURN;
  END IF;

  v_effective_tier := COALESCE(p_tier, v_found_entry ->> 'tier');
  IF v_effective_tier = 'special_moment' THEN
    DECLARE
      v_effective_label text := COALESCE(
        p_special_moment_label,
        v_found_entry ->> 'special_moment_label'
      );
    BEGIN
      IF v_effective_label IS NULL OR NOT (v_effective_label = ANY (v_allowed_labels)) THEN
        RETURN QUERY SELECT false, 'invalid_special_moment_label'::text;
        RETURN;
      END IF;
    END;
  END IF;

  v_updated_entry := v_found_entry;

  IF p_tier IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{tier}', to_jsonb(p_tier));
  END IF;

  IF p_notes IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{notes}', to_jsonb(p_notes));
  END IF;

  IF p_requested_by_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{requested_by_label}', to_jsonb(p_requested_by_label));
  END IF;

  IF p_special_moment_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{special_moment_label}', to_jsonb(p_special_moment_label));
  END IF;

  IF p_tier IS NOT NULL AND p_tier <> 'special_moment' THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{special_moment_label}', 'null'::jsonb);
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN elem ->> 'id' = p_entry_id::text THEN v_updated_entry
             ELSE elem
           END
         )
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem;

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  -- B2 cortex hook: write a new episodic fact reflecting the updated state.
  -- save_aion_memory dedupes by (workspace, scope, fact), so repeated
  -- updates with the same tier + notes just bump confidence and
  -- updated_at rather than creating duplicate rows.
  -- Fail-soft — cortex errors must NOT roll back the JSONB update.
  BEGIN
    v_fact_text := format(
      '[%s] %s%s%s',
      v_updated_entry ->> 'tier',
      CASE WHEN (v_updated_entry ->> 'artist') <> ''
           THEN (v_updated_entry ->> 'artist') || ' — '
           ELSE '' END,
      v_updated_entry ->> 'title',
      CASE WHEN (v_updated_entry ->> 'notes') <> ''
           THEN ' (' || (v_updated_entry ->> 'notes') || ')'
           ELSE '' END
    );

    PERFORM cortex.save_aion_memory(
      v_event_row.workspace_id,
      'episodic',
      v_fact_text,
      'client_portal_songs'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;


--
-- Name: FUNCTION client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text, p_notes text, p_requested_by_label text, p_special_moment_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text, p_notes text, p_requested_by_label text, p_special_moment_label text) IS 'Narrow update on a couple-authored song request. Only tier, notes, requested_by_label, and special_moment_label are mutable. See §5.2. SECURITY DEFINER, service_role only.';


--
-- Name: client_verify_otp(uuid, text, inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet DEFAULT NULL::inet) RETURNS TABLE(ok boolean, reason text, entity_id uuid, email text, purpose text, already_claimed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_row         public.client_portal_otp_challenges;
  v_code_hash   text;
  v_claimed     boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.client_portal_otp_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_consumed'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'expired'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.attempts >= 5 THEN
    RETURN QUERY SELECT false, 'locked'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  v_code_hash := encode(digest(p_code, 'sha256'), 'hex');

  IF v_code_hash IS DISTINCT FROM v_row.code_hash THEN
    UPDATE public.client_portal_otp_challenges
       SET attempts = attempts + 1
     WHERE id = p_challenge_id;
    RETURN QUERY SELECT false, 'bad_code'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  UPDATE public.client_portal_otp_challenges
     SET consumed_at = now()
   WHERE id = p_challenge_id;

  SELECT (claimed_by_user_id IS NOT NULL) INTO v_claimed
  FROM directory.entities
  WHERE id = v_row.entity_id;

  RETURN QUERY SELECT true, 'ok'::text, v_row.entity_id, v_row.email, v_row.purpose, v_claimed;
END;
$$;


--
-- Name: FUNCTION client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet) IS 'Verifies an OTP code. On success, atomically consumes the challenge and reports whether the entity is already claimed. See §15.2.';


--
-- Name: complete_onboarding(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_onboarding() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := (SELECT auth.uid());
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  UPDATE public.profiles
  SET 
    onboarding_completed = TRUE,
    onboarding_step = 3,
    updated_at = NOW()
  WHERE id = v_user_id;
  
  RETURN TRUE;
END;
$$;


--
-- Name: compute_client_session_expiry(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_client_session_expiry(p_entity_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH latest AS (
    SELECT max(ends_at) AS last_ends_at
    FROM ops.events
    WHERE client_entity_id = p_entity_id
      AND ends_at > now()
      AND status NOT IN ('cancelled', 'archived')
  )
  SELECT LEAST(
    now() + interval '365 days',
    GREATEST(
      now() + interval '30 days',
      COALESCE(last_ends_at, now()) + interval '30 days'
    )
  )
  FROM latest;
$$;


--
-- Name: FUNCTION compute_client_session_expiry(p_entity_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.compute_client_session_expiry(p_entity_id uuid) IS 'Event-lifetime session TTL. Returns max(now()+30d, latest_future_event_end+30d) capped at now()+365d. Generic CIAM products cannot do this because they do not know the client event dates; we do. See client-portal-design.md §14.7.';


--
-- Name: cortex_relationships_audit_trail(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cortex_relationships_audit_trail() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_entity_id   text;
  v_entity_name text;
BEGIN
  -- DISTINCT guard: only fire when context_data actually changed.
  IF (OLD.context_data IS NOT DISTINCT FROM NEW.context_data) THEN
    RETURN NEW;
  END IF;

  v_entity_id   := current_setting('app.current_entity_id',   true);
  v_entity_name := current_setting('app.current_entity_name', true);

  -- Only write audit keys when the caller identity is known.
  IF v_entity_id IS NOT NULL AND v_entity_id <> '' THEN
    NEW.context_data := NEW.context_data ||
      jsonb_build_object(
        'last_modified_at',      now()::text,
        'last_modified_by',      v_entity_id,
        'last_modified_by_name', COALESCE(v_entity_name, '')
      );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION cortex_relationships_audit_trail(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cortex_relationships_audit_trail() IS 'BEFORE UPDATE trigger function: writes last_modified_by/at to context_data when context_data changes. Reads caller identity from app.current_entity_id / app.current_entity_name set_config vars. DISTINCT guard prevents backfill corruption.';


--
-- Name: count_active_shows(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_active_shows(p_workspace_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::integer
  FROM deals
  WHERE workspace_id = p_workspace_id
    AND archived_at IS NULL
    AND status NOT IN ('lost')
$$;


--
-- Name: count_team_seats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_team_seats(p_workspace_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  SELECT count(*)::integer
  FROM workspace_members wm
  LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
  WHERE wm.workspace_id = p_workspace_id
    AND (wr.slug IS NULL OR wr.slug <> 'employee')
$$;


--
-- Name: create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb DEFAULT NULL::jsonb, p_bill_to jsonb DEFAULT NULL::jsonb, p_planner jsonb DEFAULT NULL::jsonb, p_venue_entity jsonb DEFAULT NULL::jsonb, p_deal jsonb DEFAULT '{}'::jsonb, p_note jsonb DEFAULT NULL::jsonb, p_pairing text DEFAULT 'romantic'::text, p_date_kind text DEFAULT 'single'::text, p_date jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_host_shape jsonb;
  v_host_ids uuid[] := ARRAY[]::uuid[];
  v_host_types text[] := ARRAY[]::text[];
  v_resolved_id uuid;
  v_resolved_type text;
  v_primary_host_id uuid;
  v_primary_host_type text;
  v_bill_to_id uuid;
  v_bill_to_type text;
  v_poc_id uuid;
  v_planner_id uuid;
  v_venue_id uuid;
  v_deal_id uuid;
  v_project_id uuid;
  v_org_id_for_deals uuid;
  v_workspace_org_id uuid;
  v_idx int;
  v_a uuid;
  v_b uuid;
  v_a_type text;
  v_b_type text;
  v_co_host_ctx jsonb;
  v_series_rule jsonb;
  v_series_archetype text;
  v_primary_date date;
  v_proposed_end_date date;
  v_project_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_deal_complete: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'create_deal_complete: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_hosts IS NULL OR jsonb_typeof(p_hosts) <> 'array' OR jsonb_array_length(p_hosts) = 0 THEN
    RAISE EXCEPTION 'create_deal_complete: p_hosts must be a non-empty jsonb array' USING ERRCODE = '22023';
  END IF;

  IF p_pairing NOT IN ('romantic', 'co_host', 'family') THEN
    RAISE EXCEPTION 'create_deal_complete: invalid pairing %', p_pairing USING ERRCODE = '22023';
  END IF;

  IF p_date_kind NOT IN ('single', 'multi_day', 'series') THEN
    RAISE EXCEPTION 'create_deal_complete: invalid date_kind %', p_date_kind USING ERRCODE = '22023';
  END IF;

  IF p_date_kind = 'multi_day' THEN
    IF p_date IS NULL OR (p_date ->> 'end_date') IS NULL THEN
      RAISE EXCEPTION 'create_deal_complete: multi_day requires p_date.end_date' USING ERRCODE = '22023';
    END IF;
    v_proposed_end_date := (p_date ->> 'end_date')::date;
  END IF;

  IF p_date_kind = 'series' THEN
    IF p_date IS NULL OR (p_date -> 'series_rule') IS NULL THEN
      RAISE EXCEPTION 'create_deal_complete: series requires p_date.series_rule' USING ERRCODE = '22023';
    END IF;
    v_series_rule := p_date -> 'series_rule';
    v_series_archetype := p_date ->> 'series_archetype';
    IF v_series_archetype IS NOT NULL
       AND v_series_archetype NOT IN ('residency', 'tour', 'run', 'weekend', 'custom') THEN
      RAISE EXCEPTION 'create_deal_complete: invalid series_archetype %', v_series_archetype USING ERRCODE = '22023';
    END IF;
    IF (v_series_rule ->> 'primary_date') IS NULL
       OR jsonb_typeof(v_series_rule -> 'rdates') <> 'array'
       OR jsonb_array_length(v_series_rule -> 'rdates') = 0 THEN
      RAISE EXCEPTION 'create_deal_complete: series_rule requires primary_date and non-empty rdates' USING ERRCODE = '22023';
    END IF;
    v_primary_date := (v_series_rule ->> 'primary_date')::date;
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(p_hosts) - 1 LOOP
    v_host_shape := p_hosts -> v_idx;

    IF v_host_shape ? 'existing_id' AND (v_host_shape ->> 'existing_id') IS NOT NULL THEN
      v_resolved_id := (v_host_shape ->> 'existing_id')::uuid;
      SELECT type INTO v_resolved_type FROM directory.entities WHERE id = v_resolved_id;
      IF v_resolved_type IS NULL THEN
        RAISE EXCEPTION 'create_deal_complete: host % does not exist', v_resolved_id USING ERRCODE = '22023';
      END IF;
    ELSIF (v_host_shape ->> 'type') IS NOT NULL THEN
      v_resolved_type := v_host_shape ->> 'type';
      IF v_resolved_type NOT IN ('person', 'company') THEN
        RAISE EXCEPTION 'create_deal_complete: invalid host type %', v_resolved_type USING ERRCODE = '22023';
      END IF;
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, v_resolved_type,
        COALESCE(v_host_shape ->> 'display_name', 'Host'),
        NULL,
        COALESCE(v_host_shape -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_resolved_id;
    ELSE
      RAISE EXCEPTION 'create_deal_complete: host shape missing both existing_id and type' USING ERRCODE = '22023';
    END IF;

    v_host_ids := array_append(v_host_ids, v_resolved_id);
    v_host_types := array_append(v_host_types, v_resolved_type);
  END LOOP;

  v_primary_host_id := v_host_ids[1];
  v_primary_host_type := v_host_types[1];

  IF p_poc IS NOT NULL THEN
    IF (p_poc ->> 'existing_id') IS NOT NULL THEN
      v_poc_id := (p_poc ->> 'existing_id')::uuid;
    ELSIF (p_poc ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, p_poc ->> 'type',
        COALESCE(p_poc ->> 'display_name', 'Point of contact'),
        NULL,
        COALESCE(p_poc -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_poc_id;
    END IF;
  END IF;

  IF p_planner IS NOT NULL THEN
    IF (p_planner ->> 'existing_id') IS NOT NULL THEN
      v_planner_id := (p_planner ->> 'existing_id')::uuid;
    ELSIF (p_planner ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, p_planner ->> 'type',
        COALESCE(p_planner ->> 'display_name', 'Planner'),
        NULL,
        COALESCE(p_planner -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_planner_id;
    END IF;
  END IF;

  IF p_bill_to IS NOT NULL THEN
    IF (p_bill_to ->> 'existing_id') IS NOT NULL THEN
      v_bill_to_id := (p_bill_to ->> 'existing_id')::uuid;
      SELECT type INTO v_bill_to_type FROM directory.entities WHERE id = v_bill_to_id;
    ELSIF (p_bill_to ->> 'type') IS NOT NULL THEN
      v_bill_to_type := p_bill_to ->> 'type';
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, v_bill_to_type,
        COALESCE(p_bill_to ->> 'display_name', 'Bill to'),
        NULL,
        COALESCE(p_bill_to -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_bill_to_id;
    END IF;
  END IF;

  IF v_bill_to_id IS NULL THEN
    v_bill_to_id := v_primary_host_id;
    v_bill_to_type := v_primary_host_type;
  END IF;

  IF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'existing_id') IS NOT NULL THEN
    v_venue_id := (p_venue_entity ->> 'existing_id')::uuid;
  ELSIF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'display_name') IS NOT NULL THEN
    INSERT INTO directory.entities (owner_workspace_id, type, display_name, attributes)
    VALUES (
      p_workspace_id, 'venue',
      p_venue_entity ->> 'display_name',
      COALESCE(p_venue_entity -> 'attributes', '{"is_ghost": true, "category": "venue"}'::jsonb)
    )
    RETURNING id INTO v_venue_id;
  END IF;

  v_org_id_for_deals := CASE
    WHEN v_bill_to_type = 'company' THEN v_bill_to_id
    WHEN v_primary_host_type = 'company' THEN v_primary_host_id
    ELSE NULL
  END;

  INSERT INTO public.deals (
    workspace_id,
    proposed_date,
    proposed_end_date,
    event_archetype,
    title,
    organization_id,
    main_contact_id,
    status,
    budget_estimated,
    notes,
    venue_id,
    lead_source,
    lead_source_id,
    lead_source_detail,
    referrer_entity_id,
    event_start_time,
    event_end_time
  )
  VALUES (
    p_workspace_id,
    CASE
      WHEN p_date_kind = 'series' THEN v_primary_date
      ELSE (p_deal ->> 'proposed_date')::date
    END,
    v_proposed_end_date,
    p_deal ->> 'event_archetype',
    NULLIF(TRIM(COALESCE(p_deal ->> 'title', '')), ''),
    v_org_id_for_deals,
    NULLIF(p_deal ->> 'main_contact_id', '')::uuid,
    COALESCE(p_deal ->> 'status', 'inquiry'),
    NULLIF(p_deal ->> 'budget_estimated', '')::numeric,
    NULLIF(TRIM(COALESCE(p_deal ->> 'notes', '')), ''),
    v_venue_id,
    NULLIF(p_deal ->> 'lead_source', ''),
    NULLIF(p_deal ->> 'lead_source_id', '')::uuid,
    NULLIF(TRIM(COALESCE(p_deal ->> 'lead_source_detail', '')), ''),
    NULLIF(p_deal ->> 'referrer_entity_id', '')::uuid,
    NULLIF(p_deal ->> 'event_start_time', ''),
    NULLIF(p_deal ->> 'event_end_time', '')
  )
  RETURNING id INTO v_deal_id;

  v_project_name := COALESCE(
    NULLIF(TRIM(COALESCE(p_deal ->> 'title', '')), ''),
    'Production'
  );

  INSERT INTO ops.projects (
    workspace_id, name, status,
    client_entity_id,
    deal_id,
    is_series, series_rule, series_archetype
  )
  VALUES (
    p_workspace_id, v_project_name, 'lead',
    v_bill_to_id,
    v_deal_id,
    p_date_kind = 'series',
    CASE WHEN p_date_kind = 'series' THEN v_series_rule ELSE NULL END,
    CASE WHEN p_date_kind = 'series' THEN v_series_archetype ELSE NULL END
  )
  RETURNING id INTO v_project_id;

  FOR v_idx IN 1 .. array_length(v_host_ids, 1) LOOP
    INSERT INTO ops.deal_stakeholders (
      deal_id, organization_id, entity_id, role, is_primary, display_order
    )
    VALUES (
      v_deal_id,
      CASE WHEN v_host_types[v_idx] = 'company' THEN v_host_ids[v_idx] ELSE NULL END,
      CASE WHEN v_host_types[v_idx] = 'person'  THEN v_host_ids[v_idx] ELSE NULL END,
      'host'::public.deal_stakeholder_role,
      v_idx = 1,
      v_idx::smallint
    );
  END LOOP;

  INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
  VALUES (
    v_deal_id,
    CASE WHEN v_bill_to_type = 'company' THEN v_bill_to_id ELSE NULL END,
    CASE WHEN v_bill_to_type = 'person'  THEN v_bill_to_id ELSE NULL END,
    'bill_to'::public.deal_stakeholder_role,
    true
  )
  ON CONFLICT DO NOTHING;

  IF v_poc_id IS NOT NULL THEN
    DECLARE
      v_poc_type text;
    BEGIN
      SELECT type INTO v_poc_type FROM directory.entities WHERE id = v_poc_id;
      INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
      VALUES (
        v_deal_id,
        CASE WHEN v_poc_type = 'company' THEN v_poc_id ELSE NULL END,
        CASE WHEN v_poc_type = 'person'  THEN v_poc_id ELSE NULL END,
        'day_of_poc'::public.deal_stakeholder_role,
        false
      );
    END;
  END IF;

  IF v_planner_id IS NOT NULL THEN
    DECLARE
      v_planner_type text;
    BEGIN
      SELECT type INTO v_planner_type FROM directory.entities WHERE id = v_planner_id;
      INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
      VALUES (
        v_deal_id,
        CASE WHEN v_planner_type = 'company' THEN v_planner_id ELSE NULL END,
        CASE WHEN v_planner_type = 'person'  THEN v_planner_id ELSE NULL END,
        'planner'::public.deal_stakeholder_role,
        false
      )
      ON CONFLICT DO NOTHING;
    END;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_venue_id, NULL, 'venue_contact'::public.deal_stakeholder_role, false)
    ON CONFLICT DO NOTHING;
  END IF;

  IF array_length(v_host_ids, 1) >= 2 THEN
    v_a := v_host_ids[1];
    v_b := v_host_ids[2];
    v_a_type := v_host_types[1];
    v_b_type := v_host_types[2];
    IF v_a_type = 'person' AND v_b_type = 'person' THEN
      v_co_host_ctx := jsonb_build_object('pairing', p_pairing, 'anniversary_date', NULL);
      INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
      VALUES (v_a, v_b, 'CO_HOST', v_co_host_ctx)
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
      INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
      VALUES (v_b, v_a, 'CO_HOST', v_co_host_ctx)
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
    END IF;
  END IF;

  SELECT id INTO v_workspace_org_id
  FROM directory.entities
  WHERE owner_workspace_id = p_workspace_id
    AND type = 'company'
    AND (attributes->>'is_ghost' IS NULL OR attributes->>'is_ghost' <> 'true')
  LIMIT 1;

  IF v_workspace_org_id IS NOT NULL THEN
    FOR v_idx IN 1 .. array_length(v_host_ids, 1) LOOP
      IF v_host_types[v_idx] = 'person' THEN
        INSERT INTO cortex.relationships (
          source_entity_id, target_entity_id, relationship_type, context_data
        )
        VALUES (
          v_workspace_org_id,
          v_host_ids[v_idx],
          'CLIENT',
          jsonb_build_object(
            'tier', 'preferred',
            'introduced_via_deal_id', v_deal_id
          )
        )
        ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF p_note IS NOT NULL AND (p_note ->> 'content') IS NOT NULL
     AND TRIM(p_note ->> 'content') <> '' THEN
    INSERT INTO ops.deal_notes (
      deal_id, workspace_id, author_user_id, content, attachments, phase_tag
    )
    VALUES (
      v_deal_id, p_workspace_id, v_user_id,
      TRIM(p_note ->> 'content'),
      '[]'::jsonb,
      COALESCE(NULLIF(p_note ->> 'phase_tag', ''), 'general')
    );
  END IF;

  RETURN jsonb_build_object(
    'deal_id', v_deal_id,
    'project_id', v_project_id,
    'host_entity_ids', to_jsonb(v_host_ids),
    'primary_host_entity_id', v_primary_host_id,
    'bill_to_entity_id', v_bill_to_id,
    'poc_entity_id', v_poc_id,
    'planner_entity_id', v_planner_id,
    'venue_entity_id', v_venue_id,
    'date_kind', p_date_kind,
    'is_series', p_date_kind = 'series'
  );
END;
$$;


--
-- Name: FUNCTION create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb) IS 'v3.1: v3 + CLIENT edges from workspace org to each host person. Closes the gap where wedding couples created via the multi-date deal flow did not surface on /network. Company-host CLIENT edges intentionally out of scope.';


--
-- Name: create_default_location(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_location(p_workspace_id uuid, p_location_name text DEFAULT 'Main Office'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_location_id UUID;
BEGIN
  INSERT INTO public.locations (workspace_id, name, is_primary)
  VALUES (p_workspace_id, p_location_name, TRUE)
  RETURNING id INTO v_location_id;
  
  RETURN v_location_id;
END;
$$;


--
-- Name: FUNCTION create_default_location(p_workspace_id uuid, p_location_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_default_location(p_workspace_id uuid, p_location_name text) IS 'Creates a default primary location for a workspace';


--
-- Name: current_entity_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_entity_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.entities WHERE auth_id = auth.uid() LIMIT 1;
$$;


--
-- Name: deal_in_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deal_in_workspace(p_deal_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_deal_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = v_workspace_id
      AND wm.user_id      = v_user_id
  );
END;
$$;


--
-- Name: FUNCTION deal_in_workspace(p_deal_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.deal_in_workspace(p_deal_id uuid) IS 'Aion Phase 3 §3.5: caller-membership check for write tools. Returns FALSE on not-found OR not-a-member (no enumeration oracle). Called from src/app/api/aion/chat/tools/writes.ts.';


--
-- Name: ensure_profile_exists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_profile_exists() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id) THEN
    INSERT INTO public.profiles (id, email)
    SELECT NEW.user_id, u.email
    FROM auth.users u
    WHERE u.id = NEW.user_id
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: entities_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entities_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: generate_bridge_pairing_code(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_bridge_pairing_code(p_user_id uuid, p_person_entity_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  -- Crockford base32: 32 chars, excludes I, L, O, U for readability.
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text := '';
  v_bytes bytea;
  i int;
BEGIN
  -- Invalidate any existing unused codes for this user (single active code).
  UPDATE public.bridge_pairing_codes
  SET expires_at = now()
  WHERE user_id = p_user_id
    AND consumed_at IS NULL
    AND expires_at > now();

  -- 8 random bytes, 8 base32 chars. Bias-free because 256 mod 32 = 0.
  v_bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;

  INSERT INTO public.bridge_pairing_codes (user_id, person_entity_id, code, expires_at)
  VALUES (p_user_id, p_person_entity_id, v_code, now() + interval '5 minutes');

  RETURN v_code;
END;
$$;


--
-- Name: get_active_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_workspace_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT wm.workspace_id INTO v_workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = (SELECT auth.uid())
  ORDER BY 
    CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END,
    wm.created_at ASC
  LIMIT 1;
  
  RETURN v_workspace_id;
END;
$$;


--
-- Name: get_catalog_availability(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_catalog_availability(p_workspace_id uuid, p_date_start date, p_date_end date) RETURNS TABLE(catalog_package_id uuid, deal_id uuid, deal_title text, deal_status text, proposed_date date, quantity_allocated integer, stock_quantity integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    pi.origin_package_id AS catalog_package_id,
    d.id AS deal_id,
    d.title AS deal_title,
    d.status AS deal_status,
    d.proposed_date::date AS proposed_date,
    COALESCE(pi.quantity, 1)::int AS quantity_allocated,
    p.stock_quantity::int AS stock_quantity
  FROM proposal_items pi
  JOIN proposals pr ON pr.id = pi.proposal_id
  JOIN deals d ON d.id = pr.deal_id
  JOIN packages p ON p.id = pi.origin_package_id
  WHERE d.workspace_id = p_workspace_id
    AND pi.origin_package_id IS NOT NULL
    AND p.category = 'rental'
    AND d.proposed_date IS NOT NULL
    AND d.proposed_date::date BETWEEN p_date_start AND p_date_end
    AND d.status NOT IN ('lost', 'archived')
    AND pr.id = (
      SELECT pr2.id FROM proposals pr2
      WHERE pr2.deal_id = d.id
      ORDER BY pr2.created_at DESC LIMIT 1
    )
$$;


--
-- Name: get_catalog_item_assignees(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_catalog_item_assignees(p_package_id uuid) RETURNS TABLE(id uuid, package_id uuid, entity_id uuid, role_note text, created_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'catalog'
    AS $$
  SELECT ia.id, ia.package_id, ia.entity_id, ia.role_note, ia.created_at
  FROM catalog.item_assignees ia
  JOIN public.packages p ON p.id = ia.package_id
  WHERE ia.package_id = p_package_id
    AND p.workspace_id IN (SELECT get_my_workspace_ids())
  ORDER BY ia.created_at ASC;
$$;


--
-- Name: get_current_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_org_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH my_entity AS (
    SELECT id FROM directory.entities WHERE claimed_by_user_id = auth.uid() LIMIT 1
  ),
  from_members AS (
    SELECT d.legacy_org_id AS org_id
    FROM cortex.relationships r
    JOIN my_entity e ON r.source_entity_id = e.id
    JOIN directory.entities d ON d.id = r.target_entity_id
    WHERE r.relationship_type IN ('ROSTER_MEMBER', 'MEMBER')
      AND d.legacy_org_id IS NOT NULL
    ORDER BY CASE (r.context_data->>'role')
      WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'member' THEN 3 ELSE 4
    END
    LIMIT 1
  )
  SELECT org_id FROM from_members;
$$;


--
-- Name: FUNCTION get_current_org_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_current_org_id() IS 'Returns current user HQ org id (bypasses RLS). Used when anon client cannot see entities/org_members.';


--
-- Name: get_deal_crew_enriched(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_deal_crew_enriched(p_deal_id uuid, p_workspace_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'directory', 'cortex'
    AS $$
DECLARE
  v_workspace_org_id uuid;
  v_result           JSONB;
BEGIN
  SELECT id INTO v_workspace_org_id
  FROM directory.entities
  WHERE owner_workspace_id = p_workspace_id
    AND type = 'company'
  LIMIT 1;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              dc.id,
      'deal_id',         dc.deal_id,
      'entity_id',       dc.entity_id,
      'role_note',       dc.role_note,
      'source',          dc.source,
      'catalog_item_id', dc.catalog_item_id,
      'confirmed_at',    dc.confirmed_at,
      'created_at',      dc.created_at,
      'department',      dc.department,
      'declined_at',     dc.declined_at,
      'status',          dc.status,
      'entity_name',
        COALESCE(
          NULLIF(TRIM(
            COALESCE(de.attributes->>'first_name', '') || ' ' ||
            COALESCE(de.attributes->>'last_name', '')
          ), ''),
          de.display_name
        ),
      'entity_type',     de.type,
      'avatar_url',      de.avatar_url,
      'is_ghost',        (de.claimed_by_user_id IS NULL),
      'first_name',      de.attributes->>'first_name',
      'last_name',       de.attributes->>'last_name',
      'job_title',
        COALESCE(
          rel.context_data->>'job_title',
          de.attributes->>'job_title'
        ),
      'phone',           de.attributes->>'phone',
      'email',           de.attributes->>'email',
      'market',          de.attributes->>'market',
      'union_status',    de.attributes->>'union_status',
      'w9_status',       (de.attributes->>'w9_status')::boolean,
      'coi_expiry',      de.attributes->>'coi_expiry',
      'employment_status', rel.context_data->>'employment_status',
      'roster_rel_id',   rel.id,
      'skills', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id',          cs.id,
              'skill_tag',   cs.skill_tag,
              'proficiency', cs.proficiency,
              'hourly_rate', cs.hourly_rate,
              'verified',    cs.verified
            )
            ORDER BY cs.skill_tag
          )
          FROM ops.crew_skills cs
          WHERE cs.entity_id    = dc.entity_id
            AND cs.workspace_id = p_workspace_id
        ),
        '[]'::jsonb
      ),
      'package_name',
        (SELECT p.name FROM public.packages p WHERE p.id = dc.catalog_item_id LIMIT 1),
      'dispatch_status',    dc.dispatch_status,
      'call_time',          dc.call_time,
      'call_time_slot_id',  dc.call_time_slot_id,
      'arrival_location',   dc.arrival_location,
      'day_rate',           dc.day_rate,
      'notes',              dc.notes,
      'day_sheet_sent_count', COALESCE(comms.day_sheet_sent_count, 0),
      'last_day_sheet_sent_at',      comms.last_day_sheet_sent_at,
      'last_day_sheet_delivered_at', comms.last_day_sheet_delivered_at,
      'last_day_sheet_bounced_at',   comms.last_day_sheet_bounced_at
    )
    ORDER BY
      (dc.confirmed_at IS NOT NULL) DESC,
      dc.created_at ASC
  )
  INTO v_result
  FROM ops.deal_crew dc
  LEFT JOIN directory.entities de
    ON de.id = dc.entity_id
  LEFT JOIN cortex.relationships rel
    ON  rel.source_entity_id   = dc.entity_id
    AND rel.relationship_type  = 'ROSTER_MEMBER'
    AND rel.target_entity_id   = v_workspace_org_id
    AND (rel.context_data->>'deleted_at') IS NULL
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE ccl.event_type = 'day_sheet_sent')      AS day_sheet_sent_count,
      MAX(ccl.occurred_at) FILTER (WHERE ccl.event_type = 'day_sheet_sent')      AS last_day_sheet_sent_at,
      MAX(ccl.occurred_at) FILTER (WHERE ccl.event_type = 'day_sheet_delivered') AS last_day_sheet_delivered_at,
      MAX(ccl.occurred_at) FILTER (WHERE ccl.event_type = 'day_sheet_bounced')   AS last_day_sheet_bounced_at
    FROM ops.crew_comms_log ccl
    WHERE ccl.deal_crew_id = dc.id
  ) comms ON TRUE
  WHERE dc.deal_id      = p_deal_id
    AND dc.workspace_id = p_workspace_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


--
-- Name: get_ghost_entity_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ghost_entity_by_email(p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  v_id uuid;
  v_trim text := trim(p_email);
BEGIN
  IF v_trim IS NULL OR v_trim = '' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id
  FROM public.entities
  WHERE email = v_trim AND is_ghost = true
  LIMIT 1;
  RETURN v_id;
END;
$$;


--
-- Name: get_member_permissions(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_member_permissions(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    CASE 
      WHEN role = 'owner' THEN '{
        "view_finance": true,
        "view_planning": true,
        "view_ros": true,
        "manage_team": true,
        "manage_locations": true
      }'::jsonb
      WHEN role = 'admin' THEN '{
        "view_finance": true,
        "view_planning": true,
        "view_ros": true,
        "manage_team": true,
        "manage_locations": true
      }'::jsonb
      ELSE permissions
    END
  FROM workspace_members
  WHERE workspace_id = p_workspace_id 
    AND user_id = p_user_id
$$;


--
-- Name: get_member_role_slug(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_member_role_slug(p_workspace_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id uuid;
  v_legacy_role text;
  v_slug text;
BEGIN
  SELECT wm.role_id, wm.role
  INTO v_role_id, v_legacy_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;

  IF v_role_id IS NULL AND v_legacy_role IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve slug from role_id
  IF v_role_id IS NOT NULL THEN
    SELECT slug INTO v_slug
    FROM ops.workspace_roles
    WHERE id = v_role_id
    LIMIT 1;
    RETURN v_slug;
  END IF;

  -- Fallback: legacy role text IS the slug
  RETURN LOWER(TRIM(v_legacy_role));
END;
$$;


--
-- Name: FUNCTION get_member_role_slug(p_workspace_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_member_role_slug(p_workspace_id uuid) IS 'Returns the role slug for the current user in the given workspace. Used for role-based routing.';


--
-- Name: get_my_client_entity_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_client_entity_ids() RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT id FROM directory.entities WHERE claimed_by_user_id = auth.uid();
END;
$$;


--
-- Name: FUNCTION get_my_client_entity_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_client_entity_ids() IS 'Client-portal RLS helper. Returns entities where claimed_by_user_id = auth.uid(). For anonymous (ghost) clients, auth.uid() is NULL and this returns empty. Mirrors the get_my_workspace_ids() pattern but scoped to client entities. See client-portal-design.md §14.3.';


--
-- Name: get_my_entity_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_entity_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM directory.entities WHERE claimed_by_user_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION get_my_entity_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_entity_id() IS 'Returns current user entity id (bypasses RLS). Used in RLS policies to avoid recursion.';


--
-- Name: get_my_organization_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_organization_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(array_agg(organization_id), ARRAY[]::uuid[])
  FROM public.organization_members WHERE user_id = auth.uid();
$$;


--
-- Name: get_my_workspace_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_workspace_ids() RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid()
    AND role != 'client';
END;
$$;


--
-- Name: FUNCTION get_my_workspace_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_workspace_ids() IS 'Returns workspace IDs for the calling user, excluding client-role memberships. Client access is handled by get_my_client_entity_ids() policies instead.';


--
-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(user_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'auth', 'public'
    AS $$
DECLARE
  uid uuid;
BEGIN
  IF user_email IS NULL OR length(trim(user_email)) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(trim(email)) = lower(trim(user_email)) LIMIT 1;
  RETURN uid;
END;
$$;


--
-- Name: FUNCTION get_user_id_by_email(user_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_id_by_email(user_email text) IS 'Returns auth.users.id for the given email. Backend only (recovery flow).';


--
-- Name: get_user_workspace_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_workspace_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid()
$$;


--
-- Name: FUNCTION get_user_workspace_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_workspace_ids() IS 'Returns workspace IDs for current user (RLS bypass)';


--
-- Name: get_workspace_seat_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_workspace_seat_limit(p_workspace_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
  SELECT tc.included_seats + coalesce(w.extra_seats, 0)
  FROM workspaces w
  JOIN tier_config tc ON tc.tier = w.subscription_tier
  WHERE w.id = p_workspace_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;


--
-- Name: increment_proposal_view(uuid, timestamp with time zone, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_proposal_view(p_proposal_id uuid, p_now timestamp with time zone, p_set_first boolean, p_was_sent boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.proposals
  SET
    view_count      = view_count + 1,
    last_viewed_at  = p_now,
    first_viewed_at = CASE WHEN p_set_first THEN p_now ELSE first_viewed_at END,
    status          = CASE WHEN p_was_sent THEN 'viewed' ELSE status END
  WHERE id = p_proposal_id;
$$;


--
-- Name: insert_ghost_entity(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_ghost_entity(p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  v_id uuid;
  v_trim text := trim(p_email);
BEGIN
  IF v_trim IS NULL OR v_trim = '' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.entities (email, is_ghost, auth_id)
  VALUES (v_trim, true, NULL)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: is_member_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_member_of(_workspace_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_workspace_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_workspace_member(w_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = w_id and wm.user_id = auth.uid()
  );
$$;


--
-- Name: is_workspace_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_workspace_owner(w_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = w_id 
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  );
$$;


--
-- Name: match_catalog(uuid, extensions.vector, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.5) RETURNS TABLE(package_id uuid, content_text text, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  SELECT NULL::uuid, NULL::text, NULL::float WHERE false;
$$;


--
-- Name: FUNCTION match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer, match_threshold double precision); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer, match_threshold double precision) IS 'DEPRECATED no-op. Legacy catalog semantic search moved to cortex.memory (source_type=catalog). Remove after 7 days with zero call-site references.';


--
-- Name: match_documents(extensions.vector, double precision, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_documents(query_embedding extensions.vector, match_threshold double precision, match_count integer, query_text text DEFAULT ''::text) RETURNS TABLE(id uuid, body text, summary text, similarity double precision)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    spine_items.id,
    spine_items.body,
    spine_items.summary,
    -- 1. Treat missing embeddings as 0.0 so the calculation doesn't break
    COALESCE(1 - (spine_items.embedding <=> query_embedding), 0) + 
    -- 2. Add the massive boost if the text matches
    (CASE WHEN spine_items.body ILIKE '%' || query_text || '%' THEN 0.5 ELSE 0 END) AS similarity
  FROM spine_items
  -- 3. The Filter: Allow rows that pass the threshold OR contain the keyword explicitly
  WHERE (COALESCE(1 - (spine_items.embedding <=> query_embedding), 0) > match_threshold)
     OR (spine_items.body ILIKE '%' || query_text || '%')
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


--
-- Name: member_has_capability(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.member_has_capability(p_workspace_id uuid, p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id uuid;
  v_legacy_role text;
BEGIN
  SELECT wm.role_id, wm.role
  INTO v_role_id, v_legacy_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;

  IF v_role_id IS NULL AND v_legacy_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role_id IS NULL AND v_legacy_role IS NOT NULL THEN
    SELECT id INTO v_role_id
    FROM ops.workspace_roles
    WHERE workspace_id IS NULL
      AND slug = LOWER(TRIM(v_legacy_role))
    LIMIT 1;
  END IF;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM ops.workspace_role_permissions wrp
    JOIN ops.workspace_permissions wp ON wp.id = wrp.permission_id
    WHERE wrp.role_id = v_role_id
      AND (wp.key = 'workspace:owner' OR wp.key = p_permission_key)
    LIMIT 1
  );
END;
$$;


--
-- Name: FUNCTION member_has_capability(p_workspace_id uuid, p_permission_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.member_has_capability(p_workspace_id uuid, p_permission_key text) IS 'Returns true if current user has the capability in the workspace. Uses ops.workspace_role_permissions (normalized). Use (SELECT member_has_capability(...)) in RLS for initPlan caching.';


--
-- Name: member_has_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.member_has_permission(p_workspace_id uuid, p_permission_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT 
        CASE 
          -- Owners always have all permissions
          WHEN role = 'owner' THEN TRUE
          -- Admins have most permissions except owner-only ones
          WHEN role = 'admin' AND p_permission_key NOT IN ('transfer_ownership') THEN TRUE
          -- Check JSONB permissions for members/viewers
          ELSE (permissions->p_permission_key)::boolean
        END
      FROM workspace_members
      WHERE workspace_id = p_workspace_id 
        AND user_id = auth.uid()
    ),
    FALSE
  )
$$;


--
-- Name: FUNCTION member_has_permission(p_workspace_id uuid, p_permission_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.member_has_permission(p_workspace_id uuid, p_permission_key text) IS 'Checks if current user has specific permission in workspace';


--
-- Name: merge_industry_tags(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_industry_tags(p_workspace_id uuid, p_from_tag text, p_to_tag text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Insufficient permissions — owner or admin required';
  END IF;

  IF p_from_tag = p_to_tag THEN
    RAISE EXCEPTION 'Source and destination tags must be different';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.workspace_industry_tags
    WHERE workspace_id = p_workspace_id AND tag = p_from_tag
  ) THEN
    RAISE EXCEPTION 'Source tag "%" not found in workspace dictionary', p_from_tag;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.workspace_industry_tags
    WHERE workspace_id = p_workspace_id AND tag = p_to_tag
  ) THEN
    RAISE EXCEPTION 'Destination tag "%" not found in workspace dictionary', p_to_tag;
  END IF;

  -- Set caller identity so the cortex audit trigger captures who triggered the merge
  PERFORM set_config('app.current_entity_id', auth.uid()::text, true);
  PERFORM set_config('app.current_entity_name', 'tag-merge', true);

  UPDATE cortex.relationships
  SET context_data = jsonb_set(
    context_data,
    '{industry_tags}',
    (
      CASE
        WHEN (context_data -> 'industry_tags') ? p_to_tag
        THEN context_data -> 'industry_tags'
        ELSE (context_data -> 'industry_tags') || to_jsonb(p_to_tag)
      END
    ) - p_from_tag
  )
  WHERE source_entity_id IN (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  )
  AND (context_data -> 'industry_tags') ? p_from_tag;

  DELETE FROM ops.workspace_industry_tags
  WHERE workspace_id = p_workspace_id
    AND tag = p_from_tag;
END;
$$;


--
-- Name: my_org_ids_admin_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_org_ids_admin_member() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT organization_id
  FROM public.affiliations
  WHERE entity_id = public.current_entity_id()
    AND access_level IN ('admin', 'member')
    AND status = 'active';
$$;


--
-- Name: ops_songs_acknowledge_client_request(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text DEFAULT NULL::text) RETURNS TABLE(ok boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'extensions'
    AS $$
DECLARE
  v_allowed_labels   text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
  v_event_row        ops.events%ROWTYPE;
  v_current_array    jsonb;
  v_found_entry      jsonb;
  v_updated_entry    jsonb;
  v_new_array        jsonb;
BEGIN
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_not_found'::text;
    RETURN;
  END IF;

  IF NOT public.is_workspace_member(v_event_row.workspace_id) THEN
    RETURN QUERY SELECT false, 'not_workspace_member'::text;
    RETURN;
  END IF;

  IF p_moment_label IS NOT NULL AND NOT (p_moment_label = ANY (v_allowed_labels)) THEN
    RETURN QUERY SELECT false, 'invalid_moment_label'::text;
    RETURN;
  END IF;

  v_current_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_found_entry
    FROM jsonb_array_elements(v_current_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_found_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_couple_entry'::text;
    RETURN;
  END IF;

  v_updated_entry := jsonb_set(v_found_entry, '{acknowledged_at}', to_jsonb(now()));

  IF p_moment_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{acknowledged_moment_label}', to_jsonb(p_moment_label));
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN elem ->> 'id' = p_entry_id::text THEN v_updated_entry
             ELSE elem
           END
         )
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem;

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;


--
-- Name: FUNCTION ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text) IS 'DJ acknowledgement of a couple song request with optional whitelisted moment label. See §0 A2.';


--
-- Name: ops_songs_promote_client_request(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid DEFAULT NULL::uuid) RETURNS TABLE(ok boolean, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'extensions'
    AS $$
DECLARE
  v_allowed_tiers    text[] := ARRAY['cued', 'must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_event_row        ops.events%ROWTYPE;
  v_client_array     jsonb;
  v_dj_array         jsonb;
  v_entry            jsonb;
  v_promoted_entry   jsonb;
  v_new_client_array jsonb;
  v_new_dj_array     jsonb;
BEGIN
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_not_found'::text;
    RETURN;
  END IF;

  IF NOT public.is_workspace_member(v_event_row.workspace_id) THEN
    RETURN QUERY SELECT false, 'not_workspace_member'::text;
    RETURN;
  END IF;

  IF p_tier IS NULL OR NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text;
    RETURN;
  END IF;

  v_client_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_entry
    FROM jsonb_array_elements(v_client_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  v_promoted_entry := v_entry
    || jsonb_build_object(
         'tier',                p_tier,
         'assigned_moment_id',  p_assigned_moment_id,
         'acknowledged_at',     now()
       );

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_new_client_array
  FROM jsonb_array_elements(v_client_array) AS elem
  WHERE elem ->> 'id' <> p_entry_id::text;

  v_dj_array := COALESCE(v_event_row.run_of_show_data -> 'dj_song_pool', '[]'::jsonb);
  v_new_dj_array := v_dj_array || v_promoted_entry;

  UPDATE ops.events
  SET run_of_show_data =
        jsonb_set(
          jsonb_set(
            COALESCE(run_of_show_data, '{}'::jsonb),
            '{client_song_requests}',
            v_new_client_array,
            true
          ),
          '{dj_song_pool}',
          v_new_dj_array,
          true
        ),
      updated_at = now()
  WHERE id = p_event_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;


--
-- Name: FUNCTION ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid) IS 'Atomic promotion of a couple-added song request into dj_song_pool. See §0 A3.';


--
-- Name: patch_entity_attributes(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patch_entity_attributes(p_entity_id uuid, p_attributes jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT owner_workspace_id INTO v_workspace_id
  FROM directory.entities
  WHERE id = p_entity_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Entity not found: %', p_entity_id;
  END IF;

  IF NOT public.user_has_workspace_role(v_workspace_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Strip Ghost Protocol sentinel keys — these must never be overwritten via this RPC.
  -- Ghost state is controlled only by the claim flow (claim_ghost_workspace RPC).
  p_attributes := p_attributes
    - 'is_ghost'
    - 'is_claimed'
    - 'claimed_by_user_id'
    - 'created_by_org_id';

  IF p_attributes = '{}'::jsonb THEN
    RETURN;
  END IF;

  UPDATE directory.entities
  SET attributes = COALESCE(attributes, '{}'::jsonb) || p_attributes
  WHERE id = p_entity_id;
END;
$$;


--
-- Name: patch_relationship_context(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner_workspace_id uuid;
  v_caller_entity_id   uuid;
  v_caller_name        text;
  v_updated            int;
BEGIN
  SELECT owner_workspace_id INTO v_owner_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_owner_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: source entity not found';
  END IF;

  IF NOT public.user_has_workspace_role(v_owner_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in workspace';
  END IF;

  SELECT id, display_name INTO v_caller_entity_id, v_caller_name
  FROM directory.entities
  WHERE claimed_by_user_id = auth.uid()
  LIMIT 1;

  IF v_caller_entity_id IS NOT NULL THEN
    PERFORM set_config('app.current_entity_id',   v_caller_entity_id::text, true);
    PERFORM set_config('app.current_entity_name', COALESCE(v_caller_name, ''),  true);
  END IF;

  UPDATE cortex.relationships
  SET context_data = COALESCE(context_data, '{}'::jsonb) || p_patch
  WHERE source_entity_id  = p_source_entity_id
    AND target_entity_id  = p_target_entity_id
    AND relationship_type = p_relationship_type;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


--
-- Name: FUNCTION patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb) IS 'Merges a JSONB patch into a cortex relationship edge context_data. SECURITY DEFINER — caller must hold owner or admin in the source entity workspace. Sets app.current_entity_id + app.current_entity_name for the audit trigger. Unmentioned keys are preserved. Returns true if an edge was found and updated.';


--
-- Name: purge_expired_sms_otp_codes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_sms_otp_codes() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  DELETE FROM public.sms_otp_codes
   WHERE expires_at < now() - interval '1 hour';
$$;


--
-- Name: FUNCTION purge_expired_sms_otp_codes(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_expired_sms_otp_codes() IS 'Deletes SMS OTP code rows whose expires_at is more than one hour in the past. SECURITY DEFINER; REVOKED from PUBLIC and anon. Intended for scheduled cron — call via service role only.';


--
-- Name: record_deal_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_deal_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_actor_user        uuid;
  v_actor_kind        text;
  v_actor_override    text;
  v_user_override     uuid;
  v_suggestion_id     uuid;
  v_triggers          jsonb;
  v_new_transition_id uuid;
BEGIN
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;
  v_actor_kind := CASE WHEN v_actor_user IS NULL THEN 'system' ELSE 'user' END;

  BEGIN
    v_actor_override := NULLIF(current_setting('unusonic.actor_kind_override', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_actor_override := NULL;
  END;
  IF v_actor_override IN ('user', 'aion', 'system') THEN
    v_actor_kind := v_actor_override;
  END IF;

  BEGIN
    v_user_override := NULLIF(current_setting('unusonic.actor_user_id_override', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_override := NULL;
  END;
  IF v_user_override IS NOT NULL THEN
    v_actor_user := v_user_override;
  END IF;

  BEGIN
    v_suggestion_id := NULLIF(current_setting('unusonic.aion_suggestion_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_suggestion_id := NULL;
  END;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot,
      suggestion_insight_id
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers,
      v_suggestion_id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot,
      suggestion_insight_id
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers,
      v_suggestion_id
    )
    RETURNING id INTO v_new_transition_id;

    UPDATE ops.follow_up_queue q
       SET superseded_at = now()
     WHERE q.deal_id = NEW.id
       AND q.status = 'pending'
       AND q.superseded_at IS NULL
       AND q.originating_stage_id IS NOT NULL
       AND q.originating_stage_id <> NEW.stage_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION record_deal_transition(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_deal_transition() IS 'Records each deal stage change into ops.deal_transitions with a snapshot of the target stage triggers. Reads three optional session-local settings: unusonic.actor_kind_override (forces user/aion/system), unusonic.actor_user_id_override (overrides auth.uid() for service-role-authored transitions), and unusonic.aion_suggestion_id (stamps suggestion_insight_id). Unset settings = no-op; pre-P0 and Stripe/dispatcher callers are unaffected. Also stamps superseded_at on pending follow-ups from prior stages.';


--
-- Name: regenerate_invite_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regenerate_invite_code(p_workspace_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_code TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := (SELECT auth.uid());
  
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = p_workspace_id 
      AND user_id = v_user_id 
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  v_new_code := encode(gen_random_bytes(6), 'hex');
  
  UPDATE public.workspaces
  SET invite_code = v_new_code, updated_at = NOW()
  WHERE id = p_workspace_id;
  
  RETURN v_new_code;
END;
$$;


--
-- Name: remove_catalog_item_assignee(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_catalog_item_assignee(p_assignee_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'catalog'
    AS $$
BEGIN
  DELETE FROM catalog.item_assignees ia
  USING public.packages p
  WHERE ia.id = p_assignee_id
    AND ia.package_id = p.id
    AND p.workspace_id IN (SELECT get_my_workspace_ids());
END;
$$;


--
-- Name: remove_relationship(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'cortex', 'directory', 'ops'
    AS $$
BEGIN
  -- Guard: caller must own the source entity directly, or be an
  -- owner/admin in the workspace that owns it.
  IF NOT EXISTS (
    SELECT 1
    FROM directory.entities
    WHERE id = p_source_entity_id
      AND claimed_by_user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1
    FROM directory.entities e
    WHERE e.id = p_source_entity_id
      AND e.owner_workspace_id IN (SELECT get_my_workspace_ids())
      AND public.user_has_workspace_role(
            e.owner_workspace_id,
            ARRAY['owner', 'admin']
          )
  ) THEN
    RAISE EXCEPTION
      'Unauthorized: insufficient permissions to modify relationships for entity %',
      p_source_entity_id;
  END IF;

  DELETE FROM cortex.relationships
  WHERE source_entity_id    = p_source_entity_id
    AND target_entity_id    = p_target_entity_id
    AND relationship_type   = p_relationship_type;
END;
$$;


--
-- Name: FUNCTION remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text) IS 'Secure hard-delete for a cortex.relationships edge. Caller must be an owner/admin of the source entity''s workspace or directly claim it. Never call cortex.relationships DELETE from client code — always use this RPC. For soft-deletes, use upsert_relationship with status:archived in context_data.';


--
-- Name: review_crew_equipment(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_crew_equipment(p_crew_equipment_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_user_role text;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM ops.crew_equipment
  WHERE id = p_crew_equipment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not authorised: only workspace owners and admins can review equipment';
  END IF;

  -- Set bypass variable so the trigger allows verification column changes
  PERFORM set_config('app.bypass_verification_guard', 'true', true);

  UPDATE ops.crew_equipment
  SET
    verification_status = p_decision,
    verified_at = now(),
    verified_by = auth.uid(),
    rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_crew_equipment_id;
END;
$$;


--
-- Name: search_spine(extensions.vector, double precision, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_spine(query_embedding extensions.vector, match_threshold double precision, match_count integer, filter_workspace_id uuid, query_text text DEFAULT ''::text) RETURNS TABLE(id uuid, title text, body text, affective_context jsonb, similarity double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    spine_items.id,
    spine_items.title,
    spine_items.body,
    spine_items.affective_context,
    -- Calculate Similarity (1 - Cosine Distance)
    (1 - (spine_items.embedding <=> query_embedding))::double precision as similarity
  FROM public.spine_items
  WHERE 
    spine_items.workspace_id = filter_workspace_id
    AND (1 - (spine_items.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;


--
-- Name: seed_workspace_lead_sources(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_workspace_lead_sources(p_workspace_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only seed if workspace has zero lead sources
  IF EXISTS (SELECT 1 FROM ops.workspace_lead_sources WHERE workspace_id = p_workspace_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO ops.workspace_lead_sources (workspace_id, label, category, is_referral, sort_order)
  VALUES
    -- Referral (is_referral = true)
    (p_workspace_id, 'Venue referral',              'referral',     true,  0),
    (p_workspace_id, 'Planner referral',            'referral',     true,  1),
    (p_workspace_id, 'Vendor referral',             'referral',     true,  2),
    (p_workspace_id, 'Past client referral',        'referral',     true,  3),
    -- Digital
    (p_workspace_id, 'Google / search',             'digital',      false, 4),
    (p_workspace_id, 'Instagram',                   'digital',      false, 5),
    (p_workspace_id, 'Facebook',                    'digital',      false, 6),
    (p_workspace_id, 'Website / contact form',      'digital',      false, 7),
    (p_workspace_id, 'Other social',                'digital',      false, 8),
    -- Marketplace
    (p_workspace_id, 'The Knot',                    'marketplace',  false, 9),
    (p_workspace_id, 'WeddingWire',                 'marketplace',  false, 10),
    -- Offline
    (p_workspace_id, 'Bridal show / trade show',    'offline',      false, 11),
    (p_workspace_id, 'Cold outreach',               'offline',      false, 12),
    (p_workspace_id, 'Walk-in / phone call',        'offline',      false, 13),
    -- Relationship
    (p_workspace_id, 'Repeat client',               'relationship', false, 14),
    (p_workspace_id, 'Direct / existing relationship', 'relationship', false, 15)
  ON CONFLICT (workspace_id, label) DO NOTHING;
END;
$$;


--
-- Name: set_org_member_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_org_member_workspace_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id
  from public.organizations
  where id = new.org_id;
  if new.workspace_id is null then
    raise exception 'organization % has no workspace_id', new.org_id;
  end if;
  return new;
end;
$$;


--
-- Name: set_org_members_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_org_members_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_ros_cue_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_ros_cue_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_talent_skill_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_talent_skill_workspace_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id
  from org_members
  where id = new.org_member_id;
  if new.workspace_id is null then
    raise exception 'org_member % has no workspace_id', new.org_member_id;
  end if;
  return new;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: strip_industry_tag(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.strip_industry_tag(p_workspace_id uuid, p_tag text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Insufficient permissions — owner or admin required';
  END IF;

  UPDATE cortex.relationships
  SET context_data = jsonb_set(
    context_data,
    '{industry_tags}',
    (context_data -> 'industry_tags') - p_tag
  )
  WHERE source_entity_id IN (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  )
  AND (context_data -> 'industry_tags') ? p_tag;

  DELETE FROM ops.workspace_industry_tags
  WHERE workspace_id = p_workspace_id
    AND tag = p_tag;
END;
$$;


--
-- Name: sync_deal_status_from_stage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_deal_status_from_stage() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops'
    AS $$
DECLARE
  v_kind         text;
  v_pipeline_id  uuid;
  v_stage_id     uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT kind, pipeline_id INTO v_kind, v_pipeline_id
      FROM ops.pipeline_stages
      WHERE id = NEW.stage_id;

      IF v_kind IS NOT NULL THEN
        NEW.status := v_kind;
        IF NEW.pipeline_id IS NULL THEN
          NEW.pipeline_id := v_pipeline_id;
        END IF;
      END IF;

      RETURN NEW;
    END IF;

    IF NEW.status IS NOT NULL THEN
      SELECT p.id, s.id, s.kind
        INTO v_pipeline_id, v_stage_id, v_kind
      FROM ops.pipelines p
      JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
      WHERE p.workspace_id = NEW.workspace_id
        AND p.is_default   = true
        AND s.slug         = NEW.status
        AND s.is_archived  = false;

      IF v_stage_id IS NOT NULL THEN
        NEW.stage_id    := v_stage_id;
        NEW.pipeline_id := v_pipeline_id;
        NEW.status      := v_kind;
        RETURN NEW;
      END IF;

      RAISE WARNING 'sync_deal_status_from_stage: no stage for workspace=% status=% (deal=%)',
        NEW.workspace_id, NEW.status, NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT kind INTO v_kind
      FROM ops.pipeline_stages
      WHERE id = NEW.stage_id;

      IF v_kind IS NOT NULL THEN
        NEW.status := v_kind;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION sync_deal_status_from_stage(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_deal_status_from_stage() IS 'Phase 3i: derives public.deals.status from ops.pipeline_stages.kind whenever stage_id is inserted/updated. Also handles legacy "writer passed slug, no stage_id" callers during the Phase 3i rollout by looking up the matching stage and promoting the slug to its kind. Phase 2a ran the opposite direction (status -> stage_id); Phase 3i inverts it and keeps status as a denormalized kind fast-path (design doc section 4.3).';


--
-- Name: sync_gig_to_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_gig_to_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_status public.event_status;
  v_location TEXT;
  v_title TEXT;
BEGIN
  -- Build starts_at from event_date (08:00 UTC)
  IF NEW.event_date IS NOT NULL THEN
    v_starts_at := (NEW.event_date::date)::timestamp AT TIME ZONE 'UTC' + interval '8 hours';
    v_ends_at   := (NEW.event_date::date)::timestamp AT TIME ZONE 'UTC' + interval '18 hours';
  ELSE
    v_starts_at := date_trunc('day', now()) + interval '8 hours';
    v_ends_at   := date_trunc('day', now()) + interval '18 hours';
  END IF;

  -- Map gig status to event_status
  v_status := CASE
    WHEN NEW.status IN ('confirmed', 'run_of_show') THEN 'confirmed'::public.event_status
    WHEN NEW.status = 'cancelled' THEN 'cancelled'::public.event_status
    WHEN NEW.status = 'hold' THEN 'hold'::public.event_status
    ELSE 'planned'::public.event_status
  END;

  -- Use gigs.location for events.location_name
  v_location := NEW.location;

  v_title := COALESCE(NEW.title, 'Untitled Production');

  INSERT INTO public.events (
    title, starts_at, ends_at, status, location_name, workspace_id, gig_id, updated_at
  ) VALUES (
    v_title, v_starts_at, v_ends_at, v_status, v_location, NEW.workspace_id, NEW.id, now()
  )
  ON CONFLICT (gig_id) DO UPDATE SET
    title = EXCLUDED.title,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    status = EXCLUDED.status,
    location_name = EXCLUDED.location_name,
    updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION sync_gig_to_event(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_gig_to_event() IS 'Keeps events table in sync with gigs for unified calendar display';


--
-- Name: sync_workspace_roles_to_app_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_workspace_roles_to_app_metadata() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'ops', 'auth'
    AS $$
DECLARE
  v_user_id uuid;
  v_roles jsonb;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COALESCE(jsonb_object_agg(
    wm.workspace_id::text,
    COALESCE(wr.slug, LOWER(TRIM(wm.role)))
  ), '{}'::jsonb)
  INTO v_roles
  FROM public.workspace_members wm
  LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
  WHERE wm.user_id = v_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('workspace_roles', v_roles)
  WHERE id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: touch_spine_item_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_spine_item_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.spine_items
  SET updated_at = now()
  WHERE id = NEW.from_item_id OR id = NEW.to_item_id;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_spine_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_spine_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.spine_audits (workspace_id, table_name, record_id, operation, old_values, new_values)
  VALUES (
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN NULL;
END;
$$;


--
-- Name: unusonic_current_entity_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unusonic_current_entity_email() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.entities WHERE auth_id = auth.uid() LIMIT 1;
  RETURN v_email;
END;
$$;


--
-- Name: unusonic_current_entity_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unusonic_current_entity_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET row_security TO 'off'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.entities WHERE auth_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;


--
-- Name: unusonic_org_ids_can_affiliate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unusonic_org_ids_can_affiliate() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM organizations WHERE owner_id = signal_current_entity_id()
  UNION
  SELECT organization_id FROM affiliations
  WHERE entity_id = signal_current_entity_id() AND access_level IN ('admin', 'member');
$$;


--
-- Name: unusonic_org_ids_for_entity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unusonic_org_ids_for_entity() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT organization_id FROM affiliations
  WHERE entity_id = signal_current_entity_id();
$$;


--
-- Name: unusonic_org_ids_where_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unusonic_org_ids_where_admin() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT organization_id FROM affiliations
  WHERE entity_id = signal_current_entity_id() AND access_level = 'admin';
$$;


--
-- Name: update_ghost_member(uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ghost_member(p_creator_org_id uuid, p_member_id uuid, p_role text DEFAULT NULL::text, p_job_title text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_rel_id uuid; v_entity_id uuid; v_org_entity_id uuid; v_new_role text; v_new_job text;
BEGIN
  SELECT id, source_entity_id, target_entity_id INTO v_rel_id, v_entity_id, v_org_entity_id
  FROM cortex.relationships WHERE id = p_member_id AND relationship_type = 'ROSTER_MEMBER' LIMIT 1;
  IF v_rel_id IS NULL THEN
    SELECT id, source_entity_id, target_entity_id INTO v_rel_id, v_entity_id, v_org_entity_id
    FROM cortex.relationships WHERE context_data->>'org_member_id' = p_member_id::text
      AND relationship_type = 'ROSTER_MEMBER' LIMIT 1;
  END IF;
  IF v_rel_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Member not found.'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM directory.entities WHERE id = v_org_entity_id AND legacy_org_id IS NOT NULL
      AND (attributes->>'created_by_org_id')::uuid = p_creator_org_id
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'You do not have clearance to edit this member.'); END IF;
  v_new_role := CASE WHEN p_role IS NOT NULL AND trim(p_role) != '' THEN p_role
    ELSE (SELECT context_data->>'role' FROM cortex.relationships WHERE id = v_rel_id) END;
  v_new_job := CASE WHEN p_job_title IS NOT NULL THEN nullif(trim(p_job_title), '')
    ELSE (SELECT context_data->>'job_title' FROM cortex.relationships WHERE id = v_rel_id) END;
  UPDATE cortex.relationships
  SET context_data = context_data || jsonb_strip_nulls(jsonb_build_object('role', v_new_role, 'job_title', v_new_job))
  WHERE id = v_rel_id;
  UPDATE directory.entities SET
    avatar_url = CASE WHEN p_avatar_url IS NOT NULL THEN nullif(trim(p_avatar_url), '') ELSE avatar_url END,
    attributes = attributes || jsonb_strip_nulls(jsonb_build_object(
      'phone', CASE WHEN p_phone IS NOT NULL THEN nullif(trim(p_phone), '') ELSE attributes->>'phone' END,
      'job_title', v_new_job)),
    updated_at = now()
  WHERE id = v_entity_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: update_location_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_location_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_profile_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_profile_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_workspace_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_workspace_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: upsert_relationship(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id                  uuid;
  v_source_workspace_id uuid;
BEGIN
  -- Verify source entity belongs to caller's workspace
  SELECT owner_workspace_id INTO v_source_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_source_workspace_id IS NULL OR
     v_source_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: source entity not in caller workspace';
  END IF;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_source_entity_id, p_target_entity_id, p_type, p_context_data)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb) IS 'Creates or updates a cortex relationship edge. SECURITY DEFINER — validates caller owns the source entity workspace before bypassing cortex.relationships RLS. Use (SELECT upsert_relationship(...)) in app code.';


--
-- Name: user_has_workspace_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_workspace_role(p_workspace_id uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_id = p_workspace_id 
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
  )
$$;


--
-- Name: FUNCTION user_has_workspace_role(p_workspace_id uuid, p_roles text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.user_has_workspace_role(p_workspace_id uuid, p_roles text[]) IS 'Checks if current user has specified role in workspace (RLS bypass)';


--
-- Name: workspace_created_by_me(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_created_by_me(p_workspace_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces WHERE id = p_workspace_id AND created_by = auth.uid()
  )
$$;


--
-- Name: FUNCTION workspace_created_by_me(p_workspace_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.workspace_created_by_me(p_workspace_id uuid) IS 'True if workspace was created by current user (for bootstrap member insert)';


--
-- Name: workspace_joinable_by_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_joinable_by_invite(p_workspace_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = p_workspace_id AND invite_code IS NOT NULL AND created_by != auth.uid()
  )
$$;


--
-- Name: FUNCTION workspace_joinable_by_invite(p_workspace_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.workspace_joinable_by_invite(p_workspace_id uuid) IS 'True if workspace has invite code and was not created by current user (for join-by-invite)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: item_assignees; Type: TABLE; Schema: catalog; Owner: -
--

CREATE TABLE catalog.item_assignees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    entity_id uuid,
    role_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_assignees_entity_or_role_required CHECK (((entity_id IS NOT NULL) OR ((role_note IS NOT NULL) AND (role_note <> ''::text))))
);


--
-- Name: aion_insights; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    trigger_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    title text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    priority integer DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    surfaced_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    resolved_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    hide_from_portal boolean DEFAULT true NOT NULL,
    CONSTRAINT aion_insights_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'surfaced'::text, 'dismissed'::text, 'resolved'::text])))
);


--
-- Name: COLUMN aion_insights.hide_from_portal; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_insights.hide_from_portal IS 'Audience flag. TRUE (default) = internal-only; owner sees it in dashboard + brief but client/employee portal readers never do. Mirrors ops.follow_up_queue.hide_from_portal. Primary enforcement is via cortex.portal_aion_insights view + ESLint no-restricted-imports on portal code.';


--
-- Name: aion_memory; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    scope text NOT NULL,
    fact text NOT NULL,
    source text DEFAULT 'aion_chat'::text,
    confidence numeric DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    user_id uuid,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT aion_memory_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT aion_memory_scope_check CHECK ((scope = ANY (ARRAY['episodic'::text, 'procedural'::text, 'semantic'::text, 'lobby_pin'::text])))
);


--
-- Name: COLUMN aion_memory.entity_id; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_memory.entity_id IS 'Optional link to a directory.entities row for per-entity memories (client communication preferences, recurring quirks). NULL for user-scoped or workspace-scoped memories.';


--
-- Name: aion_messages; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    structured_content jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval),
    context_fingerprint text,
    CONSTRAINT aion_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])))
);


--
-- Name: aion_proactive_lines; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_proactive_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    session_id uuid,
    signal_type text NOT NULL,
    headline text NOT NULL,
    artifact_ref jsonb NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_date_local date NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '72:00:00'::interval) NOT NULL,
    dismissed_at timestamp with time zone,
    dismissed_by uuid,
    resolved_at timestamp with time zone,
    CONSTRAINT aion_proactive_lines_artifact_ref_check CHECK (((artifact_ref ? 'kind'::text) AND (artifact_ref ? 'id'::text) AND (jsonb_typeof((artifact_ref -> 'kind'::text)) = 'string'::text) AND (jsonb_typeof((artifact_ref -> 'id'::text)) = 'string'::text))),
    CONSTRAINT aion_proactive_lines_dismiss_pair_check CHECK (((dismissed_at IS NULL) = (dismissed_by IS NULL))),
    CONSTRAINT aion_proactive_lines_headline_check CHECK (((char_length(headline) >= 1) AND (char_length(headline) <= 200))),
    CONSTRAINT aion_proactive_lines_signal_type_check CHECK ((signal_type = ANY (ARRAY['proposal_engagement'::text, 'money_event'::text, 'dead_silence'::text])))
);


--
-- Name: TABLE aion_proactive_lines; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.aion_proactive_lines IS 'Phase 2 Sprint 2 deal-card pinned lines. One row per (workspace, deal, workspace-local day). See docs/reference/aion-deal-chat-phase2-plan.md §3.2.';


--
-- Name: COLUMN aion_proactive_lines.artifact_ref; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_proactive_lines.artifact_ref IS 'Reference to the underlying record that triggered the line. Used by webhook receivers to resolve-on-clear.';


--
-- Name: COLUMN aion_proactive_lines.created_date_local; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_proactive_lines.created_date_local IS 'Workspace-local date at insert time. Populated by trigger from public.workspaces.timezone. Drives the 1-per-deal-per-day unique index so the cap is timezone-correct.';


--
-- Name: aion_refusal_log; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_refusal_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    question text NOT NULL,
    reason text NOT NULL,
    attempted_metric_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE aion_refusal_log; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.aion_refusal_log IS 'Log of Aion refusals (out-of-registry questions). Writes via cortex.record_refusal RPC only. Reads: workspace members via RLS.';


--
-- Name: COLUMN aion_refusal_log.reason; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_refusal_log.reason IS 'Common values: metric_not_in_registry, insufficient_capability, ambiguous_arg, other.';


--
-- Name: aion_sessions; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.aion_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text,
    preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_summary text,
    summarized_up_to text,
    feedback jsonb,
    scope_type text NOT NULL,
    scope_entity_id uuid,
    pinned boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    is_pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    title_locked boolean DEFAULT false NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aion_sessions_pin_consistency CHECK ((((is_pinned = true) AND (pinned_at IS NOT NULL)) OR ((is_pinned = false) AND (pinned_at IS NULL)))),
    CONSTRAINT aion_sessions_scope_consistency CHECK ((((scope_type = 'general'::text) AND (scope_entity_id IS NULL)) OR ((scope_type = ANY (ARRAY['deal'::text, 'event'::text])) AND (scope_entity_id IS NOT NULL)))),
    CONSTRAINT aion_sessions_scope_type_check CHECK ((scope_type = ANY (ARRAY['general'::text, 'deal'::text, 'event'::text])))
);


--
-- Name: COLUMN aion_sessions.feedback; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.aion_sessions.feedback IS 'Per-message feedback jsonb map: { messageId: "up" | "down" }. Written by saveMessageFeedback on thumbs-up/down clicks in the Brain tab.';


--
-- Name: capture_events; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.capture_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    audio_storage_path text,
    transcript text,
    parsed_entity jsonb,
    parsed_follow_up jsonb,
    parsed_note text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    resolved_entity_id uuid,
    created_follow_up_queue_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    visibility text DEFAULT 'user'::text NOT NULL,
    linked_deal_id uuid,
    linked_event_id uuid,
    CONSTRAINT capture_events_single_production_link CHECK (((linked_deal_id IS NULL) OR (linked_event_id IS NULL))),
    CONSTRAINT capture_events_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'dismissed'::text, 'failed'::text]))),
    CONSTRAINT capture_events_visibility_check CHECK ((visibility = ANY (ARRAY['user'::text, 'workspace'::text])))
);


--
-- Name: consent_log; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.consent_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    term_key text NOT NULL,
    term_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: TABLE consent_log; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.consent_log IS 'Append-only audit trail for feature consent. One row per (user, term, version) accept; revocations insert a sibling row with revoked_at set. Writes via cortex.record_consent / cortex.revoke_consent RPCs only.';


--
-- Name: entity_working_notes; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.entity_working_notes (
    workspace_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    communication_style text,
    dnr_flagged boolean DEFAULT false NOT NULL,
    dnr_reason text,
    dnr_note text,
    preferred_channel text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    auto_filled_fields text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT entity_working_notes_dnr_reason_check CHECK (((dnr_reason IS NULL) OR (dnr_reason = ANY (ARRAY['paid_late'::text, 'unreliable'::text, 'abuse'::text, 'contractual'::text, 'other'::text])))),
    CONSTRAINT entity_working_notes_preferred_channel_check CHECK (((preferred_channel IS NULL) OR (preferred_channel = ANY (ARRAY['call'::text, 'email'::text, 'sms'::text]))))
);


--
-- Name: feature_access_requests; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.feature_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    feature_key text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    reviewer_note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT feature_access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'withdrawn'::text])))
);


--
-- Name: TABLE feature_access_requests; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.feature_access_requests IS 'Queue of member-originated feature-enablement requests. Admin reviews via cortex.review_feature_request. Audit-only for v1.';


--
-- Name: memory; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    entity_ids uuid[] DEFAULT '{}'::uuid[],
    content_text text NOT NULL,
    content_header text,
    embedding extensions.vector(1024) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_rebuilt_at timestamp with time zone,
    CONSTRAINT memory_source_type_chk CHECK ((source_type = ANY (ARRAY['deal_note'::text, 'follow_up'::text, 'proposal'::text, 'event_note'::text, 'capture'::text, 'message'::text, 'narrative'::text, 'activity_log'::text, 'catalog'::text])))
);


--
-- Name: TABLE memory; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.memory IS 'Vector embeddings for workspace knowledge (deal notes, follow-ups, proposals, events). One embedding per source record. Used by Aion search_workspace_knowledge tool.';


--
-- Name: COLUMN memory.last_rebuilt_at; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON COLUMN cortex.memory.last_rebuilt_at IS 'Set when a (source_type, source_id) row is re-embedded due to backdated or corrected content. NULL on initial insert. Used by activity-log chunk invalidation.';


--
-- Name: CONSTRAINT memory_source_type_chk ON memory; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON CONSTRAINT memory_source_type_chk ON cortex.memory IS 'Source-type whitelist — bumping requires a migration. Keeps callers honest.';


--
-- Name: memory_pending; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.memory_pending (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    content_text text NOT NULL,
    content_header text,
    entity_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    enqueued_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempted_at timestamp with time zone,
    last_error text,
    next_attempt_after timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memory_pending_source_type_check CHECK ((source_type = ANY (ARRAY['deal_note'::text, 'follow_up'::text, 'proposal'::text, 'event_note'::text, 'capture'::text, 'message'::text, 'narrative'::text, 'activity_log'::text, 'catalog'::text])))
);


--
-- Name: TABLE memory_pending; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.memory_pending IS 'Embedding ingestion queue. Rows inserted by ops.messages write paths and drained every 2 min by /api/cron/aion-memory-drain. On success row deletes; on failure attempts++ with exponential backoff.';


--
-- Name: portal_aion_insights; Type: VIEW; Schema: cortex; Owner: -
--

CREATE VIEW cortex.portal_aion_insights WITH (security_invoker='true', security_barrier='true') AS
 SELECT id,
    workspace_id,
    trigger_type,
    entity_type,
    entity_id,
    title,
    context,
    priority,
    status,
    surfaced_at,
    dismissed_at,
    resolved_at,
    expires_at,
    created_at,
    hide_from_portal
   FROM cortex.aion_insights
  WHERE ((hide_from_portal = false) AND (status = ANY (ARRAY['pending'::text, 'surfaced'::text])));


--
-- Name: VIEW portal_aion_insights; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON VIEW cortex.portal_aion_insights IS 'Portal-safe subset of cortex.aion_insights. security_invoker=true so RLS on the underlying table runs as the caller (workspace membership). Filtered to hide_from_portal=false and active status. Portal routes read this view; raw table stays workspace-RLS-gated for dashboard code.';


--
-- Name: referrals; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    direction text NOT NULL,
    counterparty_entity_id uuid NOT NULL,
    client_name text,
    client_entity_id uuid,
    related_deal_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT referrals_direction_check CHECK ((direction = ANY (ARRAY['received'::text, 'sent'::text])))
);


--
-- Name: relationships; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_entity_id uuid NOT NULL,
    target_entity_id uuid NOT NULL,
    relationship_type text NOT NULL,
    connection_strength integer DEFAULT 0,
    context_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ui_notices; Type: TABLE; Schema: cortex; Owner: -
--

CREATE TABLE cortex.ui_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notice_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone,
    expires_at timestamp with time zone
);


--
-- Name: TABLE ui_notices; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON TABLE cortex.ui_notices IS 'One-shot banners for admin-flip side effects. DealLens + settings surfaces show once, marking seen_at.';


--
-- Name: entities; Type: TABLE; Schema: directory; Owner: -
--

CREATE TABLE directory.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_workspace_id uuid,
    claimed_by_user_id uuid,
    type text NOT NULL,
    display_name text NOT NULL,
    handle text,
    avatar_url text,
    attributes jsonb DEFAULT '{}'::jsonb,
    search_vector tsvector,
    embedding extensions.vector(1536),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    legacy_org_id uuid,
    legacy_entity_id uuid,
    CONSTRAINT entities_type_check CHECK ((type = ANY (ARRAY['company'::text, 'person'::text, 'venue'::text, 'couple'::text])))
);


--
-- Name: COLUMN entities.legacy_org_id; Type: COMMENT; Schema: directory; Owner: -
--

COMMENT ON COLUMN directory.entities.legacy_org_id IS 'Transitional bridge: points to public.organizations during migration. Null after cutover.';


--
-- Name: COLUMN entities.legacy_entity_id; Type: COMMENT; Schema: directory; Owner: -
--

COMMENT ON COLUMN directory.entities.legacy_entity_id IS 'Transitional bridge: points to public.entities during migration. Null after cutover.';


--
-- Name: entity_documents; Type: TABLE; Schema: directory; Owner: -
--

CREATE TABLE directory.entity_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    document_type text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    display_name text NOT NULL,
    storage_path text NOT NULL,
    file_size bigint,
    mime_type text,
    expires_at date,
    notes text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'archived'::text])))
);


--
-- Name: bill_payments; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.bill_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    reference text,
    notes text,
    qbo_bill_payment_id text,
    qbo_sync_status text DEFAULT 'not_synced'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_payments_method_check CHECK ((method = ANY (ARRAY['check'::text, 'wire'::text, 'ach'::text, 'cash'::text, 'other'::text]))),
    CONSTRAINT bill_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);

ALTER TABLE ONLY finance.bill_payments FORCE ROW LEVEL SECURITY;


--
-- Name: bills; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    bill_number text NOT NULL,
    bill_kind text DEFAULT 'freelancer'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    pay_to_entity_id uuid NOT NULL,
    event_id uuid,
    project_id uuid,
    currency text DEFAULT 'USD'::text NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(14,2) DEFAULT 0 NOT NULL,
    bill_date date,
    due_date date,
    notes text,
    internal_notes text,
    pay_to_snapshot jsonb DEFAULT '{"v": 1}'::jsonb NOT NULL,
    qbo_bill_id text,
    qbo_sync_token text,
    qbo_sync_status text DEFAULT 'not_synced'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bills_bill_kind_check CHECK ((bill_kind = ANY (ARRAY['freelancer'::text, 'vendor'::text, 'expense_reimbursement'::text]))),
    CONSTRAINT bills_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'received'::text, 'partially_paid'::text, 'paid'::text, 'void'::text])))
);

ALTER TABLE ONLY finance.bills FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bills; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.bills IS 'AP side. Schema-only in Wave 1 (no UI). Wave 2 ships freelancer pay flow. Maps to QBO Bill object — distinct from Invoice. Field Expert anti-pattern: never reuse AR table for AP.';


--
-- Name: invoices; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_kind text DEFAULT 'standalone'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    bill_to_entity_id uuid NOT NULL,
    event_id uuid,
    project_id uuid,
    proposal_id uuid,
    deal_id uuid,
    parent_invoice_id uuid,
    currency text DEFAULT 'USD'::text NOT NULL,
    subtotal_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    tax_rate_snapshot numeric(8,6),
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(14,2) DEFAULT 0 NOT NULL,
    issue_date date,
    due_date date,
    issued_at timestamp with time zone,
    sent_at timestamp with time zone,
    viewed_at timestamp with time zone,
    paid_at timestamp with time zone,
    voided_at timestamp with time zone,
    public_token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    notes_to_client text,
    internal_notes text,
    po_number text,
    terms text,
    bill_to_snapshot jsonb DEFAULT '{"v": 1}'::jsonb NOT NULL,
    from_snapshot jsonb DEFAULT '{"v": 1}'::jsonb NOT NULL,
    qbo_invoice_id text,
    qbo_sync_token text,
    qbo_doc_number text,
    qbo_last_sync_at timestamp with time zone,
    qbo_last_error text,
    qbo_sync_status text DEFAULT 'not_synced'::text NOT NULL,
    stripe_payment_link_id text,
    billing_email text,
    is_disputed boolean DEFAULT false NOT NULL,
    dispute_note text,
    pdf_version integer DEFAULT 0 NOT NULL,
    pdf_last_generated_at timestamp with time zone,
    created_by_user_id uuid,
    sent_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_mode text,
    billing_period_start date,
    billing_period_end date,
    CONSTRAINT finance_invoices_billing_mode_check CHECK (((billing_mode IS NULL) OR (billing_mode = ANY (ARRAY['lump'::text, 'deposit_final'::text, 'per_event'::text, 'monthly_rollup'::text])))),
    CONSTRAINT finance_invoices_billing_period_consistent CHECK ((((billing_period_start IS NULL) AND (billing_period_end IS NULL)) OR ((billing_period_start IS NOT NULL) AND (billing_period_end IS NOT NULL) AND (billing_period_start <= billing_period_end)))),
    CONSTRAINT invoices_invoice_kind_check CHECK ((invoice_kind = ANY (ARRAY['deposit'::text, 'progress'::text, 'final'::text, 'standalone'::text, 'credit_note'::text]))),
    CONSTRAINT invoices_qbo_sync_status_check CHECK ((qbo_sync_status = ANY (ARRAY['not_synced'::text, 'queued'::text, 'in_progress'::text, 'synced'::text, 'failed'::text, 'pending_mapping'::text, 'dead_letter'::text, 'excluded_pre_connection'::text]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'viewed'::text, 'partially_paid'::text, 'paid'::text, 'void'::text, 'refunded'::text])))
);

ALTER TABLE ONLY finance.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE invoices; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.invoices IS 'Authoritative client-billing invoice ledger. One row per invoice. A deal can have many invoices (deposit + final + change orders) all rolling up to the same deal_id. Snapshots are immutable legal records — never re-resolve from current entity state.';


--
-- Name: COLUMN invoices.tax_rate_snapshot; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON COLUMN finance.invoices.tax_rate_snapshot IS 'Frozen at send time. Wave 2 line item edits recompute tax_amount as new_taxable_subtotal * tax_rate_snapshot — rate frozen, base can move.';


--
-- Name: COLUMN invoices.public_token; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON COLUMN finance.invoices.public_token IS 'Random 32-byte hex. Powers /i/[token] public page. Reads route ONLY through finance.get_public_invoice(token) RPC (Migration 4). RLS denies anon SELECT on this table.';


--
-- Name: invoice_balances; Type: VIEW; Schema: finance; Owner: -
--

CREATE VIEW finance.invoice_balances AS
 SELECT id AS invoice_id,
    workspace_id,
    total_amount,
    paid_amount,
    (total_amount - paid_amount) AS balance_due,
        CASE
            WHEN (due_date IS NULL) THEN NULL::integer
            WHEN (status = 'paid'::text) THEN 0
            WHEN (due_date >= CURRENT_DATE) THEN 0
            ELSE (CURRENT_DATE - due_date)
        END AS days_overdue
   FROM finance.invoices i;


--
-- Name: VIEW invoice_balances; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON VIEW finance.invoice_balances IS 'Computes balance_due and days_overdue. Replaces the rejected STORED generated column from Visionary spec — see Critic §2b on lock contention.';


--
-- Name: invoice_line_items; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    item_kind text DEFAULT 'service'::text NOT NULL,
    description text NOT NULL,
    quantity numeric(14,4) DEFAULT 1 NOT NULL,
    unit_price numeric(14,2) DEFAULT 0 NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    cost numeric(14,2),
    is_taxable boolean DEFAULT false NOT NULL,
    source_proposal_item_id uuid,
    source_package_id uuid,
    qbo_item_id text,
    qbo_tax_code_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_line_items_item_kind_check CHECK ((item_kind = ANY (ARRAY['service'::text, 'rental'::text, 'talent'::text, 'fee'::text, 'discount'::text, 'tax_line'::text])))
);

ALTER TABLE ONLY finance.invoice_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN invoice_line_items.source_proposal_item_id; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON COLUMN finance.invoice_line_items.source_proposal_item_id IS 'Lineage reference. NOT a foreign key — proposal items are mutable and can be deleted during negotiation. Invoice lines are legal snapshots and must survive source deletion.';


--
-- Name: invoice_number_sequences; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.invoice_number_sequences (
    workspace_id uuid NOT NULL,
    prefix text DEFAULT 'INV-'::text NOT NULL,
    next_value bigint DEFAULT 1000 NOT NULL,
    pad_width integer DEFAULT 4 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY finance.invoice_number_sequences FORCE ROW LEVEL SECURITY;


--
-- Name: payments; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    failure_reason text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    reference text,
    notes text,
    attachment_storage_path text,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    qbo_payment_id text,
    qbo_sync_token text,
    qbo_last_sync_at timestamp with time zone,
    qbo_last_error text,
    qbo_sync_status text DEFAULT 'not_synced'::text NOT NULL,
    parent_payment_id uuid,
    recorded_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['stripe_card'::text, 'stripe_ach'::text, 'check'::text, 'wire'::text, 'cash'::text, 'bill_dot_com'::text, 'other'::text]))),
    CONSTRAINT payments_qbo_sync_status_check CHECK ((qbo_sync_status = ANY (ARRAY['not_synced'::text, 'queued'::text, 'in_progress'::text, 'synced'::text, 'failed'::text, 'dead_letter'::text, 'excluded_pre_connection'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text])))
);

ALTER TABLE ONLY finance.payments FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE payments; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.payments IS 'First-class payment ledger. Invoices have many payments (deposit + final, partial pays, refunds as negative siblings). Never edited after creation — corrections are new rows. Sole write path is finance.record_payment() RPC defined in Migration 4.';


--
-- Name: qbo_connections; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.qbo_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    realm_id text NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    access_token_secret_id uuid NOT NULL,
    refresh_token_secret_id uuid NOT NULL,
    access_token_expires_at timestamp with time zone NOT NULL,
    refresh_token_expires_at timestamp with time zone NOT NULL,
    last_refreshed_at timestamp with time zone,
    default_item_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_tax_code_id text,
    default_income_account_id text,
    default_deposit_account_id text,
    connected_by_user_id uuid,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    last_sync_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qbo_connections_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))),
    CONSTRAINT qbo_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'needs_reconsent'::text, 'revoked'::text])))
);

ALTER TABLE ONLY finance.qbo_connections FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE qbo_connections; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.qbo_connections IS 'One QuickBooks realm per workspace. Tokens stored via Supabase Vault — only the secret IDs live here. Documented limitation: multi-book production companies (LLC + S-corp) must create a second Unusonic workspace.';


--
-- Name: COLUMN qbo_connections.default_item_ids; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON COLUMN finance.qbo_connections.default_item_ids IS 'JSONB map of item_kind → QBO Item.Id. Populated by OAuth wizard with 5 default items (service, rental, talent, fee, discount). Linda gets 5 meaningful Sales by Item rows on day one, not one collapsed row.';


--
-- Name: qbo_entity_map; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.qbo_entity_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    local_type text NOT NULL,
    local_id uuid NOT NULL,
    qbo_type text NOT NULL,
    qbo_id text NOT NULL,
    qbo_sync_token text NOT NULL,
    last_hash text,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qbo_entity_map_local_type_check CHECK ((local_type = ANY (ARRAY['entity'::text, 'invoice'::text, 'payment'::text, 'item'::text, 'tax_rate'::text, 'bill'::text, 'bill_payment'::text]))),
    CONSTRAINT qbo_entity_map_qbo_type_check CHECK ((qbo_type = ANY (ARRAY['Customer'::text, 'Invoice'::text, 'Payment'::text, 'Item'::text, 'TaxCode'::text, 'Bill'::text, 'BillPayment'::text])))
);

ALTER TABLE ONLY finance.qbo_entity_map FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE qbo_entity_map; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.qbo_entity_map IS 'Universal join between Unusonic entities and QBO objects. Customer mapping never uses fuzzy matching — only exact display_name match for auto-link, otherwise explicit user choice (modal for ambiguous, chip for unmatched). Prevents the HoneyBook duplicate-customer trap.';


--
-- Name: qbo_sync_log; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.qbo_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    local_type text NOT NULL,
    local_id uuid NOT NULL,
    qbo_type text,
    qbo_id text,
    operation text NOT NULL,
    direction text DEFAULT 'push'::text NOT NULL,
    request_id text NOT NULL,
    qbo_response_status integer,
    qbo_response_body jsonb,
    error_code text,
    error_message text,
    duration_ms integer,
    attempt_number integer DEFAULT 1 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT qbo_sync_log_direction_check CHECK ((direction = ANY (ARRAY['push'::text, 'pull'::text]))),
    CONSTRAINT qbo_sync_log_operation_check CHECK ((operation = ANY (ARRAY['create'::text, 'update'::text, 'void'::text, 'delete'::text, 'query'::text, 'oauth_refresh'::text])))
);

ALTER TABLE ONLY finance.qbo_sync_log FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE qbo_sync_log; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.qbo_sync_log IS 'Append-only audit log of every QBO API call. This is Linda''s debugging lifeline. Clickable from the sync status chip on any invoice. 1-year rolling retention via cleanup cron added in Wave 2.';


--
-- Name: COLUMN qbo_sync_log.request_id; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON COLUMN finance.qbo_sync_log.request_id IS 'Deterministic Intuit RequestId derived from sha256(workspace_id || local_type || local_id || operation || attempt_version). Same RequestId on retry causes Intuit to return cached response — single most important defense against duplicate-invoice creation.';


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.stripe_webhook_events (
    stripe_event_id text NOT NULL,
    source text NOT NULL,
    event_type text NOT NULL,
    workspace_id uuid,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processing_error text,
    CONSTRAINT stripe_webhook_events_source_check CHECK ((source = ANY (ARRAY['client_billing'::text, 'subscription'::text])))
);

ALTER TABLE ONLY finance.stripe_webhook_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE stripe_webhook_events; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.stripe_webhook_events IS 'Idempotency dedup for the split Stripe webhook routes (client-billing and subscription). PRIMARY KEY on stripe_event_id makes ON CONFLICT DO NOTHING the canonical first-line check. workspace_id resolved before insert per Critic §4c — never insert with NULL workspace_id then patch later.';


--
-- Name: sync_jobs; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    job_kind text NOT NULL,
    local_id uuid NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    attempt_number integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    request_id text,
    depends_on_job_id uuid,
    leased_by text,
    leased_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_jobs_job_kind_check CHECK ((job_kind = ANY (ARRAY['push_customer'::text, 'push_item'::text, 'push_tax_code'::text, 'push_invoice'::text, 'push_payment'::text, 'void_invoice'::text, 'refund_payment'::text, 'oauth_refresh'::text, 'backfill_retry'::text]))),
    CONSTRAINT sync_jobs_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'in_progress'::text, 'succeeded'::text, 'failed'::text, 'dead_letter'::text, 'pending_mapping'::text])))
);

ALTER TABLE ONLY finance.sync_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE sync_jobs; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.sync_jobs IS 'QBO push worker queue. Per-workspace concurrency limit (1 in-flight job per workspace) prevents Intuit rate-limit collisions. Exponential backoff [1m, 5m, 30m, 2h, 12h]. Attempt 6+ enters dead_letter state with persistent dashboard banner and admin email.';


--
-- Name: tax_rates; Type: TABLE; Schema: finance; Owner: -
--

CREATE TABLE finance.tax_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    rate numeric(8,6) NOT NULL,
    jurisdiction text,
    qbo_tax_code_id text,
    is_default boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_rates_rate_check CHECK (((rate >= (0)::numeric) AND (rate < (1)::numeric)))
);

ALTER TABLE ONLY finance.tax_rates FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE tax_rates; Type: COMMENT; Schema: finance; Owner: -
--

COMMENT ON TABLE finance.tax_rates IS 'Workspace-scoped tax rates. v1 only uses is_default. Wave 2 introduces a per-invoice rate picker. public.workspaces.default_tax_rate column stays populated as the source-of-truth fallback.';


--
-- Name: events; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    title text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    venue_entity_id uuid,
    run_of_show_data jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    lifecycle_status text,
    status text DEFAULT 'planned'::text NOT NULL,
    internal_code text,
    confidentiality_level text,
    slug text,
    location_name text,
    location_address text,
    dates_load_in timestamp with time zone,
    dates_load_out timestamp with time zone,
    venue_name text,
    venue_address text,
    venue_google_maps_id text,
    logistics_dock_info text,
    logistics_power_info text,
    guest_count_expected integer,
    guest_count_actual integer,
    tech_requirements jsonb,
    compliance_docs jsonb,
    crm_probability numeric,
    crm_estimated_value numeric,
    lead_source text,
    notes text,
    actor text DEFAULT 'user'::text,
    updated_at timestamp with time zone DEFAULT now(),
    client_entity_id uuid,
    event_archetype text,
    deal_id uuid,
    show_day_contacts jsonb DEFAULT '[]'::jsonb,
    advancing_checklist jsonb DEFAULT '[]'::jsonb,
    wrap_report jsonb,
    ros_execution_state jsonb,
    client_portal_token text,
    show_started_at timestamp with time zone,
    show_ended_at timestamp with time zone,
    archived_at timestamp with time zone,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    diverged_from_series_at timestamp with time zone,
    unit_price_snapshot numeric(14,2),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'archived'::text]))),
    CONSTRAINT events_timezone_iana CHECK (((timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$'::text) OR (timezone = 'UTC'::text)))
);


--
-- Name: TABLE events; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.events IS 'Single source of truth for all events. Absorbs legacy public.events. Workspace scoped via workspace_id (direct gigs) or project_id→ops.projects (crystallized deals). client_id FK to public.organizations is transitional — removed in orgs→directory.entities migration.';


--
-- Name: COLUMN events.workspace_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.workspace_id IS 'Direct workspace scope. Set for gigs created without a project. NULL for crystallized events (use project_id→projects.workspace_id).';


--
-- Name: COLUMN events.lifecycle_status; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.lifecycle_status IS 'CRM pipeline stage: lead → tentative → confirmed → production → live → post → archived.';


--
-- Name: COLUMN events.client_entity_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.client_entity_id IS 'FK to directory.entities. The client/buyer for this event. Replaced transitional client_id → public.organizations FK.';


--
-- Name: COLUMN events.event_archetype; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.event_archetype IS 'Event type classification copied from deals.event_archetype on handover. Values: wedding, corporate_gala, product_launch, private_dinner (extensible).';


--
-- Name: COLUMN events.deal_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.deal_id IS 'Back-reference to the originating deal. Set during handoff.';


--
-- Name: COLUMN events.show_day_contacts; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.show_day_contacts IS 'Show-day contacts: [{role, name, phone, email}]. Edited inline on Plan tab.';


--
-- Name: COLUMN events.advancing_checklist; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.advancing_checklist IS 'Advancing checklist items. Each: {id, label, done, done_by, done_at, auto_key, sort_order}';


--
-- Name: COLUMN events.wrap_report; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.wrap_report IS 'Post-show wrap report: {actual_crew_hours, gear_condition_notes, venue_notes, client_feedback, completed_at, completed_by}';


--
-- Name: COLUMN events.ros_execution_state; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.ros_execution_state IS 'Live run-of-show execution state. NULL when not live. Set by startShow/endShow actions.';


--
-- Name: COLUMN events.client_portal_token; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.client_portal_token IS 'Token for public client event page. Nullable. Generated on first share. Phase 1 candidate for merger into client_portal_tokens family.';


--
-- Name: COLUMN events.show_started_at; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.show_started_at IS 'Set when the PM explicitly marks the show as started via markShowStarted. Audit trail — ops.events.status is the canonical lock signal.';


--
-- Name: COLUMN events.show_ended_at; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.show_ended_at IS 'Set when the PM explicitly marks the show as ended via markShowEnded. Null until show-end action. Editable from the wrap report (late-press scenarios).';


--
-- Name: COLUMN events.archived_at; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.events.archived_at IS 'Pass 3 Phase 4: set by markShowWrapped() in src/app/(dashboard)/(features)/crm/actions/mark-show-wrapped.ts. NULL = show is still in active piles (CRM Stream, Lobby, Follow-Up). NOT NULL = wrapped and removed from active surfaces. Finance / Venue history / Employee Portal pay history / cortex.memory explicitly do NOT filter by this column — see src/shared/lib/event-status/get-active-events-filter.ts for the allowlist.';


--
-- Name: CONSTRAINT events_status_check ON events; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON CONSTRAINT events_status_check ON ops.events IS 'Vocabulary for session-lifetime calculation (client-portal §14.7.1). Session expiry excludes cancelled and archived events.';


--
-- Name: projects; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    client_entity_id uuid,
    name text NOT NULL,
    status text DEFAULT 'lead'::text,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    deal_id uuid,
    is_series boolean DEFAULT false NOT NULL,
    series_rule jsonb,
    series_archetype text,
    series_crew_template jsonb,
    CONSTRAINT ops_projects_series_archetype_check CHECK (((series_archetype IS NULL) OR (series_archetype = ANY (ARRAY['residency'::text, 'tour'::text, 'run'::text, 'weekend'::text, 'custom'::text])))),
    CONSTRAINT ops_projects_series_rule_consistent CHECK ((((is_series = true) AND (series_rule IS NOT NULL)) OR ((is_series = false) AND (series_rule IS NULL))))
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    proposed_date date NOT NULL,
    event_archetype text,
    title text,
    organization_id uuid,
    main_contact_id uuid,
    status text DEFAULT 'inquiry'::text NOT NULL,
    budget_estimated numeric,
    notes text,
    venue_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid,
    proposed_start_time time without time zone,
    proposed_end_time time without time zone,
    venue_name text,
    preferred_crew jsonb,
    archived_at timestamp with time zone,
    owner_user_id uuid,
    lead_source text,
    lost_reason text,
    lost_to_competitor_name text,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    lead_source_id uuid,
    lead_source_detail text,
    referrer_entity_id uuid,
    owner_entity_id uuid,
    event_start_time text,
    event_end_time text,
    show_health jsonb,
    pipeline_id uuid,
    stage_id uuid,
    proposed_end_date date,
    compelling_event text,
    aion_proactive_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT deals_event_archetype_check CHECK (((event_archetype IS NULL) OR (event_archetype = ANY (ARRAY['wedding'::text, 'corporate_gala'::text, 'product_launch'::text, 'private_dinner'::text, 'concert'::text, 'festival'::text, 'conference'::text, 'awards_ceremony'::text, 'birthday_party'::text, 'fundraiser'::text, 'bar_mitzvah'::text, 'trade_show'::text, 'theater'::text, 'private_party'::text])))),
    CONSTRAINT deals_lost_reason_check CHECK ((lost_reason = ANY (ARRAY['budget'::text, 'competitor'::text, 'cancelled'::text, 'no_response'::text, 'scope'::text, 'timing'::text]))),
    CONSTRAINT deals_proposed_end_date_check CHECK (((proposed_end_date IS NULL) OR (proposed_end_date >= proposed_date))),
    CONSTRAINT deals_status_check CHECK ((status = ANY (ARRAY['working'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: COLUMN deals.proposed_start_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.proposed_start_time IS 'Proposed event start time (24h). Combined with proposed_date at deal handover to set ops.events.starts_at.';


--
-- Name: COLUMN deals.proposed_end_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.proposed_end_time IS 'Proposed event end time (24h). Combined with proposed_date at deal handover to set ops.events.ends_at.';


--
-- Name: COLUMN deals.venue_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.venue_name IS 'Free-text venue name. Set when venue_id is null (no directory entity selected) or mirrored from the linked entity display_name when venue_id is set.';


--
-- Name: COLUMN deals.preferred_crew; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.preferred_crew IS 'Array of {entity_id: uuid, display_name: string} — crew nominated at deal stage before event handoff.';


--
-- Name: COLUMN deals.event_start_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.event_start_time IS 'Event start time as HH:MM (24h). Combined with proposed_date at handoff to build ops.events.starts_at.';


--
-- Name: COLUMN deals.event_end_time; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.event_end_time IS 'Event end time as HH:MM (24h). Combined with proposed_date at handoff to build ops.events.ends_at.';


--
-- Name: COLUMN deals.show_health; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.show_health IS 'PM health status: { status: on_track|at_risk|blocked, note: string, updated_at: ISO, updated_by_name: string }';


--
-- Name: COLUMN deals.compelling_event; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.compelling_event IS 'Owner-entered "drop-dead reason" the client needs this deal closed by a specific date. Examples: "daughter''s wedding May 3", "company 10-yr anniversary gala", "tour kickoff".  Not a date itself (that lives on ops.events.starts_at); the WHY behind the date. Feeds Aion card voice when set. See docs/reference/aion-deal-card-unified-design.md Phase 7b.';


--
-- Name: COLUMN deals.aion_proactive_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.aion_proactive_enabled IS 'Per-deal kill toggle for proactive-line emission. False = no pinned-line generation. Evaluated inside cortex.emit_aion_proactive_line.';


--
-- Name: CONSTRAINT deals_status_check ON deals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT deals_status_check ON public.deals IS 'Phase 3i: public.deals.status is the denormalized kind of the current stage. Writers target stage_id; the BEFORE trigger sync_deal_status_from_stage derives status = stage.kind on every insert/update. The CHECK enforces that no path can set status to a legacy slug.';


--
-- Name: active_deals; Type: VIEW; Schema: ops; Owner: -
--

CREATE VIEW ops.active_deals WITH (security_invoker='true', security_barrier='true') AS
 SELECT d.id,
    d.workspace_id,
    d.proposed_date,
    d.event_archetype,
    d.title,
    d.organization_id,
    d.main_contact_id,
    d.status,
    d.budget_estimated,
    d.notes,
    d.venue_id,
    d.created_at,
    d.updated_at,
    d.event_id,
    d.proposed_start_time,
    d.proposed_end_time,
    d.venue_name,
    d.preferred_crew,
    d.archived_at,
    d.owner_user_id,
    d.lead_source,
    d.lost_reason,
    d.lost_to_competitor_name,
    d.won_at,
    d.lost_at,
    d.lead_source_id,
    d.lead_source_detail,
    d.referrer_entity_id,
    d.owner_entity_id,
    d.event_start_time,
    d.event_end_time,
    d.show_health,
    d.pipeline_id,
    d.stage_id,
    d.proposed_end_date
   FROM (public.deals d
     LEFT JOIN ops.projects p ON ((p.deal_id = d.id)))
  WHERE ((d.archived_at IS NULL) AND ((d.status = 'working'::text) OR ((d.status = 'won'::text) AND (( SELECT max(e.starts_at) AS max
           FROM ops.events e
          WHERE (e.project_id = p.id)) >= now()))));


--
-- Name: VIEW active_deals; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON VIEW ops.active_deals IS 'Working deals OR won deals with at least one future-dated event. security_invoker=true means callers see only their workspace rows via the underlying RLS. Used by CRM pipeline card, Today widget, and any surface that should exclude past-won/archived deals.';


--
-- Name: aion_write_log; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.aion_write_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid,
    tool_name text NOT NULL,
    deal_id uuid,
    artifact_ref jsonb DEFAULT '{}'::jsonb NOT NULL,
    input_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    drafted_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    executed_at timestamp with time zone,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aion_write_log_tool_name_check CHECK ((tool_name = ANY (ARRAY['send_reply'::text, 'schedule_followup'::text, 'update_narrative'::text])))
);


--
-- Name: assignments; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    entity_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'pending'::text,
    agreed_rate numeric DEFAULT 0,
    rate_type text DEFAULT 'flat'::text
);


--
-- Name: crew_assignments; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.crew_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    entity_id uuid,
    role text DEFAULT ''::text NOT NULL,
    assignee_name text,
    status text DEFAULT 'requested'::text NOT NULL,
    call_time_slot_id uuid,
    call_time_override timestamp with time zone,
    status_updated_at timestamp with time zone,
    status_updated_by text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_type text DEFAULT 'labor'::text NOT NULL,
    source_package_id uuid,
    quantity_index integer DEFAULT 0 NOT NULL,
    pay_rate numeric(10,2) DEFAULT NULL::numeric,
    pay_rate_type text DEFAULT 'flat'::text,
    scheduled_hours numeric(6,2),
    payment_status text DEFAULT 'pending'::text,
    payment_date timestamp with time zone,
    travel_stipend numeric,
    per_diem numeric,
    kit_fee numeric,
    overtime_hours numeric,
    overtime_rate numeric,
    bonus numeric,
    CONSTRAINT crew_assignments_booking_type_check CHECK ((booking_type = ANY (ARRAY['labor'::text, 'talent'::text]))),
    CONSTRAINT crew_assignments_pay_rate_type_check CHECK ((pay_rate_type = ANY (ARRAY['flat'::text, 'hourly'::text, 'daily'::text]))),
    CONSTRAINT crew_assignments_payment_status_check CHECK (((payment_status IS NULL) OR (payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'submitted'::text, 'approved'::text, 'processing'::text, 'paid'::text])))),
    CONSTRAINT crew_assignments_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'dispatched'::text])))
);


--
-- Name: COLUMN crew_assignments.scheduled_hours; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_assignments.scheduled_hours IS 'For hourly pay_rate_type: number of hours scheduled. NULL = use flat rate fallback.';


--
-- Name: crew_comms_log; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.crew_comms_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_crew_id uuid,
    event_id uuid,
    resend_message_id text,
    channel text NOT NULL,
    event_type text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    summary text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crew_comms_log_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'phone'::text, 'in_person'::text, 'portal'::text, 'system'::text]))),
    CONSTRAINT crew_comms_log_event_type_check CHECK ((event_type = ANY (ARRAY['day_sheet_sent'::text, 'day_sheet_delivered'::text, 'day_sheet_bounced'::text, 'schedule_update_sent'::text, 'schedule_update_delivered'::text, 'schedule_update_bounced'::text, 'manual_nudge_sent'::text, 'phone_call_logged'::text, 'note_added'::text, 'confirmation_received'::text, 'decline_received'::text, 'status_changed'::text, 'rate_changed'::text])))
);


--
-- Name: TABLE crew_comms_log; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.crew_comms_log IS 'Per-recipient comms history for crew on a deal. Written by compile-and-send-day-sheet (day_sheet_sent), the Resend webhook (day_sheet_delivered / day_sheet_bounced), and manual PM actions (phone_call_logged, note_added). Shape mirrors ops.follow_up_log so they can converge later.';


--
-- Name: crew_confirmation_tokens; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.crew_confirmation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    event_id uuid NOT NULL,
    crew_index integer,
    entity_id uuid,
    email text NOT NULL,
    role text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    used_at timestamp with time zone,
    action_taken text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assignment_id uuid,
    CONSTRAINT crew_confirmation_tokens_action_taken_check CHECK ((action_taken = ANY (ARRAY['confirmed'::text, 'declined'::text])))
);


--
-- Name: crew_equipment; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.crew_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    notes text,
    catalog_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status text DEFAULT 'approved'::text NOT NULL,
    photo_url text,
    verified_at timestamp with time zone,
    verified_by uuid,
    rejection_reason text,
    CONSTRAINT crew_equipment_category_check CHECK ((category = ANY (ARRAY['audio'::text, 'lighting'::text, 'video'::text, 'staging'::text, 'power'::text, 'misc'::text]))),
    CONSTRAINT crew_equipment_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
    CONSTRAINT crew_equipment_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT crew_equipment_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: TABLE crew_equipment; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.crew_equipment IS 'Structured equipment profiles per person entity per workspace. entity_id is a soft reference to directory.entities — Ghost Protocol compatible. Phase 2 of crew equipment tracking.';


--
-- Name: COLUMN crew_equipment.verification_status; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_equipment.verification_status IS 'pending/approved/rejected/expired. Default approved (zero friction). Workspaces with require_equipment_verification flip new items to pending.';


--
-- Name: COLUMN crew_equipment.photo_url; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_equipment.photo_url IS 'Supabase Storage path to equipment condition photo. Optional.';


--
-- Name: COLUMN crew_equipment.verified_at; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_equipment.verified_at IS 'When this item was last approved by an admin.';


--
-- Name: COLUMN crew_equipment.verified_by; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_equipment.verified_by IS 'User ID of the admin who approved this item.';


--
-- Name: COLUMN crew_equipment.rejection_reason; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.crew_equipment.rejection_reason IS 'Why the item was rejected (shown to crew member in portal).';


--
-- Name: crew_skills; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.crew_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    skill_tag text NOT NULL,
    proficiency public.skill_level,
    hourly_rate numeric(10,2),
    verified boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crew_skills_skill_tag_check CHECK (((char_length(skill_tag) >= 1) AND (char_length(skill_tag) <= 120)))
);


--
-- Name: TABLE crew_skills; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.crew_skills IS 'Normalized skill tags per person entity per workspace. Replaces public.talent_skills (keyed to dropped org_members). entity_id is a soft reference to directory.entities — Ghost Protocol.';


--
-- Name: daily_briefings; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.daily_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    facts_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: day_sheet_tokens; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.day_sheet_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    deal_crew_id uuid,
    entity_id uuid,
    email text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deal_activity_log; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    pipeline_stage_id uuid,
    actor_user_id uuid,
    actor_kind text NOT NULL,
    trigger_type text,
    action_summary text NOT NULL,
    status text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    undo_token text,
    undone_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_activity_log_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'webhook'::text, 'system'::text, 'aion'::text]))),
    CONSTRAINT deal_activity_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'pending'::text, 'undone'::text])))
);


--
-- Name: TABLE deal_activity_log; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.deal_activity_log IS 'Append-only audit trail for trigger side effects surfaced on the Deal Lens. Service role writes via ops.log_deal_activity(). Authenticated users SELECT only.';


--
-- Name: deal_crew; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_crew (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    entity_id uuid,
    role_note text,
    source text NOT NULL,
    catalog_item_id uuid,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatch_status text,
    call_time text,
    call_time_slot_id text,
    arrival_location text,
    day_rate numeric,
    notes text,
    department text,
    declined_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    payment_status text DEFAULT 'pending'::text,
    payment_date timestamp with time zone,
    travel_stipend numeric,
    per_diem numeric,
    kit_fee numeric,
    brings_own_gear boolean DEFAULT false NOT NULL,
    gear_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    event_id uuid,
    CONSTRAINT deal_crew_dispatch_status_check CHECK ((dispatch_status = ANY (ARRAY['standby'::text, 'en_route'::text, 'on_site'::text, 'wrapped'::text]))),
    CONSTRAINT deal_crew_entity_or_role_required CHECK (((entity_id IS NOT NULL) OR ((role_note IS NOT NULL) AND (role_note <> ''::text)))),
    CONSTRAINT deal_crew_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'proposal'::text]))),
    CONSTRAINT deal_crew_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'offered'::text, 'tentative'::text, 'confirmed'::text, 'declined'::text, 'replaced'::text])))
);


--
-- Name: COLUMN deal_crew.dispatch_status; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.dispatch_status IS 'Ops dispatch status. NULL = not yet dispatched.';


--
-- Name: COLUMN deal_crew.call_time; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.call_time IS 'HH:MM call time for this crew member.';


--
-- Name: COLUMN deal_crew.call_time_slot_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.call_time_slot_id IS 'References run_of_show_data.call_time_slots[].id for named call time groups.';


--
-- Name: COLUMN deal_crew.arrival_location; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.arrival_location IS 'Where this crew member should arrive (e.g. "Loading dock B").';


--
-- Name: COLUMN deal_crew.brings_own_gear; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.brings_own_gear IS 'Whether this crew member supplies their own equipment for this assignment.';


--
-- Name: COLUMN deal_crew.gear_notes; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.gear_notes IS 'Freeform notes about what equipment this crew member is bringing.';


--
-- Name: COLUMN deal_crew.event_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_crew.event_id IS 'Event-scoped crew assignment. NULL only during the pre-backfill window; every row after migration 20260421000000 must point to an event.';


--
-- Name: deal_crew_waypoints; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_crew_waypoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_crew_id uuid NOT NULL,
    kind text NOT NULL,
    custom_label text,
    "time" text NOT NULL,
    location_name text,
    location_address text,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    actual_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_crew_waypoints_custom_label_check CHECK ((((kind = 'custom'::text) AND (custom_label IS NOT NULL) AND (length(TRIM(BOTH FROM custom_label)) > 0)) OR ((kind <> 'custom'::text) AND (custom_label IS NULL)))),
    CONSTRAINT deal_crew_waypoints_kind_check CHECK ((kind = ANY (ARRAY['truck_pickup'::text, 'gear_pickup'::text, 'depart'::text, 'venue_arrival'::text, 'setup'::text, 'set_by'::text, 'doors'::text, 'wrap'::text, 'custom'::text]))),
    CONSTRAINT deal_crew_waypoints_time_check CHECK (("time" ~ '^[0-2][0-9]:[0-5][0-9]$'::text))
);


--
-- Name: TABLE deal_crew_waypoints; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.deal_crew_waypoints IS 'Per-person time waypoints for a crew assignment. Feeds the rail Times stack, day sheet waypoint table, and the future weekly production schedule. Distinct from event-level call_time_slots which are shared across crew.';


--
-- Name: deal_notes; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    pinned_at timestamp with time zone,
    phase_tag text DEFAULT 'general'::text,
    CONSTRAINT deal_notes_phase_tag_check CHECK ((phase_tag = ANY (ARRAY['deal'::text, 'plan'::text, 'ledger'::text, 'general'::text])))
);


--
-- Name: TABLE deal_notes; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.deal_notes IS 'Timestamped diary entries per deal. Each note is attributed to the author and immutable after creation (updates allowed for typo fixes only).';


--
-- Name: COLUMN deal_notes.phase_tag; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_notes.phase_tag IS 'Which phase this note pertains to. Enables filtering in shared diary.';


--
-- Name: deal_stakeholders; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_stakeholders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deal_id uuid NOT NULL,
    organization_id uuid,
    entity_id uuid,
    role public.deal_stakeholder_role DEFAULT 'bill_to'::public.deal_stakeholder_role NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    display_order smallint,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_stakeholders_node_check CHECK ((((organization_id IS NOT NULL) AND (entity_id IS NULL)) OR ((organization_id IS NULL) AND (entity_id IS NOT NULL)) OR ((organization_id IS NOT NULL) AND (entity_id IS NOT NULL))))
);


--
-- Name: TABLE deal_stakeholders; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.deal_stakeholders IS 'Multi-party roles on a deal: bill_to, planner, venue_contact, vendor. Enables referral value and split invoicing.';


--
-- Name: COLUMN deal_stakeholders.organization_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_stakeholders.organization_id IS 'Network node: the organization. Soft ref — resolved via directory.entities.legacy_org_id.';


--
-- Name: COLUMN deal_stakeholders.entity_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_stakeholders.entity_id IS 'Contact node: the person at that org. Soft ref — resolved via directory.entities.legacy_entity_id.';


--
-- Name: COLUMN deal_stakeholders.display_order; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_stakeholders.display_order IS 'Order within a role group on the deal People strip. Lower = leftmost. NULL = unspecified (renders alphabetical).';


--
-- Name: COLUMN deal_stakeholders.added_at; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_stakeholders.added_at IS 'Chronological audit of when this stakeholder was attached. Distinct from created_at on the deal itself.';


--
-- Name: follow_up_log; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.follow_up_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    actor_user_id uuid,
    action_type text NOT NULL,
    channel text,
    summary text,
    content text,
    queue_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    draft_original text,
    edit_classification text,
    edit_distance numeric,
    CONSTRAINT follow_up_log_action_type_check CHECK ((action_type = ANY (ARRAY['email_sent'::text, 'sms_sent'::text, 'call_logged'::text, 'snoozed'::text, 'dismissed'::text, 'note_added'::text, 'system_queued'::text, 'system_removed'::text, 'reply_received'::text]))),
    CONSTRAINT follow_up_log_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'call'::text, 'manual'::text, 'system'::text]))),
    CONSTRAINT follow_up_log_edit_classification_check CHECK ((edit_classification = ANY (ARRAY['approved_unchanged'::text, 'light_edit'::text, 'heavy_edit'::text, 'rejected'::text])))
);


--
-- Name: message_threads; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.message_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider_thread_key text NOT NULL,
    channel text NOT NULL,
    subject text,
    deal_id uuid,
    primary_entity_id uuid,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    unread_by_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    needs_resolution boolean DEFAULT false NOT NULL,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_threads_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'call_note'::text])))
);


--
-- Name: TABLE message_threads; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.message_threads IS 'Conversation boundary for ops.messages. Keyed on RFC 2822 Message-ID root (email) or Twilio conversation_sid (SMS). One deal may carry many threads.';


--
-- Name: messages; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    direction text NOT NULL,
    channel text NOT NULL,
    provider_message_id text,
    in_reply_to uuid,
    from_entity_id uuid,
    from_address text NOT NULL,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    body_text text,
    body_html text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    sent_by_user_id uuid,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    bounced_at timestamp with time zone,
    replied_at timestamp with time zone,
    urgency_keyword_match text,
    ai_classification text,
    ai_summary text,
    hide_from_portal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT messages_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'call_note'::text]))),
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);


--
-- Name: TABLE messages; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.messages IS 'Individual message events (inbound + outbound) on ops.message_threads. provider_message_id UNIQUE enforces webhook idempotency - retries on the same provider ID are no-ops.';


--
-- Name: deal_timeline_v; Type: VIEW; Schema: ops; Owner: -
--

CREATE VIEW ops.deal_timeline_v WITH (security_invoker='true') AS
 SELECT al.id,
    'activity'::text AS source,
    al.workspace_id,
    al.deal_id,
    al.actor_kind,
    al.actor_user_id,
    al.action_summary,
    al.status,
    al.error_message,
    al.trigger_type,
    NULL::text AS action_type,
    NULL::text AS channel,
    al.undo_token,
    al.undone_at,
    al.metadata,
    al.created_at
   FROM ops.deal_activity_log al
UNION ALL
 SELECT fl.id,
    'follow_up'::text AS source,
    fl.workspace_id,
    fl.deal_id,
        CASE
            WHEN (fl.channel = 'system'::text) THEN 'system'::text
            WHEN (fl.actor_user_id IS NOT NULL) THEN 'user'::text
            ELSE 'system'::text
        END AS actor_kind,
    fl.actor_user_id,
    COALESCE(fl.summary, fl.action_type) AS action_summary,
    'success'::text AS status,
    NULL::text AS error_message,
    NULL::text AS trigger_type,
    fl.action_type,
    fl.channel,
    NULL::text AS undo_token,
    NULL::timestamp with time zone AS undone_at,
    jsonb_build_object('content', fl.content, 'queue_item_id', fl.queue_item_id, 'edit_classification', fl.edit_classification, 'edit_distance', fl.edit_distance) AS metadata,
    fl.created_at
   FROM ops.follow_up_log fl
UNION ALL
 SELECT m.id,
    'message'::text AS source,
    m.workspace_id,
    mt.deal_id,
        CASE
            WHEN (m.direction = 'inbound'::text) THEN 'client'::text
            WHEN (m.sent_by_user_id IS NOT NULL) THEN 'user'::text
            ELSE 'system'::text
        END AS actor_kind,
    m.sent_by_user_id AS actor_user_id,
        CASE
            WHEN (m.direction = 'inbound'::text) THEN
            CASE m.channel
                WHEN 'email'::text THEN 'Received email'::text
                WHEN 'sms'::text THEN 'Received text message'::text
                ELSE 'Received message'::text
            END
            ELSE
            CASE m.channel
                WHEN 'email'::text THEN 'Sent email'::text
                WHEN 'sms'::text THEN 'Sent text message'::text
                ELSE 'Sent message'::text
            END
        END AS action_summary,
    'success'::text AS status,
    NULL::text AS error_message,
    NULL::text AS trigger_type,
        CASE
            WHEN ((m.direction = 'inbound'::text) AND (m.channel = 'email'::text)) THEN 'email_received'::text
            WHEN ((m.direction = 'inbound'::text) AND (m.channel = 'sms'::text)) THEN 'sms_received'::text
            WHEN ((m.direction = 'outbound'::text) AND (m.channel = 'email'::text)) THEN 'email_sent'::text
            WHEN ((m.direction = 'outbound'::text) AND (m.channel = 'sms'::text)) THEN 'sms_sent'::text
            ELSE NULL::text
        END AS action_type,
    m.channel,
    NULL::text AS undo_token,
    NULL::timestamp with time zone AS undone_at,
    jsonb_build_object('message_id', m.id, 'thread_id', m.thread_id, 'direction', m.direction, 'subject', mt.subject, 'from_address', m.from_address, 'from_entity_id', m.from_entity_id, 'body_preview', "left"(COALESCE(m.body_text, ''::text), 160), 'urgency_keyword_match', m.urgency_keyword_match, 'ai_classification', m.ai_classification) AS metadata,
    m.created_at
   FROM (ops.messages m
     JOIN ops.message_threads mt ON ((mt.id = m.thread_id)))
  WHERE (mt.deal_id IS NOT NULL);


--
-- Name: VIEW deal_timeline_v; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON VIEW ops.deal_timeline_v IS 'Unified chronological stream for the Deal Lens Timeline card. Unions ops.deal_activity_log, ops.follow_up_log, and ops.messages (thread-bound to a deal). Base tables unchanged; security_invoker=true respects caller RLS.';


--
-- Name: deal_transitions; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.deal_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    from_stage_id uuid,
    to_stage_id uuid NOT NULL,
    actor_user_id uuid,
    actor_kind text NOT NULL,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    triggers_dispatched_at timestamp with time zone,
    triggers_failed_at timestamp with time zone,
    triggers_error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    triggers_snapshot jsonb,
    suggestion_insight_id uuid,
    CONSTRAINT deal_transitions_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'webhook'::text, 'system'::text, 'aion'::text])))
);


--
-- Name: TABLE deal_transitions; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.deal_transitions IS 'Append-only audit + trigger-firing signal. Service role writes via RPC. Dispatcher watches triggers_dispatched_at IS NULL rows.';


--
-- Name: COLUMN deal_transitions.triggers_snapshot; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_transitions.triggers_snapshot IS 'Snapshot of the target stage''s triggers JSONB at transition time. claim_pending_transitions returns COALESCE(t.triggers_snapshot, s.triggers) so live edits to stage config do not rewrite in-flight transitions. Read-by-row-id only — do NOT add a GIN or btree index here.';


--
-- Name: COLUMN deal_transitions.suggestion_insight_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.deal_transitions.suggestion_insight_id IS 'When set, records the cortex.aion_insights row that motivated this transition (Aion suggestion accepted). actor_kind still reflects who clicked (usually user); suggestion_insight_id is the provenance layer. Set via session GUC unusonic.aion_suggestion_id by ops.record_deal_transition_with_actor.';


--
-- Name: domain_events; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.domain_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_id uuid NOT NULL,
    type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT domain_events_type_check CHECK ((type = ANY (ARRAY['show.created'::text, 'show.started'::text, 'show.ended'::text, 'show.wrapped'::text])))
);


--
-- Name: TABLE domain_events; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.domain_events IS 'Append-only log of show lifecycle events. Four types: show.created (handover), show.started, show.ended, show.wrapped. Adding a fifth requires a design-doc update and explicit approval per Pass 3 Visionary risk #4.';


--
-- Name: entity_capabilities; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.entity_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    capability text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_capabilities_capability_check CHECK (((char_length(capability) >= 1) AND (char_length(capability) <= 120)))
);


--
-- Name: entity_crew_schedule; Type: VIEW; Schema: ops; Owner: -
--

CREATE VIEW ops.entity_crew_schedule WITH (security_invoker='true') AS
 SELECT ca.id AS assignment_id,
    ca.entity_id,
    ca.event_id,
    ca.role,
    ca.status,
    ca.assignee_name,
    ca.call_time_slot_id,
    ca.call_time_override,
    ca.workspace_id,
    ca.pay_rate,
    ca.pay_rate_type,
    ca.scheduled_hours,
    ca.payment_status,
    ca.payment_date,
    ca.travel_stipend,
    ca.per_diem,
    ca.kit_fee,
    ca.overtime_hours,
    ca.overtime_rate,
    ca.bonus,
    e.title AS event_title,
    e.starts_at,
    e.ends_at,
    e.venue_name,
    e.venue_address,
    e.location_address,
    e.deal_id,
    e.event_archetype
   FROM (ops.crew_assignments ca
     JOIN ops.events e ON ((e.id = ca.event_id)));


--
-- Name: event_expenses; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.event_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_id uuid NOT NULL,
    label text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    vendor_entity_id uuid,
    paid_at date,
    payment_type text DEFAULT 'other'::text NOT NULL,
    note text,
    qbo_purchase_id text,
    qbo_account_id text,
    qbo_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_gear_items; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.event_gear_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    catalog_package_id uuid,
    is_sub_rental boolean DEFAULT false NOT NULL,
    status_updated_at timestamp with time zone,
    status_updated_by text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department text,
    operator_entity_id uuid,
    sub_rental_supplier_id uuid,
    history jsonb DEFAULT '[]'::jsonb,
    source text DEFAULT 'company'::text NOT NULL,
    supplied_by_entity_id uuid,
    kit_fee numeric,
    CONSTRAINT chk_crew_source_entity CHECK (((source <> 'crew'::text) OR (supplied_by_entity_id IS NOT NULL))),
    CONSTRAINT event_gear_items_source_check CHECK ((source = ANY (ARRAY['company'::text, 'crew'::text, 'subrental'::text])))
);


--
-- Name: COLUMN event_gear_items.department; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.event_gear_items.department IS 'Production department for pull sheet grouping (e.g. Audio, Lighting, Video, Staging, Power, Backline). NULL = General.';


--
-- Name: COLUMN event_gear_items.source; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.event_gear_items.source IS 'Where gear comes from: company (warehouse), crew (freelancer kit), subrental (third-party rental).';


--
-- Name: COLUMN event_gear_items.supplied_by_entity_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.event_gear_items.supplied_by_entity_id IS 'Person entity who supplies this gear. Required when source=crew.';


--
-- Name: COLUMN event_gear_items.kit_fee; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.event_gear_items.kit_fee IS 'Fee paid to crew member for using their own equipment. Only relevant when source=crew.';


--
-- Name: follow_up_queue; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.follow_up_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    priority_score numeric DEFAULT 0 NOT NULL,
    reason text NOT NULL,
    reason_type text NOT NULL,
    suggested_action text,
    suggested_channel text,
    context_snapshot jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    snoozed_until timestamp with time zone,
    acted_at timestamp with time zone,
    acted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    follow_up_category text DEFAULT 'sales'::text NOT NULL,
    hide_from_portal boolean DEFAULT true NOT NULL,
    escalation_count integer DEFAULT 0 NOT NULL,
    last_escalated_at timestamp with time zone,
    priority_ceiling numeric DEFAULT 100 NOT NULL,
    dismissal_reason text,
    originating_stage_id uuid,
    originating_transition_id uuid,
    primitive_key text,
    superseded_at timestamp with time zone,
    linked_insight_id uuid,
    CONSTRAINT follow_up_queue_category_check CHECK ((follow_up_category = ANY (ARRAY['sales'::text, 'ops'::text, 'nurture'::text]))),
    CONSTRAINT follow_up_queue_dismissal_reason_check CHECK (((dismissal_reason IS NULL) OR (dismissal_reason = ANY (ARRAY['tire_kicker'::text, 'wrong_timing'::text, 'manual_nudge_sent'::text, 'not_ready'::text, 'other'::text])))),
    CONSTRAINT follow_up_queue_reason_type_check CHECK ((reason_type = ANY (ARRAY['stall'::text, 'engagement_hot'::text, 'deadline_proximity'::text, 'no_owner'::text, 'no_activity'::text, 'proposal_unseen'::text, 'proposal_bounced'::text, 'proposal_sent'::text, 'date_hold_pressure'::text, 'nudge_client'::text, 'check_in'::text, 'gone_quiet'::text, 'thank_you'::text]))),
    CONSTRAINT follow_up_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'acted'::text, 'snoozed'::text, 'dismissed'::text])))
);


--
-- Name: COLUMN follow_up_queue.linked_insight_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.follow_up_queue.linked_insight_id IS 'Historical breadcrumb: the cortex.aion_insights row that preceded this follow-up, if any. Stamped by the enroll_in_follow_up primitive. ON DELETE SET NULL only fires on row DELETE — resolution (status=resolved) does NOT clear the link. Liveness is enforced at read time via status filter. See docs/reference/aion-deal-card-unified-design.md §8.3a.';


--
-- Name: kit_templates; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.kit_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    role_tag text NOT NULL,
    name text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kit_templates_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
    CONSTRAINT kit_templates_role_tag_check CHECK (((char_length(role_tag) >= 1) AND (char_length(role_tag) <= 120)))
);


--
-- Name: TABLE kit_templates; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.kit_templates IS 'Role-based expected equipment lists. Each template defines items a crew member should own for a given role_tag. items is a JSONB array.';


--
-- Name: message_channel_identities; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.message_channel_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    identity_address text NOT NULL,
    provider text NOT NULL,
    provider_credential_ref text,
    verified_at timestamp with time zone,
    is_private boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_channel_identities_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
    CONSTRAINT message_channel_identities_provider_check CHECK ((provider = ANY (ARRAY['resend'::text, 'twilio'::text, 'gmail_oauth'::text, 'microsoft_graph'::text])))
);


--
-- Name: TABLE message_channel_identities; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.message_channel_identities IS 'Per-user (or workspace-shared) connected message identities. is_private gates the cross-deal Entity Messages view only; deal-scoped messages remain workspace-visible regardless. Default is_private=false.';


--
-- Name: pipeline_stages; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    label text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer NOT NULL,
    kind text NOT NULL,
    color_token text,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    rotting_days integer,
    requires_confirmation boolean DEFAULT false NOT NULL,
    opens_handoff_wizard boolean DEFAULT false NOT NULL,
    hide_from_portal boolean DEFAULT false NOT NULL,
    triggers jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipeline_stages_kind_check CHECK ((kind = ANY (ARRAY['working'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: TABLE pipeline_stages; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.pipeline_stages IS 'Stages within a pipeline. kind anchors behavior (working/won/lost); tags are stable semantic identifiers consumed by Aion, webhooks, and cron.';


--
-- Name: pipelines; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_default boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pipelines; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.pipelines IS 'Workspace-owned pipeline definitions. One is marked is_default per workspace. Part of Custom Pipelines (docs/reference/custom-pipelines-design.md).';


--
-- Name: portal_follow_up_queue; Type: VIEW; Schema: ops; Owner: -
--

CREATE VIEW ops.portal_follow_up_queue WITH (security_invoker='true', security_barrier='true') AS
 SELECT id,
    workspace_id,
    deal_id,
    priority_score,
    reason,
    reason_type,
    suggested_action,
    suggested_channel,
    context_snapshot,
    status,
    snoozed_until,
    acted_at,
    acted_by,
    created_at,
    follow_up_category,
    hide_from_portal,
    escalation_count,
    last_escalated_at,
    priority_ceiling,
    dismissal_reason,
    originating_stage_id,
    originating_transition_id,
    primitive_key,
    superseded_at
   FROM ops.follow_up_queue q
  WHERE ((hide_from_portal = false) AND (superseded_at IS NULL) AND (status = 'pending'::text));


--
-- Name: VIEW portal_follow_up_queue; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON VIEW ops.portal_follow_up_queue IS 'Portal-safe subset of ops.follow_up_queue: only rows owners have flagged client-visible, not superseded, still pending. Portal routes should read from this view, not the raw table. security_invoker=true inherits caller RLS.';


--
-- Name: proposal_builder_events; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.proposal_builder_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    user_id uuid,
    session_id uuid NOT NULL,
    variant text NOT NULL,
    type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT proposal_builder_events_type_check CHECK ((type = ANY (ARRAY['session_start'::text, 'palette_open'::text, 'first_add'::text, 'add_success'::text, 'catalog_scroll'::text, 'row_reorder'::text]))),
    CONSTRAINT proposal_builder_events_variant_check CHECK ((variant = ANY (ARRAY['drag'::text, 'palette'::text])))
);


--
-- Name: TABLE proposal_builder_events; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.proposal_builder_events IS 'Phase 1 telemetry for the proposal-builder rebuild. Append-only. Capped at six event types — extensions require a design-doc update. Written via ops.record_proposal_builder_event().';


--
-- Name: workspace_call_time_rules; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_call_time_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    role_patterns text[] DEFAULT '{}'::text[] NOT NULL,
    entity_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    event_archetypes text[] DEFAULT '{}'::text[] NOT NULL,
    action_type text DEFAULT 'slot'::text NOT NULL,
    slot_label text,
    offset_minutes integer,
    priority integer DEFAULT 0 NOT NULL,
    apply_only_when_unset boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_call_time_rules_action_type_check CHECK ((action_type = ANY (ARRAY['slot'::text, 'offset'::text])))
);


--
-- Name: workspace_capability_presets; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_capability_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    capability text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_capability_presets_capability_check CHECK (((char_length(capability) >= 1) AND (char_length(capability) <= 120)))
);


--
-- Name: workspace_event_archetypes; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_event_archetypes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    slug text NOT NULL,
    label text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_event_archetypes_label_chk CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 80))),
    CONSTRAINT workspace_event_archetypes_slug_chk CHECK (((slug ~ '^[a-z0-9_]+$'::text) AND ((length(slug) >= 1) AND (length(slug) <= 80)))),
    CONSTRAINT workspace_event_archetypes_system_chk CHECK ((((is_system = true) AND (workspace_id IS NULL)) OR ((is_system = false) AND (workspace_id IS NOT NULL))))
);


--
-- Name: workspace_industry_tags; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_industry_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    tag text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_industry_tags_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80))),
    CONSTRAINT workspace_industry_tags_tag_check CHECK (((char_length(tag) >= 1) AND (char_length(tag) <= 80)))
);


--
-- Name: TABLE workspace_industry_tags; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_industry_tags IS 'Managed taxonomy for Network partner/vendor/venue sub-categories. Owner/admin controls the dictionary; all members use it via the IndustryTagPicker.';


--
-- Name: workspace_job_titles; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_job_titles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_job_titles_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: TABLE workspace_job_titles; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_job_titles IS 'Curated job title options per workspace. Owner/admin manages the list. Members select one of these titles so crew assignment filtering is exact rather than fuzzy freeform text matching.';


--
-- Name: workspace_lead_sources; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_lead_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    is_referral boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_lead_sources_category_check CHECK ((category = ANY (ARRAY['referral'::text, 'digital'::text, 'marketplace'::text, 'offline'::text, 'relationship'::text, 'custom'::text]))),
    CONSTRAINT workspace_lead_sources_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 120)))
);


--
-- Name: TABLE workspace_lead_sources; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_lead_sources IS 'Curated lead source options per workspace. Owner/admin manages the list. Deals reference these for structured lead tracking and referral attribution.';


--
-- Name: workspace_permissions; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL
);


--
-- Name: TABLE workspace_permissions; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_permissions IS 'Registry of all valid capability keys. Read-only; managed by migrations.';


--
-- Name: workspace_role_permissions; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: TABLE workspace_role_permissions; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_role_permissions IS 'Which permissions each role has. Normalized junction; no JSONB.';


--
-- Name: workspace_roles; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    workspace_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE workspace_roles; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_roles IS 'Role definitions: system (workspace_id NULL) or custom (workspace_id set). Permissions in ops.workspace_role_permissions.';


--
-- Name: COLUMN workspace_roles.workspace_id; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON COLUMN ops.workspace_roles.workspace_id IS 'NULL for system roles (Owner, Admin, Member, Observer); set for custom workspace roles.';


--
-- Name: workspace_ros_templates; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_ros_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    cues jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_skill_presets; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.workspace_skill_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    skill_tag text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_skill_presets_skill_tag_check CHECK (((char_length(skill_tag) >= 1) AND (char_length(skill_tag) <= 120)))
);


--
-- Name: TABLE workspace_skill_presets; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TABLE ops.workspace_skill_presets IS 'Curated skill tag quick-picks per workspace. Owner/admin can add or remove entries. Members see these as suggestions when tagging roster skills.';


--
-- Name: agent_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    persona public.user_persona NOT NULL,
    tier public.subscription_tier NOT NULL,
    xai_reasoning_enabled boolean DEFAULT true,
    agent_mode text DEFAULT 'assist'::text,
    modules_enabled text[] DEFAULT ARRAY['crm'::text, 'calendar'::text],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    organization_id uuid,
    CONSTRAINT agent_configs_agent_mode_check CHECK ((agent_mode = ANY (ARRAY['assist'::text, 'autonomous'::text, 'on_site'::text])))
);


--
-- Name: autonomous_resolutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autonomous_resolutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    agent_name text NOT NULL,
    task_type text NOT NULL,
    reasoning_chain jsonb,
    cost_cents integer DEFAULT 100,
    resolved_at timestamp with time zone DEFAULT now()
);


--
-- Name: bridge_device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bridge_device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_entity_id uuid NOT NULL,
    device_name text DEFAULT 'Unknown device'::text NOT NULL,
    token_hash text NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    local_session_nonce text,
    local_session_updated_at timestamp with time zone
);


--
-- Name: COLUMN bridge_device_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bridge_device_tokens.token_hash IS 'SHA-256 hex of the opaque device token. Tokens are generated by the web API as `unb_live_` + 32 random bytes (base64url) and never stored in plaintext.';


--
-- Name: COLUMN bridge_device_tokens.local_session_nonce; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bridge_device_tokens.local_session_nonce IS 'Per-launch nonce generated by the Bridge companion app on startup and posted to /api/bridge/local-session. Used by the portal to authenticate loopback API calls to 127.0.0.1:19433. Rotates on every Bridge restart.';


--
-- Name: COLUMN bridge_device_tokens.local_session_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bridge_device_tokens.local_session_updated_at IS 'When the Bridge companion last posted a fresh nonce. Used to pick the most recent device when multiple are paired.';


--
-- Name: bridge_pair_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bridge_pair_attempts (
    id bigint NOT NULL,
    client_ip inet NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bridge_pair_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bridge_pair_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bridge_pair_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bridge_pair_attempts_id_seq OWNED BY public.bridge_pair_attempts.id;


--
-- Name: bridge_pairing_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bridge_pairing_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_entity_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bridge_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bridge_sync_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_token_id uuid NOT NULL,
    event_id uuid NOT NULL,
    matched_count integer DEFAULT 0 NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    unmatched_songs jsonb DEFAULT '[]'::jsonb NOT NULL,
    bridge_version text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_portal_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_access_log (
    id bigint NOT NULL,
    session_id uuid,
    request_id text,
    entity_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    action text NOT NULL,
    actor_kind text NOT NULL,
    actor_id text,
    auth_method text,
    outcome text NOT NULL,
    ip inet,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_portal_access_log_action_check CHECK ((action = ANY (ARRAY['view'::text, 'sign'::text, 'pay'::text, 'download'::text, 'message'::text, 'aion_response'::text, 'claim_entity'::text, 'session_revoke'::text, 'otp_issue'::text, 'otp_verify'::text, 'magic_link_issue'::text, 'passkey_register'::text, 'passkey_auth'::text]))),
    CONSTRAINT client_portal_access_log_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['anonymous_token'::text, 'magic_link_session'::text, 'claimed_user'::text, 'service_role'::text]))),
    CONSTRAINT client_portal_access_log_auth_method_check CHECK ((auth_method = ANY (ARRAY['magic_link'::text, 'otp'::text, 'passkey'::text, 'session_cookie'::text, 'service_role'::text]))),
    CONSTRAINT client_portal_access_log_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'denied'::text, 'throttled'::text, 'error'::text, 'session_device_drift'::text]))),
    CONSTRAINT client_portal_access_log_resource_type_check CHECK ((resource_type = ANY (ARRAY['proposal'::text, 'invoice'::text, 'event'::text, 'portal_home'::text, 'document'::text, 'aion_query'::text, 'sign_in'::text, 'session'::text])))
);


--
-- Name: TABLE client_portal_access_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_portal_access_log IS 'SOC2-aligned audit log for all client portal access. Minimum 1-year retention floor per invariant §14.6(5). Entity-level FK intentionally omitted to preserve the log on entity deletion.';


--
-- Name: client_portal_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_portal_access_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_portal_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_portal_access_log_id_seq OWNED BY public.client_portal_access_log.id;


--
-- Name: client_portal_otp_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_otp_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    purpose text NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_portal_otp_challenges_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT client_portal_otp_challenges_code_hash_check CHECK ((char_length(code_hash) = 64)),
    CONSTRAINT client_portal_otp_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['magic_link_login'::text, 'step_up_sign'::text, 'step_up_pay'::text, 'step_up_download'::text, 'step_up_email_change'::text])))
);


--
-- Name: TABLE client_portal_otp_challenges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_portal_otp_challenges IS 'Short-lived OTP challenges for client portal step-up actions. 10-minute expiry, 5-attempt lockout per challenge, hashed at rest. Email is snapshotted at issue time (§15.2 edge case).';


--
-- Name: client_portal_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_rate_limits (
    id bigint NOT NULL,
    scope text NOT NULL,
    key text NOT NULL,
    action_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_portal_rate_limits_scope_check CHECK ((scope = ANY (ARRAY['magic_link_email'::text, 'magic_link_ip'::text, 'otp_attempt_email'::text, 'otp_attempt_ip'::text])))
);


--
-- Name: TABLE client_portal_rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_portal_rate_limits IS 'Sliding-window rate limit log for client portal public endpoints. Rows older than 48h are pruned by a daily cleanup job (delivered in session_rpcs migration). Per §15.6 rate-limit specification.';


--
-- Name: client_portal_rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_portal_rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_portal_rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_portal_rate_limits_id_seq OWNED BY public.client_portal_rate_limits.id;


--
-- Name: client_portal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    token_hash text NOT NULL,
    source_kind text NOT NULL,
    source_id uuid,
    device_id_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    last_used_ip inet,
    last_used_ua text,
    created_ip inet,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoked_reason text,
    CONSTRAINT client_portal_tokens_revoked_reason_check CHECK ((revoked_reason = ANY (ARRAY['client_logout'::text, 'vendor_kick'::text, 'email_changed'::text, 'source_revoked'::text, 'entity_archived'::text]))),
    CONSTRAINT client_portal_tokens_source_kind_check CHECK ((source_kind = ANY (ARRAY['proposal'::text, 'invoice'::text, 'event'::text, 'magic_link'::text]))),
    CONSTRAINT client_portal_tokens_token_hash_check CHECK ((char_length(token_hash) = 64))
);


--
-- Name: TABLE client_portal_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_portal_tokens IS 'Entity-scoped session tokens for the client portal. Event-lifetime TTL via compute_client_session_expiry(). Raw token is never stored — only SHA-256 hash (64 hex chars). See client-portal-design.md §14.1 and §14.7.';


--
-- Name: commercial_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commercial_organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.organization_type DEFAULT 'solo'::public.organization_type NOT NULL,
    subscription_tier public.subscription_tier DEFAULT 'foundation'::public.subscription_tier NOT NULL,
    pms_integration_enabled boolean DEFAULT false,
    signalpay_enabled boolean DEFAULT false,
    workspace_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    signed_at timestamp with time zone,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    guardian_email text NOT NULL,
    status public.guardian_status DEFAULT 'pending'::public.guardian_status,
    created_at timestamp with time zone DEFAULT now(),
    display_name text
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    created_by_org_id text,
    target_org_id text,
    email text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    type text DEFAULT 'employee_invite'::text,
    expires_at timestamp with time zone NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text]))),
    CONSTRAINT invitations_type_check CHECK ((type = ANY (ARRAY['employee_invite'::text, 'partner_summon'::text])))
);


--
-- Name: TABLE invitations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invitations IS 'Invitation tokens for employee and partner invite flows. Used by claim page and team invite actions.';


--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lobby_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lobby_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    source_preset_slug text,
    card_ids text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE lobby_layouts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lobby_layouts IS 'User-created Lobby layout customs. Presets are code-defined; see src/shared/lib/lobby-layouts/presets.ts. Replaces the persona-based user_lobby_layout.';


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: package_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_tags (
    package_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: TABLE package_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.package_tags IS 'Junction: packages <-> workspace_tags.';


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category public.package_category DEFAULT 'package'::public.package_category NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    target_cost numeric,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    definition jsonb,
    floor_price numeric,
    stock_quantity integer DEFAULT 0 NOT NULL,
    is_sub_rental boolean DEFAULT false NOT NULL,
    replacement_cost numeric,
    buffer_days integer DEFAULT 0 NOT NULL,
    unit_type text DEFAULT 'flat'::text NOT NULL,
    unit_multiplier numeric DEFAULT 1 NOT NULL,
    is_taxable boolean DEFAULT true NOT NULL,
    is_draft boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_packages_status CHECK ((NOT ((is_active = false) AND (is_draft = true)))),
    CONSTRAINT packages_buffer_days_check CHECK ((buffer_days >= 0)),
    CONSTRAINT packages_cost_check CHECK (((target_cost IS NULL) OR (target_cost >= (0)::numeric))),
    CONSTRAINT packages_floor_price_check CHECK (((floor_price IS NULL) OR (floor_price >= (0)::numeric))),
    CONSTRAINT packages_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT packages_replacement_cost_check CHECK (((replacement_cost IS NULL) OR (replacement_cost >= (0)::numeric))),
    CONSTRAINT packages_unit_multiplier_check CHECK ((unit_multiplier > (0)::numeric)),
    CONSTRAINT packages_unit_type_check CHECK ((unit_type = ANY (ARRAY['flat'::text, 'hour'::text, 'day'::text])))
);


--
-- Name: TABLE packages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.packages IS 'Catalog of packages for proposals (Deal Room).';


--
-- Name: COLUMN packages.target_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.target_cost IS 'Target cost (e.g. payout to talent); used for margin calc.';


--
-- Name: COLUMN packages.definition; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.definition IS 'Modular package content: { layout, blocks: [{ id, type, content }] }. Container (name, price, category) stays in columns.';


--
-- Name: COLUMN packages.floor_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.floor_price IS 'Lowest acceptable price before margin warnings (negotiation floor).';


--
-- Name: COLUMN packages.stock_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.stock_quantity IS 'Total units owned/available (rental). Used to block overbooking.';


--
-- Name: COLUMN packages.is_sub_rental; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.is_sub_rental IS 'When true, item is sourced from 3rd party; target cost = vendor rental cost.';


--
-- Name: COLUMN packages.replacement_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.replacement_cost IS 'Charge to client if item is destroyed/lost (rental).';


--
-- Name: COLUMN packages.buffer_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.buffer_days IS 'Days needed for cleaning/prep before item can be rented again.';


--
-- Name: COLUMN packages.unit_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.unit_type IS 'Catalog default: flat, hour, or day';


--
-- Name: COLUMN packages.unit_multiplier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packages.unit_multiplier IS 'Default hours/days per unit when unit_type is hour/day';


--
-- Name: passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkeys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    counter integer DEFAULT 0,
    transports text[],
    created_at timestamp with time zone DEFAULT now(),
    friendly_name text
);


--
-- Name: COLUMN passkeys.friendly_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passkeys.friendly_name IS 'User-editable display name for this passkey. Optional. Max 100 chars (enforced at the server action layer). Defaults to guessDeviceName() output during the smart sign-up flow, otherwise null.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    has_recovery_kit boolean DEFAULT false,
    recovery_setup_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    email text,
    full_name text,
    avatar_url text,
    onboarding_completed boolean DEFAULT false,
    onboarding_summary text,
    ical_token text,
    persona public.user_persona,
    onboarding_step integer DEFAULT 0,
    onboarding_persona_completed boolean DEFAULT false,
    guardian_setup_deferred boolean DEFAULT false NOT NULL,
    guardian_setup_decision_at timestamp with time zone
);


--
-- Name: COLUMN profiles.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.email IS 'Synced from auth.users; used by Signal for display and lookups';


--
-- Name: COLUMN profiles.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.full_name IS 'From auth user_metadata.full_name';


--
-- Name: COLUMN profiles.onboarding_completed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Set true when user completes onboarding';


--
-- Name: COLUMN profiles.onboarding_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.onboarding_summary IS 'AI-extracted intent and vibe from onboarding chat; used by Talent Matrix and other agents.';


--
-- Name: COLUMN profiles.persona; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.persona IS 'User persona captured during onboarding (solo_professional | agency_team | venue_brand). Drives agent_configs seeding.';


--
-- Name: COLUMN profiles.onboarding_step; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.onboarding_step IS 'Persistent onboarding step state (0-based). Resumed if the user abandons the flow.';


--
-- Name: COLUMN profiles.onboarding_persona_completed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.onboarding_persona_completed IS 'True after the user picks a persona. Gates step progression.';


--
-- Name: COLUMN profiles.guardian_setup_deferred; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.guardian_setup_deferred IS 'Phase 5 login redesign: true when the owner clicked "Skip anyway" on the non-skippable guardian setup warning. Lobby reminder card reads this to decide whether to resurface the prompt. Reset to false automatically when the user later reaches the threshold via /settings/security.';


--
-- Name: COLUMN profiles.guardian_setup_decision_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.guardian_setup_decision_at IS 'Phase 5 login redesign: timestamp of the last explicit guardian-setup decision (either accepted = threshold met, or deferred). Null until the user has made a first-time decision. Audit-only; no RLS implications.';


--
-- Name: proposal_client_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_client_selections (
    proposal_id uuid NOT NULL,
    item_id uuid NOT NULL,
    selected boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposal_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    package_id uuid,
    origin_package_id uuid,
    name text NOT NULL,
    description text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric NOT NULL,
    override_price numeric,
    actual_cost numeric,
    definition_snapshot jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    package_instance_id uuid,
    display_group_name text,
    is_client_visible boolean DEFAULT true NOT NULL,
    unit_type text DEFAULT 'flat'::text NOT NULL,
    unit_multiplier numeric DEFAULT 1 NOT NULL,
    is_package_header boolean DEFAULT false NOT NULL,
    original_base_price numeric,
    internal_notes text,
    is_optional boolean DEFAULT false NOT NULL,
    time_start text,
    time_end text,
    show_times_on_proposal boolean DEFAULT true NOT NULL,
    CONSTRAINT proposal_items_unit_multiplier_check CHECK ((unit_multiplier > (0)::numeric)),
    CONSTRAINT proposal_items_unit_type_check CHECK ((unit_type = ANY (ARRAY['flat'::text, 'hour'::text, 'day'::text])))
);


--
-- Name: TABLE proposal_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.proposal_items IS 'Line items on a proposal; package_id nullable for custom items.';


--
-- Name: COLUMN proposal_items.package_instance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.package_instance_id IS 'Unique ID for this burst of a package into the proposal; same for all items from one Add from Catalog';


--
-- Name: COLUMN proposal_items.display_group_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.display_group_name IS 'Client-facing group label (e.g. Gold Wedding Package)';


--
-- Name: COLUMN proposal_items.is_client_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.is_client_visible IS 'When false, hide from client PDF but keep on warehouse pull sheet';


--
-- Name: COLUMN proposal_items.unit_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.unit_type IS 'Billing basis: flat (qty × price), hour (qty × hrs × price/hr), day (qty × days × price/day)';


--
-- Name: COLUMN proposal_items.unit_multiplier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.unit_multiplier IS 'Hours or days per unit when unit_type is hour/day; ignored when flat';


--
-- Name: COLUMN proposal_items.is_package_header; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.is_package_header IS 'True for the single row that represents the bundle total; children of that package have unit_price 0';


--
-- Name: COLUMN proposal_items.original_base_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposal_items.original_base_price IS 'Catalog price when added as package child; used when Unpack restores item to a la carte price';


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    status public.proposal_status DEFAULT 'draft'::public.proposal_status NOT NULL,
    public_token uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deal_id uuid NOT NULL,
    accepted_at timestamp with time zone,
    signer_name text,
    signed_ip text,
    expires_at timestamp with time zone,
    deposit_percent integer,
    payment_due_days integer,
    payment_notes text,
    scope_notes text,
    terms_and_conditions text,
    docuseal_submission_id text,
    signed_at timestamp with time zone,
    signed_pdf_path text,
    docuseal_embed_src text,
    client_selections_locked_at timestamp with time zone,
    first_viewed_at timestamp with time zone,
    last_viewed_at timestamp with time zone,
    view_count integer DEFAULT 0 NOT NULL,
    reminder_sent_at timestamp with time zone,
    stripe_payment_intent_id text,
    deposit_paid_at timestamp with time zone,
    deposit_deadline_days integer,
    resend_message_id text,
    email_delivered_at timestamp with time zone,
    email_bounced_at timestamp with time zone
);


--
-- Name: TABLE proposals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.proposals IS 'Proposals/offers linked to an event; public_token for client view.';


--
-- Name: COLUMN proposals.deal_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposals.deal_id IS 'Sales opportunity; proposal is built during Liquid phase (inquiry/proposal).';


--
-- Name: COLUMN proposals.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposals.accepted_at IS 'Set when client signs; used for contract.signed_at at crystallization.';


--
-- Name: COLUMN proposals.deposit_deadline_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.proposals.deposit_deadline_days IS 'Days after acceptance that deposit is due. NULL = use workspace default.';


--
-- Name: recovery_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    timelock_until timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    cancel_token_hash text,
    CONSTRAINT recovery_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN recovery_requests.cancel_token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.recovery_requests.cancel_token_hash IS 'SHA-256 hash of the one-time cancel token sent to owner email; used for /auth/recover/cancel?token=...';


--
-- Name: recovery_shards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_shards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    guardian_id uuid NOT NULL,
    encrypted_shard text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: run_of_show_cues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_of_show_cues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text,
    start_time time without time zone,
    duration_minutes integer DEFAULT 10 NOT NULL,
    type public.cue_type DEFAULT 'stage'::public.cue_type NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_pre_show boolean DEFAULT false NOT NULL,
    assigned_crew jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_gear jsonb DEFAULT '[]'::jsonb NOT NULL,
    section_id uuid,
    label text
);


--
-- Name: run_of_show_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_of_show_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    title text DEFAULT 'Untitled Section'::text NOT NULL,
    color text,
    sort_order integer DEFAULT 0 NOT NULL,
    start_time text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sms_otp_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_otp_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ip_hash text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sms_otp_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_otp_attempts IS 'Rate-limit attempt log for SMS OTP send. Each row records a successful Twilio send. Edge function counts recent rows to enforce 5/hr/user and 10/hr/ip. Failed sends MUST NOT insert here (otherwise Twilio outage burns through quota).';


--
-- Name: sms_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sms_otp_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_otp_codes IS 'Hashed 6-digit OTP codes sent via Twilio. code_hash = SHA-256(code + user_id + SMS_OTP_HASH_SALT). 10-minute expiry. attempts increments on every verify call; ≥5 blocks further verification. RLS locked to service role — no client can SELECT or INSERT even with a valid JWT.';


--
-- Name: subscription_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    event_kind text NOT NULL,
    from_state jsonb,
    to_state jsonb,
    triggered_by_user_id uuid,
    stripe_event_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_events_event_kind_check CHECK ((event_kind = ANY (ARRAY['created'::text, 'tier_changed'::text, 'seats_changed'::text, 'payment_failed'::text, 'payment_succeeded'::text, 'canceled'::text, 'reactivated'::text, 'trial_started'::text, 'trial_ended'::text])))
);

ALTER TABLE ONLY public.subscription_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE subscription_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscription_events IS 'Audit trail for subscription lifecycle: tier changes, payment events, cancellations. Powers the Subscription History section in /settings/billing. Authenticated users read-only.';


--
-- Name: subscription_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_invoices (
    stripe_invoice_id text NOT NULL,
    workspace_id uuid NOT NULL,
    amount_due numeric(14,2),
    amount_paid numeric(14,2),
    currency text DEFAULT 'usd'::text,
    status text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    hosted_invoice_url text,
    invoice_pdf_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.subscription_invoices FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE subscription_invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscription_invoices IS 'Cache of Stripe-generated subscription invoices. Populated by invoice.paid/finalized/upcoming webhooks. Authenticated users read-only via RLS; writing is service_role only (webhook handler).';


--
-- Name: tier_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_config (
    tier public.subscription_tier NOT NULL,
    label text NOT NULL,
    base_price_cents integer NOT NULL,
    billing_interval text DEFAULT 'month'::text NOT NULL,
    included_seats integer NOT NULL,
    max_active_shows integer,
    extra_seat_price_cents integer NOT NULL,
    aion_mode text DEFAULT 'passive'::text NOT NULL,
    aion_monthly_actions integer,
    stripe_price_id text,
    stripe_extra_seat_price_id text
);


--
-- Name: user_lobby_active; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_lobby_active (
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    layout_key text DEFAULT 'default'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_lobby_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_lobby_active IS 'Per-user active layout pointer. layout_key is a preset slug or a lobby_layouts.id.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    role_id uuid,
    CONSTRAINT workspace_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'employee'::text, 'client'::text])))
);


--
-- Name: COLUMN workspace_members.role_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspace_members.role_id IS 'Resolved role; legacy role (text) kept for backward compatibility until unpacker is default.';


--
-- Name: workspace_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    label text NOT NULL,
    color text DEFAULT 'slate-400'::text NOT NULL
);


--
-- Name: TABLE workspace_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workspace_tags IS 'Tags per workspace; one label per workspace (case-insensitive).';


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now(),
    subscription_tier public.subscription_tier DEFAULT 'foundation'::public.subscription_tier,
    stripe_subscription_id text,
    signalpay_enabled boolean DEFAULT false,
    autonomous_resolution_count integer DEFAULT 0,
    default_tax_rate numeric(6,4) DEFAULT 0 NOT NULL,
    sending_domain text,
    resend_domain_id text,
    sending_domain_status text,
    sending_from_name text,
    sending_from_localpart text DEFAULT 'hello'::text,
    dmarc_status text,
    logo_url text,
    default_deposit_percent numeric(5,2) DEFAULT 50 NOT NULL,
    default_deposit_deadline_days integer DEFAULT 7 NOT NULL,
    default_balance_due_days_before_event integer DEFAULT 14 NOT NULL,
    portal_theme_preset text DEFAULT 'default'::text NOT NULL,
    portal_theme_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    autonomous_addon_enabled boolean DEFAULT false NOT NULL,
    extra_seats integer DEFAULT 0 NOT NULL,
    aion_actions_used integer DEFAULT 0 NOT NULL,
    aion_actions_reset_at timestamp with time zone,
    billing_status text DEFAULT 'active'::text NOT NULL,
    aion_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    require_equipment_verification boolean DEFAULT false NOT NULL,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    last_payment_failed_at timestamp with time zone,
    grace_period_ends_at timestamp with time zone,
    payment_due_days integer DEFAULT 30 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    feature_flags jsonb DEFAULT '{"pipelines.triggers_enabled": true}'::jsonb NOT NULL,
    sms_signin_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT workspaces_dmarc_status_check CHECK ((dmarc_status = ANY (ARRAY['not_configured'::text, 'configured'::text]))),
    CONSTRAINT workspaces_portal_theme_preset_check CHECK ((portal_theme_preset = ANY (ARRAY['default'::text, 'minimalist'::text, 'dark-stage'::text, 'editorial'::text, 'civic'::text, 'neo-brutalist'::text, 'tactile-warm'::text, 'retro-future'::text, 'custom'::text]))),
    CONSTRAINT workspaces_sending_domain_status_check CHECK ((sending_domain_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'verified'::text, 'temporary_failure'::text, 'failure'::text]))),
    CONSTRAINT workspaces_timezone_iana CHECK (((timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$'::text) OR (timezone = 'UTC'::text)))
);


--
-- Name: COLUMN workspaces.sending_domain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.sending_domain IS 'Custom sending subdomain, e.g. mail.example.com. NULL = use Signal shared domain.';


--
-- Name: COLUMN workspaces.resend_domain_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.resend_domain_id IS 'Resend domain object ID. Required for verify/delete calls.';


--
-- Name: COLUMN workspaces.sending_domain_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.sending_domain_status IS 'Cached Resend verification status. Refresh via verifySendingDomain().';


--
-- Name: COLUMN workspaces.sending_from_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.sending_from_name IS 'Display name in From header, e.g. Invisible Touch Events.';


--
-- Name: COLUMN workspaces.sending_from_localpart; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.sending_from_localpart IS 'Local-part before @, e.g. hello or events. Default: hello.';


--
-- Name: COLUMN workspaces.dmarc_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.dmarc_status IS 'Whether _dmarc record detected on the sending domain.';


--
-- Name: COLUMN workspaces.default_deposit_percent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.default_deposit_percent IS 'Default deposit % applied to new proposals. Overridable per proposal.';


--
-- Name: COLUMN workspaces.default_deposit_deadline_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.default_deposit_deadline_days IS 'Default number of days after contract acceptance that the deposit is due.';


--
-- Name: COLUMN workspaces.default_balance_due_days_before_event; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.default_balance_due_days_before_event IS 'Default number of days before the event that the remaining balance is due.';


--
-- Name: COLUMN workspaces.portal_theme_preset; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.portal_theme_preset IS 'Portal theme preset name. Controls the visual identity of client-facing pages (proposals, invoices).';


--
-- Name: COLUMN workspaces.portal_theme_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.portal_theme_config IS 'JSONB overrides for portal theme tokens. Empty for pure presets. For custom themes, stores all 12 tokens. For partial customization (preset + brand color), stores only the overrides.';


--
-- Name: COLUMN workspaces.require_equipment_verification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.require_equipment_verification IS 'When true, new crew equipment items start as pending and require admin approval.';


--
-- Name: COLUMN workspaces.current_period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.current_period_end IS 'Cached from customer.subscription.updated webhook. UI reads for "next invoice on..." display.';


--
-- Name: COLUMN workspaces.trial_ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.trial_ends_at IS 'Cached from subscription trial_end. Powers trial countdown banners and gating.';


--
-- Name: COLUMN workspaces.cancel_at_period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.cancel_at_period_end IS 'Mirrors Stripe cancel_at_period_end. UI renders "subscription ending" warning.';


--
-- Name: COLUMN workspaces.grace_period_ends_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.grace_period_ends_at IS '7 days after last_payment_failed_at. After this, tier-gated features are hard-blocked.';


--
-- Name: COLUMN workspaces.payment_due_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.payment_due_days IS 'Default payment terms for invoices (number of days from issue). Configurable per workspace.';


--
-- Name: COLUMN workspaces.feature_flags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.feature_flags IS 'Per-workspace feature flag overrides. Namespaced keys (e.g. reports.modular_lobby, crm.proposal_builder_drag) → boolean. Read via shared/lib/feature-flags.ts. Does not bypass tier or billing gates.';


--
-- Name: COLUMN workspaces.sms_signin_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.sms_signin_enabled IS 'When true, members of this workspace may receive a 6-digit SMS sign-in code as a fallback to the email magic link. Gated by AUTH_V2_SMS feature flag; default false. Toggled by workspace owner/admin in settings/security.';


--
-- Name: bridge_pair_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_pair_attempts ALTER COLUMN id SET DEFAULT nextval('public.bridge_pair_attempts_id_seq'::regclass);


--
-- Name: client_portal_access_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access_log ALTER COLUMN id SET DEFAULT nextval('public.client_portal_access_log_id_seq'::regclass);


--
-- Name: client_portal_rate_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_rate_limits ALTER COLUMN id SET DEFAULT nextval('public.client_portal_rate_limits_id_seq'::regclass);


--
-- Name: item_assignees item_assignees_pkey; Type: CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.item_assignees
    ADD CONSTRAINT item_assignees_pkey PRIMARY KEY (id);


--
-- Name: aion_insights aion_insights_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_insights
    ADD CONSTRAINT aion_insights_pkey PRIMARY KEY (id);


--
-- Name: aion_memory aion_memory_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_memory
    ADD CONSTRAINT aion_memory_pkey PRIMARY KEY (id);


--
-- Name: aion_messages aion_messages_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_messages
    ADD CONSTRAINT aion_messages_pkey PRIMARY KEY (id);


--
-- Name: aion_proactive_lines aion_proactive_lines_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_proactive_lines
    ADD CONSTRAINT aion_proactive_lines_pkey PRIMARY KEY (id);


--
-- Name: aion_refusal_log aion_refusal_log_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_refusal_log
    ADD CONSTRAINT aion_refusal_log_pkey PRIMARY KEY (id);


--
-- Name: aion_sessions aion_sessions_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_sessions
    ADD CONSTRAINT aion_sessions_pkey PRIMARY KEY (id);


--
-- Name: capture_events capture_events_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_pkey PRIMARY KEY (id);


--
-- Name: consent_log consent_log_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.consent_log
    ADD CONSTRAINT consent_log_pkey PRIMARY KEY (id);


--
-- Name: entity_working_notes entity_working_notes_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.entity_working_notes
    ADD CONSTRAINT entity_working_notes_pkey PRIMARY KEY (workspace_id, entity_id);


--
-- Name: feature_access_requests feature_access_requests_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.feature_access_requests
    ADD CONSTRAINT feature_access_requests_pkey PRIMARY KEY (id);


--
-- Name: memory_pending memory_pending_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory_pending
    ADD CONSTRAINT memory_pending_pkey PRIMARY KEY (id);


--
-- Name: memory_pending memory_pending_source_type_source_id_key; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory_pending
    ADD CONSTRAINT memory_pending_source_type_source_id_key UNIQUE (source_type, source_id);


--
-- Name: memory memory_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory
    ADD CONSTRAINT memory_pkey PRIMARY KEY (id);


--
-- Name: memory memory_source_type_source_id_key; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory
    ADD CONSTRAINT memory_source_type_source_id_key UNIQUE (source_type, source_id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_source_entity_id_target_entity_id_relationshi_key; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.relationships
    ADD CONSTRAINT relationships_source_entity_id_target_entity_id_relationshi_key UNIQUE (source_entity_id, target_entity_id, relationship_type);


--
-- Name: ui_notices ui_notices_pkey; Type: CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.ui_notices
    ADD CONSTRAINT ui_notices_pkey PRIMARY KEY (id);


--
-- Name: entities entities_handle_key; Type: CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entities
    ADD CONSTRAINT entities_handle_key UNIQUE (handle);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: entity_documents entity_documents_pkey; Type: CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entity_documents
    ADD CONSTRAINT entity_documents_pkey PRIMARY KEY (id);


--
-- Name: bill_payments bill_payments_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bill_payments
    ADD CONSTRAINT bill_payments_pkey PRIMARY KEY (id);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);


--
-- Name: bills bills_workspace_id_bill_number_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_workspace_id_bill_number_key UNIQUE (workspace_id, bill_number);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_number_sequences invoice_number_sequences_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoice_number_sequences
    ADD CONSTRAINT invoice_number_sequences_pkey PRIMARY KEY (workspace_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_public_token_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_public_token_key UNIQUE (public_token);


--
-- Name: invoices invoices_workspace_id_invoice_number_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_workspace_id_invoice_number_key UNIQUE (workspace_id, invoice_number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: qbo_connections qbo_connections_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_connections
    ADD CONSTRAINT qbo_connections_pkey PRIMARY KEY (id);


--
-- Name: qbo_connections qbo_connections_workspace_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_connections
    ADD CONSTRAINT qbo_connections_workspace_id_key UNIQUE (workspace_id);


--
-- Name: qbo_entity_map qbo_entity_map_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_entity_map
    ADD CONSTRAINT qbo_entity_map_pkey PRIMARY KEY (id);


--
-- Name: qbo_entity_map qbo_entity_map_workspace_id_local_type_local_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_entity_map
    ADD CONSTRAINT qbo_entity_map_workspace_id_local_type_local_id_key UNIQUE (workspace_id, local_type, local_id);


--
-- Name: qbo_entity_map qbo_entity_map_workspace_id_qbo_type_qbo_id_key; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_entity_map
    ADD CONSTRAINT qbo_entity_map_workspace_id_qbo_type_qbo_id_key UNIQUE (workspace_id, qbo_type, qbo_id);


--
-- Name: qbo_sync_log qbo_sync_log_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_sync_log
    ADD CONSTRAINT qbo_sync_log_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (stripe_event_id);


--
-- Name: sync_jobs sync_jobs_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.sync_jobs
    ADD CONSTRAINT sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: tax_rates tax_rates_pkey; Type: CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.tax_rates
    ADD CONSTRAINT tax_rates_pkey PRIMARY KEY (id);


--
-- Name: aion_write_log aion_write_log_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.aion_write_log
    ADD CONSTRAINT aion_write_log_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: crew_assignments crew_assignments_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_assignments
    ADD CONSTRAINT crew_assignments_pkey PRIMARY KEY (id);


--
-- Name: crew_comms_log crew_comms_log_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_comms_log
    ADD CONSTRAINT crew_comms_log_pkey PRIMARY KEY (id);


--
-- Name: crew_confirmation_tokens crew_confirmation_tokens_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_confirmation_tokens
    ADD CONSTRAINT crew_confirmation_tokens_pkey PRIMARY KEY (id);


--
-- Name: crew_confirmation_tokens crew_confirmation_tokens_token_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_confirmation_tokens
    ADD CONSTRAINT crew_confirmation_tokens_token_key UNIQUE (token);


--
-- Name: crew_equipment crew_equipment_entity_workspace_name_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_equipment
    ADD CONSTRAINT crew_equipment_entity_workspace_name_uniq UNIQUE (entity_id, workspace_id, name);


--
-- Name: crew_equipment crew_equipment_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_equipment
    ADD CONSTRAINT crew_equipment_pkey PRIMARY KEY (id);


--
-- Name: crew_skills crew_skills_entity_workspace_tag_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_skills
    ADD CONSTRAINT crew_skills_entity_workspace_tag_uniq UNIQUE (entity_id, workspace_id, skill_tag);


--
-- Name: crew_skills crew_skills_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_skills
    ADD CONSTRAINT crew_skills_pkey PRIMARY KEY (id);


--
-- Name: daily_briefings daily_briefings_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.daily_briefings
    ADD CONSTRAINT daily_briefings_pkey PRIMARY KEY (id);


--
-- Name: day_sheet_tokens day_sheet_tokens_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.day_sheet_tokens
    ADD CONSTRAINT day_sheet_tokens_pkey PRIMARY KEY (token);


--
-- Name: deal_activity_log deal_activity_log_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_activity_log
    ADD CONSTRAINT deal_activity_log_pkey PRIMARY KEY (id);


--
-- Name: deal_crew deal_crew_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_crew
    ADD CONSTRAINT deal_crew_pkey PRIMARY KEY (id);


--
-- Name: deal_crew_waypoints deal_crew_waypoints_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_crew_waypoints
    ADD CONSTRAINT deal_crew_waypoints_pkey PRIMARY KEY (id);


--
-- Name: deal_notes deal_notes_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_notes
    ADD CONSTRAINT deal_notes_pkey PRIMARY KEY (id);


--
-- Name: deal_stakeholders deal_stakeholders_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_stakeholders
    ADD CONSTRAINT deal_stakeholders_pkey PRIMARY KEY (id);


--
-- Name: deal_transitions deal_transitions_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_pkey PRIMARY KEY (id);


--
-- Name: domain_events domain_events_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.domain_events
    ADD CONSTRAINT domain_events_pkey PRIMARY KEY (id);


--
-- Name: entity_capabilities entity_capabilities_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.entity_capabilities
    ADD CONSTRAINT entity_capabilities_pkey PRIMARY KEY (id);


--
-- Name: entity_capabilities entity_capabilities_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.entity_capabilities
    ADD CONSTRAINT entity_capabilities_uniq UNIQUE (entity_id, workspace_id, capability);


--
-- Name: event_expenses event_expenses_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_expenses
    ADD CONSTRAINT event_expenses_pkey PRIMARY KEY (id);


--
-- Name: event_gear_items event_gear_items_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_gear_items
    ADD CONSTRAINT event_gear_items_pkey PRIMARY KEY (id);


--
-- Name: events events_client_portal_token_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_client_portal_token_key UNIQUE (client_portal_token);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: follow_up_log follow_up_log_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.follow_up_log
    ADD CONSTRAINT follow_up_log_pkey PRIMARY KEY (id);


--
-- Name: follow_up_queue follow_up_queue_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.follow_up_queue
    ADD CONSTRAINT follow_up_queue_pkey PRIMARY KEY (id);


--
-- Name: kit_templates kit_templates_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.kit_templates
    ADD CONSTRAINT kit_templates_pkey PRIMARY KEY (id);


--
-- Name: kit_templates kit_templates_workspace_role_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.kit_templates
    ADD CONSTRAINT kit_templates_workspace_role_uniq UNIQUE (workspace_id, role_tag);


--
-- Name: message_channel_identities message_channel_identities_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.message_channel_identities
    ADD CONSTRAINT message_channel_identities_pkey PRIMARY KEY (id);


--
-- Name: message_channel_identities message_channel_identities_workspace_id_channel_identity_ad_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.message_channel_identities
    ADD CONSTRAINT message_channel_identities_workspace_id_channel_identity_ad_key UNIQUE (workspace_id, channel, identity_address);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_workspace_id_provider_thread_key_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.message_threads
    ADD CONSTRAINT message_threads_workspace_id_provider_thread_key_key UNIQUE (workspace_id, provider_thread_key);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_slug_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_slug_key UNIQUE (pipeline_id, slug);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_sort_order_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipeline_stages
    ADD CONSTRAINT pipeline_stages_sort_order_uniq UNIQUE (pipeline_id, sort_order) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- Name: pipelines pipelines_workspace_id_slug_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipelines
    ADD CONSTRAINT pipelines_workspace_id_slug_key UNIQUE (workspace_id, slug);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: proposal_builder_events proposal_builder_events_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.proposal_builder_events
    ADD CONSTRAINT proposal_builder_events_pkey PRIMARY KEY (id);


--
-- Name: workspace_call_time_rules workspace_call_time_rules_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_call_time_rules
    ADD CONSTRAINT workspace_call_time_rules_pkey PRIMARY KEY (id);


--
-- Name: workspace_capability_presets workspace_capability_presets_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_capability_presets
    ADD CONSTRAINT workspace_capability_presets_pkey PRIMARY KEY (id);


--
-- Name: workspace_capability_presets workspace_capability_presets_uniq; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_capability_presets
    ADD CONSTRAINT workspace_capability_presets_uniq UNIQUE (workspace_id, capability);


--
-- Name: workspace_event_archetypes workspace_event_archetypes_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_event_archetypes
    ADD CONSTRAINT workspace_event_archetypes_pkey PRIMARY KEY (id);


--
-- Name: workspace_industry_tags workspace_industry_tags_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_industry_tags
    ADD CONSTRAINT workspace_industry_tags_pkey PRIMARY KEY (id);


--
-- Name: workspace_industry_tags workspace_industry_tags_unique; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_industry_tags
    ADD CONSTRAINT workspace_industry_tags_unique UNIQUE (workspace_id, tag);


--
-- Name: workspace_job_titles workspace_job_titles_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_job_titles
    ADD CONSTRAINT workspace_job_titles_pkey PRIMARY KEY (id);


--
-- Name: workspace_job_titles workspace_job_titles_unique; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_job_titles
    ADD CONSTRAINT workspace_job_titles_unique UNIQUE (workspace_id, title);


--
-- Name: workspace_lead_sources workspace_lead_sources_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_lead_sources
    ADD CONSTRAINT workspace_lead_sources_pkey PRIMARY KEY (id);


--
-- Name: workspace_lead_sources workspace_lead_sources_unique; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_lead_sources
    ADD CONSTRAINT workspace_lead_sources_unique UNIQUE (workspace_id, label);


--
-- Name: workspace_permissions workspace_permissions_key_key; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_permissions
    ADD CONSTRAINT workspace_permissions_key_key UNIQUE (key);


--
-- Name: workspace_permissions workspace_permissions_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_permissions
    ADD CONSTRAINT workspace_permissions_pkey PRIMARY KEY (id);


--
-- Name: workspace_role_permissions workspace_role_permissions_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_role_permissions
    ADD CONSTRAINT workspace_role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: workspace_roles workspace_roles_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_roles
    ADD CONSTRAINT workspace_roles_pkey PRIMARY KEY (id);


--
-- Name: workspace_ros_templates workspace_ros_templates_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_ros_templates
    ADD CONSTRAINT workspace_ros_templates_pkey PRIMARY KEY (id);


--
-- Name: workspace_skill_presets workspace_skill_presets_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_skill_presets
    ADD CONSTRAINT workspace_skill_presets_pkey PRIMARY KEY (id);


--
-- Name: workspace_skill_presets workspace_skill_presets_unique; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_skill_presets
    ADD CONSTRAINT workspace_skill_presets_unique UNIQUE (workspace_id, skill_tag);


--
-- Name: agent_configs agent_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_pkey PRIMARY KEY (id);


--
-- Name: agent_configs agent_configs_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_workspace_id_key UNIQUE (workspace_id);


--
-- Name: autonomous_resolutions autonomous_resolutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomous_resolutions
    ADD CONSTRAINT autonomous_resolutions_pkey PRIMARY KEY (id);


--
-- Name: bridge_device_tokens bridge_device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_device_tokens
    ADD CONSTRAINT bridge_device_tokens_pkey PRIMARY KEY (id);


--
-- Name: bridge_device_tokens bridge_device_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_device_tokens
    ADD CONSTRAINT bridge_device_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: bridge_pair_attempts bridge_pair_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_pair_attempts
    ADD CONSTRAINT bridge_pair_attempts_pkey PRIMARY KEY (id);


--
-- Name: bridge_pairing_codes bridge_pairing_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_pairing_codes
    ADD CONSTRAINT bridge_pairing_codes_pkey PRIMARY KEY (id);


--
-- Name: bridge_sync_status bridge_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_sync_status
    ADD CONSTRAINT bridge_sync_status_pkey PRIMARY KEY (id);


--
-- Name: client_portal_access_log client_portal_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_access_log
    ADD CONSTRAINT client_portal_access_log_pkey PRIMARY KEY (id);


--
-- Name: client_portal_otp_challenges client_portal_otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_otp_challenges
    ADD CONSTRAINT client_portal_otp_challenges_pkey PRIMARY KEY (id);


--
-- Name: client_portal_rate_limits client_portal_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_rate_limits
    ADD CONSTRAINT client_portal_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: client_portal_tokens client_portal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_tokens
    ADD CONSTRAINT client_portal_tokens_pkey PRIMARY KEY (id);


--
-- Name: client_portal_tokens client_portal_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_tokens
    ADD CONSTRAINT client_portal_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: commercial_organizations commercial_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_organizations
    ADD CONSTRAINT commercial_organizations_pkey PRIMARY KEY (id);


--
-- Name: commercial_organizations commercial_organizations_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_organizations
    ADD CONSTRAINT commercial_organizations_workspace_id_key UNIQUE (workspace_id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: guardians guardians_owner_id_guardian_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_owner_id_guardian_email_key UNIQUE (owner_id, guardian_email);


--
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_key UNIQUE (token);


--
-- Name: lobby_layouts lobby_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lobby_layouts
    ADD CONSTRAINT lobby_layouts_pkey PRIMARY KEY (id);


--
-- Name: lobby_layouts lobby_layouts_user_id_workspace_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lobby_layouts
    ADD CONSTRAINT lobby_layouts_user_id_workspace_id_name_key UNIQUE (user_id, workspace_id, name);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (user_id, organization_id);


--
-- Name: package_tags package_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_tags
    ADD CONSTRAINT package_tags_pkey PRIMARY KEY (package_id, tag_id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: passkeys passkeys_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_credential_id_key UNIQUE (credential_id);


--
-- Name: passkeys passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_ical_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_ical_token_key UNIQUE (ical_token);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: proposal_client_selections proposal_client_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_client_selections
    ADD CONSTRAINT proposal_client_selections_pkey PRIMARY KEY (proposal_id, item_id);


--
-- Name: proposal_items proposal_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_items
    ADD CONSTRAINT proposal_items_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: recovery_requests recovery_requests_cancel_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_requests
    ADD CONSTRAINT recovery_requests_cancel_token_hash_key UNIQUE (cancel_token_hash);


--
-- Name: recovery_requests recovery_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_requests
    ADD CONSTRAINT recovery_requests_pkey PRIMARY KEY (id);


--
-- Name: recovery_shards recovery_shards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_shards
    ADD CONSTRAINT recovery_shards_pkey PRIMARY KEY (id);


--
-- Name: run_of_show_cues run_of_show_cues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_of_show_cues
    ADD CONSTRAINT run_of_show_cues_pkey PRIMARY KEY (id);


--
-- Name: run_of_show_sections run_of_show_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_of_show_sections
    ADD CONSTRAINT run_of_show_sections_pkey PRIMARY KEY (id);


--
-- Name: sms_otp_attempts sms_otp_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_otp_attempts
    ADD CONSTRAINT sms_otp_attempts_pkey PRIMARY KEY (id);


--
-- Name: sms_otp_codes sms_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_otp_codes
    ADD CONSTRAINT sms_otp_codes_pkey PRIMARY KEY (id);


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_invoices subscription_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (stripe_invoice_id);


--
-- Name: tier_config tier_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_config
    ADD CONSTRAINT tier_config_pkey PRIMARY KEY (tier);


--
-- Name: user_lobby_active user_lobby_active_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lobby_active
    ADD CONSTRAINT user_lobby_active_pkey PRIMARY KEY (user_id, workspace_id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspace_tags workspace_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tags
    ADD CONSTRAINT workspace_tags_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_sending_domain_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_sending_domain_unique UNIQUE (id, sending_domain) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workspaces workspaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);


--
-- Name: item_assignees_entity_id_idx; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX item_assignees_entity_id_idx ON catalog.item_assignees USING btree (entity_id);


--
-- Name: item_assignees_package_id_idx; Type: INDEX; Schema: catalog; Owner: -
--

CREATE INDEX item_assignees_package_id_idx ON catalog.item_assignees USING btree (package_id);


--
-- Name: item_assignees_pkg_entity_uniq; Type: INDEX; Schema: catalog; Owner: -
--

CREATE UNIQUE INDEX item_assignees_pkg_entity_uniq ON catalog.item_assignees USING btree (package_id, entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: item_assignees_pkg_role_uniq; Type: INDEX; Schema: catalog; Owner: -
--

CREATE UNIQUE INDEX item_assignees_pkg_role_uniq ON catalog.item_assignees USING btree (package_id, role_note) WHERE ((entity_id IS NULL) AND (role_note IS NOT NULL));


--
-- Name: aion_memory_entity_id_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_memory_entity_id_idx ON cortex.aion_memory USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: aion_proactive_lines_active_lookup_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_proactive_lines_active_lookup_idx ON cortex.aion_proactive_lines USING btree (workspace_id, deal_id, dismissed_at, resolved_at, expires_at, created_at DESC);


--
-- Name: aion_proactive_lines_artifact_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_proactive_lines_artifact_idx ON cortex.aion_proactive_lines USING btree (((artifact_ref ->> 'kind'::text)), ((artifact_ref ->> 'id'::text))) WHERE ((resolved_at IS NULL) AND (dismissed_at IS NULL));


--
-- Name: aion_proactive_lines_daily_cap_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE UNIQUE INDEX aion_proactive_lines_daily_cap_idx ON cortex.aion_proactive_lines USING btree (workspace_id, deal_id, created_date_local);


--
-- Name: aion_proactive_lines_throttle_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_proactive_lines_throttle_idx ON cortex.aion_proactive_lines USING btree (workspace_id, deal_id, signal_type, dismissed_at DESC) WHERE (dismissed_at IS NOT NULL);


--
-- Name: aion_sessions_pinned; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_sessions_pinned ON cortex.aion_sessions USING btree (user_id, workspace_id, scope_entity_id, pinned_at DESC) WHERE ((is_pinned = true) AND (archived_at IS NULL));


--
-- Name: aion_sessions_scope_entity; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_sessions_scope_entity ON cortex.aion_sessions USING btree (scope_entity_id) WHERE (scope_entity_id IS NOT NULL);


--
-- Name: aion_sessions_sidebar_v2; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX aion_sessions_sidebar_v2 ON cortex.aion_sessions USING btree (user_id, workspace_id, scope_entity_id, archived_at, last_message_at DESC);


--
-- Name: idx_aion_insights_active; Type: INDEX; Schema: cortex; Owner: -
--

CREATE UNIQUE INDEX idx_aion_insights_active ON cortex.aion_insights USING btree (trigger_type, entity_id) WHERE (status = ANY (ARRAY['pending'::text, 'surfaced'::text]));


--
-- Name: idx_aion_insights_portal_visible; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_insights_portal_visible ON cortex.aion_insights USING btree (workspace_id, status) WHERE (hide_from_portal = false);


--
-- Name: idx_aion_insights_workspace; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_insights_workspace ON cortex.aion_insights USING btree (workspace_id, status, priority DESC);


--
-- Name: idx_aion_memory_lobby_pins; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_memory_lobby_pins ON cortex.aion_memory USING btree (workspace_id, user_id) WHERE (scope = 'lobby_pin'::text);


--
-- Name: idx_aion_messages_session; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_messages_session ON cortex.aion_messages USING btree (session_id, created_at);


--
-- Name: idx_aion_refusal_log_workspace_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_refusal_log_workspace_created ON cortex.aion_refusal_log USING btree (workspace_id, created_at DESC);


--
-- Name: idx_aion_sessions_user; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_aion_sessions_user ON cortex.aion_sessions USING btree (user_id, workspace_id, updated_at DESC);


--
-- Name: idx_capture_events_entity; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_entity ON cortex.capture_events USING btree (resolved_entity_id) WHERE (resolved_entity_id IS NOT NULL);


--
-- Name: idx_capture_events_linked_deal_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_linked_deal_created ON cortex.capture_events USING btree (linked_deal_id, created_at DESC) WHERE ((linked_deal_id IS NOT NULL) AND (status = 'confirmed'::text));


--
-- Name: idx_capture_events_linked_event_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_linked_event_created ON cortex.capture_events USING btree (linked_event_id, created_at DESC) WHERE ((linked_event_id IS NOT NULL) AND (status = 'confirmed'::text));


--
-- Name: idx_capture_events_resolved_entity_id_confirmed; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_resolved_entity_id_confirmed ON cortex.capture_events USING btree (resolved_entity_id, created_at DESC) WHERE (status = 'confirmed'::text);


--
-- Name: idx_capture_events_workspace_created_confirmed; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_workspace_created_confirmed ON cortex.capture_events USING btree (workspace_id, created_at DESC) WHERE (status = 'confirmed'::text);


--
-- Name: idx_capture_events_ws_user_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_capture_events_ws_user_created ON cortex.capture_events USING btree (workspace_id, user_id, created_at DESC);


--
-- Name: idx_consent_log_active; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_consent_log_active ON cortex.consent_log USING btree (workspace_id, user_id, term_key, term_version) WHERE (revoked_at IS NULL);


--
-- Name: idx_cortex_aion_memory_workspace_user; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_cortex_aion_memory_workspace_user ON cortex.aion_memory USING btree (workspace_id, user_id, scope);


--
-- Name: idx_cortex_context; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_cortex_context ON cortex.relationships USING gin (context_data);


--
-- Name: idx_feature_access_requests_pending; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_feature_access_requests_pending ON cortex.feature_access_requests USING btree (workspace_id, feature_key, requested_at DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_memory_embedding; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_memory_embedding ON cortex.memory USING hnsw (embedding extensions.vector_cosine_ops) WITH (m='16', ef_construction='200');


--
-- Name: idx_memory_entity_ids; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_memory_entity_ids ON cortex.memory USING gin (entity_ids);


--
-- Name: idx_memory_workspace_source; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_memory_workspace_source ON cortex.memory USING btree (workspace_id, source_type);


--
-- Name: idx_referrals_counterparty_direction_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_referrals_counterparty_direction_created ON cortex.referrals USING btree (counterparty_entity_id, direction, created_at DESC);


--
-- Name: idx_referrals_workspace_created; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_referrals_workspace_created ON cortex.referrals USING btree (workspace_id, created_at DESC);


--
-- Name: idx_ui_notices_pending; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX idx_ui_notices_pending ON cortex.ui_notices USING btree (workspace_id, user_id, created_at DESC) WHERE (seen_at IS NULL);


--
-- Name: memory_pending_drain_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX memory_pending_drain_idx ON cortex.memory_pending USING btree (next_attempt_after) WHERE (attempts < 6);


--
-- Name: memory_pending_stuck_idx; Type: INDEX; Schema: cortex; Owner: -
--

CREATE INDEX memory_pending_stuck_idx ON cortex.memory_pending USING btree (attempts, last_attempted_at DESC) WHERE (attempts >= 6);


--
-- Name: entities_primary_email_idx; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX entities_primary_email_idx ON directory.entities USING btree (lower((attributes ->> 'email'::text))) WHERE (attributes ? 'email'::text);


--
-- Name: INDEX entities_primary_email_idx; Type: COMMENT; Schema: directory; Owner: -
--

COMMENT ON INDEX directory.entities_primary_email_idx IS 'Supports the client portal forgot-my-link flow (§15.5) and OTP issuance lookups (§15.2). Case-insensitive; only entities with an email attribute are indexed.';


--
-- Name: idx_directory_attributes; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_directory_attributes ON directory.entities USING gin (attributes);


--
-- Name: idx_directory_entities_legacy_entity_id; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_directory_entities_legacy_entity_id ON directory.entities USING btree (legacy_entity_id) WHERE (legacy_entity_id IS NOT NULL);


--
-- Name: idx_directory_entities_legacy_org_id; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_directory_entities_legacy_org_id ON directory.entities USING btree (legacy_org_id) WHERE (legacy_org_id IS NOT NULL);


--
-- Name: idx_directory_search; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_directory_search ON directory.entities USING gin (search_vector);


--
-- Name: idx_entity_documents_active; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_entity_documents_active ON directory.entity_documents USING btree (entity_id, document_type) WHERE (status = 'active'::text);


--
-- Name: idx_entity_documents_entity; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_entity_documents_entity ON directory.entity_documents USING btree (entity_id);


--
-- Name: idx_entity_documents_expiry; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_entity_documents_expiry ON directory.entity_documents USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND (status = 'active'::text));


--
-- Name: idx_entity_documents_type; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_entity_documents_type ON directory.entity_documents USING btree (workspace_id, document_type) WHERE (status = 'active'::text);


--
-- Name: idx_entity_documents_workspace; Type: INDEX; Schema: directory; Owner: -
--

CREATE INDEX idx_entity_documents_workspace ON directory.entity_documents USING btree (workspace_id);


--
-- Name: finance_invoices_spawn_idem; Type: INDEX; Schema: finance; Owner: -
--

CREATE UNIQUE INDEX finance_invoices_spawn_idem ON finance.invoices USING btree (proposal_id, invoice_kind, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(billing_period_start, '1900-01-01'::date)) WHERE ((proposal_id IS NOT NULL) AND (status <> 'void'::text));


--
-- Name: idx_finance_bill_payments_bill; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_bill_payments_bill ON finance.bill_payments USING btree (bill_id);


--
-- Name: idx_finance_bills_pay_to; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_bills_pay_to ON finance.bills USING btree (pay_to_entity_id);


--
-- Name: idx_finance_bills_pay_to_year; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_bills_pay_to_year ON finance.bills USING btree (workspace_id, pay_to_entity_id, bill_date) WHERE ((bill_date IS NOT NULL) AND (paid_amount > (0)::numeric));


--
-- Name: idx_finance_bills_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_bills_workspace ON finance.bills USING btree (workspace_id);


--
-- Name: idx_finance_bills_workspace_bill_date; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_bills_workspace_bill_date ON finance.bills USING btree (workspace_id, bill_date DESC) WHERE ((bill_date IS NOT NULL) AND (pay_to_entity_id IS NOT NULL));


--
-- Name: idx_finance_invoice_line_items_invoice; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoice_line_items_invoice ON finance.invoice_line_items USING btree (invoice_id, "position");


--
-- Name: idx_finance_invoice_line_items_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoice_line_items_workspace ON finance.invoice_line_items USING btree (workspace_id);


--
-- Name: idx_finance_invoices_bill_to; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_bill_to ON finance.invoices USING btree (bill_to_entity_id);


--
-- Name: idx_finance_invoices_deal; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_deal ON finance.invoices USING btree (deal_id) WHERE (deal_id IS NOT NULL);


--
-- Name: idx_finance_invoices_due_date; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_due_date ON finance.invoices USING btree (workspace_id, due_date) WHERE (status = ANY (ARRAY['sent'::text, 'viewed'::text, 'partially_paid'::text]));


--
-- Name: idx_finance_invoices_event; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_event ON finance.invoices USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_finance_invoices_proposal; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_proposal ON finance.invoices USING btree (proposal_id) WHERE (proposal_id IS NOT NULL);


--
-- Name: idx_finance_invoices_qbo_sync_status; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_qbo_sync_status ON finance.invoices USING btree (workspace_id, qbo_sync_status) WHERE (qbo_sync_status <> ALL (ARRAY['synced'::text, 'not_synced'::text]));


--
-- Name: idx_finance_invoices_status; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_status ON finance.invoices USING btree (workspace_id, status);


--
-- Name: idx_finance_invoices_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_workspace ON finance.invoices USING btree (workspace_id);


--
-- Name: idx_finance_invoices_workspace_paid_at; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_invoices_workspace_paid_at ON finance.invoices USING btree (workspace_id, paid_at DESC) WHERE (paid_at IS NOT NULL);


--
-- Name: idx_finance_payments_invoice; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_payments_invoice ON finance.payments USING btree (invoice_id);


--
-- Name: idx_finance_payments_qbo_sync_status; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_payments_qbo_sync_status ON finance.payments USING btree (workspace_id, qbo_sync_status) WHERE (qbo_sync_status <> ALL (ARRAY['synced'::text, 'not_synced'::text]));


--
-- Name: idx_finance_payments_received_at; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_payments_received_at ON finance.payments USING btree (workspace_id, received_at DESC);


--
-- Name: idx_finance_payments_reference; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_payments_reference ON finance.payments USING btree (workspace_id, reference) WHERE (reference IS NOT NULL);


--
-- Name: idx_finance_payments_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_payments_workspace ON finance.payments USING btree (workspace_id);


--
-- Name: idx_finance_qbo_entity_map_workspace_local; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_qbo_entity_map_workspace_local ON finance.qbo_entity_map USING btree (workspace_id, local_type, local_id);


--
-- Name: idx_finance_qbo_entity_map_workspace_qbo; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_qbo_entity_map_workspace_qbo ON finance.qbo_entity_map USING btree (workspace_id, qbo_type, qbo_id);


--
-- Name: idx_finance_qbo_sync_log_failed; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_qbo_sync_log_failed ON finance.qbo_sync_log USING btree (workspace_id, started_at DESC) WHERE (error_message IS NOT NULL);


--
-- Name: idx_finance_qbo_sync_log_local; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_qbo_sync_log_local ON finance.qbo_sync_log USING btree (workspace_id, local_type, local_id, started_at DESC);


--
-- Name: idx_finance_qbo_sync_log_workspace_started; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_qbo_sync_log_workspace_started ON finance.qbo_sync_log USING btree (workspace_id, started_at DESC);


--
-- Name: idx_finance_stripe_webhook_events_source; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_stripe_webhook_events_source ON finance.stripe_webhook_events USING btree (source, received_at DESC);


--
-- Name: idx_finance_stripe_webhook_events_unprocessed; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_stripe_webhook_events_unprocessed ON finance.stripe_webhook_events USING btree (received_at) WHERE (processed_at IS NULL);


--
-- Name: idx_finance_stripe_webhook_events_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_stripe_webhook_events_workspace ON finance.stripe_webhook_events USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: idx_finance_sync_jobs_dependency; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_sync_jobs_dependency ON finance.sync_jobs USING btree (depends_on_job_id) WHERE (depends_on_job_id IS NOT NULL);


--
-- Name: idx_finance_sync_jobs_dispatch; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_sync_jobs_dispatch ON finance.sync_jobs USING btree (workspace_id, state, next_attempt_at) WHERE (state = ANY (ARRAY['queued'::text, 'failed'::text]));


--
-- Name: idx_finance_tax_rates_one_default; Type: INDEX; Schema: finance; Owner: -
--

CREATE UNIQUE INDEX idx_finance_tax_rates_one_default ON finance.tax_rates USING btree (workspace_id) WHERE (is_default AND (NOT is_archived));


--
-- Name: idx_finance_tax_rates_workspace; Type: INDEX; Schema: finance; Owner: -
--

CREATE INDEX idx_finance_tax_rates_workspace ON finance.tax_rates USING btree (workspace_id) WHERE (NOT is_archived);


--
-- Name: aion_write_log_deal_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX aion_write_log_deal_idx ON ops.aion_write_log USING btree (deal_id, drafted_at DESC) WHERE (deal_id IS NOT NULL);


--
-- Name: aion_write_log_unconfirmed_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX aion_write_log_unconfirmed_idx ON ops.aion_write_log USING btree (workspace_id, drafted_at DESC) WHERE (confirmed_at IS NULL);


--
-- Name: aion_write_log_user_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX aion_write_log_user_idx ON ops.aion_write_log USING btree (user_id, drafted_at DESC);


--
-- Name: aion_write_log_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX aion_write_log_workspace_idx ON ops.aion_write_log USING btree (workspace_id, drafted_at DESC);


--
-- Name: crew_assignments_entity_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_assignments_entity_idx ON ops.crew_assignments USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: crew_assignments_event_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_assignments_event_idx ON ops.crew_assignments USING btree (event_id);


--
-- Name: crew_assignments_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_assignments_workspace_idx ON ops.crew_assignments USING btree (workspace_id);


--
-- Name: crew_comms_log_deal_crew_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_comms_log_deal_crew_idx ON ops.crew_comms_log USING btree (deal_crew_id, occurred_at DESC);


--
-- Name: crew_comms_log_event_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_comms_log_event_idx ON ops.crew_comms_log USING btree (event_id, occurred_at DESC) WHERE (event_id IS NOT NULL);


--
-- Name: crew_comms_log_resend_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_comms_log_resend_idx ON ops.crew_comms_log USING btree (resend_message_id) WHERE (resend_message_id IS NOT NULL);


--
-- Name: crew_comms_log_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_comms_log_workspace_idx ON ops.crew_comms_log USING btree (workspace_id, occurred_at DESC);


--
-- Name: crew_equipment_category_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_equipment_category_idx ON ops.crew_equipment USING btree (category);


--
-- Name: crew_equipment_entity_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_equipment_entity_workspace_idx ON ops.crew_equipment USING btree (entity_id, workspace_id);


--
-- Name: crew_equipment_verification_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_equipment_verification_idx ON ops.crew_equipment USING btree (workspace_id, verification_status) WHERE (verification_status = 'pending'::text);


--
-- Name: crew_equipment_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_equipment_workspace_idx ON ops.crew_equipment USING btree (workspace_id);


--
-- Name: crew_skills_entity_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_skills_entity_workspace_idx ON ops.crew_skills USING btree (entity_id, workspace_id);


--
-- Name: crew_skills_skill_tag_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX crew_skills_skill_tag_idx ON ops.crew_skills USING btree (skill_tag);


--
-- Name: day_sheet_tokens_entity_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX day_sheet_tokens_entity_idx ON ops.day_sheet_tokens USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: day_sheet_tokens_event_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX day_sheet_tokens_event_idx ON ops.day_sheet_tokens USING btree (event_id);


--
-- Name: day_sheet_tokens_expires_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX day_sheet_tokens_expires_idx ON ops.day_sheet_tokens USING btree (expires_at);


--
-- Name: deal_activity_log_deal_id_created_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_activity_log_deal_id_created_at_idx ON ops.deal_activity_log USING btree (deal_id, created_at DESC);


--
-- Name: deal_activity_log_workspace_id_created_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_activity_log_workspace_id_created_at_idx ON ops.deal_activity_log USING btree (workspace_id, created_at DESC);


--
-- Name: deal_crew_catalog_item_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_catalog_item_idx ON ops.deal_crew USING btree (catalog_item_id);


--
-- Name: deal_crew_deal_entity_uniq; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX deal_crew_deal_entity_uniq ON ops.deal_crew USING btree (deal_id, entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: deal_crew_deal_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_deal_id_idx ON ops.deal_crew USING btree (deal_id);


--
-- Name: deal_crew_deal_role_uniq; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX deal_crew_deal_role_uniq ON ops.deal_crew USING btree (deal_id, role_note) WHERE ((entity_id IS NULL) AND (role_note IS NOT NULL));


--
-- Name: deal_crew_department_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_department_idx ON ops.deal_crew USING btree (department) WHERE (department IS NOT NULL);


--
-- Name: deal_crew_entity_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_entity_id_idx ON ops.deal_crew USING btree (entity_id);


--
-- Name: deal_crew_status_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_status_idx ON ops.deal_crew USING btree (deal_id, status);


--
-- Name: deal_crew_waypoints_deal_crew_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_waypoints_deal_crew_idx ON ops.deal_crew_waypoints USING btree (deal_crew_id, sort_order, "time");


--
-- Name: deal_crew_waypoints_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_waypoints_workspace_idx ON ops.deal_crew_waypoints USING btree (workspace_id);


--
-- Name: deal_crew_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_crew_workspace_id_idx ON ops.deal_crew USING btree (workspace_id);


--
-- Name: deal_transitions_deal_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_transitions_deal_id_idx ON ops.deal_transitions USING btree (deal_id, entered_at DESC);


--
-- Name: deal_transitions_pending_dispatch_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_transitions_pending_dispatch_idx ON ops.deal_transitions USING btree (entered_at) WHERE (triggers_dispatched_at IS NULL);


--
-- Name: deal_transitions_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX deal_transitions_workspace_id_idx ON ops.deal_transitions USING btree (workspace_id);


--
-- Name: domain_events_event_id_created_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX domain_events_event_id_created_at_idx ON ops.domain_events USING btree (event_id, created_at DESC);


--
-- Name: domain_events_workspace_type_created_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX domain_events_workspace_type_created_at_idx ON ops.domain_events USING btree (workspace_id, type, created_at DESC);


--
-- Name: entity_capabilities_capability_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX entity_capabilities_capability_idx ON ops.entity_capabilities USING btree (capability);


--
-- Name: entity_capabilities_entity_ws_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX entity_capabilities_entity_ws_idx ON ops.entity_capabilities USING btree (entity_id, workspace_id);


--
-- Name: entity_capabilities_ws_cap_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX entity_capabilities_ws_cap_idx ON ops.entity_capabilities USING btree (workspace_id, capability);


--
-- Name: event_expenses_event_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_expenses_event_id_idx ON ops.event_expenses USING btree (event_id);


--
-- Name: event_expenses_qbo_purchase_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_expenses_qbo_purchase_idx ON ops.event_expenses USING btree (qbo_purchase_id) WHERE (qbo_purchase_id IS NOT NULL);


--
-- Name: event_expenses_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_expenses_workspace_id_idx ON ops.event_expenses USING btree (workspace_id);


--
-- Name: event_gear_items_event_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_gear_items_event_idx ON ops.event_gear_items USING btree (event_id);


--
-- Name: event_gear_items_pkg_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_gear_items_pkg_idx ON ops.event_gear_items USING btree (catalog_package_id) WHERE (catalog_package_id IS NOT NULL);


--
-- Name: event_gear_items_source_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_gear_items_source_idx ON ops.event_gear_items USING btree (event_id, source);


--
-- Name: event_gear_items_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX event_gear_items_workspace_idx ON ops.event_gear_items USING btree (workspace_id);


--
-- Name: events_active_workspace_starts_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX events_active_workspace_starts_at_idx ON ops.events USING btree (workspace_id, starts_at DESC) WHERE (archived_at IS NULL);


--
-- Name: events_starts_at_tz_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX events_starts_at_tz_idx ON ops.events USING btree (starts_at, timezone);


--
-- Name: follow_up_log_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_log_created_idx ON ops.follow_up_log USING btree (deal_id, created_at DESC);


--
-- Name: follow_up_log_deal_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_log_deal_idx ON ops.follow_up_log USING btree (deal_id);


--
-- Name: follow_up_log_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_log_workspace_idx ON ops.follow_up_log USING btree (workspace_id);


--
-- Name: follow_up_queue_deal_pending_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_queue_deal_pending_idx ON ops.follow_up_queue USING btree (deal_id) WHERE ((status = 'pending'::text) AND (superseded_at IS NULL));


--
-- Name: follow_up_queue_deal_reason_pending_uniq; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX follow_up_queue_deal_reason_pending_uniq ON ops.follow_up_queue USING btree (deal_id, reason_type) WHERE (status = 'pending'::text);


--
-- Name: follow_up_queue_priority_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_queue_priority_idx ON ops.follow_up_queue USING btree (workspace_id, priority_score DESC) WHERE (status = 'pending'::text);


--
-- Name: follow_up_queue_status_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_queue_status_idx ON ops.follow_up_queue USING btree (workspace_id, status);


--
-- Name: follow_up_queue_transition_primitive_uniq; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX follow_up_queue_transition_primitive_uniq ON ops.follow_up_queue USING btree (originating_transition_id, primitive_key) WHERE ((originating_transition_id IS NOT NULL) AND (primitive_key IS NOT NULL));


--
-- Name: follow_up_queue_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX follow_up_queue_workspace_idx ON ops.follow_up_queue USING btree (workspace_id);


--
-- Name: idx_daily_briefings_ws_date; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_daily_briefings_ws_date ON ops.daily_briefings USING btree (workspace_id, generated_at DESC);


--
-- Name: idx_deal_notes_deal; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_deal_notes_deal ON ops.deal_notes USING btree (deal_id, created_at DESC);


--
-- Name: idx_deal_transitions_suggestion_insight; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_deal_transitions_suggestion_insight ON ops.deal_transitions USING btree (suggestion_insight_id) WHERE (suggestion_insight_id IS NOT NULL);


--
-- Name: idx_events_client_portal_token; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_events_client_portal_token ON ops.events USING btree (client_portal_token) WHERE (client_portal_token IS NOT NULL);


--
-- Name: idx_follow_up_queue_linked_insight; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_follow_up_queue_linked_insight ON ops.follow_up_queue USING btree (linked_insight_id) WHERE (linked_insight_id IS NOT NULL);


--
-- Name: idx_ops_crew_assignments_workspace_entity; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_ops_crew_assignments_workspace_entity ON ops.crew_assignments USING btree (workspace_id, entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: idx_ops_events_active_starts; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX idx_ops_events_active_starts ON ops.events USING btree (workspace_id, starts_at) WHERE ((archived_at IS NULL) AND (starts_at IS NOT NULL));


--
-- Name: kit_templates_role_tag_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX kit_templates_role_tag_idx ON ops.kit_templates USING btree (role_tag);


--
-- Name: kit_templates_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX kit_templates_workspace_idx ON ops.kit_templates USING btree (workspace_id);


--
-- Name: message_channel_identities_user_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX message_channel_identities_user_idx ON ops.message_channel_identities USING btree (user_id) WHERE ((user_id IS NOT NULL) AND (revoked_at IS NULL));


--
-- Name: message_channel_identities_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX message_channel_identities_workspace_idx ON ops.message_channel_identities USING btree (workspace_id) WHERE (revoked_at IS NULL);


--
-- Name: message_threads_deal_last_message_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX message_threads_deal_last_message_idx ON ops.message_threads USING btree (deal_id, last_message_at DESC) WHERE (deal_id IS NOT NULL);


--
-- Name: message_threads_needs_resolution_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX message_threads_needs_resolution_idx ON ops.message_threads USING btree (workspace_id, last_message_at DESC) WHERE ((needs_resolution = true) AND (dismissed_at IS NULL));


--
-- Name: message_threads_workspace_last_message_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX message_threads_workspace_last_message_idx ON ops.message_threads USING btree (workspace_id, last_message_at DESC);


--
-- Name: messages_provider_message_id_uniq; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX messages_provider_message_id_uniq ON ops.messages USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: messages_thread_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX messages_thread_created_idx ON ops.messages USING btree (thread_id, created_at DESC);


--
-- Name: messages_thread_direction_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX messages_thread_direction_created_idx ON ops.messages USING btree (thread_id, direction, created_at DESC);


--
-- Name: messages_workspace_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX messages_workspace_created_idx ON ops.messages USING btree (workspace_id, created_at DESC);


--
-- Name: messages_workspace_direction_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX messages_workspace_direction_created_idx ON ops.messages USING btree (workspace_id, direction, created_at DESC);


--
-- Name: ops_deal_crew_event_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_deal_crew_event_id_idx ON ops.deal_crew USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: ops_deal_stakeholders_deal_day_of_poc_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_deal_stakeholders_deal_day_of_poc_unique ON ops.deal_stakeholders USING btree (deal_id) WHERE (role = 'day_of_poc'::public.deal_stakeholder_role);


--
-- Name: ops_deal_stakeholders_deal_deal_poc_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_deal_stakeholders_deal_deal_poc_unique ON ops.deal_stakeholders USING btree (deal_id) WHERE (role = 'deal_poc'::public.deal_stakeholder_role);


--
-- Name: ops_deal_stakeholders_deal_entity_role_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_deal_stakeholders_deal_entity_role_unique ON ops.deal_stakeholders USING btree (deal_id, entity_id, role) WHERE (entity_id IS NOT NULL);


--
-- Name: ops_deal_stakeholders_deal_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_deal_stakeholders_deal_id_idx ON ops.deal_stakeholders USING btree (deal_id);


--
-- Name: ops_deal_stakeholders_deal_org_role_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_deal_stakeholders_deal_org_role_unique ON ops.deal_stakeholders USING btree (deal_id, organization_id, role) WHERE (organization_id IS NOT NULL);


--
-- Name: ops_deal_stakeholders_deal_primary_host_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_deal_stakeholders_deal_primary_host_unique ON ops.deal_stakeholders USING btree (deal_id) WHERE ((role = 'host'::public.deal_stakeholder_role) AND (is_primary = true));


--
-- Name: ops_deal_stakeholders_entity_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_deal_stakeholders_entity_id_idx ON ops.deal_stakeholders USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: ops_deal_stakeholders_organization_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_deal_stakeholders_organization_id_idx ON ops.deal_stakeholders USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: ops_events_client_entity_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_client_entity_id_idx ON ops.events USING btree (client_entity_id) WHERE (client_entity_id IS NOT NULL);


--
-- Name: ops_events_deal_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_deal_id_idx ON ops.events USING btree (deal_id) WHERE (deal_id IS NOT NULL);


--
-- Name: ops_events_lifecycle_status_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_lifecycle_status_idx ON ops.events USING btree (lifecycle_status) WHERE (lifecycle_status IS NOT NULL);


--
-- Name: ops_events_project_starts_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_project_starts_at_idx ON ops.events USING btree (project_id, starts_at DESC);


--
-- Name: ops_events_starts_at_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_starts_at_idx ON ops.events USING btree (starts_at);


--
-- Name: ops_events_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_events_workspace_id_idx ON ops.events USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: ops_projects_deal_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_projects_deal_id_idx ON ops.projects USING btree (deal_id) WHERE (deal_id IS NOT NULL);


--
-- Name: ops_projects_is_series_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_projects_is_series_idx ON ops.projects USING btree (workspace_id, is_series);


--
-- Name: ops_workspace_industry_tags_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_industry_tags_workspace_id_idx ON ops.workspace_industry_tags USING btree (workspace_id);


--
-- Name: ops_workspace_job_titles_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_job_titles_workspace_id_idx ON ops.workspace_job_titles USING btree (workspace_id);


--
-- Name: ops_workspace_lead_sources_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_lead_sources_workspace_id_idx ON ops.workspace_lead_sources USING btree (workspace_id);


--
-- Name: ops_workspace_role_permissions_permission_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_role_permissions_permission_id_idx ON ops.workspace_role_permissions USING btree (permission_id);


--
-- Name: ops_workspace_role_permissions_role_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_role_permissions_role_id_idx ON ops.workspace_role_permissions USING btree (role_id);


--
-- Name: ops_workspace_roles_custom_slug_workspace_key; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_workspace_roles_custom_slug_workspace_key ON ops.workspace_roles USING btree (workspace_id, slug) WHERE (workspace_id IS NOT NULL);


--
-- Name: ops_workspace_roles_system_slug_key; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX ops_workspace_roles_system_slug_key ON ops.workspace_roles USING btree (slug) WHERE (workspace_id IS NULL);


--
-- Name: ops_workspace_roles_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_roles_workspace_id_idx ON ops.workspace_roles USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: ops_workspace_skill_presets_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX ops_workspace_skill_presets_workspace_id_idx ON ops.workspace_skill_presets USING btree (workspace_id);


--
-- Name: pipeline_stages_one_lost_per_pipeline; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX pipeline_stages_one_lost_per_pipeline ON ops.pipeline_stages USING btree (pipeline_id) WHERE (kind = 'lost'::text);


--
-- Name: pipeline_stages_one_won_per_pipeline; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX pipeline_stages_one_won_per_pipeline ON ops.pipeline_stages USING btree (pipeline_id) WHERE (kind = 'won'::text);


--
-- Name: pipeline_stages_pipeline_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX pipeline_stages_pipeline_id_idx ON ops.pipeline_stages USING btree (pipeline_id);


--
-- Name: pipeline_stages_tags_gin; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX pipeline_stages_tags_gin ON ops.pipeline_stages USING gin (tags);


--
-- Name: pipeline_stages_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX pipeline_stages_workspace_id_idx ON ops.pipeline_stages USING btree (workspace_id);


--
-- Name: pipelines_one_default_per_workspace; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX pipelines_one_default_per_workspace ON ops.pipelines USING btree (workspace_id) WHERE (is_default = true);


--
-- Name: pipelines_workspace_id_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX pipelines_workspace_id_idx ON ops.pipelines USING btree (workspace_id);


--
-- Name: proposal_builder_events_session_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX proposal_builder_events_session_idx ON ops.proposal_builder_events USING btree (session_id, created_at);


--
-- Name: proposal_builder_events_ws_variant_type_created_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX proposal_builder_events_ws_variant_type_created_idx ON ops.proposal_builder_events USING btree (workspace_id, variant, type, created_at DESC);


--
-- Name: workspace_capability_presets_ws_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX workspace_capability_presets_ws_idx ON ops.workspace_capability_presets USING btree (workspace_id);


--
-- Name: workspace_event_archetypes_slug_unique; Type: INDEX; Schema: ops; Owner: -
--

CREATE UNIQUE INDEX workspace_event_archetypes_slug_unique ON ops.workspace_event_archetypes USING btree (COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), slug) WHERE (archived_at IS NULL);


--
-- Name: workspace_event_archetypes_workspace_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX workspace_event_archetypes_workspace_idx ON ops.workspace_event_archetypes USING btree (workspace_id) WHERE (archived_at IS NULL);


--
-- Name: bridge_pair_attempts_ip_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bridge_pair_attempts_ip_time_idx ON public.bridge_pair_attempts USING btree (client_ip, attempted_at DESC);


--
-- Name: client_portal_access_log_entity_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_access_log_entity_time_idx ON public.client_portal_access_log USING btree (entity_id, created_at DESC);


--
-- Name: client_portal_access_log_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_access_log_session_idx ON public.client_portal_access_log USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: client_portal_access_log_workspace_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_access_log_workspace_time_idx ON public.client_portal_access_log USING btree (workspace_id, created_at DESC);


--
-- Name: client_portal_otp_entity_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_otp_entity_recent_idx ON public.client_portal_otp_challenges USING btree (entity_id, created_at DESC);


--
-- Name: client_portal_otp_expires_at_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_otp_expires_at_pending_idx ON public.client_portal_otp_challenges USING btree (expires_at) WHERE (consumed_at IS NULL);


--
-- Name: client_portal_rate_limits_scope_key_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_rate_limits_scope_key_time_idx ON public.client_portal_rate_limits USING btree (scope, key, action_at DESC);


--
-- Name: client_portal_tokens_entity_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_tokens_entity_active_idx ON public.client_portal_tokens USING btree (entity_id) WHERE (revoked_at IS NULL);


--
-- Name: client_portal_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_tokens_expires_at_idx ON public.client_portal_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: client_portal_tokens_source_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_portal_tokens_source_active_idx ON public.client_portal_tokens USING btree (source_kind, source_id) WHERE (revoked_at IS NULL);


--
-- Name: deals_aion_proactive_disabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_aion_proactive_disabled_idx ON public.deals USING btree (workspace_id) WHERE (aion_proactive_enabled = false);


--
-- Name: deals_lead_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_lead_source_id_idx ON public.deals USING btree (lead_source_id);


--
-- Name: deals_pipeline_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_pipeline_id_idx ON public.deals USING btree (pipeline_id);


--
-- Name: deals_proposed_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_proposed_date_idx ON public.deals USING btree (proposed_date);


--
-- Name: deals_referrer_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_referrer_entity_id_idx ON public.deals USING btree (referrer_entity_id);


--
-- Name: deals_stage_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_stage_id_idx ON public.deals USING btree (stage_id);


--
-- Name: deals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_status_idx ON public.deals USING btree (status);


--
-- Name: deals_win_probability_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_win_probability_idx ON public.deals USING btree (workspace_id, status, owner_user_id) WHERE (status = ANY (ARRAY['won'::text, 'lost'::text]));


--
-- Name: deals_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_workspace_id_idx ON public.deals USING btree (workspace_id);


--
-- Name: idx_agent_configs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_configs_org ON public.agent_configs USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: idx_agent_configs_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_configs_workspace ON public.agent_configs USING btree (workspace_id);


--
-- Name: idx_autonomous_resolutions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_autonomous_resolutions_workspace ON public.autonomous_resolutions USING btree (workspace_id);


--
-- Name: idx_bridge_device_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bridge_device_tokens_hash ON public.bridge_device_tokens USING btree (token_hash);


--
-- Name: idx_bridge_device_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bridge_device_tokens_user ON public.bridge_device_tokens USING btree (user_id);


--
-- Name: idx_bridge_pairing_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bridge_pairing_codes_code ON public.bridge_pairing_codes USING btree (code);


--
-- Name: idx_bridge_sync_status_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bridge_sync_status_device ON public.bridge_sync_status USING btree (device_token_id);


--
-- Name: idx_bridge_sync_status_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bridge_sync_status_event ON public.bridge_sync_status USING btree (event_id);


--
-- Name: idx_bridge_sync_status_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bridge_sync_status_unique ON public.bridge_sync_status USING btree (device_token_id, event_id);


--
-- Name: idx_commercial_orgs_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commercial_orgs_workspace ON public.commercial_organizations USING btree (workspace_id);


--
-- Name: idx_deals_workspace_date_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_workspace_date_status ON public.deals USING btree (workspace_id, proposed_date, status);


--
-- Name: idx_lobby_layouts_user_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lobby_layouts_user_workspace ON public.lobby_layouts USING btree (user_id, workspace_id);


--
-- Name: idx_org_members_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_org ON public.organization_members USING btree (organization_id);


--
-- Name: idx_org_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_user ON public.organization_members USING btree (user_id);


--
-- Name: idx_proposal_items_origin_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_items_origin_package ON public.proposal_items USING btree (origin_package_id) WHERE (origin_package_id IS NOT NULL);


--
-- Name: idx_proposal_items_proposal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_items_proposal_id ON public.proposal_items USING btree (proposal_id);


--
-- Name: idx_proposal_items_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_items_sort ON public.proposal_items USING btree (proposal_id, sort_order);


--
-- Name: idx_proposals_accepted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_accepted_at ON public.proposals USING btree (accepted_at) WHERE (accepted_at IS NOT NULL);


--
-- Name: idx_proposals_deal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_deal_id ON public.proposals USING btree (deal_id);


--
-- Name: idx_proposals_public_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_public_token ON public.proposals USING btree (public_token);


--
-- Name: idx_proposals_resend_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_resend_message_id ON public.proposals USING btree (resend_message_id) WHERE (resend_message_id IS NOT NULL);


--
-- Name: idx_proposals_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposals_workspace_id ON public.proposals USING btree (workspace_id);


--
-- Name: idx_ros_cues_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ros_cues_section ON public.run_of_show_cues USING btree (section_id) WHERE (section_id IS NOT NULL);


--
-- Name: idx_ros_sections_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ros_sections_event ON public.run_of_show_sections USING btree (event_id);


--
-- Name: idx_run_of_show_cues_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_run_of_show_cues_event_id ON public.run_of_show_cues USING btree (event_id);


--
-- Name: idx_subscription_events_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_events_workspace ON public.subscription_events USING btree (workspace_id, created_at DESC);


--
-- Name: idx_subscription_invoices_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_invoices_workspace ON public.subscription_invoices USING btree (workspace_id, created_at DESC);


--
-- Name: invitations_email_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_email_org_idx ON public.invitations USING btree (email, organization_id);


--
-- Name: invitations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_status_idx ON public.invitations USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: invitations_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_token_idx ON public.invitations USING btree (token);


--
-- Name: package_tags_tag_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_tags_tag_id_idx ON public.package_tags USING btree (tag_id);


--
-- Name: packages_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX packages_is_active_idx ON public.packages USING btree (is_active) WHERE (is_active = true);


--
-- Name: packages_workspace_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX packages_workspace_id_idx ON public.packages USING btree (workspace_id);


--
-- Name: sms_otp_attempts_ip_hash_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_otp_attempts_ip_hash_sent_at_idx ON public.sms_otp_attempts USING btree (ip_hash, sent_at DESC);


--
-- Name: sms_otp_attempts_user_id_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_otp_attempts_user_id_sent_at_idx ON public.sms_otp_attempts USING btree (user_id, sent_at DESC);


--
-- Name: sms_otp_codes_user_id_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_otp_codes_user_id_expires_idx ON public.sms_otp_codes USING btree (user_id, expires_at DESC);


--
-- Name: workspace_tags_workspace_label_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_tags_workspace_label_lower_idx ON public.workspace_tags USING btree (workspace_id, lower(TRIM(BOTH FROM label)));


--
-- Name: aion_proactive_lines aion_proactive_lines_set_date_local_trg; Type: TRIGGER; Schema: cortex; Owner: -
--

CREATE TRIGGER aion_proactive_lines_set_date_local_trg BEFORE INSERT ON cortex.aion_proactive_lines FOR EACH ROW EXECUTE FUNCTION cortex.set_aion_proactive_line_date_local();


--
-- Name: relationships trg_cortex_relationships_audit; Type: TRIGGER; Schema: cortex; Owner: -
--

CREATE TRIGGER trg_cortex_relationships_audit BEFORE UPDATE ON cortex.relationships FOR EACH ROW EXECUTE FUNCTION public.cortex_relationships_audit_trail();


--
-- Name: bill_payments finance_bill_payments_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_bill_payments_set_updated_at BEFORE UPDATE ON finance.bill_payments FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: bills finance_bills_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_bills_set_updated_at BEFORE UPDATE ON finance.bills FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: invoice_line_items finance_invoice_line_items_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_invoice_line_items_set_updated_at BEFORE UPDATE ON finance.invoice_line_items FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: invoice_number_sequences finance_invoice_number_sequences_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_invoice_number_sequences_set_updated_at BEFORE UPDATE ON finance.invoice_number_sequences FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: invoices finance_invoices_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_invoices_set_updated_at BEFORE UPDATE ON finance.invoices FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: payments finance_payments_recompute_invoice; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_payments_recompute_invoice AFTER INSERT OR DELETE OR UPDATE ON finance.payments FOR EACH ROW EXECUTE FUNCTION finance.payments_recompute_trigger();


--
-- Name: payments finance_payments_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_payments_set_updated_at BEFORE UPDATE ON finance.payments FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: qbo_connections finance_qbo_connections_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_qbo_connections_set_updated_at BEFORE UPDATE ON finance.qbo_connections FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: qbo_entity_map finance_qbo_entity_map_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_qbo_entity_map_set_updated_at BEFORE UPDATE ON finance.qbo_entity_map FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: sync_jobs finance_sync_jobs_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_sync_jobs_set_updated_at BEFORE UPDATE ON finance.sync_jobs FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: tax_rates finance_tax_rates_set_updated_at; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER finance_tax_rates_set_updated_at BEFORE UPDATE ON finance.tax_rates FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();


--
-- Name: invoices trg_invoice_mode_switch_guard; Type: TRIGGER; Schema: finance; Owner: -
--

CREATE TRIGGER trg_invoice_mode_switch_guard BEFORE INSERT ON finance.invoices FOR EACH ROW EXECUTE FUNCTION finance._guard_invoice_mode_switch();


--
-- Name: crew_assignments crew_assignments_confirmation_drift; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER crew_assignments_confirmation_drift BEFORE INSERT OR UPDATE OF status ON ops.crew_assignments FOR EACH ROW EXECUTE FUNCTION ops.crew_confirmation_drift_check_trg();


--
-- Name: TRIGGER crew_assignments_confirmation_drift ON crew_assignments; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TRIGGER crew_assignments_confirmation_drift ON ops.crew_assignments IS 'Pass 3 Phase 1: rejects status=confirmed writes when the partner deal_crew row is missing or has NULL confirmed_at. See src/features/ops/actions/respond-to-crew-assignment.ts for the canonical mirror pattern. 3 pre-existing orphan rows at migration time are untouched; trigger only fires on new status writes.';


--
-- Name: crew_assignments crew_assignments_set_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER crew_assignments_set_updated_at BEFORE UPDATE ON ops.crew_assignments FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();


--
-- Name: crew_equipment crew_equipment_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER crew_equipment_updated_at BEFORE UPDATE ON ops.crew_equipment FOR EACH ROW EXECUTE FUNCTION ops.set_crew_equipment_updated_at();


--
-- Name: crew_skills crew_skills_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER crew_skills_updated_at BEFORE UPDATE ON ops.crew_skills FOR EACH ROW EXECUTE FUNCTION ops.set_crew_skills_updated_at();


--
-- Name: event_gear_items event_gear_items_set_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER event_gear_items_set_updated_at BEFORE UPDATE ON ops.event_gear_items FOR EACH ROW EXECUTE FUNCTION ops.set_updated_at();


--
-- Name: events events_status_pair_check; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER events_status_pair_check BEFORE INSERT OR UPDATE OF status, lifecycle_status ON ops.events FOR EACH ROW EXECUTE FUNCTION ops.events_status_pair_check_trg();


--
-- Name: TRIGGER events_status_pair_check ON events; Type: COMMENT; Schema: ops; Owner: -
--

COMMENT ON TRIGGER events_status_pair_check ON ops.events IS 'Pass 3 Phase 0: rejects writes that would put status and lifecycle_status into incompatible values. Pass 1.5B kept these in sync at the application layer; this trigger makes the invariant load-bearing.';


--
-- Name: crew_equipment guard_verification_columns; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER guard_verification_columns BEFORE UPDATE ON ops.crew_equipment FOR EACH ROW EXECUTE FUNCTION ops.guard_crew_equipment_verification_columns();


--
-- Name: kit_templates kit_templates_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER kit_templates_updated_at BEFORE UPDATE ON ops.kit_templates FOR EACH ROW EXECUTE FUNCTION ops.set_kit_templates_updated_at();


--
-- Name: event_expenses trg_event_expenses_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER trg_event_expenses_updated_at BEFORE UPDATE ON ops.event_expenses FOR EACH ROW EXECUTE FUNCTION ops.set_event_expenses_updated_at();


--
-- Name: pipeline_stages trg_pipeline_stages_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER trg_pipeline_stages_updated_at BEFORE UPDATE ON ops.pipeline_stages FOR EACH ROW EXECUTE FUNCTION ops.set_pipeline_stages_updated_at();


--
-- Name: pipelines trg_pipelines_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER trg_pipelines_updated_at BEFORE UPDATE ON ops.pipelines FOR EACH ROW EXECUTE FUNCTION ops.set_pipelines_updated_at();


--
-- Name: workspace_ros_templates trg_ros_template_updated_at; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER trg_ros_template_updated_at BEFORE UPDATE ON ops.workspace_ros_templates FOR EACH ROW EXECUTE FUNCTION ops.set_ros_template_updated_at();


--
-- Name: events trg_sync_deal_proposed_date; Type: TRIGGER; Schema: ops; Owner: -
--

CREATE TRIGGER trg_sync_deal_proposed_date AFTER INSERT OR DELETE OR UPDATE OF starts_at, archived_at, deal_id ON ops.events FOR EACH ROW EXECUTE FUNCTION public._sync_deal_proposed_date_from_events();


--
-- Name: proposals client_portal_cascade_revoke_on_proposal_token; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER client_portal_cascade_revoke_on_proposal_token AFTER UPDATE OF public_token ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change();


--
-- Name: TRIGGER client_portal_cascade_revoke_on_proposal_token ON proposals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER client_portal_cascade_revoke_on_proposal_token ON public.proposals IS 'Invariant §14.6(7): sessions minted from a proposal public_token are force-revoked when the source token changes.';


--
-- Name: workspace_members enforce_seat_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_seat_limit BEFORE INSERT ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.check_seat_limit();


--
-- Name: deals trg_record_deal_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_record_deal_transition AFTER INSERT OR UPDATE OF status, stage_id ON public.deals FOR EACH ROW EXECUTE FUNCTION public.record_deal_transition();


--
-- Name: run_of_show_cues trg_ros_cue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ros_cue_updated_at BEFORE UPDATE ON public.run_of_show_cues FOR EACH ROW EXECUTE FUNCTION public.set_ros_cue_updated_at();


--
-- Name: workspaces trg_seed_default_pipeline_on_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_default_pipeline_on_workspace AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION ops.seed_default_pipeline_on_workspace_insert();


--
-- Name: deals trg_sync_deal_status_from_stage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_deal_status_from_stage BEFORE INSERT OR UPDATE OF stage_id ON public.deals FOR EACH ROW EXECUTE FUNCTION public.sync_deal_status_from_stage();


--
-- Name: workspace_members trg_sync_workspace_roles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_workspace_roles AFTER INSERT OR DELETE OR UPDATE OF role_id, role ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.sync_workspace_roles_to_app_metadata();


--
-- Name: item_assignees item_assignees_package_id_fkey; Type: FK CONSTRAINT; Schema: catalog; Owner: -
--

ALTER TABLE ONLY catalog.item_assignees
    ADD CONSTRAINT item_assignees_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: aion_insights aion_insights_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_insights
    ADD CONSTRAINT aion_insights_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: aion_memory aion_memory_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_memory
    ADD CONSTRAINT aion_memory_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: aion_memory aion_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_memory
    ADD CONSTRAINT aion_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: aion_memory aion_memory_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_memory
    ADD CONSTRAINT aion_memory_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: aion_messages aion_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_messages
    ADD CONSTRAINT aion_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES cortex.aion_sessions(id) ON DELETE CASCADE;


--
-- Name: aion_proactive_lines aion_proactive_lines_deal_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_proactive_lines
    ADD CONSTRAINT aion_proactive_lines_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: aion_proactive_lines aion_proactive_lines_dismissed_by_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_proactive_lines
    ADD CONSTRAINT aion_proactive_lines_dismissed_by_fkey FOREIGN KEY (dismissed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: aion_proactive_lines aion_proactive_lines_session_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_proactive_lines
    ADD CONSTRAINT aion_proactive_lines_session_id_fkey FOREIGN KEY (session_id) REFERENCES cortex.aion_sessions(id) ON DELETE SET NULL;


--
-- Name: aion_proactive_lines aion_proactive_lines_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_proactive_lines
    ADD CONSTRAINT aion_proactive_lines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: aion_refusal_log aion_refusal_log_user_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_refusal_log
    ADD CONSTRAINT aion_refusal_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: aion_refusal_log aion_refusal_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_refusal_log
    ADD CONSTRAINT aion_refusal_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: aion_sessions aion_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_sessions
    ADD CONSTRAINT aion_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: aion_sessions aion_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.aion_sessions
    ADD CONSTRAINT aion_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: capture_events capture_events_created_follow_up_queue_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_created_follow_up_queue_id_fkey FOREIGN KEY (created_follow_up_queue_id) REFERENCES ops.follow_up_queue(id);


--
-- Name: capture_events capture_events_linked_deal_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_linked_deal_id_fkey FOREIGN KEY (linked_deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: capture_events capture_events_linked_event_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_linked_event_id_fkey FOREIGN KEY (linked_event_id) REFERENCES ops.events(id) ON DELETE SET NULL;


--
-- Name: capture_events capture_events_resolved_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_resolved_entity_id_fkey FOREIGN KEY (resolved_entity_id) REFERENCES directory.entities(id);


--
-- Name: capture_events capture_events_user_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: capture_events capture_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.capture_events
    ADD CONSTRAINT capture_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: consent_log consent_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.consent_log
    ADD CONSTRAINT consent_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: entity_working_notes entity_working_notes_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.entity_working_notes
    ADD CONSTRAINT entity_working_notes_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE CASCADE;


--
-- Name: entity_working_notes entity_working_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.entity_working_notes
    ADD CONSTRAINT entity_working_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: entity_working_notes entity_working_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.entity_working_notes
    ADD CONSTRAINT entity_working_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: feature_access_requests feature_access_requests_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.feature_access_requests
    ADD CONSTRAINT feature_access_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: memory_pending memory_pending_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory_pending
    ADD CONSTRAINT memory_pending_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: memory memory_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.memory
    ADD CONSTRAINT memory_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_client_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_client_entity_id_fkey FOREIGN KEY (client_entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_counterparty_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_counterparty_entity_id_fkey FOREIGN KEY (counterparty_entity_id) REFERENCES directory.entities(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_created_by_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_related_deal_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_related_deal_id_fkey FOREIGN KEY (related_deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.referrals
    ADD CONSTRAINT referrals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_source_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.relationships
    ADD CONSTRAINT relationships_source_entity_id_fkey FOREIGN KEY (source_entity_id) REFERENCES directory.entities(id);


--
-- Name: relationships relationships_target_entity_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.relationships
    ADD CONSTRAINT relationships_target_entity_id_fkey FOREIGN KEY (target_entity_id) REFERENCES directory.entities(id);


--
-- Name: ui_notices ui_notices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: cortex; Owner: -
--

ALTER TABLE ONLY cortex.ui_notices
    ADD CONSTRAINT ui_notices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: entities entities_claimed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entities
    ADD CONSTRAINT entities_claimed_by_user_id_fkey FOREIGN KEY (claimed_by_user_id) REFERENCES auth.users(id);


--
-- Name: entities entities_owner_workspace_id_fkey; Type: FK CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entities
    ADD CONSTRAINT entities_owner_workspace_id_fkey FOREIGN KEY (owner_workspace_id) REFERENCES public.workspaces(id);


--
-- Name: entity_documents entity_documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entity_documents
    ADD CONSTRAINT entity_documents_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE CASCADE;


--
-- Name: entity_documents entity_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entity_documents
    ADD CONSTRAINT entity_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: entity_documents entity_documents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: directory; Owner: -
--

ALTER TABLE ONLY directory.entity_documents
    ADD CONSTRAINT entity_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: bill_payments bill_payments_bill_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bill_payments
    ADD CONSTRAINT bill_payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES finance.bills(id) ON DELETE CASCADE;


--
-- Name: bill_payments bill_payments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bill_payments
    ADD CONSTRAINT bill_payments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: bills bills_event_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE SET NULL;


--
-- Name: bills bills_pay_to_entity_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_pay_to_entity_id_fkey FOREIGN KEY (pay_to_entity_id) REFERENCES directory.entities(id);


--
-- Name: bills bills_project_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_project_id_fkey FOREIGN KEY (project_id) REFERENCES ops.projects(id) ON DELETE SET NULL;


--
-- Name: bills bills_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.bills
    ADD CONSTRAINT bills_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoice_line_items
    ADD CONSTRAINT invoice_line_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoice_number_sequences invoice_number_sequences_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoice_number_sequences
    ADD CONSTRAINT invoice_number_sequences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_bill_to_entity_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_bill_to_entity_id_fkey FOREIGN KEY (bill_to_entity_id) REFERENCES directory.entities(id);


--
-- Name: invoices invoices_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_deal_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_event_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_parent_invoice_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_parent_invoice_id_fkey FOREIGN KEY (parent_invoice_id) REFERENCES finance.invoices(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES ops.projects(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_proposal_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_sent_by_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.invoices
    ADD CONSTRAINT invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES finance.invoices(id) ON DELETE CASCADE;


--
-- Name: payments payments_parent_payment_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_parent_payment_id_fkey FOREIGN KEY (parent_payment_id) REFERENCES finance.payments(id) ON DELETE SET NULL;


--
-- Name: payments payments_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.payments
    ADD CONSTRAINT payments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: qbo_connections qbo_connections_connected_by_user_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_connections
    ADD CONSTRAINT qbo_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: qbo_connections qbo_connections_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_connections
    ADD CONSTRAINT qbo_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: qbo_entity_map qbo_entity_map_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_entity_map
    ADD CONSTRAINT qbo_entity_map_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: qbo_sync_log qbo_sync_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.qbo_sync_log
    ADD CONSTRAINT qbo_sync_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: stripe_webhook_events stripe_webhook_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sync_jobs sync_jobs_depends_on_job_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.sync_jobs
    ADD CONSTRAINT sync_jobs_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES finance.sync_jobs(id) ON DELETE SET NULL;


--
-- Name: sync_jobs sync_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.sync_jobs
    ADD CONSTRAINT sync_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: tax_rates tax_rates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: finance; Owner: -
--

ALTER TABLE ONLY finance.tax_rates
    ADD CONSTRAINT tax_rates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.assignments
    ADD CONSTRAINT assignments_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id);


--
-- Name: assignments assignments_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.assignments
    ADD CONSTRAINT assignments_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: crew_assignments crew_assignments_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_assignments
    ADD CONSTRAINT crew_assignments_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: crew_assignments crew_assignments_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_assignments
    ADD CONSTRAINT crew_assignments_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: crew_comms_log crew_comms_log_deal_crew_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_comms_log
    ADD CONSTRAINT crew_comms_log_deal_crew_id_fkey FOREIGN KEY (deal_crew_id) REFERENCES ops.deal_crew(id) ON DELETE CASCADE;


--
-- Name: crew_confirmation_tokens crew_confirmation_tokens_assignment_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_confirmation_tokens
    ADD CONSTRAINT crew_confirmation_tokens_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES ops.crew_assignments(id) ON DELETE SET NULL;


--
-- Name: crew_equipment crew_equipment_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.crew_equipment
    ADD CONSTRAINT crew_equipment_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: daily_briefings daily_briefings_user_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.daily_briefings
    ADD CONSTRAINT daily_briefings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: daily_briefings daily_briefings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.daily_briefings
    ADD CONSTRAINT daily_briefings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: day_sheet_tokens day_sheet_tokens_deal_crew_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.day_sheet_tokens
    ADD CONSTRAINT day_sheet_tokens_deal_crew_id_fkey FOREIGN KEY (deal_crew_id) REFERENCES ops.deal_crew(id) ON DELETE SET NULL;


--
-- Name: day_sheet_tokens day_sheet_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.day_sheet_tokens
    ADD CONSTRAINT day_sheet_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: deal_activity_log deal_activity_log_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_activity_log
    ADD CONSTRAINT deal_activity_log_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_activity_log deal_activity_log_pipeline_stage_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_activity_log
    ADD CONSTRAINT deal_activity_log_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES ops.pipeline_stages(id);


--
-- Name: deal_crew deal_crew_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_crew
    ADD CONSTRAINT deal_crew_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_crew deal_crew_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_crew
    ADD CONSTRAINT deal_crew_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: deal_crew_waypoints deal_crew_waypoints_deal_crew_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_crew_waypoints
    ADD CONSTRAINT deal_crew_waypoints_deal_crew_id_fkey FOREIGN KEY (deal_crew_id) REFERENCES ops.deal_crew(id) ON DELETE CASCADE;


--
-- Name: deal_notes deal_notes_author_user_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_notes
    ADD CONSTRAINT deal_notes_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_notes deal_notes_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_notes
    ADD CONSTRAINT deal_notes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_notes deal_notes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_notes
    ADD CONSTRAINT deal_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: deal_stakeholders deal_stakeholders_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_stakeholders
    ADD CONSTRAINT deal_stakeholders_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_transitions deal_transitions_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_transitions deal_transitions_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES ops.pipeline_stages(id);


--
-- Name: deal_transitions deal_transitions_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES ops.pipelines(id);


--
-- Name: deal_transitions deal_transitions_suggestion_insight_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_suggestion_insight_id_fkey FOREIGN KEY (suggestion_insight_id) REFERENCES cortex.aion_insights(id) ON DELETE SET NULL;


--
-- Name: deal_transitions deal_transitions_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.deal_transitions
    ADD CONSTRAINT deal_transitions_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES ops.pipeline_stages(id);


--
-- Name: domain_events domain_events_created_by_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.domain_events
    ADD CONSTRAINT domain_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: domain_events domain_events_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.domain_events
    ADD CONSTRAINT domain_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: domain_events domain_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.domain_events
    ADD CONSTRAINT domain_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: event_expenses event_expenses_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_expenses
    ADD CONSTRAINT event_expenses_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: event_expenses event_expenses_vendor_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_expenses
    ADD CONSTRAINT event_expenses_vendor_entity_id_fkey FOREIGN KEY (vendor_entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: event_expenses event_expenses_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_expenses
    ADD CONSTRAINT event_expenses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: event_gear_items event_gear_items_event_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.event_gear_items
    ADD CONSTRAINT event_gear_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: events events_client_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_client_entity_id_fkey FOREIGN KEY (client_entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: events events_deal_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;


--
-- Name: events events_project_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_project_id_fkey FOREIGN KEY (project_id) REFERENCES ops.projects(id) ON DELETE CASCADE;


--
-- Name: events events_venue_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_venue_entity_id_fkey FOREIGN KEY (venue_entity_id) REFERENCES directory.entities(id);


--
-- Name: events events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.events
    ADD CONSTRAINT events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: follow_up_queue follow_up_queue_linked_insight_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.follow_up_queue
    ADD CONSTRAINT follow_up_queue_linked_insight_id_fkey FOREIGN KEY (linked_insight_id) REFERENCES cortex.aion_insights(id) ON DELETE SET NULL;


--
-- Name: message_threads message_threads_primary_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.message_threads
    ADD CONSTRAINT message_threads_primary_entity_id_fkey FOREIGN KEY (primary_entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: messages messages_from_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.messages
    ADD CONSTRAINT messages_from_entity_id_fkey FOREIGN KEY (from_entity_id) REFERENCES directory.entities(id) ON DELETE SET NULL;


--
-- Name: messages messages_in_reply_to_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.messages
    ADD CONSTRAINT messages_in_reply_to_fkey FOREIGN KEY (in_reply_to) REFERENCES ops.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES ops.message_threads(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES ops.pipelines(id) ON DELETE CASCADE;


--
-- Name: pipelines pipelines_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.pipelines
    ADD CONSTRAINT pipelines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: projects projects_client_entity_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.projects
    ADD CONSTRAINT projects_client_entity_id_fkey FOREIGN KEY (client_entity_id) REFERENCES directory.entities(id);


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: proposal_builder_events proposal_builder_events_user_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.proposal_builder_events
    ADD CONSTRAINT proposal_builder_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: proposal_builder_events proposal_builder_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.proposal_builder_events
    ADD CONSTRAINT proposal_builder_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_call_time_rules workspace_call_time_rules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_call_time_rules
    ADD CONSTRAINT workspace_call_time_rules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_capability_presets workspace_capability_presets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_capability_presets
    ADD CONSTRAINT workspace_capability_presets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_event_archetypes workspace_event_archetypes_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_event_archetypes
    ADD CONSTRAINT workspace_event_archetypes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_event_archetypes workspace_event_archetypes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_event_archetypes
    ADD CONSTRAINT workspace_event_archetypes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_industry_tags workspace_industry_tags_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_industry_tags
    ADD CONSTRAINT workspace_industry_tags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_job_titles workspace_job_titles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_job_titles
    ADD CONSTRAINT workspace_job_titles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_lead_sources workspace_lead_sources_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_lead_sources
    ADD CONSTRAINT workspace_lead_sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_role_permissions workspace_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_role_permissions
    ADD CONSTRAINT workspace_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES ops.workspace_permissions(id) ON DELETE RESTRICT;


--
-- Name: workspace_role_permissions workspace_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_role_permissions
    ADD CONSTRAINT workspace_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES ops.workspace_roles(id) ON DELETE CASCADE;


--
-- Name: workspace_roles workspace_roles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_roles
    ADD CONSTRAINT workspace_roles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_skill_presets workspace_skill_presets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.workspace_skill_presets
    ADD CONSTRAINT workspace_skill_presets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: agent_configs agent_configs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.commercial_organizations(id) ON DELETE CASCADE;


--
-- Name: agent_configs agent_configs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: autonomous_resolutions autonomous_resolutions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomous_resolutions
    ADD CONSTRAINT autonomous_resolutions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: bridge_device_tokens bridge_device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_device_tokens
    ADD CONSTRAINT bridge_device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bridge_pairing_codes bridge_pairing_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_pairing_codes
    ADD CONSTRAINT bridge_pairing_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bridge_sync_status bridge_sync_status_device_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_sync_status
    ADD CONSTRAINT bridge_sync_status_device_token_id_fkey FOREIGN KEY (device_token_id) REFERENCES public.bridge_device_tokens(id) ON DELETE CASCADE;


--
-- Name: client_portal_otp_challenges client_portal_otp_challenges_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_otp_challenges
    ADD CONSTRAINT client_portal_otp_challenges_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE CASCADE;


--
-- Name: client_portal_tokens client_portal_tokens_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_tokens
    ADD CONSTRAINT client_portal_tokens_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES directory.entities(id) ON DELETE CASCADE;


--
-- Name: commercial_organizations commercial_organizations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_organizations
    ADD CONSTRAINT commercial_organizations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: deals deals_lead_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_lead_source_id_fkey FOREIGN KEY (lead_source_id) REFERENCES ops.workspace_lead_sources(id) ON DELETE SET NULL;


--
-- Name: deals deals_owner_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_entity_id_fkey FOREIGN KEY (owner_entity_id) REFERENCES directory.entities(id);


--
-- Name: deals deals_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES ops.pipelines(id);


--
-- Name: deals deals_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES ops.pipeline_stages(id);


--
-- Name: deals deals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: guardians guardians_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lobby_layouts lobby_layouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lobby_layouts
    ADD CONSTRAINT lobby_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lobby_layouts lobby_layouts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lobby_layouts
    ADD CONSTRAINT lobby_layouts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.commercial_organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: package_tags package_tags_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_tags
    ADD CONSTRAINT package_tags_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: package_tags package_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_tags
    ADD CONSTRAINT package_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.workspace_tags(id) ON DELETE CASCADE;


--
-- Name: packages packages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: passkeys passkeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proposal_client_selections proposal_client_selections_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_client_selections
    ADD CONSTRAINT proposal_client_selections_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.proposal_items(id) ON DELETE CASCADE;


--
-- Name: proposal_client_selections proposal_client_selections_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_client_selections
    ADD CONSTRAINT proposal_client_selections_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;


--
-- Name: proposal_items proposal_items_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_items
    ADD CONSTRAINT proposal_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: proposal_items proposal_items_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_items
    ADD CONSTRAINT proposal_items_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: recovery_requests recovery_requests_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_requests
    ADD CONSTRAINT recovery_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recovery_shards recovery_shards_guardian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_shards
    ADD CONSTRAINT recovery_shards_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON DELETE CASCADE;


--
-- Name: recovery_shards recovery_shards_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_shards
    ADD CONSTRAINT recovery_shards_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: run_of_show_cues run_of_show_cues_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_of_show_cues
    ADD CONSTRAINT run_of_show_cues_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: run_of_show_cues run_of_show_cues_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_of_show_cues
    ADD CONSTRAINT run_of_show_cues_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.run_of_show_sections(id) ON DELETE SET NULL;


--
-- Name: run_of_show_sections run_of_show_sections_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_of_show_sections
    ADD CONSTRAINT run_of_show_sections_event_id_fkey FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE CASCADE;


--
-- Name: sms_otp_attempts sms_otp_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_otp_attempts
    ADD CONSTRAINT sms_otp_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sms_otp_codes sms_otp_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_otp_codes
    ADD CONSTRAINT sms_otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscription_events subscription_events_triggered_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subscription_events subscription_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: subscription_invoices subscription_invoices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_lobby_active user_lobby_active_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lobby_active
    ADD CONSTRAINT user_lobby_active_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_lobby_active user_lobby_active_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lobby_active
    ADD CONSTRAINT user_lobby_active_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES ops.workspace_roles(id) ON DELETE RESTRICT;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_tags workspace_tags_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tags
    ADD CONSTRAINT workspace_tags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: item_assignees; Type: ROW SECURITY; Schema: catalog; Owner: -
--

ALTER TABLE catalog.item_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: item_assignees item_assignees_delete; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY item_assignees_delete ON catalog.item_assignees FOR DELETE USING ((package_id IN ( SELECT packages.id
   FROM public.packages
  WHERE (packages.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: item_assignees item_assignees_insert; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY item_assignees_insert ON catalog.item_assignees FOR INSERT WITH CHECK ((package_id IN ( SELECT packages.id
   FROM public.packages
  WHERE (packages.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: item_assignees item_assignees_select; Type: POLICY; Schema: catalog; Owner: -
--

CREATE POLICY item_assignees_select ON catalog.item_assignees FOR SELECT USING ((package_id IN ( SELECT packages.id
   FROM public.packages
  WHERE (packages.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: relationships View Graph; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY "View Graph" ON cortex.relationships FOR SELECT USING ((source_entity_id IN ( SELECT entities.id
   FROM directory.entities
  WHERE (entities.owner_workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: aion_insights; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_memory; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_memory aion_memory_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY aion_memory_select ON cortex.aion_memory FOR SELECT USING ((workspace_id IN ( SELECT wm.workspace_id
   FROM public.workspace_members wm
  WHERE (wm.user_id = auth.uid()))));


--
-- Name: aion_messages; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_messages aion_messages_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY aion_messages_select ON cortex.aion_messages FOR SELECT USING ((session_id IN ( SELECT s.id
   FROM cortex.aion_sessions s
  WHERE (s.user_id = auth.uid()))));


--
-- Name: aion_proactive_lines; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_proactive_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_proactive_lines aion_proactive_lines_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY aion_proactive_lines_select ON cortex.aion_proactive_lines FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: aion_refusal_log; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_refusal_log ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_sessions; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.aion_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_sessions aion_sessions_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY aion_sessions_select ON cortex.aion_sessions FOR SELECT USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT wm.workspace_id
   FROM public.workspace_members wm
  WHERE (wm.user_id = auth.uid())))));


--
-- Name: capture_events; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.capture_events ENABLE ROW LEVEL SECURITY;

--
-- Name: capture_events capture_events_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY capture_events_select ON cortex.capture_events FOR SELECT USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND ((visibility = 'workspace'::text) OR ((visibility = 'user'::text) AND (user_id = auth.uid())))));


--
-- Name: consent_log; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.consent_log ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_log consent_log_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY consent_log_select ON cortex.consent_log FOR SELECT USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND ((user_id = auth.uid()) OR (public.get_member_role_slug(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: entity_working_notes; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.entity_working_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_working_notes entity_working_notes_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY entity_working_notes_select ON cortex.entity_working_notes FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: feature_access_requests; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.feature_access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_access_requests feature_access_requests_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY feature_access_requests_select ON cortex.feature_access_requests FOR SELECT USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND ((requested_by = auth.uid()) OR (public.get_member_role_slug(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: aion_insights insights_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY insights_select ON cortex.aion_insights FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: memory; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.memory ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_pending; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.memory_pending ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_pending memory_pending_deny_authenticated; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY memory_pending_deny_authenticated ON cortex.memory_pending TO authenticated USING (false) WITH CHECK (false);


--
-- Name: POLICY memory_pending_deny_authenticated ON memory_pending; Type: COMMENT; Schema: cortex; Owner: -
--

COMMENT ON POLICY memory_pending_deny_authenticated ON cortex.memory_pending IS 'Internal queue — authenticated callers have no legitimate reason to read or write. Service role bypasses RLS for enqueue/drain RPC use.';


--
-- Name: memory memory_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY memory_select ON cortex.memory FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: referrals; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals referrals_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY referrals_select ON cortex.referrals FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: aion_refusal_log refusal_log_read; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY refusal_log_read ON cortex.aion_refusal_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: relationships; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: ui_notices; Type: ROW SECURITY; Schema: cortex; Owner: -
--

ALTER TABLE cortex.ui_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: ui_notices ui_notices_mark_seen; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY ui_notices_mark_seen ON cortex.ui_notices FOR UPDATE USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))) WITH CHECK (((user_id = auth.uid()) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))));


--
-- Name: ui_notices ui_notices_select; Type: POLICY; Schema: cortex; Owner: -
--

CREATE POLICY ui_notices_select ON cortex.ui_notices FOR SELECT USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))));


--
-- Name: entities Edit Directory; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY "Edit Directory" ON directory.entities USING ((owner_workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entities View Directory; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY "View Directory" ON directory.entities FOR SELECT USING (((owner_workspace_id IS NULL) OR (owner_workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))));


--
-- Name: entities; Type: ROW SECURITY; Schema: directory; Owner: -
--

ALTER TABLE directory.entities ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_documents; Type: ROW SECURITY; Schema: directory; Owner: -
--

ALTER TABLE directory.entity_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_documents entity_documents_delete; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY entity_documents_delete ON directory.entity_documents FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_documents entity_documents_insert; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY entity_documents_insert ON directory.entity_documents FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_documents entity_documents_select; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY entity_documents_select ON directory.entity_documents FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_documents entity_documents_update; Type: POLICY; Schema: directory; Owner: -
--

CREATE POLICY entity_documents_update ON directory.entity_documents FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bill_payments; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.bill_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: bill_payments bill_payments_insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bill_payments_insert ON finance.bill_payments FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bill_payments bill_payments_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bill_payments_select ON finance.bill_payments FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bill_payments bill_payments_update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bill_payments_update ON finance.bill_payments FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bills; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.bills ENABLE ROW LEVEL SECURITY;

--
-- Name: bills bills_delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bills_delete ON finance.bills FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bills bills_insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bills_insert ON finance.bills FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bills bills_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bills_select ON finance.bills FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: bills bills_update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY bills_update ON finance.bills FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items invoice_line_items_delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoice_line_items_delete ON finance.invoice_line_items FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoice_line_items invoice_line_items_insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoice_line_items_insert ON finance.invoice_line_items FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoice_line_items invoice_line_items_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoice_line_items_select ON finance.invoice_line_items FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoice_line_items invoice_line_items_update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoice_line_items_update ON finance.invoice_line_items FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoice_number_sequences; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.invoice_number_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_number_sequences invoice_number_sequences_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoice_number_sequences_select ON finance.invoice_number_sequences FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoices; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoices_delete ON finance.invoices FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoices invoices_insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoices_insert ON finance.invoices FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoices invoices_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoices_select ON finance.invoices FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: invoices invoices_update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY invoices_update ON finance.invoices FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: payments; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY payments_select ON finance.payments FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: qbo_connections; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.qbo_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: qbo_connections qbo_connections_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY qbo_connections_select ON finance.qbo_connections FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: qbo_entity_map; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.qbo_entity_map ENABLE ROW LEVEL SECURITY;

--
-- Name: qbo_entity_map qbo_entity_map_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY qbo_entity_map_select ON finance.qbo_entity_map FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: qbo_sync_log; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.qbo_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: qbo_sync_log qbo_sync_log_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY qbo_sync_log_select ON finance.qbo_sync_log FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_jobs; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_jobs sync_jobs_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY sync_jobs_select ON finance.sync_jobs FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: tax_rates; Type: ROW SECURITY; Schema: finance; Owner: -
--

ALTER TABLE finance.tax_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_rates tax_rates_insert; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY tax_rates_insert ON finance.tax_rates FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: tax_rates tax_rates_select; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY tax_rates_select ON finance.tax_rates FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: tax_rates tax_rates_update; Type: POLICY; Schema: finance; Owner: -
--

CREATE POLICY tax_rates_update ON finance.tax_rates FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: assignments Workspace Assignments; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "Workspace Assignments" ON ops.assignments USING ((event_id IN ( SELECT e.id
   FROM (ops.events e
     JOIN ops.projects p ON ((p.id = e.project_id)))
  WHERE (p.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: events Workspace Events; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "Workspace Events" ON ops.events USING ((project_id IN ( SELECT projects.id
   FROM ops.projects
  WHERE (projects.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: projects Workspace Ops; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "Workspace Ops" ON ops.projects USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: aion_write_log; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.aion_write_log ENABLE ROW LEVEL SECURITY;

--
-- Name: aion_write_log aion_write_log_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY aion_write_log_select ON ops.aion_write_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: events anon_select_by_client_portal_token; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY anon_select_by_client_portal_token ON ops.events FOR SELECT TO anon USING (((client_portal_token IS NOT NULL) AND (client_portal_token = ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'client_portal_token'::text))));


--
-- Name: assignments; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_call_time_rules call_time_rules_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY call_time_rules_delete ON ops.workspace_call_time_rules FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_call_time_rules call_time_rules_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY call_time_rules_insert ON ops.workspace_call_time_rules FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_call_time_rules call_time_rules_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY call_time_rules_select ON ops.workspace_call_time_rules FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_call_time_rules call_time_rules_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY call_time_rules_update ON ops.workspace_call_time_rules FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: events client_view_own_events; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY client_view_own_events ON ops.events FOR SELECT USING ((client_entity_id IN ( SELECT public.get_my_client_entity_ids() AS get_my_client_entity_ids)));


--
-- Name: projects client_view_own_projects; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY client_view_own_projects ON ops.projects FOR SELECT USING ((client_entity_id IN ( SELECT public.get_my_client_entity_ids() AS get_my_client_entity_ids)));


--
-- Name: crew_assignments; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.crew_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: crew_assignments crew_assignments_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_assignments_delete ON ops.crew_assignments FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_assignments crew_assignments_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_assignments_insert ON ops.crew_assignments FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_assignments crew_assignments_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_assignments_select ON ops.crew_assignments FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_assignments crew_assignments_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_assignments_update ON ops.crew_assignments FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_comms_log; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.crew_comms_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crew_comms_log crew_comms_log_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_comms_log_delete ON ops.crew_comms_log FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_comms_log crew_comms_log_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_comms_log_insert ON ops.crew_comms_log FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_comms_log crew_comms_log_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_comms_log_select ON ops.crew_comms_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_comms_log crew_comms_log_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_comms_log_update ON ops.crew_comms_log FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_equipment; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.crew_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: crew_equipment crew_equipment_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_equipment_delete ON ops.crew_equipment FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_equipment crew_equipment_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_equipment_insert ON ops.crew_equipment FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_equipment crew_equipment_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_equipment_select ON ops.crew_equipment FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_equipment crew_equipment_update_safe; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_equipment_update_safe ON ops.crew_equipment FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND (verification_status = ( SELECT ce.verification_status
   FROM ops.crew_equipment ce
  WHERE (ce.id = crew_equipment.id)))));


--
-- Name: crew_skills; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.crew_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: crew_skills crew_skills_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_skills_delete ON ops.crew_skills FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_skills crew_skills_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_skills_insert ON ops.crew_skills FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_skills crew_skills_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_skills_select ON ops.crew_skills FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: crew_skills crew_skills_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY crew_skills_update ON ops.crew_skills FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: daily_briefings; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.daily_briefings ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_briefings daily_briefings_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY daily_briefings_insert ON ops.daily_briefings FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: daily_briefings daily_briefings_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY daily_briefings_select ON ops.daily_briefings FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: day_sheet_tokens; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.day_sheet_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: day_sheet_tokens day_sheet_tokens_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY day_sheet_tokens_delete ON ops.day_sheet_tokens FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: day_sheet_tokens day_sheet_tokens_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY day_sheet_tokens_insert ON ops.day_sheet_tokens FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: day_sheet_tokens day_sheet_tokens_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY day_sheet_tokens_select ON ops.day_sheet_tokens FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_activity_log; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_activity_log deal_activity_log_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_activity_log_select ON ops.deal_activity_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_crew ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_crew deal_crew_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_delete ON ops.deal_crew FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew deal_crew_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_insert ON ops.deal_crew FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew deal_crew_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_select ON ops.deal_crew FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew deal_crew_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_update ON ops.deal_crew FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew_waypoints; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_crew_waypoints ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_crew_waypoints deal_crew_waypoints_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_waypoints_delete ON ops.deal_crew_waypoints FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew_waypoints deal_crew_waypoints_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_waypoints_insert ON ops.deal_crew_waypoints FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew_waypoints deal_crew_waypoints_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_waypoints_select ON ops.deal_crew_waypoints FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_crew_waypoints deal_crew_waypoints_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_crew_waypoints_update ON ops.deal_crew_waypoints FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_notes; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_notes deal_notes_ws_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_notes_ws_delete ON ops.deal_notes FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_notes deal_notes_ws_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_notes_ws_insert ON ops.deal_notes FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_notes deal_notes_ws_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_notes_ws_select ON ops.deal_notes FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_notes deal_notes_ws_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_notes_ws_update ON ops.deal_notes FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: deal_stakeholders; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_stakeholders ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_stakeholders deal_stakeholders_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_stakeholders_delete ON ops.deal_stakeholders FOR DELETE USING ((deal_id IN ( SELECT deals.id
   FROM public.deals
  WHERE (deals.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: deal_stakeholders deal_stakeholders_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_stakeholders_insert ON ops.deal_stakeholders FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (deal_id IN ( SELECT deals.id
   FROM public.deals
  WHERE (deals.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))));


--
-- Name: deal_stakeholders deal_stakeholders_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_stakeholders_select ON ops.deal_stakeholders FOR SELECT USING ((deal_id IN ( SELECT deals.id
   FROM public.deals
  WHERE (deals.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: deal_stakeholders deal_stakeholders_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_stakeholders_update ON ops.deal_stakeholders FOR UPDATE USING ((deal_id IN ( SELECT deals.id
   FROM public.deals
  WHERE (deals.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: deal_transitions; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.deal_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_transitions deal_transitions_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY deal_transitions_select ON ops.deal_transitions FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: domain_events; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.domain_events ENABLE ROW LEVEL SECURITY;

--
-- Name: domain_events domain_events_workspace_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY domain_events_workspace_select ON ops.domain_events FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_capabilities; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.entity_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_capabilities entity_capabilities_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY entity_capabilities_delete ON ops.entity_capabilities FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_capabilities entity_capabilities_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY entity_capabilities_insert ON ops.entity_capabilities FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_capabilities entity_capabilities_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY entity_capabilities_select ON ops.entity_capabilities FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: entity_capabilities entity_capabilities_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY entity_capabilities_update ON ops.entity_capabilities FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_expenses; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.event_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: event_expenses event_expenses_workspace_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_expenses_workspace_delete ON ops.event_expenses FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_expenses event_expenses_workspace_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_expenses_workspace_insert ON ops.event_expenses FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_expenses event_expenses_workspace_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_expenses_workspace_select ON ops.event_expenses FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_expenses event_expenses_workspace_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_expenses_workspace_update ON ops.event_expenses FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_gear_items; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.event_gear_items ENABLE ROW LEVEL SECURITY;

--
-- Name: event_gear_items event_gear_items_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_gear_items_delete ON ops.event_gear_items FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_gear_items event_gear_items_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_gear_items_insert ON ops.event_gear_items FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_gear_items event_gear_items_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_gear_items_select ON ops.event_gear_items FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: event_gear_items event_gear_items_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY event_gear_items_update ON ops.event_gear_items FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: events; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY events_delete ON ops.events FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) OR (project_id IN ( SELECT projects.id
   FROM ops.projects
  WHERE (projects.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))));


--
-- Name: events events_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY events_insert ON ops.events FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (((workspace_id IS NOT NULL) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))) OR (project_id IN ( SELECT projects.id
   FROM ops.projects
  WHERE (projects.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))))));


--
-- Name: events events_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY events_select ON ops.events FOR SELECT USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) OR (project_id IN ( SELECT projects.id
   FROM ops.projects
  WHERE (projects.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))));


--
-- Name: events events_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY events_update ON ops.events FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) OR (project_id IN ( SELECT projects.id
   FROM ops.projects
  WHERE (projects.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))));


--
-- Name: follow_up_log; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.follow_up_log ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_log follow_up_log_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_log_delete ON ops.follow_up_log FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_log follow_up_log_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_log_insert ON ops.follow_up_log FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_log follow_up_log_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_log_select ON ops.follow_up_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_log follow_up_log_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_log_update ON ops.follow_up_log FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_queue; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.follow_up_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_queue follow_up_queue_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_queue_delete ON ops.follow_up_queue FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_queue follow_up_queue_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_queue_insert ON ops.follow_up_queue FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_queue follow_up_queue_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_queue_select ON ops.follow_up_queue FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: follow_up_queue follow_up_queue_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY follow_up_queue_update ON ops.follow_up_queue FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_industry_tags industry_tags_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY industry_tags_delete ON ops.workspace_industry_tags FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_industry_tags industry_tags_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY industry_tags_insert ON ops.workspace_industry_tags FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_industry_tags industry_tags_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY industry_tags_select ON ops.workspace_industry_tags FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_industry_tags industry_tags_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY industry_tags_update ON ops.workspace_industry_tags FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_job_titles job_titles_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY job_titles_delete ON ops.workspace_job_titles FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_job_titles job_titles_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY job_titles_insert ON ops.workspace_job_titles FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_job_titles job_titles_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY job_titles_select ON ops.workspace_job_titles FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_job_titles job_titles_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY job_titles_update ON ops.workspace_job_titles FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: kit_templates; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.kit_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: kit_templates kit_templates_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY kit_templates_delete ON ops.kit_templates FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: kit_templates kit_templates_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY kit_templates_insert ON ops.kit_templates FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: kit_templates kit_templates_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY kit_templates_select ON ops.kit_templates FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: kit_templates kit_templates_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY kit_templates_update ON ops.kit_templates FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_lead_sources lead_sources_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY lead_sources_delete ON ops.workspace_lead_sources FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_lead_sources lead_sources_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY lead_sources_insert ON ops.workspace_lead_sources FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_lead_sources lead_sources_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY lead_sources_select ON ops.workspace_lead_sources FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_lead_sources lead_sources_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY lead_sources_update ON ops.workspace_lead_sources FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: message_channel_identities; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.message_channel_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: message_channel_identities message_channel_identities_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY message_channel_identities_select ON ops.message_channel_identities FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: message_threads; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.message_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: message_threads message_threads_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY message_threads_select ON ops.message_threads FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: messages; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY messages_select ON ops.messages FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages pipeline_stages_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipeline_stages_delete ON ops.pipeline_stages FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipeline_stages pipeline_stages_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipeline_stages_insert ON ops.pipeline_stages FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipeline_stages pipeline_stages_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipeline_stages_select ON ops.pipeline_stages FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipeline_stages pipeline_stages_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipeline_stages_update ON ops.pipeline_stages FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipelines; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: pipelines pipelines_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipelines_delete ON ops.pipelines FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipelines pipelines_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipelines_insert ON ops.pipelines FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipelines pipelines_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipelines_select ON ops.pipelines FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: pipelines pipelines_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY pipelines_update ON ops.pipelines FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: projects; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_builder_events; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.proposal_builder_events ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_builder_events proposal_builder_events_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY proposal_builder_events_select ON ops.proposal_builder_events FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_ros_templates ros_templates_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY ros_templates_delete ON ops.workspace_ros_templates FOR DELETE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_ros_templates ros_templates_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY ros_templates_insert ON ops.workspace_ros_templates FOR INSERT WITH CHECK ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_ros_templates ros_templates_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY ros_templates_select ON ops.workspace_ros_templates FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_ros_templates ros_templates_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY ros_templates_update ON ops.workspace_ros_templates FOR UPDATE USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_skill_presets skill_presets_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY skill_presets_delete ON ops.workspace_skill_presets FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_skill_presets skill_presets_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY skill_presets_insert ON ops.workspace_skill_presets FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_skill_presets skill_presets_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY skill_presets_select ON ops.workspace_skill_presets FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_skill_presets skill_presets_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY skill_presets_update ON ops.workspace_skill_presets FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_call_time_rules; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_call_time_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_capability_presets workspace_cap_presets_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_cap_presets_delete ON ops.workspace_capability_presets FOR DELETE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_capability_presets workspace_cap_presets_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_cap_presets_insert ON ops.workspace_capability_presets FOR INSERT WITH CHECK (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_capability_presets workspace_cap_presets_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_cap_presets_select ON ops.workspace_capability_presets FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspace_capability_presets workspace_cap_presets_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_cap_presets_update ON ops.workspace_capability_presets FOR UPDATE USING (((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_capability_presets; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_capability_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_event_archetypes; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_event_archetypes ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_event_archetypes workspace_event_archetypes_no_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_event_archetypes_no_delete ON ops.workspace_event_archetypes FOR DELETE USING (false);


--
-- Name: workspace_event_archetypes workspace_event_archetypes_no_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_event_archetypes_no_insert ON ops.workspace_event_archetypes FOR INSERT WITH CHECK (false);


--
-- Name: workspace_event_archetypes workspace_event_archetypes_no_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_event_archetypes_no_update ON ops.workspace_event_archetypes FOR UPDATE USING (false);


--
-- Name: workspace_event_archetypes workspace_event_archetypes_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_event_archetypes_select ON ops.workspace_event_archetypes FOR SELECT USING (((is_system = true) OR (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))));


--
-- Name: workspace_industry_tags; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_industry_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_job_titles; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_job_titles ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_lead_sources; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_lead_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_permissions; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_permissions workspace_permissions_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_permissions_select ON ops.workspace_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: workspace_role_permissions; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_role_permissions workspace_role_permissions_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_role_permissions_delete ON ops.workspace_role_permissions FOR DELETE USING ((role_id IN ( SELECT workspace_roles.id
   FROM ops.workspace_roles
  WHERE ((workspace_roles.workspace_id IS NOT NULL) AND (workspace_roles.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_roles.workspace_id, ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: workspace_role_permissions workspace_role_permissions_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_role_permissions_insert ON ops.workspace_role_permissions FOR INSERT WITH CHECK ((role_id IN ( SELECT workspace_roles.id
   FROM ops.workspace_roles
  WHERE ((workspace_roles.workspace_id IS NOT NULL) AND (workspace_roles.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_roles.workspace_id, ARRAY['owner'::text, 'admin'::text])))));


--
-- Name: workspace_role_permissions workspace_role_permissions_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_role_permissions_select ON ops.workspace_role_permissions FOR SELECT USING ((role_id IN ( SELECT workspace_roles.id
   FROM ops.workspace_roles
  WHERE ((workspace_roles.workspace_id IS NULL) OR (workspace_roles.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))));


--
-- Name: workspace_roles; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_roles workspace_roles_delete; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_roles_delete ON ops.workspace_roles FOR DELETE USING (((workspace_id IS NOT NULL) AND (is_system = false) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_roles workspace_roles_insert; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_roles_insert ON ops.workspace_roles FOR INSERT WITH CHECK (((workspace_id IS NOT NULL) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_roles workspace_roles_select; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_roles_select ON ops.workspace_roles FOR SELECT USING (((workspace_id IS NULL) OR (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))));


--
-- Name: workspace_roles workspace_roles_update; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY workspace_roles_update ON ops.workspace_roles FOR UPDATE USING (((workspace_id IS NOT NULL) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)) AND public.user_has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])));


--
-- Name: workspace_ros_templates; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_ros_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_skill_presets; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.workspace_skill_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: commercial_organizations Authenticated users can create organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create organization" ON public.commercial_organizations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: workspace_members Authenticated users can join workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can join workspace" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: recovery_shards Guardians can read shards assigned to them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Guardians can read shards assigned to them" ON public.recovery_shards FOR SELECT USING ((auth.email() = ( SELECT guardians.guardian_email
   FROM public.guardians
  WHERE (guardians.id = recovery_shards.guardian_id))));


--
-- Name: agent_configs Org or workspace members manage agent config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Org or workspace members manage agent config" ON public.agent_configs USING ((((organization_id IS NOT NULL) AND (organization_id = ANY (public.get_my_organization_ids()))) OR ((workspace_id IS NOT NULL) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids))))) WITH CHECK ((((organization_id IS NOT NULL) AND (organization_id = ANY (public.get_my_organization_ids()))) OR ((workspace_id IS NOT NULL) AND (workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: commercial_organizations Owners admins manage org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners admins manage org" ON public.commercial_organizations USING ((id IN ( SELECT organization_members.organization_id
   FROM public.organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((id IN ( SELECT organization_members.organization_id
   FROM public.organization_members
  WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: recovery_shards Owners full access to own shards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners full access to own shards" ON public.recovery_shards USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: organization_members Owners manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners manage members" ON public.organization_members USING ((organization_id IN ( SELECT organization_members_1.organization_id
   FROM public.organization_members organization_members_1
  WHERE ((organization_members_1.user_id = auth.uid()) AND (organization_members_1.role = 'owner'::text))))) WITH CHECK ((organization_id IN ( SELECT organization_members_1.organization_id
   FROM public.organization_members organization_members_1
  WHERE ((organization_members_1.user_id = auth.uid()) AND (organization_members_1.role = 'owner'::text)))));


--
-- Name: recovery_requests Owners manage own recovery requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners manage own recovery requests" ON public.recovery_requests USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: organization_members Users can add self as member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add self as member" ON public.organization_members FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: guardians Users manage own guardians; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own guardians" ON public.guardians USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));


--
-- Name: passkeys Users manage own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own passkeys" ON public.passkeys USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users manage own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own profile" ON public.profiles USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: webauthn_challenges Users manage own webauthn challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own webauthn challenges" ON public.webauthn_challenges USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: organization_members Users see own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own memberships" ON public.organization_members FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: commercial_organizations Users see own orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own orgs" ON public.commercial_organizations FOR SELECT USING ((id IN ( SELECT organization_members.organization_id
   FROM public.organization_members
  WHERE (organization_members.user_id = auth.uid()))));


--
-- Name: workspaces Users with session can create workspace; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users with session can create workspace" ON public.workspaces FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: workspace_members View Members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View Members" ON public.workspace_members FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: workspaces View Workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View Workspaces" ON public.workspaces FOR SELECT USING ((id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: autonomous_resolutions Workspace members view resolutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members view resolutions" ON public.autonomous_resolutions FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: agent_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: autonomous_resolutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autonomous_resolutions ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_pairing_codes bridge_codes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bridge_codes_insert ON public.bridge_pairing_codes FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: bridge_pairing_codes bridge_codes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bridge_codes_select ON public.bridge_pairing_codes FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: bridge_device_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bridge_device_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_pair_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bridge_pair_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_pairing_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bridge_pairing_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_sync_status bridge_sync_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bridge_sync_select ON public.bridge_sync_status FOR SELECT USING ((device_token_id IN ( SELECT bridge_device_tokens.id
   FROM public.bridge_device_tokens
  WHERE (bridge_device_tokens.user_id = auth.uid()))));


--
-- Name: bridge_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bridge_sync_status ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_device_tokens bridge_tokens_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bridge_tokens_delete ON public.bridge_device_tokens FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: bridge_device_tokens bridge_tokens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bridge_tokens_select ON public.bridge_device_tokens FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: client_portal_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_access_log client_portal_access_log_select_claimed_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_log_select_claimed_client ON public.client_portal_access_log FOR SELECT USING ((entity_id IN ( SELECT public.get_my_client_entity_ids() AS get_my_client_entity_ids)));


--
-- Name: client_portal_access_log client_portal_access_log_select_workspace_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_portal_access_log_select_workspace_member ON public.client_portal_access_log FOR SELECT USING ((workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)));


--
-- Name: client_portal_otp_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_otp_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: client_portal_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals client_view_own_proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_view_own_proposals ON public.proposals FOR SELECT USING ((deal_id IN ( SELECT d.id
   FROM (public.deals d
     JOIN ops.events e ON ((e.id = d.event_id)))
  WHERE (e.client_entity_id IN ( SELECT public.get_my_client_entity_ids() AS get_my_client_entity_ids)))));


--
-- Name: commercial_organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commercial_organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts contracts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contracts_delete ON public.contracts FOR DELETE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: contracts contracts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contracts_insert ON public.contracts FOR INSERT WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: contracts contracts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contracts_select ON public.contracts FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: contracts contracts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contracts_update ON public.contracts FOR UPDATE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_workspace_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_workspace_delete ON public.deals FOR DELETE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: deals deals_workspace_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_workspace_insert ON public.deals FOR INSERT WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: deals deals_workspace_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_workspace_select ON public.deals FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: deals deals_workspace_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_workspace_update ON public.deals FOR UPDATE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: guardians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_anon_token_lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_anon_token_lookup ON public.invitations FOR SELECT TO anon USING (true);


--
-- Name: invitations invitations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_insert ON public.invitations FOR INSERT WITH CHECK ((organization_id IN ( SELECT (entities.legacy_org_id)::text AS legacy_org_id
   FROM directory.entities
  WHERE ((entities.owner_workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))) AND (entities.legacy_org_id IS NOT NULL)))));


--
-- Name: invitations invitations_own_email_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_own_email_select ON public.invitations FOR SELECT TO authenticated USING ((lower(email) = lower((auth.jwt() ->> 'email'::text))));


--
-- Name: invitations invitations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select ON public.invitations FOR SELECT USING ((organization_id IN ( SELECT (entities.legacy_org_id)::text AS legacy_org_id
   FROM directory.entities
  WHERE ((entities.owner_workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))) AND (entities.legacy_org_id IS NOT NULL)))));


--
-- Name: invitations invitations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_update ON public.invitations FOR UPDATE USING (((organization_id IN ( SELECT (entities.legacy_org_id)::text AS legacy_org_id
   FROM directory.entities
  WHERE ((entities.owner_workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))) AND (entities.legacy_org_id IS NOT NULL)))) OR (lower(email) = lower((auth.jwt() ->> 'email'::text)))));


--
-- Name: lobby_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lobby_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: lobby_layouts lobby_layouts_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lobby_layouts_self ON public.lobby_layouts USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: package_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: package_tags package_tags_via_package; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_tags_via_package ON public.package_tags USING ((package_id IN ( SELECT packages.id
   FROM public.packages
  WHERE (packages.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))))));


--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: packages packages_workspace_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_workspace_delete ON public.packages FOR DELETE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: packages packages_workspace_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_workspace_insert ON public.packages FOR INSERT WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: packages packages_workspace_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_workspace_select ON public.packages FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: packages packages_workspace_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_workspace_update ON public.packages FOR UPDATE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: passkeys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_client_selections pcs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pcs_select ON public.proposal_client_selections FOR SELECT USING ((proposal_id IN ( SELECT proposals.id
   FROM public.proposals
  WHERE ((proposals.public_token IS NOT NULL) AND (proposals.status = ANY (ARRAY['sent'::public.proposal_status, 'viewed'::public.proposal_status, 'accepted'::public.proposal_status]))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_client_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_client_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_items proposal_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_items_delete ON public.proposal_items FOR DELETE USING ((proposal_id IN ( SELECT proposals.id
   FROM public.proposals
  WHERE (proposals.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))))));


--
-- Name: proposal_items proposal_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_items_insert ON public.proposal_items FOR INSERT WITH CHECK ((proposal_id IN ( SELECT proposals.id
   FROM public.proposals
  WHERE (proposals.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))))));


--
-- Name: proposal_items proposal_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_items_select ON public.proposal_items FOR SELECT USING ((proposal_id IN ( SELECT proposals.id
   FROM public.proposals
  WHERE (proposals.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))))));


--
-- Name: proposal_items proposal_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_items_update ON public.proposal_items FOR UPDATE USING ((proposal_id IN ( SELECT proposals.id
   FROM public.proposals
  WHERE (proposals.workspace_id IN ( SELECT workspace_members.workspace_id
           FROM public.workspace_members
          WHERE (workspace_members.user_id = auth.uid()))))));


--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals proposals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposals_delete ON public.proposals FOR DELETE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: proposals proposals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposals_insert ON public.proposals FOR INSERT WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: proposals proposals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposals_select ON public.proposals FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: proposals proposals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposals_update ON public.proposals FOR UPDATE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: recovery_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: recovery_shards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_shards ENABLE ROW LEVEL SECURITY;

--
-- Name: run_of_show_cues ros_cues_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ros_cues_delete ON public.run_of_show_cues FOR DELETE USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_cues ros_cues_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ros_cues_insert ON public.run_of_show_cues FOR INSERT WITH CHECK ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_cues ros_cues_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ros_cues_select ON public.run_of_show_cues FOR SELECT USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_cues ros_cues_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ros_cues_update ON public.run_of_show_cues FOR UPDATE USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_cues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.run_of_show_cues ENABLE ROW LEVEL SECURITY;

--
-- Name: run_of_show_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.run_of_show_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: run_of_show_sections sections_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sections_delete ON public.run_of_show_sections FOR DELETE USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_sections sections_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sections_insert ON public.run_of_show_sections FOR INSERT WITH CHECK ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_sections sections_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sections_select ON public.run_of_show_sections FOR SELECT USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: run_of_show_sections sections_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sections_update ON public.run_of_show_sections FOR UPDATE USING ((event_id IN ( SELECT events.id
   FROM ops.events
  WHERE (events.workspace_id IN ( SELECT public.get_my_workspace_ids() AS get_my_workspace_ids)))));


--
-- Name: sms_otp_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_otp_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_otp_attempts sms_otp_attempts_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_otp_attempts_own_select ON public.sms_otp_attempts FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: sms_otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_events subscription_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_events_select ON public.subscription_events FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: subscription_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_invoices subscription_invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_invoices_select ON public.subscription_invoices FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: tier_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tier_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tier_config tier_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tier_config_select ON public.tier_config FOR SELECT TO authenticated USING (true);


--
-- Name: user_lobby_active; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_lobby_active ENABLE ROW LEVEL SECURITY;

--
-- Name: user_lobby_active user_lobby_active_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_lobby_active_self ON public.user_lobby_active USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: webauthn_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_tags workspace_tags_workspace_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_tags_workspace_delete ON public.workspace_tags FOR DELETE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: workspace_tags workspace_tags_workspace_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_tags_workspace_insert ON public.workspace_tags FOR INSERT WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: workspace_tags workspace_tags_workspace_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_tags_workspace_select ON public.workspace_tags FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: workspace_tags workspace_tags_workspace_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_tags_workspace_update ON public.workspace_tags FOR UPDATE USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM public.workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA catalog; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA catalog TO authenticated;


--
-- Name: SCHEMA cortex; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA cortex TO anon;
GRANT USAGE ON SCHEMA cortex TO authenticated;
GRANT USAGE ON SCHEMA cortex TO service_role;


--
-- Name: SCHEMA directory; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA directory TO anon;
GRANT USAGE ON SCHEMA directory TO authenticated;
GRANT USAGE ON SCHEMA directory TO service_role;


--
-- Name: SCHEMA finance; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA finance TO anon;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT USAGE ON SCHEMA finance TO service_role;


--
-- Name: SCHEMA ops; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA ops TO authenticated;
GRANT USAGE ON SCHEMA ops TO anon;
GRANT USAGE ON SCHEMA ops TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _pin_args_hash(p_args jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex._pin_args_hash(p_args jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex._pin_args_hash(p_args jsonb) TO service_role;
GRANT ALL ON FUNCTION cortex._pin_args_hash(p_args jsonb) TO authenticated;


--
-- Name: FUNCTION _pin_assert_membership(p_workspace_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex._pin_assert_membership(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex._pin_assert_membership(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex._pin_assert_membership(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION archive_aion_session(p_session_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.archive_aion_session(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.archive_aion_session(p_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.archive_aion_session(p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION claim_memory_pending_batch(p_limit integer); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.claim_memory_pending_batch(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.claim_memory_pending_batch(p_limit integer) TO service_role;


--
-- Name: FUNCTION create_aion_session(p_workspace_id uuid, p_user_id uuid, p_id uuid, p_preview text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.create_aion_session(p_workspace_id uuid, p_user_id uuid, p_id uuid, p_preview text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.create_aion_session(p_workspace_id uuid, p_user_id uuid, p_id uuid, p_preview text) TO service_role;


--
-- Name: FUNCTION create_new_aion_session_for_scope(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.create_new_aion_session_for_scope(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.create_new_aion_session_for_scope(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) TO service_role;
GRANT ALL ON FUNCTION cortex.create_new_aion_session_for_scope(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) TO authenticated;


--
-- Name: FUNCTION delete_aion_session(p_session_id uuid, p_user_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.delete_aion_session(p_session_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.delete_aion_session(p_session_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION delete_lobby_pin(p_pin_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.delete_lobby_pin(p_pin_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.delete_lobby_pin(p_pin_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.delete_lobby_pin(p_pin_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_memory_embedding(p_source_type text, p_source_id text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.delete_memory_embedding(p_source_type text, p_source_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.delete_memory_embedding(p_source_type text, p_source_id text) TO service_role;


--
-- Name: FUNCTION delete_referral(p_referral_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.delete_referral(p_referral_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.delete_referral(p_referral_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.delete_referral(p_referral_id uuid) TO authenticated;


--
-- Name: FUNCTION dismiss_aion_insight(p_insight_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.dismiss_aion_insight(p_insight_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.dismiss_aion_insight(p_insight_id uuid) TO service_role;


--
-- Name: FUNCTION dismiss_aion_proactive_line(p_line_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.dismiss_aion_proactive_line(p_line_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.dismiss_aion_proactive_line(p_line_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.dismiss_aion_proactive_line(p_line_id uuid) TO authenticated;


--
-- Name: FUNCTION dismiss_capture(p_capture_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.dismiss_capture(p_capture_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.dismiss_capture(p_capture_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.dismiss_capture(p_capture_id uuid) TO authenticated;


--
-- Name: FUNCTION dismiss_ui_notice(p_notice_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.dismiss_ui_notice(p_notice_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.dismiss_ui_notice(p_notice_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.dismiss_ui_notice(p_notice_id uuid) TO authenticated;


--
-- Name: FUNCTION due_lobby_pins(p_limit integer); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.due_lobby_pins(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.due_lobby_pins(p_limit integer) TO service_role;


--
-- Name: FUNCTION emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.emit_aion_proactive_line(p_workspace_id uuid, p_deal_id uuid, p_signal_type text, p_headline text, p_artifact_ref jsonb, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_entity_ids uuid[], p_metadata jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_entity_ids uuid[], p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.enqueue_memory_pending(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_entity_ids uuid[], p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION fanout_ui_notice(p_workspace_id uuid, p_notice_type text, p_payload jsonb, p_expires_at timestamp with time zone); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.fanout_ui_notice(p_workspace_id uuid, p_notice_type text, p_payload jsonb, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.fanout_ui_notice(p_workspace_id uuid, p_notice_type text, p_payload jsonb, p_expires_at timestamp with time zone) TO service_role;
GRANT ALL ON FUNCTION cortex.fanout_ui_notice(p_workspace_id uuid, p_notice_type text, p_payload jsonb, p_expires_at timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer) TO service_role;
GRANT ALL ON FUNCTION cortex.get_proactive_line_dismiss_rates(p_workspace_id uuid, p_window_days integer, p_min_sample integer) TO authenticated;


--
-- Name: FUNCTION hybrid_search(query_text text, query_embedding extensions.vector, match_count integer, full_text_weight double precision, semantic_weight double precision, rrf_k integer); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.hybrid_search(query_text text, query_embedding extensions.vector, match_count integer, full_text_weight double precision, semantic_weight double precision, rrf_k integer) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.hybrid_search(query_text text, query_embedding extensions.vector, match_count integer, full_text_weight double precision, semantic_weight double precision, rrf_k integer) TO service_role;


--
-- Name: FUNCTION list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.list_lobby_pin_health(p_workspace_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION list_lobby_pins(p_workspace_id uuid, p_user_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.list_lobby_pins(p_workspace_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.list_lobby_pins(p_workspace_id uuid, p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.list_lobby_pins(p_workspace_id uuid, p_user_id uuid) TO authenticated;


--
-- Name: FUNCTION log_referral(p_workspace_id uuid, p_direction text, p_counterparty_entity_id uuid, p_client_name text, p_client_entity_id uuid, p_related_deal_id uuid, p_note text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.log_referral(p_workspace_id uuid, p_direction text, p_counterparty_entity_id uuid, p_client_name text, p_client_entity_id uuid, p_related_deal_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.log_referral(p_workspace_id uuid, p_direction text, p_counterparty_entity_id uuid, p_client_name text, p_client_entity_id uuid, p_related_deal_id uuid, p_note text) TO service_role;
GRANT ALL ON FUNCTION cortex.log_referral(p_workspace_id uuid, p_direction text, p_counterparty_entity_id uuid, p_client_name text, p_client_entity_id uuid, p_related_deal_id uuid, p_note text) TO authenticated;


--
-- Name: FUNCTION mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.mark_lobby_pin_failure(p_pin_id uuid, p_error_message text, p_error_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION mark_memory_pending_result(p_id uuid, p_status text, p_error text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.mark_memory_pending_result(p_id uuid, p_status text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.mark_memory_pending_result(p_id uuid, p_status text, p_error text) TO service_role;


--
-- Name: FUNCTION match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer, p_match_threshold double precision, p_source_types text[], p_entity_ids uuid[]); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer, p_match_threshold double precision, p_source_types text[], p_entity_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.match_memory(p_workspace_id uuid, p_query_embedding extensions.vector, p_match_count integer, p_match_threshold double precision, p_source_types text[], p_entity_ids uuid[]) TO service_role;


--
-- Name: FUNCTION pin_aion_session(p_session_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.pin_aion_session(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.pin_aion_session(p_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.pin_aion_session(p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION reassign_capture(p_capture_id uuid, p_new_entity_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.reassign_capture(p_capture_id uuid, p_new_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.reassign_capture(p_capture_id uuid, p_new_entity_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.reassign_capture(p_capture_id uuid, p_new_entity_id uuid) TO authenticated;


--
-- Name: FUNCTION record_consent(p_workspace_id uuid, p_term_key text, p_term_version text, p_metadata jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.record_consent(p_workspace_id uuid, p_term_key text, p_term_version text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.record_consent(p_workspace_id uuid, p_term_key text, p_term_version text, p_metadata jsonb) TO service_role;
GRANT ALL ON FUNCTION cortex.record_consent(p_workspace_id uuid, p_term_key text, p_term_version text, p_metadata jsonb) TO authenticated;


--
-- Name: FUNCTION record_lobby_pin_view(p_pin_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid) TO authenticated;


--
-- Name: FUNCTION record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text) TO service_role;
GRANT ALL ON FUNCTION cortex.record_refusal(p_workspace_id uuid, p_user_id uuid, p_question text, p_reason text, p_attempted_metric_id text) TO authenticated;


--
-- Name: FUNCTION relink_capture_production(p_capture_id uuid, p_linked_deal_id uuid, p_linked_event_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.relink_capture_production(p_capture_id uuid, p_linked_deal_id uuid, p_linked_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.relink_capture_production(p_capture_id uuid, p_linked_deal_id uuid, p_linked_event_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.relink_capture_production(p_capture_id uuid, p_linked_deal_id uuid, p_linked_event_id uuid) TO authenticated;


--
-- Name: FUNCTION reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION cortex.reorder_lobby_pins(p_workspace_id uuid, p_user_id uuid, p_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION request_feature_access(p_workspace_id uuid, p_feature_key text, p_metadata jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.request_feature_access(p_workspace_id uuid, p_feature_key text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.request_feature_access(p_workspace_id uuid, p_feature_key text, p_metadata jsonb) TO service_role;
GRANT ALL ON FUNCTION cortex.request_feature_access(p_workspace_id uuid, p_feature_key text, p_metadata jsonb) TO authenticated;


--
-- Name: FUNCTION reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.reset_member_passkey(p_workspace_id uuid, p_member_user_id uuid) TO authenticated;


--
-- Name: FUNCTION resolve_aion_insight(p_trigger_type text, p_entity_id text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.resolve_aion_insight(p_trigger_type text, p_entity_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.resolve_aion_insight(p_trigger_type text, p_entity_id text) TO service_role;


--
-- Name: FUNCTION resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(p_workspace_id uuid, p_artifact_kind text, p_artifact_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(p_workspace_id uuid, p_deal_id uuid, p_signal_type text) TO service_role;


--
-- Name: FUNCTION resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) TO service_role;
GRANT ALL ON FUNCTION cortex.resume_or_create_aion_session(p_workspace_id uuid, p_scope_type text, p_scope_entity_id uuid, p_title text) TO authenticated;


--
-- Name: FUNCTION review_feature_request(p_request_id uuid, p_decision text, p_note text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.review_feature_request(p_request_id uuid, p_decision text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.review_feature_request(p_request_id uuid, p_decision text, p_note text) TO service_role;
GRANT ALL ON FUNCTION cortex.review_feature_request(p_request_id uuid, p_decision text, p_note text) TO authenticated;


--
-- Name: FUNCTION revoke_consent(p_workspace_id uuid, p_term_key text, p_target_user uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.revoke_consent(p_workspace_id uuid, p_term_key text, p_target_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.revoke_consent(p_workspace_id uuid, p_term_key text, p_target_user uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.revoke_consent(p_workspace_id uuid, p_term_key text, p_target_user uuid) TO authenticated;


--
-- Name: FUNCTION save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION save_aion_message(p_session_id uuid, p_role text, p_content text, p_structured_content jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.save_aion_message(p_session_id uuid, p_role text, p_content text, p_structured_content jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.save_aion_message(p_session_id uuid, p_role text, p_content text, p_structured_content jsonb) TO service_role;


--
-- Name: FUNCTION save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb) TO service_role;
GRANT ALL ON FUNCTION cortex.save_lobby_pin(p_workspace_id uuid, p_user_id uuid, p_title text, p_metric_id text, p_args jsonb, p_cadence text, p_initial_value jsonb) TO authenticated;


--
-- Name: FUNCTION set_aion_proactive_line_date_local(); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.set_aion_proactive_line_date_local() FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.set_aion_proactive_line_date_local() TO service_role;


--
-- Name: FUNCTION set_aion_session_title(p_session_id uuid, p_title text, p_lock boolean); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.set_aion_session_title(p_session_id uuid, p_title text, p_lock boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.set_aion_session_title(p_session_id uuid, p_title text, p_lock boolean) TO service_role;
GRANT ALL ON FUNCTION cortex.set_aion_session_title(p_session_id uuid, p_title text, p_lock boolean) TO authenticated;


--
-- Name: FUNCTION substrate_counts(p_workspace_id uuid, p_window_days integer); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.substrate_counts(p_workspace_id uuid, p_window_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.substrate_counts(p_workspace_id uuid, p_window_days integer) TO service_role;
GRANT ALL ON FUNCTION cortex.substrate_counts(p_workspace_id uuid, p_window_days integer) TO authenticated;


--
-- Name: FUNCTION unarchive_aion_session(p_session_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.unarchive_aion_session(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.unarchive_aion_session(p_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.unarchive_aion_session(p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION unpin_aion_session(p_session_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.unpin_aion_session(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.unpin_aion_session(p_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.unpin_aion_session(p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION update_aion_session_summary(p_session_id uuid, p_summary text, p_summarized_up_to text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.update_aion_session_summary(p_session_id uuid, p_summary text, p_summarized_up_to text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.update_aion_session_summary(p_session_id uuid, p_summary text, p_summarized_up_to text) TO service_role;


--
-- Name: FUNCTION update_capture_content(p_capture_id uuid, p_transcript text, p_parsed_note text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.update_capture_content(p_capture_id uuid, p_transcript text, p_parsed_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.update_capture_content(p_capture_id uuid, p_transcript text, p_parsed_note text) TO service_role;
GRANT ALL ON FUNCTION cortex.update_capture_content(p_capture_id uuid, p_transcript text, p_parsed_note text) TO authenticated;


--
-- Name: FUNCTION update_capture_visibility(p_capture_id uuid, p_visibility text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.update_capture_visibility(p_capture_id uuid, p_visibility text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.update_capture_visibility(p_capture_id uuid, p_visibility text) TO service_role;
GRANT ALL ON FUNCTION cortex.update_capture_visibility(p_capture_id uuid, p_visibility text) TO authenticated;


--
-- Name: FUNCTION update_lobby_pin_value(p_pin_id uuid, p_value jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.update_lobby_pin_value(p_pin_id uuid, p_value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.update_lobby_pin_value(p_pin_id uuid, p_value jsonb) TO service_role;
GRANT ALL ON FUNCTION cortex.update_lobby_pin_value(p_pin_id uuid, p_value jsonb) TO authenticated;


--
-- Name: FUNCTION upsert_aion_insight(p_workspace_id uuid, p_trigger_type text, p_entity_type text, p_entity_id text, p_title text, p_context jsonb, p_priority integer, p_expires_at timestamp with time zone); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.upsert_aion_insight(p_workspace_id uuid, p_trigger_type text, p_entity_type text, p_entity_id text, p_title text, p_context jsonb, p_priority integer, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.upsert_aion_insight(p_workspace_id uuid, p_trigger_type text, p_entity_type text, p_entity_id text, p_title text, p_context jsonb, p_priority integer, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION upsert_entity_working_notes(p_workspace_id uuid, p_entity_id uuid, p_communication_style text, p_dnr_flagged boolean, p_dnr_reason text, p_dnr_note text, p_preferred_channel text, p_source text); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.upsert_entity_working_notes(p_workspace_id uuid, p_entity_id uuid, p_communication_style text, p_dnr_flagged boolean, p_dnr_reason text, p_dnr_note text, p_preferred_channel text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.upsert_entity_working_notes(p_workspace_id uuid, p_entity_id uuid, p_communication_style text, p_dnr_flagged boolean, p_dnr_reason text, p_dnr_note text, p_preferred_channel text, p_source text) TO service_role;
GRANT ALL ON FUNCTION cortex.upsert_entity_working_notes(p_workspace_id uuid, p_entity_id uuid, p_communication_style text, p_dnr_flagged boolean, p_dnr_reason text, p_dnr_note text, p_preferred_channel text, p_source text) TO authenticated;


--
-- Name: FUNCTION upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding extensions.vector, p_entity_ids uuid[], p_metadata jsonb); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding extensions.vector, p_entity_ids uuid[], p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding extensions.vector, p_entity_ids uuid[], p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION write_capture_confirmed(p_workspace_id uuid, p_transcript text, p_parsed_entity jsonb, p_parsed_follow_up jsonb, p_parsed_note text, p_resolved_entity_id uuid, p_created_follow_up_queue_id uuid, p_audio_storage_path text, p_visibility text, p_linked_deal_id uuid, p_linked_event_id uuid); Type: ACL; Schema: cortex; Owner: -
--

REVOKE ALL ON FUNCTION cortex.write_capture_confirmed(p_workspace_id uuid, p_transcript text, p_parsed_entity jsonb, p_parsed_follow_up jsonb, p_parsed_note text, p_resolved_entity_id uuid, p_created_follow_up_queue_id uuid, p_audio_storage_path text, p_visibility text, p_linked_deal_id uuid, p_linked_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION cortex.write_capture_confirmed(p_workspace_id uuid, p_transcript text, p_parsed_entity jsonb, p_parsed_follow_up jsonb, p_parsed_note text, p_resolved_entity_id uuid, p_created_follow_up_queue_id uuid, p_audio_storage_path text, p_visibility text, p_linked_deal_id uuid, p_linked_event_id uuid) TO service_role;
GRANT ALL ON FUNCTION cortex.write_capture_confirmed(p_workspace_id uuid, p_transcript text, p_parsed_entity jsonb, p_parsed_follow_up jsonb, p_parsed_note text, p_resolved_entity_id uuid, p_created_follow_up_queue_id uuid, p_audio_storage_path text, p_visibility text, p_linked_deal_id uuid, p_linked_event_id uuid) TO authenticated;


--
-- Name: PROCEDURE _copy_proposal_items_to_invoice(IN p_proposal_id uuid, IN p_invoice_id uuid, IN p_tax_amount numeric, IN p_tax_rate numeric, IN p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON PROCEDURE finance._copy_proposal_items_to_invoice(IN p_proposal_id uuid, IN p_invoice_id uuid, IN p_tax_amount numeric, IN p_tax_rate numeric, IN p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON PROCEDURE finance._copy_proposal_items_to_invoice(IN p_proposal_id uuid, IN p_invoice_id uuid, IN p_tax_amount numeric, IN p_tax_rate numeric, IN p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION _guard_invoice_mode_switch(); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance._guard_invoice_mode_switch() FROM PUBLIC;
GRANT ALL ON FUNCTION finance._guard_invoice_mode_switch() TO service_role;


--
-- Name: FUNCTION _metric_assert_membership(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance._metric_assert_membership(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance._metric_assert_membership(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance._metric_assert_membership(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION _metric_resolve_tz(p_workspace_id uuid, p_tz text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance._metric_resolve_tz(p_workspace_id uuid, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance._metric_resolve_tz(p_workspace_id uuid, p_tz text) TO service_role;
GRANT ALL ON FUNCTION finance._metric_resolve_tz(p_workspace_id uuid, p_tz text) TO authenticated;


--
-- Name: FUNCTION get_fresh_qbo_token(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.get_fresh_qbo_token(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION get_public_invoice(p_token text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.get_public_invoice(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.get_public_invoice(p_token text) TO service_role;
GRANT ALL ON FUNCTION finance.get_public_invoice(p_token text) TO anon;
GRANT ALL ON FUNCTION finance.get_public_invoice(p_token text) TO authenticated;


--
-- Name: FUNCTION metric_1099_worksheet(p_workspace_id uuid, p_year integer); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_1099_worksheet(p_workspace_id uuid, p_year integer) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_1099_worksheet(p_workspace_id uuid, p_year integer) TO service_role;
GRANT ALL ON FUNCTION finance.metric_1099_worksheet(p_workspace_id uuid, p_year integer) TO authenticated;


--
-- Name: FUNCTION metric_ar_aged_60plus(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_ar_aged_60plus(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_ar_aged_60plus(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance.metric_ar_aged_60plus(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION finance.metric_budget_vs_actual(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_invoice_variance(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_invoice_variance(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_invoice_variance(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance.metric_invoice_variance(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION metric_qbo_sync_health(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_qbo_sync_health(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_qbo_sync_health(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance.metric_qbo_sync_health(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION metric_qbo_variance(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_qbo_variance(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_qbo_variance(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance.metric_qbo_variance(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION finance.metric_revenue_by_lead_source(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean) TO service_role;
GRANT ALL ON FUNCTION finance.metric_revenue_collected(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text, p_compare boolean) TO authenticated;


--
-- Name: FUNCTION metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION finance.metric_revenue_yoy(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION finance.metric_sales_tax_worksheet(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_unreconciled_payments(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.metric_unreconciled_payments(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.metric_unreconciled_payments(p_workspace_id uuid) TO service_role;
GRANT ALL ON FUNCTION finance.metric_unreconciled_payments(p_workspace_id uuid) TO authenticated;


--
-- Name: FUNCTION next_invoice_number(p_workspace_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.next_invoice_number(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.next_invoice_number(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION payments_recompute_trigger(); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.payments_recompute_trigger() FROM PUBLIC;
GRANT ALL ON FUNCTION finance.payments_recompute_trigger() TO service_role;


--
-- Name: FUNCTION persist_refreshed_qbo_tokens(p_workspace_id uuid, p_new_access_token text, p_new_refresh_token text, p_access_expires_in_seconds integer, p_refresh_expires_in_seconds integer); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.persist_refreshed_qbo_tokens(p_workspace_id uuid, p_new_access_token text, p_new_refresh_token text, p_access_expires_in_seconds integer, p_refresh_expires_in_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.persist_refreshed_qbo_tokens(p_workspace_id uuid, p_new_access_token text, p_new_refresh_token text, p_access_expires_in_seconds integer, p_refresh_expires_in_seconds integer) TO service_role;


--
-- Name: FUNCTION recompute_invoice_paid(p_invoice_id uuid); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid) TO service_role;


--
-- Name: FUNCTION record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone, p_reference text, p_notes text, p_stripe_payment_intent_id text, p_stripe_charge_id text, p_status text, p_recorded_by_user_id uuid, p_parent_payment_id uuid, p_attachment_storage_path text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone, p_reference text, p_notes text, p_stripe_payment_intent_id text, p_stripe_charge_id text, p_status text, p_recorded_by_user_id uuid, p_parent_payment_id uuid, p_attachment_storage_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_received_at timestamp with time zone, p_reference text, p_notes text, p_stripe_payment_intent_id text, p_stripe_charge_id text, p_status text, p_recorded_by_user_id uuid, p_parent_payment_id uuid, p_attachment_storage_path text) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION finance.set_updated_at() TO service_role;


--
-- Name: FUNCTION spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text); Type: ACL; Schema: finance; Owner: -
--

REVOKE ALL ON FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text) FROM PUBLIC;
GRANT ALL ON FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text) TO service_role;
GRANT ALL ON FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text) TO authenticated;


--
-- Name: FUNCTION _expand_series_rule(p_series_rule jsonb); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops._expand_series_rule(p_series_rule jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION ops._expand_series_rule(p_series_rule jsonb) TO service_role;
GRANT ALL ON FUNCTION ops._expand_series_rule(p_series_rule jsonb) TO authenticated;


--
-- Name: FUNCTION advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]) TO service_role;
GRANT ALL ON FUNCTION ops.advance_deal_stage(p_deal_id uuid, p_new_stage_id uuid, p_only_if_status_in text[], p_only_if_tags_any text[]) TO authenticated;


--
-- Name: FUNCTION advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[]); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.advance_deal_stage_from_webhook(p_deal_id uuid, p_new_stage_id uuid, p_new_status_slug text, p_webhook_source text, p_webhook_event_id text, p_only_if_status_in text[], p_only_if_tags_any text[]) TO service_role;


--
-- Name: FUNCTION archive_workspace_event_archetype(p_workspace_id uuid, p_slug text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.archive_workspace_event_archetype(p_workspace_id uuid, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.archive_workspace_event_archetype(p_workspace_id uuid, p_slug text) TO service_role;
GRANT ALL ON FUNCTION ops.archive_workspace_event_archetype(p_workspace_id uuid, p_slug text) TO authenticated;


--
-- Name: FUNCTION claim_pending_transitions(p_batch_size integer); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.claim_pending_transitions(p_batch_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.claim_pending_transitions(p_batch_size integer) TO service_role;


--
-- Name: FUNCTION create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean) TO service_role;
GRANT ALL ON FUNCTION ops.create_pipeline_stage(p_pipeline_id uuid, p_label text, p_slug text, p_tags text[], p_rotting_days integer, p_color_token text, p_requires_confirmation boolean, p_opens_handoff_wizard boolean, p_hide_from_portal boolean) TO authenticated;


--
-- Name: FUNCTION crew_confirmation_drift_check_trg(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.crew_confirmation_drift_check_trg() FROM PUBLIC;


--
-- Name: FUNCTION evaluate_dwell_sla(p_batch_size integer); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.evaluate_dwell_sla(p_batch_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.evaluate_dwell_sla(p_batch_size integer) TO service_role;


--
-- Name: FUNCTION event_status_pair_valid(p_status text, p_lifecycle text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.event_status_pair_valid(p_status text, p_lifecycle text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.event_status_pair_valid(p_status text, p_lifecycle text) TO authenticated;
GRANT ALL ON FUNCTION ops.event_status_pair_valid(p_status text, p_lifecycle text) TO service_role;


--
-- Name: FUNCTION events_status_pair_check_trg(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.events_status_pair_check_trg() FROM PUBLIC;


--
-- Name: FUNCTION has_primitive_fired(p_transition_id uuid, p_primitive text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.has_primitive_fired(p_transition_id uuid, p_primitive text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.has_primitive_fired(p_transition_id uuid, p_primitive text) TO service_role;


--
-- Name: FUNCTION log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid, p_actor_user_id uuid, p_trigger_type text, p_error_message text, p_metadata jsonb, p_undo_token text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid, p_actor_user_id uuid, p_trigger_type text, p_error_message text, p_metadata jsonb, p_undo_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.log_deal_activity(p_deal_id uuid, p_actor_kind text, p_action_summary text, p_status text, p_pipeline_stage_id uuid, p_actor_user_id uuid, p_trigger_type text, p_error_message text, p_metadata jsonb, p_undo_token text) TO service_role;


--
-- Name: FUNCTION mark_deal_activity_undone(p_activity_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.mark_deal_activity_undone(p_activity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.mark_deal_activity_undone(p_activity_id uuid) TO service_role;


--
-- Name: FUNCTION mark_transition_dispatched(p_transition_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.mark_transition_dispatched(p_transition_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.mark_transition_dispatched(p_transition_id uuid) TO service_role;


--
-- Name: FUNCTION mark_transition_failed(p_transition_id uuid, p_error text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.mark_transition_failed(p_transition_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.mark_transition_failed(p_transition_id uuid, p_error text) TO service_role;


--
-- Name: FUNCTION merge_workspace_event_archetypes(p_workspace_id uuid, p_source_slug text, p_target_slug text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.merge_workspace_event_archetypes(p_workspace_id uuid, p_source_slug text, p_target_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.merge_workspace_event_archetypes(p_workspace_id uuid, p_source_slug text, p_target_slug text) TO service_role;
GRANT ALL ON FUNCTION ops.merge_workspace_event_archetypes(p_workspace_id uuid, p_source_slug text, p_target_slug text) TO authenticated;


--
-- Name: FUNCTION metric_aion_refusal_rate(p_workspace_id uuid, p_days integer); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_aion_refusal_rate(p_workspace_id uuid, p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_aion_refusal_rate(p_workspace_id uuid, p_days integer) TO service_role;
GRANT ALL ON FUNCTION ops.metric_aion_refusal_rate(p_workspace_id uuid, p_days integer) TO authenticated;


--
-- Name: FUNCTION metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION ops.metric_crew_utilization(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_multi_stop_rollup(p_workspace_id uuid, p_tz text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_multi_stop_rollup(p_workspace_id uuid, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_multi_stop_rollup(p_workspace_id uuid, p_tz text) TO service_role;
GRANT ALL ON FUNCTION ops.metric_multi_stop_rollup(p_workspace_id uuid, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_owner_cadence_profile(p_workspace_id uuid, p_user_id uuid, p_archetype text, p_lookback_days integer) TO service_role;


--
-- Name: FUNCTION metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION ops.metric_settlement_variance(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO service_role;
GRANT ALL ON FUNCTION ops.metric_vendor_payment_status(p_workspace_id uuid, p_period_start date, p_period_end date, p_tz text) TO authenticated;


--
-- Name: FUNCTION normalize_event_archetype_label(p_label text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.normalize_event_archetype_label(p_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.normalize_event_archetype_label(p_label text) TO service_role;
GRANT ALL ON FUNCTION ops.normalize_event_archetype_label(p_label text) TO authenticated;


--
-- Name: FUNCTION patch_event_ros_data(p_event_id uuid, p_patch jsonb); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.patch_event_ros_data(p_event_id uuid, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.patch_event_ros_data(p_event_id uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION ops.patch_event_ros_data(p_event_id uuid, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid, p_reason text, p_suggestion_insight_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid, p_reason text, p_suggestion_insight_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.record_deal_transition_with_actor(p_deal_id uuid, p_to_stage_id uuid, p_actor_kind text, p_actor_id uuid, p_reason text, p_suggestion_insight_id uuid) TO service_role;


--
-- Name: FUNCTION record_inbound_message(p_payload jsonb); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.record_inbound_message(p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.record_inbound_message(p_payload jsonb) TO service_role;


--
-- Name: FUNCTION record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.record_outbound_message_draft(p_workspace_id uuid, p_thread_id uuid, p_channel text, p_to_addresses text[], p_cc_addresses text[], p_subject text, p_body_text text, p_body_html text, p_attachments jsonb, p_sent_by_user_id uuid, p_in_reply_to uuid) TO service_role;


--
-- Name: FUNCTION record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb) TO service_role;
GRANT ALL ON FUNCTION ops.record_proposal_builder_event(p_workspace_id uuid, p_deal_id uuid, p_session_id uuid, p_variant text, p_type text, p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION rename_workspace_event_archetype(p_workspace_id uuid, p_slug text, p_new_label text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.rename_workspace_event_archetype(p_workspace_id uuid, p_slug text, p_new_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.rename_workspace_event_archetype(p_workspace_id uuid, p_slug text, p_new_label text) TO service_role;
GRANT ALL ON FUNCTION ops.rename_workspace_event_archetype(p_workspace_id uuid, p_slug text, p_new_label text) TO authenticated;


--
-- Name: FUNCTION reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION ops.reorder_pipeline_stages(p_pipeline_id uuid, p_stage_ids uuid[]) TO authenticated;


--
-- Name: FUNCTION resolve_follow_up_on_reply(p_queue_item_id uuid, p_message_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.resolve_follow_up_on_reply(p_queue_item_id uuid, p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.resolve_follow_up_on_reply(p_queue_item_id uuid, p_message_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_stage_by_tag(p_pipeline_id uuid, p_tag text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.resolve_stage_by_tag(p_pipeline_id uuid, p_tag text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.resolve_stage_by_tag(p_pipeline_id uuid, p_tag text) TO service_role;
GRANT ALL ON FUNCTION ops.resolve_stage_by_tag(p_pipeline_id uuid, p_tag text) TO authenticated;


--
-- Name: FUNCTION revoke_public_exec_on_new_function(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.revoke_public_exec_on_new_function() FROM PUBLIC;
GRANT ALL ON FUNCTION ops.revoke_public_exec_on_new_function() TO service_role;


--
-- Name: FUNCTION seed_default_pipeline(p_workspace_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.seed_default_pipeline(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.seed_default_pipeline(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION seed_default_pipeline_on_workspace_insert(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.seed_default_pipeline_on_workspace_insert() FROM PUBLIC;
GRANT ALL ON FUNCTION ops.seed_default_pipeline_on_workspace_insert() TO service_role;


--
-- Name: FUNCTION seed_default_triggers(p_workspace_id uuid); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.seed_default_triggers(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.seed_default_triggers(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION set_pipeline_stages_updated_at(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.set_pipeline_stages_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION ops.set_pipeline_stages_updated_at() TO service_role;


--
-- Name: FUNCTION set_pipelines_updated_at(); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.set_pipelines_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION ops.set_pipelines_updated_at() TO service_role;


--
-- Name: FUNCTION stamp_outbound_provider_id(p_message_id uuid, p_provider_message_id text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.stamp_outbound_provider_id(p_message_id uuid, p_provider_message_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.stamp_outbound_provider_id(p_message_id uuid, p_provider_message_id text) TO service_role;


--
-- Name: FUNCTION unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text) TO service_role;
GRANT ALL ON FUNCTION ops.unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text) TO authenticated;


--
-- Name: FUNCTION upsert_workspace_event_archetype(p_workspace_id uuid, p_label text); Type: ACL; Schema: ops; Owner: -
--

REVOKE ALL ON FUNCTION ops.upsert_workspace_event_archetype(p_workspace_id uuid, p_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION ops.upsert_workspace_event_archetype(p_workspace_id uuid, p_label text) TO service_role;
GRANT ALL ON FUNCTION ops.upsert_workspace_event_archetype(p_workspace_id uuid, p_label text) TO authenticated;


--
-- Name: FUNCTION _sync_deal_proposed_date_from_events(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._sync_deal_proposed_date_from_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public._sync_deal_proposed_date_from_events() TO service_role;


--
-- Name: FUNCTION add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text) TO service_role;
GRANT ALL ON FUNCTION public.add_books_for_edge(p_workspace_id uuid, p_person_id uuid, p_company_id uuid, p_since text) TO authenticated;


--
-- Name: FUNCTION add_catalog_item_assignee(p_package_id uuid, p_entity_id uuid, p_role_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_catalog_item_assignee(p_package_id uuid, p_entity_id uuid, p_role_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_catalog_item_assignee(p_package_id uuid, p_entity_id uuid, p_role_note text) TO authenticated;
GRANT ALL ON FUNCTION public.add_catalog_item_assignee(p_package_id uuid, p_entity_id uuid, p_role_note text) TO service_role;


--
-- Name: FUNCTION add_catalog_role_assignee(p_package_id uuid, p_role_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_catalog_role_assignee(p_package_id uuid, p_role_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_catalog_role_assignee(p_package_id uuid, p_role_note text) TO authenticated;
GRANT ALL ON FUNCTION public.add_catalog_role_assignee(p_package_id uuid, p_role_note text) TO service_role;


--
-- Name: FUNCTION add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text) TO service_role;
GRANT ALL ON FUNCTION public.add_co_host_edge(p_workspace_id uuid, p_partner_a_id uuid, p_partner_b_id uuid, p_pairing text, p_anniversary text) TO authenticated;


--
-- Name: FUNCTION add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text) TO service_role;


--
-- Name: FUNCTION add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) TO authenticated;
GRANT ALL ON FUNCTION public.add_contact_to_ghost_org(p_ghost_org_id uuid, p_workspace_id uuid, p_creator_org_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) TO service_role;


--
-- Name: FUNCTION add_ghost_member(p_org_id uuid, p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_ghost_member(p_org_id uuid, p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_ghost_member(p_org_id uuid, p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) TO authenticated;
GRANT ALL ON FUNCTION public.add_ghost_member(p_org_id uuid, p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_role text, p_job_title text) TO service_role;


--
-- Name: FUNCTION add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text) TO service_role;
GRANT ALL ON FUNCTION public.add_represents_edge(p_workspace_id uuid, p_representative_id uuid, p_principal_id uuid, p_scope text, p_since text) TO authenticated;


--
-- Name: FUNCTION add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.add_roster_member(p_person_entity_id uuid, p_org_entity_id uuid, p_context_data jsonb) TO service_role;


--
-- Name: FUNCTION aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.aion_lookup_catalog(p_workspace_id uuid, p_query text, p_kind text, p_limit integer) TO authenticated;


--
-- Name: FUNCTION bulk_approve_pending_equipment(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bulk_approve_pending_equipment(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bulk_approve_pending_equipment(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.bulk_approve_pending_equipment(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION check_bridge_pair_rate_limit(p_client_ip inet); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_bridge_pair_rate_limit(p_client_ip inet) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_bridge_pair_rate_limit(p_client_ip inet) TO service_role;


--
-- Name: FUNCTION check_seat_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_seat_limit() TO anon;
GRANT ALL ON FUNCTION public.check_seat_limit() TO authenticated;
GRANT ALL ON FUNCTION public.check_seat_limit() TO service_role;


--
-- Name: FUNCTION claim_ghost_entities_for_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_ghost_entities_for_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_ghost_entities_for_user() TO service_role;
GRANT ALL ON FUNCTION public.claim_ghost_entities_for_user() TO authenticated;


--
-- Name: FUNCTION claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.claim_ghost_entity_workspace(p_entity_id uuid, p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION cleanup_webauthn_challenges(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_webauthn_challenges() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_webauthn_challenges() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_webauthn_challenges() TO service_role;


--
-- Name: FUNCTION client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_check_rate_limit(p_scope text, p_key text, p_limit integer, p_window_seconds integer) TO service_role;


--
-- Name: FUNCTION client_claim_entity(p_entity_id uuid, p_auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_claim_entity(p_entity_id uuid, p_auth_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_claim_entity(p_entity_id uuid, p_auth_user_id uuid) TO service_role;


--
-- Name: FUNCTION client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.client_is_workspace_client(p_entity_id uuid, p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_issue_otp_challenge(p_entity_id uuid, p_email text, p_purpose text, p_ip inet) TO service_role;


--
-- Name: FUNCTION client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid, p_request_id text, p_resource_id uuid, p_actor_id text, p_auth_method text, p_ip inet, p_user_agent text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid, p_request_id text, p_resource_id uuid, p_actor_id text, p_auth_method text, p_ip inet, p_user_agent text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_log_access(p_entity_id uuid, p_workspace_id uuid, p_resource_type text, p_action text, p_actor_kind text, p_outcome text, p_session_id uuid, p_request_id text, p_resource_id uuid, p_actor_id text, p_auth_method text, p_ip inet, p_user_agent text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION client_lookup_entity_by_email(p_email_lower text, p_workspace_hint uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_lookup_entity_by_email(p_email_lower text, p_workspace_hint uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_lookup_entity_by_email(p_email_lower text, p_workspace_hint uuid) TO service_role;


--
-- Name: FUNCTION client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet, p_device_id_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet, p_device_id_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_mint_session_token(p_entity_id uuid, p_source_kind text, p_source_id uuid, p_ip inet, p_device_id_hash text) TO service_role;


--
-- Name: FUNCTION client_portal_cascade_revoke_on_proposal_token_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change() TO anon;
GRANT ALL ON FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change() TO authenticated;
GRANT ALL ON FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change() TO service_role;


--
-- Name: FUNCTION client_portal_rate_limit_prune(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_portal_rate_limit_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_portal_rate_limit_prune() TO service_role;


--
-- Name: FUNCTION client_resolve_proposal_entity(p_public_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_resolve_proposal_entity(p_public_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_resolve_proposal_entity(p_public_token uuid) TO service_role;


--
-- Name: FUNCTION client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_revoke_all_for_entity(p_entity_id uuid, p_workspace_id uuid, p_revoked_by uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION client_revoke_session_token(p_token_hash text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_revoke_session_token(p_token_hash text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_revoke_session_token(p_token_hash text, p_reason text) TO service_role;


--
-- Name: FUNCTION client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_revoke_session_token_device(p_workspace_id uuid, p_entity_id uuid, p_session_id uuid, p_revoked_by uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION client_rotate_session_token(p_token_hash text, p_ip inet, p_user_agent text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_rotate_session_token(p_token_hash text, p_ip inet, p_user_agent text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_rotate_session_token(p_token_hash text, p_ip inet, p_user_agent text) TO service_role;


--
-- Name: FUNCTION client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text, p_special_moment_label text, p_spotify_id text, p_apple_music_id text, p_isrc text, p_artwork_url text, p_duration_ms integer, p_preview_url text, p_requested_by_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text, p_special_moment_label text, p_spotify_id text, p_apple_music_id text, p_isrc text, p_artwork_url text, p_duration_ms integer, p_preview_url text, p_requested_by_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_songs_add_request(p_entity_id uuid, p_event_id uuid, p_title text, p_artist text, p_tier text, p_notes text, p_special_moment_label text, p_spotify_id text, p_apple_music_id text, p_isrc text, p_artwork_url text, p_duration_ms integer, p_preview_url text, p_requested_by_label text) TO service_role;


--
-- Name: FUNCTION client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_songs_delete_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid) TO service_role;


--
-- Name: FUNCTION client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text, p_notes text, p_requested_by_label text, p_special_moment_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text, p_notes text, p_requested_by_label text, p_special_moment_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_songs_update_request(p_entity_id uuid, p_event_id uuid, p_entry_id uuid, p_tier text, p_notes text, p_requested_by_label text, p_special_moment_label text) TO service_role;


--
-- Name: FUNCTION client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet) FROM PUBLIC;
GRANT ALL ON FUNCTION public.client_verify_otp(p_challenge_id uuid, p_code text, p_ip inet) TO service_role;


--
-- Name: FUNCTION complete_onboarding(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_onboarding() TO authenticated;
GRANT ALL ON FUNCTION public.complete_onboarding() TO service_role;


--
-- Name: FUNCTION compute_client_session_expiry(p_entity_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.compute_client_session_expiry(p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.compute_client_session_expiry(p_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.compute_client_session_expiry(p_entity_id uuid) TO service_role;


--
-- Name: FUNCTION cortex_relationships_audit_trail(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cortex_relationships_audit_trail() TO anon;
GRANT ALL ON FUNCTION public.cortex_relationships_audit_trail() TO authenticated;
GRANT ALL ON FUNCTION public.cortex_relationships_audit_trail() TO service_role;


--
-- Name: FUNCTION count_active_shows(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_active_shows(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_active_shows(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.count_active_shows(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION count_team_seats(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_team_seats(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_team_seats(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.count_team_seats(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb) TO service_role;
GRANT ALL ON FUNCTION public.create_deal_complete(p_workspace_id uuid, p_hosts jsonb, p_poc jsonb, p_bill_to jsonb, p_planner jsonb, p_venue_entity jsonb, p_deal jsonb, p_note jsonb, p_pairing text, p_date_kind text, p_date jsonb) TO authenticated;


--
-- Name: FUNCTION create_default_location(p_workspace_id uuid, p_location_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_default_location(p_workspace_id uuid, p_location_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_default_location(p_workspace_id uuid, p_location_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_default_location(p_workspace_id uuid, p_location_name text) TO service_role;


--
-- Name: FUNCTION current_entity_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_entity_id() TO anon;
GRANT ALL ON FUNCTION public.current_entity_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_entity_id() TO service_role;


--
-- Name: FUNCTION deal_in_workspace(p_deal_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.deal_in_workspace(p_deal_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deal_in_workspace(p_deal_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.deal_in_workspace(p_deal_id uuid) TO authenticated;


--
-- Name: FUNCTION ensure_profile_exists(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_profile_exists() TO anon;
GRANT ALL ON FUNCTION public.ensure_profile_exists() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_profile_exists() TO service_role;


--
-- Name: FUNCTION entities_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.entities_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.entities_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.entities_set_updated_at() TO service_role;


--
-- Name: FUNCTION generate_bridge_pairing_code(p_user_id uuid, p_person_entity_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generate_bridge_pairing_code(p_user_id uuid, p_person_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_bridge_pairing_code(p_user_id uuid, p_person_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_bridge_pairing_code(p_user_id uuid, p_person_entity_id uuid) TO service_role;


--
-- Name: FUNCTION get_active_workspace_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_workspace_id() TO anon;
GRANT ALL ON FUNCTION public.get_active_workspace_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_workspace_id() TO service_role;


--
-- Name: FUNCTION get_catalog_availability(p_workspace_id uuid, p_date_start date, p_date_end date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_catalog_availability(p_workspace_id uuid, p_date_start date, p_date_end date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_catalog_availability(p_workspace_id uuid, p_date_start date, p_date_end date) TO authenticated;
GRANT ALL ON FUNCTION public.get_catalog_availability(p_workspace_id uuid, p_date_start date, p_date_end date) TO service_role;


--
-- Name: FUNCTION get_catalog_item_assignees(p_package_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_catalog_item_assignees(p_package_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_catalog_item_assignees(p_package_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_catalog_item_assignees(p_package_id uuid) TO service_role;


--
-- Name: FUNCTION get_current_org_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_current_org_id() TO anon;
GRANT ALL ON FUNCTION public.get_current_org_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_current_org_id() TO service_role;


--
-- Name: FUNCTION get_deal_crew_enriched(p_deal_id uuid, p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_deal_crew_enriched(p_deal_id uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_deal_crew_enriched(p_deal_id uuid, p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_deal_crew_enriched(p_deal_id uuid, p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION get_ghost_entity_by_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_ghost_entity_by_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_ghost_entity_by_email(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.get_ghost_entity_by_email(p_email text) TO service_role;


--
-- Name: FUNCTION get_member_permissions(p_workspace_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_member_permissions(p_workspace_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_member_permissions(p_workspace_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_member_permissions(p_workspace_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_member_role_slug(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_member_role_slug(p_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_member_role_slug(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_member_role_slug(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_client_entity_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_client_entity_ids() TO anon;
GRANT ALL ON FUNCTION public.get_my_client_entity_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_client_entity_ids() TO service_role;


--
-- Name: FUNCTION get_my_entity_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_entity_id() TO anon;
GRANT ALL ON FUNCTION public.get_my_entity_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_entity_id() TO service_role;


--
-- Name: FUNCTION get_my_organization_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_organization_ids() TO anon;
GRANT ALL ON FUNCTION public.get_my_organization_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_organization_ids() TO service_role;


--
-- Name: FUNCTION get_my_workspace_ids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_workspace_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_workspace_ids() TO anon;
GRANT ALL ON FUNCTION public.get_my_workspace_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_workspace_ids() TO service_role;


--
-- Name: FUNCTION get_user_id_by_email(user_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_id_by_email(user_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_id_by_email(user_email text) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_id_by_email(user_email text) TO service_role;


--
-- Name: FUNCTION get_user_workspace_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_workspace_ids() TO anon;
GRANT ALL ON FUNCTION public.get_user_workspace_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_workspace_ids() TO service_role;


--
-- Name: FUNCTION get_workspace_seat_limit(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_workspace_seat_limit(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_workspace_seat_limit(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_workspace_seat_limit(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION increment_proposal_view(p_proposal_id uuid, p_now timestamp with time zone, p_set_first boolean, p_was_sent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_proposal_view(p_proposal_id uuid, p_now timestamp with time zone, p_set_first boolean, p_was_sent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_proposal_view(p_proposal_id uuid, p_now timestamp with time zone, p_set_first boolean, p_was_sent boolean) TO authenticated;
GRANT ALL ON FUNCTION public.increment_proposal_view(p_proposal_id uuid, p_now timestamp with time zone, p_set_first boolean, p_was_sent boolean) TO service_role;


--
-- Name: FUNCTION insert_ghost_entity(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.insert_ghost_entity(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.insert_ghost_entity(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.insert_ghost_entity(p_email text) TO service_role;


--
-- Name: FUNCTION is_member_of(_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_member_of(_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_member_of(_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_member_of(_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION is_workspace_member(w_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_workspace_member(w_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_workspace_member(w_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_workspace_member(w_id uuid) TO service_role;


--
-- Name: FUNCTION is_workspace_owner(w_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_workspace_owner(w_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_workspace_owner(w_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_workspace_owner(w_id uuid) TO service_role;


--
-- Name: FUNCTION match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer, match_threshold double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer, match_threshold double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_catalog(filter_workspace_id uuid, query_embedding extensions.vector, match_count integer, match_threshold double precision) TO service_role;


--
-- Name: FUNCTION match_documents(query_embedding extensions.vector, match_threshold double precision, match_count integer, query_text text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_documents(query_embedding extensions.vector, match_threshold double precision, match_count integer, query_text text) TO anon;
GRANT ALL ON FUNCTION public.match_documents(query_embedding extensions.vector, match_threshold double precision, match_count integer, query_text text) TO authenticated;
GRANT ALL ON FUNCTION public.match_documents(query_embedding extensions.vector, match_threshold double precision, match_count integer, query_text text) TO service_role;


--
-- Name: FUNCTION member_has_capability(p_workspace_id uuid, p_permission_key text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.member_has_capability(p_workspace_id uuid, p_permission_key text) TO anon;
GRANT ALL ON FUNCTION public.member_has_capability(p_workspace_id uuid, p_permission_key text) TO authenticated;
GRANT ALL ON FUNCTION public.member_has_capability(p_workspace_id uuid, p_permission_key text) TO service_role;


--
-- Name: FUNCTION member_has_permission(p_workspace_id uuid, p_permission_key text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.member_has_permission(p_workspace_id uuid, p_permission_key text) TO anon;
GRANT ALL ON FUNCTION public.member_has_permission(p_workspace_id uuid, p_permission_key text) TO authenticated;
GRANT ALL ON FUNCTION public.member_has_permission(p_workspace_id uuid, p_permission_key text) TO service_role;


--
-- Name: FUNCTION merge_industry_tags(p_workspace_id uuid, p_from_tag text, p_to_tag text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.merge_industry_tags(p_workspace_id uuid, p_from_tag text, p_to_tag text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_industry_tags(p_workspace_id uuid, p_from_tag text, p_to_tag text) TO authenticated;
GRANT ALL ON FUNCTION public.merge_industry_tags(p_workspace_id uuid, p_from_tag text, p_to_tag text) TO service_role;


--
-- Name: FUNCTION my_org_ids_admin_member(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_org_ids_admin_member() TO anon;
GRANT ALL ON FUNCTION public.my_org_ids_admin_member() TO authenticated;
GRANT ALL ON FUNCTION public.my_org_ids_admin_member() TO service_role;


--
-- Name: FUNCTION ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text) TO authenticated;
GRANT ALL ON FUNCTION public.ops_songs_acknowledge_client_request(p_event_id uuid, p_entry_id uuid, p_moment_label text) TO service_role;


--
-- Name: FUNCTION ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ops_songs_promote_client_request(p_event_id uuid, p_entry_id uuid, p_tier text, p_assigned_moment_id uuid) TO service_role;


--
-- Name: FUNCTION patch_entity_attributes(p_entity_id uuid, p_attributes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.patch_entity_attributes(p_entity_id uuid, p_attributes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patch_entity_attributes(p_entity_id uuid, p_attributes jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.patch_entity_attributes(p_entity_id uuid, p_attributes jsonb) TO service_role;


--
-- Name: FUNCTION patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.patch_relationship_context(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION purge_expired_sms_otp_codes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_expired_sms_otp_codes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_expired_sms_otp_codes() TO service_role;


--
-- Name: FUNCTION record_deal_transition(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_deal_transition() FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_deal_transition() TO service_role;


--
-- Name: FUNCTION regenerate_invite_code(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.regenerate_invite_code(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.regenerate_invite_code(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.regenerate_invite_code(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION remove_catalog_item_assignee(p_assignee_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_catalog_item_assignee(p_assignee_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_catalog_item_assignee(p_assignee_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_catalog_item_assignee(p_assignee_id uuid) TO service_role;


--
-- Name: FUNCTION remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.remove_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_relationship_type text) TO service_role;


--
-- Name: FUNCTION review_crew_equipment(p_crew_equipment_id uuid, p_decision text, p_rejection_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.review_crew_equipment(p_crew_equipment_id uuid, p_decision text, p_rejection_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_crew_equipment(p_crew_equipment_id uuid, p_decision text, p_rejection_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.review_crew_equipment(p_crew_equipment_id uuid, p_decision text, p_rejection_reason text) TO service_role;


--
-- Name: FUNCTION search_spine(query_embedding extensions.vector, match_threshold double precision, match_count integer, filter_workspace_id uuid, query_text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_spine(query_embedding extensions.vector, match_threshold double precision, match_count integer, filter_workspace_id uuid, query_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_spine(query_embedding extensions.vector, match_threshold double precision, match_count integer, filter_workspace_id uuid, query_text text) TO authenticated;
GRANT ALL ON FUNCTION public.search_spine(query_embedding extensions.vector, match_threshold double precision, match_count integer, filter_workspace_id uuid, query_text text) TO service_role;


--
-- Name: FUNCTION seed_workspace_lead_sources(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.seed_workspace_lead_sources(p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.seed_workspace_lead_sources(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_workspace_lead_sources(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION set_org_member_workspace_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_org_member_workspace_id() TO anon;
GRANT ALL ON FUNCTION public.set_org_member_workspace_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_org_member_workspace_id() TO service_role;


--
-- Name: FUNCTION set_org_members_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_org_members_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_org_members_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_org_members_updated_at() TO service_role;


--
-- Name: FUNCTION set_ros_cue_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_ros_cue_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_ros_cue_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_ros_cue_updated_at() TO service_role;


--
-- Name: FUNCTION set_talent_skill_workspace_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_talent_skill_workspace_id() TO anon;
GRANT ALL ON FUNCTION public.set_talent_skill_workspace_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_talent_skill_workspace_id() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION strip_industry_tag(p_workspace_id uuid, p_tag text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.strip_industry_tag(p_workspace_id uuid, p_tag text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.strip_industry_tag(p_workspace_id uuid, p_tag text) TO authenticated;
GRANT ALL ON FUNCTION public.strip_industry_tag(p_workspace_id uuid, p_tag text) TO service_role;


--
-- Name: FUNCTION sync_deal_status_from_stage(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_deal_status_from_stage() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_deal_status_from_stage() TO service_role;


--
-- Name: FUNCTION sync_gig_to_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_gig_to_event() TO anon;
GRANT ALL ON FUNCTION public.sync_gig_to_event() TO authenticated;
GRANT ALL ON FUNCTION public.sync_gig_to_event() TO service_role;


--
-- Name: FUNCTION sync_workspace_roles_to_app_metadata(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_workspace_roles_to_app_metadata() TO anon;
GRANT ALL ON FUNCTION public.sync_workspace_roles_to_app_metadata() TO authenticated;
GRANT ALL ON FUNCTION public.sync_workspace_roles_to_app_metadata() TO service_role;


--
-- Name: FUNCTION touch_spine_item_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_spine_item_timestamp() TO anon;
GRANT ALL ON FUNCTION public.touch_spine_item_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.touch_spine_item_timestamp() TO service_role;


--
-- Name: FUNCTION trigger_spine_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trigger_spine_audit() TO anon;
GRANT ALL ON FUNCTION public.trigger_spine_audit() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_spine_audit() TO service_role;


--
-- Name: FUNCTION unusonic_current_entity_email(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unusonic_current_entity_email() TO anon;
GRANT ALL ON FUNCTION public.unusonic_current_entity_email() TO authenticated;
GRANT ALL ON FUNCTION public.unusonic_current_entity_email() TO service_role;


--
-- Name: FUNCTION unusonic_current_entity_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unusonic_current_entity_id() TO anon;
GRANT ALL ON FUNCTION public.unusonic_current_entity_id() TO authenticated;
GRANT ALL ON FUNCTION public.unusonic_current_entity_id() TO service_role;


--
-- Name: FUNCTION unusonic_org_ids_can_affiliate(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unusonic_org_ids_can_affiliate() TO anon;
GRANT ALL ON FUNCTION public.unusonic_org_ids_can_affiliate() TO authenticated;
GRANT ALL ON FUNCTION public.unusonic_org_ids_can_affiliate() TO service_role;


--
-- Name: FUNCTION unusonic_org_ids_for_entity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unusonic_org_ids_for_entity() TO anon;
GRANT ALL ON FUNCTION public.unusonic_org_ids_for_entity() TO authenticated;
GRANT ALL ON FUNCTION public.unusonic_org_ids_for_entity() TO service_role;


--
-- Name: FUNCTION unusonic_org_ids_where_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unusonic_org_ids_where_admin() TO anon;
GRANT ALL ON FUNCTION public.unusonic_org_ids_where_admin() TO authenticated;
GRANT ALL ON FUNCTION public.unusonic_org_ids_where_admin() TO service_role;


--
-- Name: FUNCTION update_ghost_member(p_creator_org_id uuid, p_member_id uuid, p_role text, p_job_title text, p_avatar_url text, p_phone text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_ghost_member(p_creator_org_id uuid, p_member_id uuid, p_role text, p_job_title text, p_avatar_url text, p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_ghost_member(p_creator_org_id uuid, p_member_id uuid, p_role text, p_job_title text, p_avatar_url text, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.update_ghost_member(p_creator_org_id uuid, p_member_id uuid, p_role text, p_job_title text, p_avatar_url text, p_phone text) TO service_role;


--
-- Name: FUNCTION update_location_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_location_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_location_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_location_timestamp() TO service_role;


--
-- Name: FUNCTION update_profile_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_profile_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_profile_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_profile_timestamp() TO service_role;


--
-- Name: FUNCTION update_workspace_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_workspace_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_workspace_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_workspace_timestamp() TO service_role;


--
-- Name: FUNCTION upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_relationship(p_source_entity_id uuid, p_target_entity_id uuid, p_type text, p_context_data jsonb) TO service_role;


--
-- Name: FUNCTION user_has_workspace_role(p_workspace_id uuid, p_roles text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_has_workspace_role(p_workspace_id uuid, p_roles text[]) TO anon;
GRANT ALL ON FUNCTION public.user_has_workspace_role(p_workspace_id uuid, p_roles text[]) TO authenticated;
GRANT ALL ON FUNCTION public.user_has_workspace_role(p_workspace_id uuid, p_roles text[]) TO service_role;


--
-- Name: FUNCTION workspace_created_by_me(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.workspace_created_by_me(p_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_created_by_me(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_created_by_me(p_workspace_id uuid) TO service_role;


--
-- Name: FUNCTION workspace_joinable_by_invite(p_workspace_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.workspace_joinable_by_invite(p_workspace_id uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_joinable_by_invite(p_workspace_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_joinable_by_invite(p_workspace_id uuid) TO service_role;


--
-- Name: TABLE item_assignees; Type: ACL; Schema: catalog; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE catalog.item_assignees TO authenticated;


--
-- Name: TABLE aion_insights; Type: ACL; Schema: cortex; Owner: -
--

GRANT ALL ON TABLE cortex.aion_insights TO service_role;


--
-- Name: TABLE aion_messages; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.aion_messages TO authenticated;
GRANT SELECT ON TABLE cortex.aion_messages TO service_role;


--
-- Name: TABLE aion_proactive_lines; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.aion_proactive_lines TO authenticated;
GRANT ALL ON TABLE cortex.aion_proactive_lines TO service_role;


--
-- Name: TABLE aion_sessions; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.aion_sessions TO authenticated;
GRANT SELECT ON TABLE cortex.aion_sessions TO service_role;


--
-- Name: TABLE capture_events; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.capture_events TO authenticated;
GRANT ALL ON TABLE cortex.capture_events TO service_role;


--
-- Name: TABLE entity_working_notes; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.entity_working_notes TO authenticated;
GRANT ALL ON TABLE cortex.entity_working_notes TO service_role;


--
-- Name: TABLE memory_pending; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE cortex.memory_pending TO service_role;


--
-- Name: TABLE portal_aion_insights; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.portal_aion_insights TO authenticated;


--
-- Name: TABLE referrals; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.referrals TO authenticated;
GRANT ALL ON TABLE cortex.referrals TO service_role;


--
-- Name: TABLE relationships; Type: ACL; Schema: cortex; Owner: -
--

GRANT SELECT ON TABLE cortex.relationships TO authenticated;
GRANT ALL ON TABLE cortex.relationships TO service_role;


--
-- Name: TABLE entities; Type: ACL; Schema: directory; Owner: -
--

GRANT SELECT ON TABLE directory.entities TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE directory.entities TO authenticated;
GRANT ALL ON TABLE directory.entities TO service_role;


--
-- Name: TABLE bill_payments; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.bill_payments TO service_role;


--
-- Name: TABLE bills; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.bills TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.invoices TO service_role;


--
-- Name: TABLE invoice_balances; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.invoice_balances TO service_role;


--
-- Name: TABLE invoice_line_items; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.invoice_line_items TO service_role;


--
-- Name: TABLE invoice_number_sequences; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.invoice_number_sequences TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.payments TO service_role;


--
-- Name: TABLE qbo_connections; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.qbo_connections TO service_role;


--
-- Name: COLUMN qbo_connections.id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.workspace_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(workspace_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.realm_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(realm_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.environment; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(environment) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.status; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(status) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.access_token_expires_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(access_token_expires_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.refresh_token_expires_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(refresh_token_expires_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.last_refreshed_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(last_refreshed_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.default_item_ids; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(default_item_ids) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.default_tax_code_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(default_tax_code_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.default_income_account_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(default_income_account_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.default_deposit_account_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(default_deposit_account_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.connected_by_user_id; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(connected_by_user_id) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.connected_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(connected_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.last_sync_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(last_sync_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.last_sync_error; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(last_sync_error) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.created_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(created_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: COLUMN qbo_connections.updated_at; Type: ACL; Schema: finance; Owner: -
--

GRANT SELECT(updated_at) ON TABLE finance.qbo_connections TO authenticated;


--
-- Name: TABLE qbo_entity_map; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.qbo_entity_map TO service_role;


--
-- Name: TABLE qbo_sync_log; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.qbo_sync_log TO service_role;


--
-- Name: TABLE stripe_webhook_events; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.stripe_webhook_events TO service_role;


--
-- Name: TABLE sync_jobs; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.sync_jobs TO service_role;


--
-- Name: TABLE tax_rates; Type: ACL; Schema: finance; Owner: -
--

GRANT ALL ON TABLE finance.tax_rates TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.events TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.events TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.projects TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.projects TO service_role;


--
-- Name: TABLE deals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.deals TO anon;
GRANT ALL ON TABLE public.deals TO authenticated;
GRANT ALL ON TABLE public.deals TO service_role;


--
-- Name: TABLE active_deals; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.active_deals TO service_role;
GRANT SELECT ON TABLE ops.active_deals TO authenticated;


--
-- Name: TABLE aion_write_log; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.aion_write_log TO service_role;
GRANT SELECT ON TABLE ops.aion_write_log TO authenticated;


--
-- Name: TABLE assignments; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.assignments TO service_role;


--
-- Name: TABLE crew_assignments; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_assignments TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_assignments TO service_role;


--
-- Name: TABLE crew_comms_log; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_comms_log TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_comms_log TO authenticated;


--
-- Name: TABLE crew_confirmation_tokens; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_confirmation_tokens TO service_role;


--
-- Name: TABLE crew_equipment; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_equipment TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_equipment TO service_role;


--
-- Name: TABLE crew_skills; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_skills TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.crew_skills TO service_role;


--
-- Name: TABLE daily_briefings; Type: ACL; Schema: ops; Owner: -
--

GRANT ALL ON TABLE ops.daily_briefings TO service_role;
GRANT SELECT,INSERT ON TABLE ops.daily_briefings TO authenticated;


--
-- Name: TABLE day_sheet_tokens; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE ops.day_sheet_tokens TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.day_sheet_tokens TO service_role;


--
-- Name: TABLE deal_activity_log; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_activity_log TO service_role;
GRANT SELECT ON TABLE ops.deal_activity_log TO authenticated;


--
-- Name: TABLE deal_crew; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_crew TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_crew TO service_role;


--
-- Name: TABLE deal_crew_waypoints; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_crew_waypoints TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_crew_waypoints TO authenticated;


--
-- Name: TABLE deal_notes; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_notes TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_notes TO service_role;


--
-- Name: TABLE deal_stakeholders; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_stakeholders TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_stakeholders TO service_role;


--
-- Name: TABLE follow_up_log; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.follow_up_log TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.follow_up_log TO service_role;


--
-- Name: TABLE message_threads; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.message_threads TO service_role;
GRANT SELECT ON TABLE ops.message_threads TO authenticated;


--
-- Name: TABLE messages; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.messages TO service_role;
GRANT SELECT ON TABLE ops.messages TO authenticated;


--
-- Name: TABLE deal_timeline_v; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_timeline_v TO service_role;
GRANT SELECT ON TABLE ops.deal_timeline_v TO authenticated;


--
-- Name: TABLE deal_transitions; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.deal_transitions TO service_role;
GRANT SELECT ON TABLE ops.deal_transitions TO authenticated;


--
-- Name: TABLE domain_events; Type: ACL; Schema: ops; Owner: -
--

GRANT ALL ON TABLE ops.domain_events TO service_role;
GRANT SELECT ON TABLE ops.domain_events TO authenticated;


--
-- Name: TABLE entity_capabilities; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.entity_capabilities TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.entity_capabilities TO service_role;


--
-- Name: TABLE entity_crew_schedule; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.entity_crew_schedule TO service_role;
GRANT SELECT ON TABLE ops.entity_crew_schedule TO authenticated;


--
-- Name: TABLE event_expenses; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.event_expenses TO service_role;


--
-- Name: TABLE event_gear_items; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.event_gear_items TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.event_gear_items TO service_role;


--
-- Name: TABLE follow_up_queue; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.follow_up_queue TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.follow_up_queue TO service_role;


--
-- Name: TABLE kit_templates; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.kit_templates TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.kit_templates TO service_role;


--
-- Name: TABLE message_channel_identities; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.message_channel_identities TO service_role;
GRANT SELECT ON TABLE ops.message_channel_identities TO authenticated;


--
-- Name: TABLE pipeline_stages; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.pipeline_stages TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.pipeline_stages TO authenticated;


--
-- Name: TABLE pipelines; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.pipelines TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.pipelines TO authenticated;


--
-- Name: TABLE portal_follow_up_queue; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.portal_follow_up_queue TO service_role;
GRANT SELECT ON TABLE ops.portal_follow_up_queue TO authenticated;


--
-- Name: TABLE proposal_builder_events; Type: ACL; Schema: ops; Owner: -
--

GRANT ALL ON TABLE ops.proposal_builder_events TO service_role;
GRANT SELECT ON TABLE ops.proposal_builder_events TO authenticated;


--
-- Name: TABLE workspace_call_time_rules; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_call_time_rules TO service_role;


--
-- Name: TABLE workspace_capability_presets; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_capability_presets TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_capability_presets TO service_role;


--
-- Name: TABLE workspace_event_archetypes; Type: ACL; Schema: ops; Owner: -
--

GRANT ALL ON TABLE ops.workspace_event_archetypes TO service_role;
GRANT SELECT ON TABLE ops.workspace_event_archetypes TO authenticated;


--
-- Name: TABLE workspace_industry_tags; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_industry_tags TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_industry_tags TO service_role;


--
-- Name: TABLE workspace_job_titles; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_job_titles TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_job_titles TO service_role;


--
-- Name: TABLE workspace_lead_sources; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_lead_sources TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_lead_sources TO service_role;


--
-- Name: TABLE workspace_permissions; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT ON TABLE ops.workspace_permissions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_permissions TO service_role;


--
-- Name: TABLE workspace_role_permissions; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE ops.workspace_role_permissions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_role_permissions TO service_role;


--
-- Name: TABLE workspace_roles; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_roles TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_roles TO service_role;


--
-- Name: TABLE workspace_ros_templates; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_ros_templates TO service_role;


--
-- Name: TABLE workspace_skill_presets; Type: ACL; Schema: ops; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_skill_presets TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ops.workspace_skill_presets TO service_role;


--
-- Name: TABLE agent_configs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_configs TO anon;
GRANT ALL ON TABLE public.agent_configs TO authenticated;
GRANT ALL ON TABLE public.agent_configs TO service_role;


--
-- Name: TABLE autonomous_resolutions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.autonomous_resolutions TO anon;
GRANT ALL ON TABLE public.autonomous_resolutions TO authenticated;
GRANT ALL ON TABLE public.autonomous_resolutions TO service_role;


--
-- Name: TABLE bridge_device_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bridge_device_tokens TO anon;
GRANT ALL ON TABLE public.bridge_device_tokens TO authenticated;
GRANT ALL ON TABLE public.bridge_device_tokens TO service_role;


--
-- Name: TABLE bridge_pair_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bridge_pair_attempts TO anon;
GRANT ALL ON TABLE public.bridge_pair_attempts TO authenticated;
GRANT ALL ON TABLE public.bridge_pair_attempts TO service_role;


--
-- Name: SEQUENCE bridge_pair_attempts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.bridge_pair_attempts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bridge_pair_attempts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bridge_pair_attempts_id_seq TO service_role;


--
-- Name: TABLE bridge_pairing_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bridge_pairing_codes TO anon;
GRANT ALL ON TABLE public.bridge_pairing_codes TO authenticated;
GRANT ALL ON TABLE public.bridge_pairing_codes TO service_role;


--
-- Name: TABLE bridge_sync_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bridge_sync_status TO anon;
GRANT ALL ON TABLE public.bridge_sync_status TO authenticated;
GRANT ALL ON TABLE public.bridge_sync_status TO service_role;


--
-- Name: TABLE client_portal_access_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_portal_access_log TO anon;
GRANT ALL ON TABLE public.client_portal_access_log TO authenticated;
GRANT ALL ON TABLE public.client_portal_access_log TO service_role;


--
-- Name: SEQUENCE client_portal_access_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.client_portal_access_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.client_portal_access_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.client_portal_access_log_id_seq TO service_role;


--
-- Name: TABLE client_portal_otp_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_portal_otp_challenges TO anon;
GRANT ALL ON TABLE public.client_portal_otp_challenges TO authenticated;
GRANT ALL ON TABLE public.client_portal_otp_challenges TO service_role;


--
-- Name: TABLE client_portal_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_portal_rate_limits TO anon;
GRANT ALL ON TABLE public.client_portal_rate_limits TO authenticated;
GRANT ALL ON TABLE public.client_portal_rate_limits TO service_role;


--
-- Name: SEQUENCE client_portal_rate_limits_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.client_portal_rate_limits_id_seq TO anon;
GRANT ALL ON SEQUENCE public.client_portal_rate_limits_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.client_portal_rate_limits_id_seq TO service_role;


--
-- Name: TABLE client_portal_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_portal_tokens TO anon;
GRANT ALL ON TABLE public.client_portal_tokens TO authenticated;
GRANT ALL ON TABLE public.client_portal_tokens TO service_role;


--
-- Name: TABLE commercial_organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.commercial_organizations TO anon;
GRANT ALL ON TABLE public.commercial_organizations TO authenticated;
GRANT ALL ON TABLE public.commercial_organizations TO service_role;


--
-- Name: TABLE contracts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contracts TO anon;
GRANT ALL ON TABLE public.contracts TO authenticated;
GRANT ALL ON TABLE public.contracts TO service_role;


--
-- Name: TABLE guardians; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guardians TO anon;
GRANT ALL ON TABLE public.guardians TO authenticated;
GRANT ALL ON TABLE public.guardians TO service_role;


--
-- Name: TABLE invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitations TO anon;
GRANT ALL ON TABLE public.invitations TO authenticated;
GRANT ALL ON TABLE public.invitations TO service_role;


--
-- Name: SEQUENCE invoice_number_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.invoice_number_seq TO anon;
GRANT ALL ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoice_number_seq TO service_role;


--
-- Name: TABLE lobby_layouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lobby_layouts TO anon;
GRANT ALL ON TABLE public.lobby_layouts TO authenticated;
GRANT ALL ON TABLE public.lobby_layouts TO service_role;


--
-- Name: TABLE organization_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_members TO anon;
GRANT ALL ON TABLE public.organization_members TO authenticated;
GRANT ALL ON TABLE public.organization_members TO service_role;


--
-- Name: TABLE package_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.package_tags TO anon;
GRANT ALL ON TABLE public.package_tags TO authenticated;
GRANT ALL ON TABLE public.package_tags TO service_role;


--
-- Name: TABLE packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.packages TO anon;
GRANT ALL ON TABLE public.packages TO authenticated;
GRANT ALL ON TABLE public.packages TO service_role;


--
-- Name: TABLE passkeys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.passkeys TO anon;
GRANT ALL ON TABLE public.passkeys TO authenticated;
GRANT ALL ON TABLE public.passkeys TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE proposal_client_selections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposal_client_selections TO anon;
GRANT ALL ON TABLE public.proposal_client_selections TO authenticated;
GRANT ALL ON TABLE public.proposal_client_selections TO service_role;


--
-- Name: TABLE proposal_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposal_items TO anon;
GRANT ALL ON TABLE public.proposal_items TO authenticated;
GRANT ALL ON TABLE public.proposal_items TO service_role;


--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposals TO anon;
GRANT ALL ON TABLE public.proposals TO authenticated;
GRANT ALL ON TABLE public.proposals TO service_role;


--
-- Name: TABLE recovery_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recovery_requests TO anon;
GRANT ALL ON TABLE public.recovery_requests TO authenticated;
GRANT ALL ON TABLE public.recovery_requests TO service_role;


--
-- Name: TABLE recovery_shards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recovery_shards TO anon;
GRANT ALL ON TABLE public.recovery_shards TO authenticated;
GRANT ALL ON TABLE public.recovery_shards TO service_role;


--
-- Name: TABLE run_of_show_cues; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.run_of_show_cues TO anon;
GRANT ALL ON TABLE public.run_of_show_cues TO authenticated;
GRANT ALL ON TABLE public.run_of_show_cues TO service_role;


--
-- Name: TABLE run_of_show_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.run_of_show_sections TO anon;
GRANT ALL ON TABLE public.run_of_show_sections TO authenticated;
GRANT ALL ON TABLE public.run_of_show_sections TO service_role;


--
-- Name: TABLE sms_otp_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_otp_attempts TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sms_otp_attempts TO authenticated;
GRANT ALL ON TABLE public.sms_otp_attempts TO service_role;


--
-- Name: TABLE sms_otp_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_otp_codes TO service_role;


--
-- Name: TABLE subscription_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_events TO anon;
GRANT ALL ON TABLE public.subscription_events TO authenticated;
GRANT ALL ON TABLE public.subscription_events TO service_role;


--
-- Name: TABLE subscription_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_invoices TO anon;
GRANT ALL ON TABLE public.subscription_invoices TO authenticated;
GRANT ALL ON TABLE public.subscription_invoices TO service_role;


--
-- Name: TABLE tier_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tier_config TO anon;
GRANT ALL ON TABLE public.tier_config TO authenticated;
GRANT ALL ON TABLE public.tier_config TO service_role;


--
-- Name: TABLE user_lobby_active; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_lobby_active TO anon;
GRANT ALL ON TABLE public.user_lobby_active TO authenticated;
GRANT ALL ON TABLE public.user_lobby_active TO service_role;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webauthn_challenges TO anon;
GRANT ALL ON TABLE public.webauthn_challenges TO authenticated;
GRANT ALL ON TABLE public.webauthn_challenges TO service_role;


--
-- Name: TABLE workspace_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_members TO anon;
GRANT ALL ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;


--
-- Name: TABLE workspace_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspace_tags TO anon;
GRANT ALL ON TABLE public.workspace_tags TO authenticated;
GRANT ALL ON TABLE public.workspace_tags TO service_role;


--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;


--
-- ============================================================================
-- Post-baseline grants hardening
-- ============================================================================
-- pg_dump captures the net grant state — GRANT statements only. REVOKEs that
-- removed default-acl-inherited privileges in pre-baseline migrations don't
-- replay because the current ACL doesn't show them. On a fresh Supabase DB,
-- default ACLs (from Supabase's platform init) re-grant broadly, so we must
-- explicitly tighten sensitive tables here.
--
-- Sources:
--   - sms_otp: supabase/migrations/pre-baseline/20260427000000_sms_signin_enabled.sql
--   - client-portal RPCs: pre-baseline/20260410160000_revoke_anon_exec_client_portal_rpcs.sql
--   - broad security-definer REVOKE: pre-baseline/20260410170000_revoke_anon_exec_broader_security_definer.sql
-- ============================================================================

-- SMS OTP tables (sensitive credential-handling).
REVOKE ALL ON TABLE public.sms_otp_codes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sms_otp_attempts FROM PUBLIC, anon, authenticated;

-- SMS OTP purge function — cron-only, service role only.
REVOKE ALL ON FUNCTION public.purge_expired_sms_otp_codes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_sms_otp_codes() TO service_role;

-- Stripe webhook events — webhook-only, no user read path.
REVOKE ALL ON TABLE finance.stripe_webhook_events FROM PUBLIC, anon, authenticated;

-- cortex.relationships — SELECT only for authenticated (CLAUDE.md #3 write-protection).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE cortex.relationships FROM PUBLIC, anon, authenticated;

-- Client Portal song RPCs — service_role only (no anon/authenticated path).
-- Pre-baseline migration: 20260410204754_client_portal_songs_client_rpcs.sql
REVOKE EXECUTE ON FUNCTION public.client_songs_add_request(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_songs_delete_request(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Ops songs promote RPC — authenticated staff path (not anon).
-- Pre-baseline migration: 20260410205821_ops_songs_dj_rpcs.sql
REVOKE EXECUTE ON FUNCTION public.ops_songs_promote_client_request(uuid, uuid, text, uuid) FROM PUBLIC, anon;


--
-- PostgreSQL database dump complete
--


