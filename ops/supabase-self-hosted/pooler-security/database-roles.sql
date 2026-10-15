-- Apply as the database administrator after creating both LOGIN roles with
-- independent private passwords. Never change the shared administrator role.
-- Metadata grants apply only in _supabase; the auth helper belongs in postgres.
\connect _supabase
GRANT CONNECT ON DATABASE _supabase TO workout_pooler_meta;
GRANT USAGE ON SCHEMA _supavisor TO workout_pooler_meta;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA _supavisor
  TO workout_pooler_meta;
REVOKE INSERT, UPDATE, DELETE ON _supavisor.schema_migrations FROM workout_pooler_meta;

\connect postgres
GRANT CONNECT ON DATABASE postgres TO workout_pooler_manager;
GRANT USAGE ON SCHEMA pgbouncer TO workout_pooler_manager;
CREATE FUNCTION pgbouncer.workout_pooler_auth(p_usename text)
RETURNS TABLE(username text, password text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT target.rolname::text,
    CASE WHEN target.rolvaliduntil < now() THEN NULL
      ELSE target.rolpassword::text END
  FROM pg_authid AS target
  WHERE target.rolname = p_usename AND target.rolcanlogin
    AND NOT target.rolsuper AND NOT target.rolcreatedb
    AND NOT target.rolcreaterole AND NOT target.rolreplication
    AND NOT target.rolbypassrls
    AND target.rolname NOT IN ('workout_pooler_meta', 'pgbouncer')
    AND NOT EXISTS (
      SELECT 1 FROM pg_roles AS privileged
      WHERE (privileged.rolsuper OR privileged.rolcreatedb
        OR privileged.rolcreaterole OR privileged.rolreplication
        OR privileged.rolbypassrls OR privileged.rolname LIKE 'pg\_%' ESCAPE '\')
        AND pg_has_role(target.oid, privileged.oid, 'MEMBER')
    );
$$;
REVOKE ALL ON FUNCTION pgbouncer.workout_pooler_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pgbouncer.workout_pooler_auth(text)
  TO workout_pooler_manager;
