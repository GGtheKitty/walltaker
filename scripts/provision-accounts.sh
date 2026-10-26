#!/bin/sh
# Run after Node schema setup inside PostgreSQL as its admin. Never grant this login
# to the wallpaper services: only accounts may read credential hashes.
set -eu
: "${ACCOUNTS_DB_USER:?required}"
: "${ACCOUNTS_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=account_user="$ACCOUNTS_DB_USER" --set=account_password="$ACCOUNTS_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'account_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'account_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'account_user', :'account_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'account_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'account_user') \gexec
SELECT format('GRANT SELECT ON users,profiles,invite_codes,site_settings,surrenders,friendships TO %I', :'account_user') \gexec
SELECT format('GRANT INSERT (username,email,password_digest,details,created_at,updated_at) ON users TO %I', :'account_user') \gexec
SELECT format('GRANT UPDATE (username,username_changed_at,password_digest,password_reset_token,password_reset_sent_at,api_key,profile_id,advanced,colour_preference,mascot,pervert,deleted_username,deleted_at,updated_at) ON users TO %I', :'account_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON profiles TO %I', :'account_user') \gexec
SELECT format('GRANT UPDATE (redeemed_by_id,redeemed_at,updated_at) ON invite_codes TO %I', :'account_user') \gexec
SELECT format('GRANT INSERT (user_id,notification_type,text,link,created_at,updated_at) ON notifications TO %I', :'account_user') \gexec
SELECT format('GRANT SELECT (id) ON notifications TO %I', :'account_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE users_id_seq,profiles_id_seq,notifications_id_seq,node_account_events_id_seq TO %I', :'account_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_account_events TO %I', :'account_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_account_events TO %I', :'account_user') \gexec
SELECT
 format('GRANT SELECT,UPDATE (revoked_at) ON node_browser_sessions,node_browser_legacy_sessions TO %I', :'account_user') WHERE to_regclass('public.node_browser_sessions') IS NOT NULL \gexec
SQL
