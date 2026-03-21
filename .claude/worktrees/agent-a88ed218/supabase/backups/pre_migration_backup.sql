


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "finance";


ALTER SCHEMA "finance" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE TYPE "public"."area_status" AS ENUM (
    'active',
    'archived'
);


ALTER TYPE "public"."area_status" OWNER TO "postgres";


CREATE TYPE "public"."confidentiality_level" AS ENUM (
    'public',
    'private',
    'secret'
);


ALTER TYPE "public"."confidentiality_level" OWNER TO "postgres";


CREATE TYPE "public"."contract_status" AS ENUM (
    'draft',
    'sent',
    'signed'
);


ALTER TYPE "public"."contract_status" OWNER TO "postgres";


CREATE TYPE "public"."cue_type" AS ENUM (
    'stage',
    'audio',
    'lighting',
    'video',
    'logistics'
);


ALTER TYPE "public"."cue_type" OWNER TO "postgres";


CREATE TYPE "public"."event_lifecycle_status" AS ENUM (
    'lead',
    'tentative',
    'confirmed',
    'production',
    'live',
    'post',
    'archived',
    'cancelled'
);


ALTER TYPE "public"."event_lifecycle_status" OWNER TO "postgres";


CREATE TYPE "public"."event_status" AS ENUM (
    'planned',
    'confirmed',
    'completed',
    'canceled',
    'booked',
    'hold',
    'cancelled'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."package_category" AS ENUM (
    'service',
    'rental',
    'talent',
    'package'
);


ALTER TYPE "public"."package_category" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'credit_card',
    'wire',
    'check',
    'cash',
    'stripe'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'succeeded',
    'pending',
    'failed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."person_relationship" AS ENUM (
    'family',
    'friend',
    'client',
    'vendor',
    'partner',
    'lead',
    'team',
    'other'
);


ALTER TYPE "public"."person_relationship" OWNER TO "postgres";


CREATE TYPE "public"."priority_level" AS ENUM (
    'p0',
    'p1',
    'p2',
    'p3'
);


ALTER TYPE "public"."priority_level" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'active',
    'paused',
    'completed',
    'archived'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."proposal_status" AS ENUM (
    'draft',
    'sent',
    'viewed',
    'accepted',
    'rejected'
);


ALTER TYPE "public"."proposal_status" OWNER TO "postgres";


CREATE TYPE "public"."qbo_sync_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."qbo_sync_status" OWNER TO "postgres";


CREATE TYPE "public"."source_type" AS ENUM (
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


ALTER TYPE "public"."source_type" OWNER TO "postgres";


CREATE TYPE "public"."spine_item_status" AS ENUM (
    'inbox',
    'active',
    'waiting',
    'scheduled',
    'someday',
    'reference',
    'archived',
    'deleted'
);


ALTER TYPE "public"."spine_item_status" OWNER TO "postgres";


CREATE TYPE "public"."spine_item_type" AS ENUM (
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


ALTER TYPE "public"."spine_item_type" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'inbox',
    'next',
    'doing',
    'waiting',
    'done',
    'dropped'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."disconnect_quickbooks"("p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_connection finance.quickbooks_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_connection FROM finance.quickbooks_connections WHERE workspace_id = p_workspace_id;
  
  IF v_connection.id IS NOT NULL THEN
    PERFORM finance.vault_delete_secret(v_connection.token_vault_secret_id);
    PERFORM finance.vault_delete_secret(v_connection.refresh_vault_secret_id);
    
    UPDATE finance.quickbooks_connections
    SET is_connected = FALSE, token_vault_secret_id = NULL, refresh_vault_secret_id = NULL
    WHERE id = v_connection.id;
  END IF;
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "finance"."disconnect_quickbooks"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."get_quickbooks_tokens"("p_workspace_id" "uuid") RETURNS TABLE("realm_id" "text", "company_name" "text", "access_token" "text", "refresh_token" "text", "token_expires_at" timestamp with time zone, "is_expired" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_connection finance.quickbooks_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_connection
  FROM finance.quickbooks_connections qc
  WHERE qc.workspace_id = p_workspace_id AND qc.is_connected = TRUE;
  
  IF v_connection.id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY SELECT
    v_connection.realm_id,
    v_connection.company_name,
    finance.vault_get_secret(v_connection.token_vault_secret_id),
    finance.vault_get_secret(v_connection.refresh_vault_secret_id),
    v_connection.token_expires_at,
    v_connection.token_expires_at < NOW();
END;
$$;


ALTER FUNCTION "finance"."get_quickbooks_tokens"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."handle_deposit_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- If an invoice status changes to 'paid' and it's a 'deposit'
  IF NEW.status = 'paid' AND OLD.status != 'paid' AND NEW.invoice_type = 'deposit' THEN
    
    UPDATE public.events
    SET status = 'booked'
    WHERE id = NEW.event_id;
    
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "finance"."handle_deposit_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."handle_invoice_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only run this logic if the status changed to 'paid'
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    
    -- Rule: If the Deposit is paid, lock the event
    IF NEW.invoice_type = 'deposit' THEN
      UPDATE public.events
      SET status = 'booked'
      WHERE id = NEW.event_id;
    END IF;

    -- (Optional Future Logic): If 'final' is paid, maybe archive the event?
    
  END IF;
  return NEW;
END;
$$;


ALTER FUNCTION "finance"."handle_invoice_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."set_quickbooks_tokens"("p_workspace_id" "uuid", "p_realm_id" "text", "p_company_name" "text", "p_access_token" "text", "p_refresh_token" "text", "p_expires_in_seconds" integer DEFAULT 3600) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_connection_id UUID;
  v_access_token_vault_id UUID;
  v_refresh_token_vault_id UUID;
  v_existing_connection finance.quickbooks_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_existing_connection
  FROM finance.quickbooks_connections
  WHERE workspace_id = p_workspace_id;
  
  IF v_existing_connection.id IS NOT NULL THEN
    PERFORM finance.vault_update_secret(v_existing_connection.token_vault_secret_id, p_access_token);
    PERFORM finance.vault_update_secret(v_existing_connection.refresh_vault_secret_id, p_refresh_token);
    
    UPDATE finance.quickbooks_connections
    SET realm_id = p_realm_id, company_name = p_company_name, token_expires_at = NOW() + (p_expires_in_seconds || ' seconds')::INTERVAL, is_connected = TRUE, updated_at = NOW()
    WHERE id = v_existing_connection.id
    RETURNING id INTO v_connection_id;
  ELSE
    v_access_token_vault_id := finance.vault_store_secret(p_access_token, 'qb_access_' || p_workspace_id::TEXT);
    v_refresh_token_vault_id := finance.vault_store_secret(p_refresh_token, 'qb_refresh_' || p_workspace_id::TEXT);
    
    INSERT INTO finance.quickbooks_connections (workspace_id, realm_id, company_name, token_vault_secret_id, refresh_vault_secret_id, token_expires_at, is_connected) 
    VALUES (p_workspace_id, p_realm_id, p_company_name, v_access_token_vault_id, v_refresh_token_vault_id, NOW() + (p_expires_in_seconds || ' seconds')::INTERVAL, TRUE)
    RETURNING id INTO v_connection_id;
  END IF;
  RETURN v_connection_id;
END;
$$;


ALTER FUNCTION "finance"."set_quickbooks_tokens"("p_workspace_id" "uuid", "p_realm_id" "text", "p_company_name" "text", "p_access_token" "text", "p_refresh_token" "text", "p_expires_in_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."vault_delete_secret"("p_secret_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'finance'
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "finance"."vault_delete_secret"("p_secret_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."vault_get_secret"("p_secret_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'finance'
    AS $$
DECLARE
  decrypted_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO decrypted_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;
  RETURN decrypted_secret;
END;
$$;


ALTER FUNCTION "finance"."vault_get_secret"("p_secret_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."vault_store_secret"("p_secret" "text", "p_name" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'finance'
    AS $$
DECLARE
  secret_id UUID;
BEGIN
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (p_secret, p_name, p_description)
  RETURNING id INTO secret_id;
  RETURN secret_id;
END;
$$;


ALTER FUNCTION "finance"."vault_store_secret"("p_secret" "text", "p_name" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "finance"."vault_update_secret"("p_secret_id" "uuid", "p_new_secret" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vault', 'finance'
    AS $$
BEGIN
  UPDATE vault.secrets
  SET secret = p_new_secret, updated_at = NOW()
  WHERE id = p_secret_id;
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "finance"."vault_update_secret"("p_secret_id" "uuid", "p_new_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_onboarding"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."complete_onboarding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text" DEFAULT 'Main Office'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text") IS 'Creates a default primary location for a workspace';



CREATE OR REPLACE FUNCTION "public"."create_draft_invoice_from_proposal"("p_proposal_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_proposal record;
  v_invoice_id uuid;
  v_item record;
  v_sort int := 0;
BEGIN
  -- Fetch Proposal
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF v_proposal.id IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  -- Create Invoice
  INSERT INTO public.invoices (
    workspace_id, gig_id, proposal_id, status, 
    issue_date, due_date, total_amount
  ) VALUES (
    v_proposal.workspace_id, v_proposal.gig_id, p_proposal_id, 'draft',
    CURRENT_DATE, CURRENT_DATE + 30, 0
  )
  RETURNING id INTO v_invoice_id;

  -- Copy Items + LOOKUP COST from Packages
  FOR v_item IN
    SELECT pi.*, p.cost as pkg_cost 
    FROM public.proposal_items pi
    LEFT JOIN public.packages p ON pi.package_id = p.id
    WHERE pi.proposal_id = p_proposal_id 
    ORDER BY pi.sort_order
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, amount, sort_order, cost
    ) VALUES (
      v_invoice_id, 
      COALESCE(v_item.description, v_item.name), 
      v_item.quantity, 
      v_item.unit_price, 
      (v_item.quantity * v_item.unit_price), 
      v_sort,
      -- If package exists, use its cost. Otherwise 0.
      (v_item.quantity * COALESCE(v_item.pkg_cost, 0))
    );
  END LOOP;

  -- Update Total
  UPDATE public.invoices
  SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.invoice_items WHERE invoice_id = v_invoice_id)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;


ALTER FUNCTION "public"."create_draft_invoice_from_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile_exists"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."ensure_profile_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_workspace_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_active_workspace_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_member_permissions"("p_workspace_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_member_permissions"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_workspace_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid()
$$;


ALTER FUNCTION "public"."get_user_workspace_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_workspace_ids"() IS 'Returns workspace IDs for current user (RLS bypass)';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of"("_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."is_member_of"("_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("w_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = w_id and wm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("w_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_owner"("w_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = w_id 
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_workspace_owner"("w_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "query_text" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "body" "text", "summary" "text", "similarity" double precision)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."match_documents"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") IS 'Checks if current user has specific permission in workspace';



CREATE OR REPLACE FUNCTION "public"."regenerate_invite_code"("p_workspace_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."regenerate_invite_code"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_spine"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_workspace_id" "uuid", "query_text" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "title" "text", "body" "text", "affective_context" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
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


ALTER FUNCTION "public"."search_spine"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_workspace_id" "uuid", "query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_gig_to_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."sync_gig_to_event"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_gig_to_event"() IS 'Keeps events table in sync with gigs for unified calendar display';



CREATE OR REPLACE FUNCTION "public"."touch_spine_item_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.spine_items
  SET updated_at = now()
  WHERE id = NEW.from_item_id OR id = NEW.to_item_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_spine_item_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_spine_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."trigger_spine_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_location_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_location_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profile_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profile_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workspace_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_workspace_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_id = p_workspace_id 
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
  )
$$;


ALTER FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) IS 'Checks if current user has specified role in workspace (RLS bypass)';



CREATE OR REPLACE FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces WHERE id = p_workspace_id AND created_by = auth.uid()
  )
$$;


ALTER FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") IS 'True if workspace was created by current user (for bootstrap member insert)';



CREATE OR REPLACE FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = p_workspace_id AND invite_code IS NOT NULL AND created_by != auth.uid()
  )
$$;


ALTER FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") IS 'True if workspace has invite code and was not created by current user (for join-by-invite)';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "finance"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "external_id" "text",
    "raw_description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "transaction_date" "date" NOT NULL,
    "reconciliation_status" "text" DEFAULT 'unreconciled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bank_transactions_reconciliation_status_check" CHECK (("reconciliation_status" = ANY (ARRAY['unreconciled'::"text", 'partial'::"text", 'reconciled'::"text"])))
);


ALTER TABLE "finance"."bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "finance"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "bill_to_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "subtotal_amount" numeric(12,2) NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0,
    "total_amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "invoice_type" "text",
    "gig_id" "uuid",
    "quickbooks_invoice_id" "text",
    "quickbooks_sync_status" "text" DEFAULT 'pending'::"text",
    "quickbooks_last_synced_at" timestamp with time zone,
    "quickbooks_error" "text",
    CONSTRAINT "invoices_invoice_type_check" CHECK (("invoice_type" = ANY (ARRAY['deposit'::"text", 'final'::"text", 'adjustment'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'void'::"text", 'overdue'::"text"])))
);


ALTER TABLE "finance"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "relationship" "public"."person_relationship" DEFAULT 'other'::"public"."person_relationship" NOT NULL,
    "company" "text",
    "email" "text",
    "phone" "text",
    "linkedin_url" "text",
    "notes" "text",
    "last_contacted_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "type" "text" DEFAULT 'person'::"text",
    "parent_id" "uuid",
    CONSTRAINT "people_type_check" CHECK (("type" = ANY (ARRAY['person'::"text", 'organization'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


CREATE OR REPLACE VIEW "finance"."dashboard_ledger" WITH ("security_invoker"='true') AS
 SELECT "i"."id",
    "i"."invoice_number",
    "i"."total_amount" AS "amount",
    "i"."status",
    "i"."due_date",
    "i"."created_at",
    "i"."workspace_id",
    "p"."name" AS "client_name"
   FROM ("finance"."invoices" "i"
     LEFT JOIN "public"."people" "p" ON (("i"."bill_to_id" = "p"."id")));


ALTER VIEW "finance"."dashboard_ledger" OWNER TO "postgres";


CREATE OR REPLACE VIEW "finance"."monthly_revenue" AS
 SELECT "workspace_id",
    "date_trunc"('month'::"text", "created_at") AS "month",
    "sum"(
        CASE
            WHEN ("status" = 'paid'::"text") THEN "total_amount"
            ELSE (0)::numeric
        END) AS "revenue",
    "sum"(
        CASE
            WHEN ("status" = ANY (ARRAY['sent'::"text", 'overdue'::"text"])) THEN "total_amount"
            ELSE (0)::numeric
        END) AS "outstanding",
    "count"(*) FILTER (WHERE ("status" = 'paid'::"text")) AS "paid_count",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['sent'::"text", 'overdue'::"text"]))) AS "pending_count"
   FROM "finance"."invoices"
  GROUP BY "workspace_id", ("date_trunc"('month'::"text", "created_at"));


ALTER VIEW "finance"."monthly_revenue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "finance"."outstanding_invoices" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "workspace_id",
    NULL::"text" AS "invoice_number",
    NULL::numeric(12,2) AS "total_amount",
    NULL::"text" AS "status",
    NULL::"date" AS "due_date",
    NULL::"text" AS "quickbooks_sync_status",
    NULL::"text" AS "gig_title",
    NULL::"text" AS "event_name",
    NULL::"text" AS "bill_to_name",
    NULL::numeric AS "balance_due",
    NULL::"text" AS "urgency";


ALTER VIEW "finance"."outstanding_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "finance"."quickbooks_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "realm_id" "text" NOT NULL,
    "company_name" "text",
    "token_vault_secret_id" "uuid",
    "refresh_vault_secret_id" "uuid",
    "token_expires_at" timestamp with time zone,
    "is_connected" boolean DEFAULT true,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "finance"."quickbooks_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "finance"."transaction_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount_allocated" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "finance"."transaction_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "agent_name" "text" DEFAULT 'Arthur'::"text" NOT NULL,
    "model" "text",
    "input_context" "jsonb",
    "output_result" "jsonb",
    "tokens_used" integer,
    "cost_usd" numeric(10,6),
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "error_log" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "persona_id" "uuid",
    "user_feedback" "text",
    "user_rating" integer,
    "agent_response" "text",
    "persona_used" "text",
    "user_message" "text"
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."area_status" DEFAULT 'active'::"public"."area_status" NOT NULL,
    "standards" "text",
    "review_frequency" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "spine_item_id" "uuid",
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "size_bytes" bigint,
    "token_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "status" "text" DEFAULT 'active'::"text",
    "avatar_url" "text",
    "workspace_id" "uuid" NOT NULL,
    CONSTRAINT "clients_type_check" CHECK (("type" = ANY (ARRAY['corporate'::"text", 'private'::"text", 'agency'::"text", 'venue'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "gig_id" "uuid",
    "status" "public"."contract_status" DEFAULT 'draft'::"public"."contract_status" NOT NULL,
    "signed_at" timestamp with time zone,
    "pdf_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


COMMENT ON TABLE "public"."contracts" IS 'Legal wrapper for signed agreements';



CREATE TABLE IF NOT EXISTS "public"."event_people" (
    "workspace_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'attendee'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "location_name" "text",
    "location_address" "text",
    "status" "public"."event_status" DEFAULT 'planned'::"public"."event_status" NOT NULL,
    "notes" "text",
    "external_calendar_provider" "text",
    "external_calendar_event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "gig_id" "uuid",
    "internal_code" "text",
    "lifecycle_status" "public"."event_lifecycle_status",
    "confidentiality_level" "public"."confidentiality_level",
    "slug" "text",
    "dates_load_in" timestamp with time zone,
    "dates_load_out" timestamp with time zone,
    "venue_name" "text",
    "venue_address" "text",
    "venue_google_maps_id" "text",
    "logistics_dock_info" "text",
    "logistics_power_info" "text",
    "client_id" "uuid",
    "producer_id" "uuid",
    "pm_id" "uuid",
    "guest_count_expected" integer,
    "guest_count_actual" integer,
    "tech_requirements" "jsonb" DEFAULT '{}'::"jsonb",
    "compliance_docs" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "check_event_dates" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "event_time_order" CHECK (("ends_at" >= "starts_at"))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."gig_id" IS 'Links to CRM gig; backfilled from orphan gigs.';



COMMENT ON COLUMN "public"."events"."tech_requirements" IS 'Audio/video/lighting notes and specs';



COMMENT ON COLUMN "public"."events"."compliance_docs" IS 'Permit and compliance tracking';



CREATE TABLE IF NOT EXISTS "public"."finance_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "qbo_id" "text" NOT NULL,
    "vendor_name" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "category" "text",
    "transaction_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."finance_expenses" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_expenses" IS 'Mirror of QBO expenses (Purchase/Bill); event_id links to internal event (gig).';



CREATE TABLE IF NOT EXISTS "public"."finance_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "qbo_id" "text" NOT NULL,
    "qbo_doc_number" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "due_date" "date",
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."finance_invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_invoices" IS 'Mirror of QBO invoices; event_id links to internal event (gig). Status: paid, open, overdue.';



COMMENT ON COLUMN "public"."finance_invoices"."event_id" IS 'Internal event (gig) id; links to gigs.id or equivalent.';



CREATE TABLE IF NOT EXISTS "public"."gigs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "client_id" "uuid",
    "workspace_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'inquiry'::"text",
    "event_date" timestamp with time zone,
    "event_location" "text",
    "budget_estimated" numeric DEFAULT 0,
    "budget_actual" numeric DEFAULT 0,
    "vibe_keywords" "text"[],
    "client_name" "text",
    "date" "date",
    "location" "text",
    "venue_id" "uuid",
    "organization_id" "uuid",
    "main_contact_id" "uuid",
    CONSTRAINT "gigs_status_check" CHECK (("status" = ANY (ARRAY['inquiry'::"text", 'proposal'::"text", 'contract_sent'::"text", 'confirmed'::"text", 'run_of_show'::"text", 'archived'::"text", 'active'::"text"])))
);


ALTER TABLE "public"."gigs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbox" (
    "id" bigint NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "sender_email" "text",
    "subject" "text",
    "body" "text",
    "metadata" "jsonb",
    "processed" boolean DEFAULT false,
    "ai_summary" "text",
    "ai_urgency" "text",
    "ai_action_items" "text"
);


ALTER TABLE "public"."inbox" OWNER TO "postgres";


ALTER TABLE "public"."inbox" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."inbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invoice_items"."cost" IS 'Cost per line item for gross profit / margin calculation';



CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "gig_id" "uuid" NOT NULL,
    "proposal_id" "uuid",
    "invoice_number" "text" DEFAULT ('INV-'::"text" || "nextval"('"public"."invoice_number_seq"'::"regclass")) NOT NULL,
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date" NOT NULL,
    "subtotal_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "billing_details" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."locations" IS 'Physical office/location records for workspaces';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_venue_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric DEFAULT 0 NOT NULL,
    "category" "public"."package_category" NOT NULL,
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."packages" OWNER TO "postgres";


COMMENT ON TABLE "public"."packages" IS 'Product library: services, rentals, talent, packages';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "method" "public"."payment_method" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "reference_id" "text",
    "note" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "emotional_setting" "jsonb" DEFAULT '{"empathy": 0.5, "verbosity": 0.5}'::"jsonb",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response_style" "jsonb" DEFAULT '{"warmth": 0.5, "formality": 0.5}'::"jsonb"
);


ALTER TABLE "public"."personas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "onboarding_completed" boolean DEFAULT false,
    "preferences" "jsonb" DEFAULT '{"theme": "japandi", "locale": "en-US", "motion": "full", "notifications": {"push": false, "email": true}}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "onboarding_step" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "area_id" "uuid",
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."project_status" DEFAULT 'active'::"public"."project_status" NOT NULL,
    "outcome" "text",
    "start_date" "date",
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "check_project_dates" CHECK (("due_date" >= "start_date"))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "package_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proposal_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."proposal_items" IS 'Line items on a proposal; package_id nullable for custom items';



CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "gig_id" "uuid" NOT NULL,
    "status" "public"."proposal_status" DEFAULT 'draft'::"public"."proposal_status" NOT NULL,
    "valid_until" "date",
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


COMMENT ON TABLE "public"."proposals" IS 'Proposals/offers linked to a gig; public_token for client view';



COMMENT ON COLUMN "public"."proposals"."public_token" IS 'Critical for client-facing proposal view (unlisted URL)';



CREATE TABLE IF NOT EXISTS "public"."qbo_configs" (
    "workspace_id" "uuid" NOT NULL,
    "realm_id" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "token_expires_at" timestamp with time zone NOT NULL,
    "reconnect_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qbo_configs" OWNER TO "postgres";


COMMENT ON TABLE "public"."qbo_configs" IS 'QBO OAuth config per workspace. Tokens must be encrypted by application before insert.';



COMMENT ON COLUMN "public"."qbo_configs"."access_token" IS 'Encrypted at rest. Application encrypts before insert, decrypts after read using QBO_TOKEN_ENCRYPTION_KEY (or similar).';



COMMENT ON COLUMN "public"."qbo_configs"."refresh_token" IS 'Encrypted at rest. Same strategy as access_token.';



CREATE TABLE IF NOT EXISTS "public"."qbo_project_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "qbo_project_id" "text" NOT NULL,
    "internal_event_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qbo_project_mappings" OWNER TO "postgres";


COMMENT ON TABLE "public"."qbo_project_mappings" IS 'Maps QBO project IDs to internal event (gig/event) IDs.';



CREATE TABLE IF NOT EXISTS "public"."qbo_sync_logs" (
    "event_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "external_event_id" "text",
    "source" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "public"."qbo_sync_status" DEFAULT 'pending'::"public"."qbo_sync_status" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qbo_sync_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."qbo_sync_logs" IS 'Ingested QBO webhook events (array payload). Status pending -> processed by trigger/cron.';



CREATE TABLE IF NOT EXISTS "public"."run_of_show_cues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gig_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "start_time" time without time zone,
    "duration_minutes" integer DEFAULT 5,
    "type" "public"."cue_type" DEFAULT 'stage'::"public"."cue_type",
    "notes" "text",
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."run_of_show_cues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."run_of_show_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gig_id" "uuid",
    "start_time" timestamp with time zone,
    "duration_minutes" integer,
    "activity" "text" NOT NULL,
    "lighting_cue" "text",
    "audio_cue" "text",
    "visual_cue" "text",
    "order_index" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."run_of_show_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_audits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "actor_id" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spine_audits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_item_people" (
    "workspace_id" "uuid" NOT NULL,
    "spine_item_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spine_item_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_item_provenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "spine_item_id" "uuid" NOT NULL,
    "quote_text" "text" NOT NULL,
    "page_number" integer,
    "bounding_box" "jsonb",
    "similarity_score" double precision,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spine_item_provenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_item_relations" (
    "workspace_id" "uuid" NOT NULL,
    "from_item_id" "uuid" NOT NULL,
    "to_item_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'related'::"text" NOT NULL,
    "weight" double precision DEFAULT 1.0,
    "reasoning" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spine_item_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_item_tags" (
    "workspace_id" "uuid" NOT NULL,
    "spine_item_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spine_item_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spine_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "type" "public"."spine_item_type" DEFAULT 'note'::"public"."spine_item_type" NOT NULL,
    "status" "public"."spine_item_status" DEFAULT 'inbox'::"public"."spine_item_status" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'p2'::"public"."priority_level" NOT NULL,
    "source" "public"."source_type" DEFAULT 'manual'::"public"."source_type" NOT NULL,
    "summary" "text",
    "body" "text",
    "content_json" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "source_url" "text",
    "source_external_id" "text",
    "processed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "project_id" "uuid",
    "area_id" "uuid",
    "event_id" "uuid",
    "task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fts_vector" "tsvector" GENERATED ALWAYS AS ((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("summary", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("body", ''::"text")), 'C'::"char"))) STORED,
    "embedding" "extensions"."vector"(1536),
    "sentiment_score" double precision,
    "affective_context" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."spine_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_dependencies" (
    "workspace_id" "uuid" NOT NULL,
    "blocking_task_id" "uuid" NOT NULL,
    "dependent_task_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "area_id" "uuid",
    "created_by" "uuid",
    "updated_by" "uuid",
    "actor" "text" DEFAULT 'user'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "public"."task_status" DEFAULT 'inbox'::"public"."task_status" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'p2'::"public"."priority_level" NOT NULL,
    "due_date" "date",
    "do_date" "date",
    "estimate_min" integer,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    CONSTRAINT "check_task_dates" CHECK (("due_date" >= "do_date"))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "state" "text",
    "is_favorite" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."venues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "department" "text",
    "permissions" "jsonb" DEFAULT '{"edit_roster": false, "manage_gigs": true, "view_finance": false, "view_run_of_show": true}'::"jsonb",
    "primary_location_id" "uuid",
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workspace_members"."department" IS 'Department name (e.g., DJ, Sales, Operations)';



COMMENT ON COLUMN "public"."workspace_members"."permissions" IS 'Granular permission flags as JSONB';



CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    "logo_url" "text",
    "invite_code" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(6), 'hex'::"text"),
    "created_by" "uuid"
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "finance"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "finance"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "finance"."quickbooks_connections"
    ADD CONSTRAINT "quickbooks_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "finance"."transaction_allocations"
    ADD CONSTRAINT "transaction_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "finance"."quickbooks_connections"
    ADD CONSTRAINT "uq_quickbooks_workspace" UNIQUE ("workspace_id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_history"
    ADD CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_people"
    ADD CONSTRAINT "event_people_pkey" PRIMARY KEY ("event_id", "person_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_gig_id_key" UNIQUE ("gig_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_workspace_id_qbo_id_key" UNIQUE ("workspace_id", "qbo_id");



ALTER TABLE ONLY "public"."finance_invoices"
    ADD CONSTRAINT "finance_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_invoices"
    ADD CONSTRAINT "finance_invoices_workspace_id_qbo_id_key" UNIQUE ("workspace_id", "qbo_id");



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbox"
    ADD CONSTRAINT "inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_items"
    ADD CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_public_token_key" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."qbo_configs"
    ADD CONSTRAINT "qbo_configs_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."qbo_project_mappings"
    ADD CONSTRAINT "qbo_project_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qbo_project_mappings"
    ADD CONSTRAINT "qbo_project_mappings_workspace_id_qbo_project_id_key" UNIQUE ("workspace_id", "qbo_project_id");



ALTER TABLE ONLY "public"."qbo_sync_logs"
    ADD CONSTRAINT "qbo_sync_logs_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."qbo_sync_logs"
    ADD CONSTRAINT "qbo_sync_logs_workspace_id_external_event_id_key" UNIQUE ("workspace_id", "external_event_id");



ALTER TABLE ONLY "public"."run_of_show_cues"
    ADD CONSTRAINT "ros_cues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."run_of_show_items"
    ADD CONSTRAINT "run_of_show_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spine_audits"
    ADD CONSTRAINT "spine_audits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spine_item_people"
    ADD CONSTRAINT "spine_item_people_pkey" PRIMARY KEY ("spine_item_id", "person_id");



ALTER TABLE ONLY "public"."spine_item_provenance"
    ADD CONSTRAINT "spine_item_provenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spine_item_relations"
    ADD CONSTRAINT "spine_item_relations_pkey" PRIMARY KEY ("from_item_id", "to_item_id", "relation_type");



ALTER TABLE ONLY "public"."spine_item_tags"
    ADD CONSTRAINT "spine_item_tags_pkey" PRIMARY KEY ("spine_item_id", "tag_id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_unique_source" UNIQUE ("workspace_id", "source", "source_external_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_workspace_name_unique" UNIQUE ("workspace_id", "name");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("blocking_task_id", "dependent_task_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");



CREATE INDEX "idx_invoices_quickbooks_id" ON "finance"."invoices" USING "btree" ("quickbooks_invoice_id") WHERE ("quickbooks_invoice_id" IS NOT NULL);



CREATE INDEX "idx_qb_connections_workspace_id" ON "finance"."quickbooks_connections" USING "btree" ("workspace_id");



CREATE INDEX "events_gig_id_idx" ON "public"."events" USING "btree" ("gig_id");



CREATE UNIQUE INDEX "events_internal_code_key" ON "public"."events" USING "btree" ("internal_code") WHERE ("internal_code" IS NOT NULL);



CREATE UNIQUE INDEX "events_slug_key" ON "public"."events" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_agent_persona" ON "public"."agent_runs" USING "btree" ("persona_id");



CREATE INDEX "idx_areas_workspace" ON "public"."areas" USING "btree" ("workspace_id");



CREATE INDEX "idx_chat_history_session" ON "public"."chat_history" USING "btree" ("session_id");



CREATE INDEX "idx_contacts_org" ON "public"."contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_contacts_search" ON "public"."contacts" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((COALESCE("first_name", ''::"text") || ' '::"text") || COALESCE("last_name", ''::"text")) || ' '::"text") || COALESCE("email", ''::"text"))));



CREATE INDEX "idx_contacts_workspace" ON "public"."contacts" USING "btree" ("workspace_id");



CREATE INDEX "idx_contracts_gig_id" ON "public"."contracts" USING "btree" ("gig_id");



CREATE INDEX "idx_contracts_status" ON "public"."contracts" USING "btree" ("status");



CREATE INDEX "idx_contracts_workspace_id" ON "public"."contracts" USING "btree" ("workspace_id");



CREATE INDEX "idx_cues_gig_order" ON "public"."run_of_show_cues" USING "btree" ("gig_id", "sort_order");



CREATE INDEX "idx_event_people_person" ON "public"."event_people" USING "btree" ("person_id");



CREATE INDEX "idx_events_gig_id" ON "public"."events" USING "btree" ("gig_id");



CREATE INDEX "idx_events_project" ON "public"."events" USING "btree" ("project_id");



CREATE UNIQUE INDEX "idx_events_unique_external" ON "public"."events" USING "btree" ("workspace_id", "external_calendar_provider", "external_calendar_event_id") WHERE ("external_calendar_event_id" IS NOT NULL);



CREATE INDEX "idx_events_workspace" ON "public"."events" USING "btree" ("workspace_id");



CREATE INDEX "idx_events_workspace_range" ON "public"."events" USING "btree" ("workspace_id", "starts_at", "ends_at");



CREATE INDEX "idx_events_workspace_starts_desc" ON "public"."events" USING "btree" ("workspace_id", "starts_at" DESC);



CREATE INDEX "idx_finance_expenses_event" ON "public"."finance_expenses" USING "btree" ("event_id");



CREATE INDEX "idx_finance_expenses_transaction_date" ON "public"."finance_expenses" USING "btree" ("transaction_date");



CREATE INDEX "idx_finance_expenses_workspace" ON "public"."finance_expenses" USING "btree" ("workspace_id");



CREATE INDEX "idx_finance_invoices_due_date" ON "public"."finance_invoices" USING "btree" ("due_date");



CREATE INDEX "idx_finance_invoices_event" ON "public"."finance_invoices" USING "btree" ("event_id");



CREATE INDEX "idx_finance_invoices_status" ON "public"."finance_invoices" USING "btree" ("status");



CREATE INDEX "idx_finance_invoices_workspace" ON "public"."finance_invoices" USING "btree" ("workspace_id");



CREATE INDEX "idx_gigs_main_contact" ON "public"."gigs" USING "btree" ("main_contact_id");



CREATE INDEX "idx_gigs_organization" ON "public"."gigs" USING "btree" ("organization_id");



CREATE INDEX "idx_gigs_venue" ON "public"."gigs" USING "btree" ("venue_id");



CREATE INDEX "idx_locations_is_primary" ON "public"."locations" USING "btree" ("workspace_id", "is_primary") WHERE ("is_primary" = true);



CREATE UNIQUE INDEX "idx_locations_unique_primary" ON "public"."locations" USING "btree" ("workspace_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_locations_workspace_id" ON "public"."locations" USING "btree" ("workspace_id");



CREATE INDEX "idx_organizations_name" ON "public"."organizations" USING "gin" ("to_tsvector"('"simple"'::"regconfig", COALESCE("name", ''::"text")));



CREATE INDEX "idx_organizations_workspace" ON "public"."organizations" USING "btree" ("workspace_id");



CREATE INDEX "idx_packages_category" ON "public"."packages" USING "btree" ("category");



CREATE INDEX "idx_packages_is_active" ON "public"."packages" USING "btree" ("is_active");



CREATE INDEX "idx_packages_workspace_id" ON "public"."packages" USING "btree" ("workspace_id");



CREATE INDEX "idx_people_workspace" ON "public"."people" USING "btree" ("workspace_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_onboarding" ON "public"."profiles" USING "btree" ("onboarding_completed") WHERE ("onboarding_completed" = false);



CREATE INDEX "idx_projects_area" ON "public"."projects" USING "btree" ("area_id");



CREATE INDEX "idx_projects_workspace" ON "public"."projects" USING "btree" ("workspace_id");



CREATE INDEX "idx_proposal_items_package_id" ON "public"."proposal_items" USING "btree" ("package_id");



CREATE INDEX "idx_proposal_items_proposal_id" ON "public"."proposal_items" USING "btree" ("proposal_id");



CREATE INDEX "idx_proposal_items_sort_order" ON "public"."proposal_items" USING "btree" ("proposal_id", "sort_order");



CREATE INDEX "idx_proposals_gig_id" ON "public"."proposals" USING "btree" ("gig_id");



CREATE UNIQUE INDEX "idx_proposals_public_token" ON "public"."proposals" USING "btree" ("public_token");



CREATE INDEX "idx_proposals_status" ON "public"."proposals" USING "btree" ("status");



CREATE INDEX "idx_proposals_workspace_id" ON "public"."proposals" USING "btree" ("workspace_id");



CREATE INDEX "idx_qbo_configs_realm" ON "public"."qbo_configs" USING "btree" ("realm_id");



CREATE INDEX "idx_qbo_project_mappings_internal_event" ON "public"."qbo_project_mappings" USING "btree" ("internal_event_id");



CREATE INDEX "idx_qbo_project_mappings_qbo_project" ON "public"."qbo_project_mappings" USING "btree" ("qbo_project_id");



CREATE INDEX "idx_qbo_project_mappings_workspace" ON "public"."qbo_project_mappings" USING "btree" ("workspace_id");



CREATE INDEX "idx_qbo_sync_logs_created" ON "public"."qbo_sync_logs" USING "btree" ("created_at");



CREATE INDEX "idx_qbo_sync_logs_status" ON "public"."qbo_sync_logs" USING "btree" ("status");



CREATE INDEX "idx_qbo_sync_logs_workspace" ON "public"."qbo_sync_logs" USING "btree" ("workspace_id");



CREATE INDEX "idx_spine_affective" ON "public"."spine_items" USING "gin" ("affective_context");



CREATE INDEX "idx_tasks_project" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_tasks_workspace" ON "public"."tasks" USING "btree" ("workspace_id");



CREATE INDEX "idx_tasks_workspace_status_do_date" ON "public"."tasks" USING "btree" ("workspace_id", "status", "do_date");



CREATE INDEX "idx_venues_name" ON "public"."venues" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("address", ''::"text")) || ' '::"text") || COALESCE("city", ''::"text"))));



CREATE INDEX "idx_venues_workspace" ON "public"."venues" USING "btree" ("workspace_id");



CREATE INDEX "idx_workspace_members_department" ON "public"."workspace_members" USING "btree" ("workspace_id", "department");



CREATE INDEX "idx_workspace_members_user" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX "idx_workspace_members_user_id" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX "idx_workspace_members_workspace_id" ON "public"."workspace_members" USING "btree" ("workspace_id");



CREATE INDEX "idx_workspaces_created_by" ON "public"."workspaces" USING "btree" ("created_by");



CREATE INDEX "idx_workspaces_invite_code" ON "public"."workspaces" USING "btree" ("invite_code");



CREATE INDEX "idx_workspaces_slug" ON "public"."workspaces" USING "btree" ("slug");



CREATE INDEX "spine_items_embedding_idx" ON "public"."spine_items" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "spine_items_fts_idx" ON "public"."spine_items" USING "gin" ("fts_vector");



CREATE OR REPLACE VIEW "finance"."outstanding_invoices" AS
 SELECT "i"."id",
    "i"."workspace_id",
    "i"."invoice_number",
    "i"."total_amount",
    "i"."status",
    "i"."due_date",
    "i"."quickbooks_sync_status",
    "g"."title" AS "gig_title",
    "e"."title" AS "event_name",
    "p"."name" AS "bill_to_name",
    ("i"."total_amount" - COALESCE("sum"("ta"."amount_allocated"), (0)::numeric)) AS "balance_due",
        CASE
            WHEN ("i"."due_date" < CURRENT_DATE) THEN 'overdue'::"text"
            WHEN ("i"."due_date" <= (CURRENT_DATE + '7 days'::interval)) THEN 'due_soon'::"text"
            ELSE 'on_track'::"text"
        END AS "urgency"
   FROM (((("finance"."invoices" "i"
     LEFT JOIN "public"."gigs" "g" ON (("g"."id" = "i"."gig_id")))
     LEFT JOIN "public"."events" "e" ON (("e"."id" = "i"."event_id")))
     LEFT JOIN "public"."people" "p" ON (("p"."id" = "i"."bill_to_id")))
     LEFT JOIN "finance"."transaction_allocations" "ta" ON (("ta"."invoice_id" = "i"."id")))
  WHERE ("i"."status" = ANY (ARRAY['sent'::"text", 'overdue'::"text"]))
  GROUP BY "i"."id", "g"."title", "e"."title", "p"."name";



CREATE OR REPLACE TRIGGER "on_deposit_paid" AFTER UPDATE ON "finance"."invoices" FOR EACH ROW EXECUTE FUNCTION "finance"."handle_deposit_payment"();



CREATE OR REPLACE TRIGGER "on_invoice_paid_update" AFTER UPDATE ON "finance"."invoices" FOR EACH ROW EXECUTE FUNCTION "finance"."handle_invoice_payment"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."areas" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."event_people" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."workspace_members" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "sync_gig_to_event_trigger" AFTER INSERT OR UPDATE OF "title", "status", "event_date", "location", "workspace_id" ON "public"."gigs" FOR EACH ROW EXECUTE FUNCTION "public"."sync_gig_to_event"();



CREATE OR REPLACE TRIGGER "trg_ensure_profile_exists" BEFORE INSERT ON "public"."workspace_members" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_profile_exists"();



CREATE OR REPLACE TRIGGER "trg_locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_location_timestamp"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_profile_timestamp"();



CREATE OR REPLACE TRIGGER "trg_workspaces_updated_at" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."update_workspace_timestamp"();



CREATE OR REPLACE TRIGGER "update_spine_timestamp_on_relation" AFTER INSERT OR UPDATE ON "public"."spine_item_relations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_spine_item_timestamp"();



ALTER TABLE ONLY "finance"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "finance"."invoices"
    ADD CONSTRAINT "invoices_bill_to_id_fkey" FOREIGN KEY ("bill_to_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "finance"."invoices"
    ADD CONSTRAINT "invoices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "finance"."invoices"
    ADD CONSTRAINT "invoices_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id");



ALTER TABLE ONLY "finance"."invoices"
    ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "finance"."quickbooks_connections"
    ADD CONSTRAINT "quickbooks_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "finance"."transaction_allocations"
    ADD CONSTRAINT "transaction_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "finance"."invoices"("id");



ALTER TABLE ONLY "finance"."transaction_allocations"
    ADD CONSTRAINT "transaction_allocations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "finance"."bank_transactions"("id");



ALTER TABLE ONLY "finance"."transaction_allocations"
    ADD CONSTRAINT "transaction_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_spine_item_id_fkey" FOREIGN KEY ("spine_item_id") REFERENCES "public"."spine_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_people"
    ADD CONSTRAINT "event_people_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_people"
    ADD CONSTRAINT "event_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_people"
    ADD CONSTRAINT "event_people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pm_id_fkey" FOREIGN KEY ("pm_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_expenses"
    ADD CONSTRAINT "finance_expenses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_invoices"
    ADD CONSTRAINT "finance_invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_main_contact_id_fkey" FOREIGN KEY ("main_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gigs"
    ADD CONSTRAINT "gigs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_default_venue_id_fkey" FOREIGN KEY ("default_venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_items"
    ADD CONSTRAINT "proposal_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposal_items"
    ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qbo_configs"
    ADD CONSTRAINT "qbo_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qbo_project_mappings"
    ADD CONSTRAINT "qbo_project_mappings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qbo_sync_logs"
    ADD CONSTRAINT "qbo_sync_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."run_of_show_cues"
    ADD CONSTRAINT "ros_cues_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."run_of_show_items"
    ADD CONSTRAINT "run_of_show_items_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_people"
    ADD CONSTRAINT "spine_item_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_people"
    ADD CONSTRAINT "spine_item_people_spine_item_id_fkey" FOREIGN KEY ("spine_item_id") REFERENCES "public"."spine_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_people"
    ADD CONSTRAINT "spine_item_people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."spine_item_provenance"
    ADD CONSTRAINT "spine_item_provenance_spine_item_id_fkey" FOREIGN KEY ("spine_item_id") REFERENCES "public"."spine_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_provenance"
    ADD CONSTRAINT "spine_item_provenance_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."spine_item_relations"
    ADD CONSTRAINT "spine_item_relations_from_item_id_fkey" FOREIGN KEY ("from_item_id") REFERENCES "public"."spine_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_relations"
    ADD CONSTRAINT "spine_item_relations_to_item_id_fkey" FOREIGN KEY ("to_item_id") REFERENCES "public"."spine_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_relations"
    ADD CONSTRAINT "spine_item_relations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."spine_item_tags"
    ADD CONSTRAINT "spine_item_tags_spine_item_id_fkey" FOREIGN KEY ("spine_item_id") REFERENCES "public"."spine_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_tags"
    ADD CONSTRAINT "spine_item_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spine_item_tags"
    ADD CONSTRAINT "spine_item_tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."spine_items"
    ADD CONSTRAINT "spine_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_deps_blocking_fkey" FOREIGN KEY ("blocking_task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."task_dependencies"
    ADD CONSTRAINT "task_deps_dependent_fkey" FOREIGN KEY ("dependent_task_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_primary_location_id_fkey" FOREIGN KEY ("primary_location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Tenant Access" ON "finance"."invoices" USING ("public"."is_member_of"("workspace_id"));



CREATE POLICY "Workspace admins can manage QB connection" ON "finance"."quickbooks_connections" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "quickbooks_connections"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("wm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Workspace members can view QB connection" ON "finance"."quickbooks_connections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "quickbooks_connections"."workspace_id") AND ("wm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "finance"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "finance"."quickbooks_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Access Agent Runs" ON "public"."agent_runs" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Attachments" ON "public"."attachments" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Audit Logs" ON "public"."spine_audits" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Item Tags" ON "public"."spine_item_tags" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Personas" ON "public"."personas" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Provenance" ON "public"."spine_item_provenance" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Relations" ON "public"."spine_item_relations" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Spine People Links" ON "public"."spine_item_people" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Tags" ON "public"."tags" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access Task Dependencies" ON "public"."task_dependencies" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Access invoices in workspace" ON "public"."invoices" USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids"))) WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Access items via invoice" ON "public"."invoice_items" USING (("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids"))))) WITH CHECK (("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Access payments in workspace" ON "public"."payments" USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids"))) WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Admins can create locations" ON "public"."locations" FOR INSERT WITH CHECK (("public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "public"."member_has_permission"("workspace_id", 'manage_locations'::"text")));



CREATE POLICY "Admins can delete locations" ON "public"."locations" FOR DELETE USING (("public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "public"."member_has_permission"("workspace_id", 'manage_locations'::"text")));



CREATE POLICY "Admins can update locations" ON "public"."locations" FOR UPDATE USING (("public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]) OR "public"."member_has_permission"("workspace_id", 'manage_locations'::"text")));



CREATE POLICY "Enable insert for all users" ON "public"."run_of_show_cues" FOR INSERT WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."gigs" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."run_of_show_cues" FOR SELECT USING (true);



CREATE POLICY "Enable update for all users" ON "public"."run_of_show_cues" FOR UPDATE USING (true);



CREATE POLICY "Member Access" ON "public"."workspaces" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "workspaces"."id") AND ("workspace_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can leave or admins can remove" ON "public"."workspace_members" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Service role full access to locations" ON "public"."locations" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role has full access" ON "public"."profiles" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Tenant Access" ON "public"."events" USING ("public"."is_member_of"("workspace_id"));



CREATE POLICY "Tenant Access" ON "public"."people" USING ("public"."is_member_of"("workspace_id"));



CREATE POLICY "Users can add self to workspace they created or owner adds memb" ON "public"."workspace_members" FOR INSERT WITH CHECK (((("user_id" = "auth"."uid"()) AND "public"."workspace_created_by_me"("workspace_id")) OR (("user_id" = "auth"."uid"()) AND "public"."workspace_joinable_by_invite"("workspace_id")) OR "public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "Users can create workspace as self" ON "public"."workspaces" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can create workspaces" ON "public"."workspaces" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete contracts in their workspace" ON "public"."contracts" FOR DELETE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can delete events in their workspace" ON "public"."events" FOR DELETE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can delete gigs in their workspace" ON "public"."gigs" FOR DELETE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can delete items in their workspace" ON "public"."spine_items" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can delete packages in their workspace" ON "public"."packages" FOR DELETE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can delete proposal items in their workspace" ON "public"."proposal_items" FOR DELETE USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can delete proposal_items in their workspace" ON "public"."proposal_items" FOR DELETE USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can delete proposals in their workspace" ON "public"."proposals" FOR DELETE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert contracts in their workspace" ON "public"."contracts" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert events in their workspace" ON "public"."events" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert gigs in their workspace" ON "public"."gigs" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert items in their workspace" ON "public"."spine_items" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can insert packages in their workspace" ON "public"."packages" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert proposal items in their workspace" ON "public"."proposal_items" FOR INSERT WITH CHECK (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can insert proposal_items in their workspace" ON "public"."proposal_items" FOR INSERT WITH CHECK (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can insert proposals in their workspace" ON "public"."proposals" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can join workspaces" ON "public"."workspace_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update contracts in their workspace" ON "public"."contracts" FOR UPDATE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can update events in their workspace" ON "public"."events" FOR UPDATE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can update gigs in their workspace" ON "public"."gigs" FOR UPDATE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can update items in their workspace" ON "public"."spine_items" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update packages in their workspace" ON "public"."packages" FOR UPDATE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can update proposal items in their workspace" ON "public"."proposal_items" FOR UPDATE USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can update proposal_items in their workspace" ON "public"."proposal_items" FOR UPDATE USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can update proposals in their workspace" ON "public"."proposals" FOR UPDATE USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view RoS from their workspace" ON "public"."run_of_show_items" FOR SELECT USING (("auth"."uid"() IN ( SELECT "workspace_members"."user_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."workspace_id" = ( SELECT "gigs"."workspace_id"
           FROM "public"."gigs"
          WHERE ("gigs"."id" = "run_of_show_items"."gig_id"))))));



CREATE POLICY "Users can view contracts in their workspace" ON "public"."contracts" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view data from their workspace" ON "public"."clients" FOR SELECT USING (("auth"."uid"() IN ( SELECT "workspace_members"."user_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."workspace_id" = "clients"."workspace_id"))));



CREATE POLICY "Users can view events in their workspace" ON "public"."events" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view gigs from their workspace" ON "public"."gigs" FOR SELECT USING (("auth"."uid"() IN ( SELECT "workspace_members"."user_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."workspace_id" = "gigs"."workspace_id"))));



CREATE POLICY "Users can view gigs in their workspace" ON "public"."gigs" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view items in their workspace" ON "public"."spine_items" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view packages in their workspace" ON "public"."packages" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view proposal items in their workspace" ON "public"."proposal_items" FOR SELECT USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can view proposal_items in their workspace" ON "public"."proposal_items" FOR SELECT USING (("proposal_id" IN ( SELECT "proposals"."id"
   FROM "public"."proposals"
  WHERE ("proposals"."workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")))));



CREATE POLICY "Users can view proposals in their workspace" ON "public"."proposals" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view their workspaces" ON "public"."workspaces" FOR SELECT USING ((("id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")) OR ("invite_code" IS NOT NULL)));



CREATE POLICY "Users can view workspace locations" ON "public"."locations" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Users can view workspace members" ON "public"."workspace_members" FOR SELECT USING (("workspace_id" IN ( SELECT "public"."get_user_workspace_ids"() AS "get_user_workspace_ids")));



CREATE POLICY "Workspace admins can manage members" ON "public"."workspace_members" FOR UPDATE USING ("public"."user_has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "Workspace owners can delete" ON "public"."workspaces" FOR DELETE USING ("public"."user_has_workspace_role"("id", ARRAY['owner'::"text"]));



CREATE POLICY "Workspace owners can update" ON "public"."workspaces" FOR UPDATE USING ("public"."user_has_workspace_role"("id", ARRAY['owner'::"text", 'admin'::"text"]));



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas_policy" ON "public"."areas" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_workspace_isolate" ON "public"."contacts" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_people_policy" ON "public"."event_people" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_policy" ON "public"."events" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "events_workspace_insert" ON "public"."events" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "events_workspace_select" ON "public"."events" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "events_workspace_update" ON "public"."events" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."finance_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_expenses_workspace_read" ON "public"."finance_expenses" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "finance_expenses_workspace_write" ON "public"."finance_expenses" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."finance_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_invoices_workspace_read" ON "public"."finance_invoices" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "finance_invoices_workspace_write" ON "public"."finance_invoices" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."gigs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_workspace" ON "public"."workspaces" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manage_members" ON "public"."workspace_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_workspace_owner"("workspace_id"));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_workspace_isolate" ON "public"."organizations" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people_policy" ON "public"."people" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_policy" ON "public"."projects" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."proposal_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qbo_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qbo_configs_workspace_session" ON "public"."qbo_configs" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."qbo_project_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qbo_project_mappings_workspace_session" ON "public"."qbo_project_mappings" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."qbo_sync_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qbo_sync_logs_workspace_session" ON "public"."qbo_sync_logs" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."run_of_show_cues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."run_of_show_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_own_workspace" ON "public"."workspaces" FOR SELECT USING ("public"."is_workspace_member"("id"));



ALTER TABLE "public"."spine_audits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spine_item_people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spine_item_provenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spine_item_relations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spine_item_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spine_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_dependencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_policy" ON "public"."tasks" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "venues_workspace_isolate" ON "public"."venues" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "view_members" ON "public"."workspace_members" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_runs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."spine_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";



GRANT USAGE ON SCHEMA "finance" TO "anon";
GRANT USAGE ON SCHEMA "finance" TO "authenticated";
GRANT USAGE ON SCHEMA "finance" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
















































GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";





































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."complete_onboarding"() TO "anon";
GRANT ALL ON FUNCTION "public"."complete_onboarding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_onboarding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_location"("p_workspace_id" "uuid", "p_location_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_draft_invoice_from_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_draft_invoice_from_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_draft_invoice_from_proposal"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_profile_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_exists"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_workspace_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_workspace_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_workspace_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_member_permissions"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_member_permissions"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_member_permissions"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_workspace_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_workspace_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_workspace_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("w_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("w_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("w_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_owner"("w_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("w_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("w_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_has_permission"("p_workspace_id" "uuid", "p_permission_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regenerate_invite_code"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."regenerate_invite_code"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_invite_code"("p_workspace_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_gig_to_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_gig_to_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_gig_to_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_spine_item_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_spine_item_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_spine_item_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_spine_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_spine_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_spine_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_location_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_location_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_location_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profile_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workspace_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workspace_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workspace_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_workspace_role"("p_workspace_id" "uuid", "p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_created_by_me"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_joinable_by_invite"("p_workspace_id" "uuid") TO "service_role";






























GRANT SELECT ON TABLE "finance"."bank_transactions" TO "anon";
GRANT SELECT ON TABLE "finance"."bank_transactions" TO "authenticated";
GRANT SELECT ON TABLE "finance"."bank_transactions" TO "service_role";



GRANT SELECT ON TABLE "finance"."invoices" TO "anon";
GRANT SELECT ON TABLE "finance"."invoices" TO "authenticated";
GRANT SELECT ON TABLE "finance"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT SELECT ON TABLE "finance"."dashboard_ledger" TO "anon";
GRANT SELECT ON TABLE "finance"."dashboard_ledger" TO "authenticated";
GRANT SELECT ON TABLE "finance"."dashboard_ledger" TO "service_role";



GRANT SELECT ON TABLE "finance"."monthly_revenue" TO "authenticated";



GRANT SELECT ON TABLE "finance"."outstanding_invoices" TO "authenticated";



GRANT SELECT ON TABLE "finance"."transaction_allocations" TO "anon";
GRANT SELECT ON TABLE "finance"."transaction_allocations" TO "authenticated";
GRANT SELECT ON TABLE "finance"."transaction_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."chat_history" TO "anon";
GRANT ALL ON TABLE "public"."chat_history" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_history" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."event_people" TO "anon";
GRANT ALL ON TABLE "public"."event_people" TO "authenticated";
GRANT ALL ON TABLE "public"."event_people" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."finance_expenses" TO "anon";
GRANT ALL ON TABLE "public"."finance_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."finance_invoices" TO "anon";
GRANT ALL ON TABLE "public"."finance_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."gigs" TO "anon";
GRANT ALL ON TABLE "public"."gigs" TO "authenticated";
GRANT ALL ON TABLE "public"."gigs" TO "service_role";



GRANT ALL ON TABLE "public"."inbox" TO "anon";
GRANT ALL ON TABLE "public"."inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."inbox" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inbox_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inbox_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inbox_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."packages" TO "anon";
GRANT ALL ON TABLE "public"."packages" TO "authenticated";
GRANT ALL ON TABLE "public"."packages" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_items" TO "anon";
GRANT ALL ON TABLE "public"."proposal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_items" TO "service_role";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_configs" TO "anon";
GRANT ALL ON TABLE "public"."qbo_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_configs" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_project_mappings" TO "anon";
GRANT ALL ON TABLE "public"."qbo_project_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_project_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."qbo_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."qbo_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."qbo_sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."run_of_show_cues" TO "anon";
GRANT ALL ON TABLE "public"."run_of_show_cues" TO "authenticated";
GRANT ALL ON TABLE "public"."run_of_show_cues" TO "service_role";



GRANT ALL ON TABLE "public"."run_of_show_items" TO "anon";
GRANT ALL ON TABLE "public"."run_of_show_items" TO "authenticated";
GRANT ALL ON TABLE "public"."run_of_show_items" TO "service_role";



GRANT ALL ON TABLE "public"."spine_audits" TO "anon";
GRANT ALL ON TABLE "public"."spine_audits" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_audits" TO "service_role";



GRANT ALL ON TABLE "public"."spine_item_people" TO "anon";
GRANT ALL ON TABLE "public"."spine_item_people" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_item_people" TO "service_role";



GRANT ALL ON TABLE "public"."spine_item_provenance" TO "anon";
GRANT ALL ON TABLE "public"."spine_item_provenance" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_item_provenance" TO "service_role";



GRANT ALL ON TABLE "public"."spine_item_relations" TO "anon";
GRANT ALL ON TABLE "public"."spine_item_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_item_relations" TO "service_role";



GRANT ALL ON TABLE "public"."spine_item_tags" TO "anon";
GRANT ALL ON TABLE "public"."spine_item_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_item_tags" TO "service_role";



GRANT ALL ON TABLE "public"."spine_items" TO "anon";
GRANT ALL ON TABLE "public"."spine_items" TO "authenticated";
GRANT ALL ON TABLE "public"."spine_items" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."task_dependencies" TO "anon";
GRANT ALL ON TABLE "public"."task_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."task_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































