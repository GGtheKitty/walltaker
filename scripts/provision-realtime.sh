#!/bin/sh
# Run inside PostgreSQL as its admin. This role can only write presence fields.
set -eu
: "${REALTIME_DB_USER:?required}"
: "${REALTIME_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=realtime_user="$REALTIME_DB_USER" --set=realtime_password="$REALTIME_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'realtime_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'realtime_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'realtime_user', :'realtime_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'realtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'realtime_user') \gexec
SELECT format('GRANT SELECT (id,user_id,last_ping_user_agent,live_client_started_at) ON links TO %I', :'realtime_user') \gexec
SELECT format('GRANT UPDATE (last_ping,last_ping_user_agent,live_client_started_at,updated_at) ON links TO %I', :'realtime_user') \gexec
SELECT format('GRANT SELECT (id,username,deleted_at,viewing_link_id) ON users TO %I', :'realtime_user') \gexec
SELECT format('GRANT UPDATE (viewing_link_id,updated_at) ON users TO %I', :'realtime_user') \gexec
SQL
