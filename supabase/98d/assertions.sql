-- Real PostgreSQL role/RLS tests, ONLY in the verified 98D container.
-- JWT claims are injected at the database boundary; no GoTrue/JWT certification.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '10s';
DO $guard$
BEGIN
  IF current_database() <> 'crm98d_fictional' OR NOT EXISTS (
    SELECT FROM crm98d_control.environment WHERE fictional_only AND schema_version = 1
  ) THEN RAISE EXCEPTION '98D: environment identity missing'; END IF;
END
$guard$;

-- Seed A/B in one transaction using only synthetic content; always rolled back.
INSERT INTO public.crm_prospects VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'same-id', '{"id":"same-id","notes":"fiction A","conversationHistory":[]}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'same-id', '{"id":"same-id","notes":"fiction B","conversationHistory":[]}');
INSERT INTO public.crm_resources SELECT user_id, local_id, data FROM public.crm_prospects;
INSERT INTO public.crm_settings SELECT user_id, '{"appSettings":{"businessName":"fiction"},"streetMarketingSurvey":{"surveys":[],"activeSurveyId":""}}'::jsonb FROM public.crm_prospects;
INSERT INTO public.crm_message_templates SELECT user_id, '{"fiction":"message fictif"}'::jsonb FROM public.crm_prospects;
INSERT INTO public.crm_sync_state (user_id, revision, schema_version, fingerprint)
  SELECT user_id, 9007199254740993, 1, repeat('a', 64) FROM public.crm_prospects;
INSERT INTO public.crm_backup_history (id, user_id, payload)
  SELECT user_id, user_id, '{"fiction":true}'::jsonb FROM public.crm_prospects;

-- Inspect actual catalog metadata, not a model of policies.
DO $catalog$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN ('crm98d_writer', 'crm98d_table_owner') AND
    (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole)) THEN RAISE EXCEPTION '98D: privileged fixture role'; END IF;
  IF pg_has_role('authenticated', 'crm98d_writer', 'MEMBER') OR pg_has_role('anon', 'crm98d_writer', 'MEMBER') OR
    pg_has_role('authenticated', 'crm98d_table_owner', 'MEMBER') THEN RAISE EXCEPTION '98D: API role escalation'; END IF;
  FOREACH t IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings', 'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    IF NOT EXISTS (SELECT FROM pg_class WHERE oid = ('public.' || t)::regclass AND relrowsecurity AND relforcerowsecurity AND relowner = 'crm98d_table_owner'::regrole)
      THEN RAISE EXCEPTION '98D: missing forced RLS or wrong owner: %', t; END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE') OR
       has_table_privilege('anon', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION '98D: direct DML granted: %', t; END IF;
  END LOOP;
END
$catalog$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
DO $a$
DECLARE t text; count_all integer; count_foreign integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings', 'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    EXECUTE format('SELECT count(*), count(*) FILTER (WHERE user_id <> auth.uid()) FROM public.%I', t) INTO count_all, count_foreign;
    IF count_all <> 1 OR count_foreign <> 0 THEN RAISE EXCEPTION '98D: A isolation failed: %', t; END IF;
    BEGIN
      EXECUTE format('DELETE FROM public.%I', t);
      RAISE EXCEPTION '98D: old DELETE unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      EXECUTE format('UPDATE public.%I SET user_id = user_id', t);
      RAISE EXCEPTION '98D: old UPDATE unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN
    INSERT INTO public.crm_prospects VALUES (auth.uid(), 'blocked', '{"id":"blocked"}');
    RAISE EXCEPTION '98D: old INSERT unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_sync_state VALUES (auth.uid(), 1, 1, repeat('a', 64), now()) ON CONFLICT (user_id) DO UPDATE SET revision = 1;
    RAISE EXCEPTION '98D: old UPSERT unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$a$;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
DO $b$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings', 'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = auth.uid()', t) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION '98D: B own data missing: %', t; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id <> auth.uid()', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION '98D: B sees A: %', t; END IF;
  END LOOP;
  IF (SELECT revision::text FROM public.crm_sync_state) <> '9007199254740993' THEN RAISE EXCEPTION '98D: revision precision lost'; END IF;
END
$b$;

-- Missing identity fails closed, including an authenticated role without sub.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);
DO $missing$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings', 'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION '98D: unknown owner can read: %', t; END IF;
  END LOOP;
END
$missing$;
SET LOCAL ROLE anon;
DO $anon$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_prospects', 'crm_resources', 'crm_settings', 'crm_message_templates', 'crm_sync_state', 'crm_backup_history'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION '98D: anon read: %', t; END IF;
  END LOOP;
END
$anon$;

-- WITH CHECK tested under a real non-bypass writer; no mutation is committed.
SET LOCAL ROLE crm98d_writer;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
DO $writer$
DECLARE affected integer;
BEGIN
  BEGIN
    INSERT INTO public.crm_prospects VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spoof', '{"id":"spoof"}');
    RAISE EXCEPTION '98D: forged owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.crm_prospects SET data = '{"id":"same-id","notes":"forbidden"}' WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION '98D: cross-account update'; END IF;
  BEGIN
    UPDATE public.crm_prospects SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE user_id = auth.uid();
    RAISE EXCEPTION '98D: owner reassignment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_prospects VALUES (auth.uid(), 'same-id', '{"id":"same-id"}');
    RAISE EXCEPTION '98D: duplicate local ID accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_sync_state VALUES (auth.uid(), NULL, 1, repeat('a', 64), now());
    RAISE EXCEPTION '98D: unknown revision accepted';
  EXCEPTION WHEN not_null_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_resources VALUES (NULL, 'null-owner', '{"id":"null-owner"}');
    RAISE EXCEPTION '98D: null owner accepted';
  EXCEPTION WHEN not_null_violation OR insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_resources VALUES (auth.uid(), 'mismatch', '{"id":"other"}');
    RAISE EXCEPTION '98D: inconsistent local ID accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_sync_state VALUES (auth.uid(), -1, 1, repeat('a', 64), now());
    RAISE EXCEPTION '98D: negative revision accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$writer$;
RESET ROLE;
DO $preserved$
BEGIN
  IF (SELECT count(*) FROM public.crm_prospects) <> 2 OR
    (SELECT count(*) FROM public.crm_sync_state WHERE revision = 9007199254740993) <> 2 THEN
    RAISE EXCEPTION '98D: fictional initial state changed';
  END IF;
END
$preserved$;
ROLLBACK;
SELECT '98D_SQL_ASSERTIONS_PASSED';
