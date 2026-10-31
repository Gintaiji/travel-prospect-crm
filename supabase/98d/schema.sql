-- 98D ONLY: synthetic schema, never a production migration or a schema import.
-- Executed solely by tests/cloud-98d/run.mjs inside its verified fresh container.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '10s';
DO $guard$
BEGIN
  IF current_database() <> 'crm98d_fictional' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION '98D: wrong database or bootstrap role';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION '98D: genuine Supabase auth baseline missing; no auth shim allowed';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) <> 2 OR
    EXISTS (SELECT FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION '98D: invalid Supabase API roles';
  END IF;
  IF EXISTS (SELECT FROM auth.users) OR EXISTS (
    SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  ) OR EXISTS (SELECT FROM pg_namespace WHERE nspname = 'crm98d_control') THEN
    RAISE EXCEPTION '98D: nonempty or already initialized environment; no reuse';
  END IF;
END
$guard$;

CREATE ROLE crm98d_table_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE crm98d_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- No membership in either role is granted to public API roles.
CREATE SCHEMA crm98d_control AUTHORIZATION crm98d_table_owner;
CREATE TABLE crm98d_control.environment (
  singleton boolean PRIMARY KEY CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  fictional_only boolean NOT NULL CHECK (fictional_only)
);
INSERT INTO crm98d_control.environment VALUES (true, 1, true);
ALTER TABLE crm98d_control.environment OWNER TO crm98d_table_owner;
REVOKE ALL ON SCHEMA crm98d_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON crm98d_control.environment FROM PUBLIC, anon, authenticated;

-- Synthetic identities only; no password, real email, session, or imported user.
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'account-a@98d.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'account-b@98d.invalid');

CREATE TABLE public.crm_prospects (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  local_id text NOT NULL CHECK (length(btrim(local_id)) > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND data ? 'id' AND data->>'id' = local_id),
  PRIMARY KEY (user_id, local_id)
);
CREATE TABLE public.crm_resources (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  local_id text NOT NULL CHECK (length(btrim(local_id)) > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND data ? 'id' AND data->>'id' = local_id),
  PRIMARY KEY (user_id, local_id)
);
CREATE TABLE public.crm_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  -- Settings and Street Marketing remain two explicit business categories.
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND
    jsonb_typeof(data->'appSettings') = 'object' AND data ? 'appSettings' AND
    jsonb_typeof(data->'streetMarketingSurvey') = 'object' AND data ? 'streetMarketingSurvey')
);
CREATE TABLE public.crm_message_templates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE public.crm_sync_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  revision bigint NOT NULL CHECK (revision >= 0),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  last_sync_at timestamptz NOT NULL DEFAULT now()
);
-- Old history remains separate. No V2 history, receipt or commit RPC in 98D.
CREATE TABLE public.crm_backup_history (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm98d_history_owner_date ON public.crm_backup_history (user_id, created_at);

-- Closed public API: reads are owner-scoped; no direct client mutation is allowed.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, crm98d_writer;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, crm98d_writer;

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings',
    'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO crm98d_table_owner', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO crm98d_writer', table_name);
    EXECUTE format('CREATE POLICY account_read ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))', table_name);
    EXECUTE format('CREATE POLICY writer_owner ON public.%I FOR ALL TO crm98d_writer USING ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid())) WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))', table_name);
  END LOOP;
END
$policies$;
-- Roles above own no API function. Future RPCs must opt into explicit privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE crm98d_table_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE crm98d_writer IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
COMMIT;
