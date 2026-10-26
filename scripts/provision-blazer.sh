#!/bin/sh
set -eu
: "${MODERATION_DB_USER:?required}"
: "${BLAZER_DB_USER:?required}"
: "${BLAZER_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
 --set=metadata_user="$MODERATION_DB_USER" --set=reader_user="$BLAZER_DB_USER" --set=reader_password="$BLAZER_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 3', :'reader_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'reader_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'reader_user', :'reader_password') \gexec
SELECT format('ALTER ROLE %I SET default_transaction_read_only = on', :'reader_user') \gexec
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'reader_user', '10s') \gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'reader_user', '15s') \gexec
SELECT format('ALTER ROLE %I SET work_mem = %L', :'reader_user', '4MB') \gexec
SELECT format('ALTER ROLE %I SET temp_file_limit = %L', :'reader_user', '16MB') \gexec
SELECT format('ALTER ROLE %I SET max_parallel_workers_per_gather = 0', :'reader_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'reader_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'reader_user') \gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'reader_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON blazer_queries,blazer_checks,blazer_dashboards,blazer_dashboard_queries TO %I', :'metadata_user') \gexec
SELECT format('GRANT SELECT,INSERT ON blazer_audits TO %I', :'metadata_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE blazer_queries_id_seq,blazer_checks_id_seq,blazer_dashboards_id_seq,blazer_dashboard_queries_id_seq,blazer_audits_id_seq TO %I', :'metadata_user') \gexec
SQL
