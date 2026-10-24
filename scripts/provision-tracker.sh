#!/bin/sh
set -eu
: "${TRACKER_DB_USER:?required}"
: "${TRACKER_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=tracker_user="$TRACKER_DB_USER" --set=tracker_password="$TRACKER_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'tracker_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'tracker_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'tracker_user', :'tracker_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'tracker_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'tracker_user') \gexec
SELECT format('GRANT SELECT (id,username,mascot,admin,deleted_at) ON users TO %I', :'tracker_user') \gexec
-- The same owner-row lock used by reactions needs one UPDATE privilege.
SELECT format('GRANT UPDATE (updated_at) ON users TO %I', :'tracker_user') \gexec
SELECT format('GRANT SELECT ON friendships,surrenders,site_settings,past_links TO %I', :'tracker_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON nuttracker_orgasms TO %I', :'tracker_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE ON nut_pledges TO %I', :'tracker_user') \gexec
SELECT format('GRANT INSERT ON notifications TO %I', :'tracker_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_tracker_events TO %I', :'tracker_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_tracker_events TO %I', :'tracker_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE nuttracker_orgasms_id_seq,nut_pledges_id_seq,notifications_id_seq,node_tracker_events_id_seq TO %I', :'tracker_user') \gexec
SQL
