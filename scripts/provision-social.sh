#!/bin/sh
set -eu
: "${SOCIAL_DB_USER:?required}"
: "${SOCIAL_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=social_user="$SOCIAL_DB_USER" --set=social_password="$SOCIAL_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'social_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'social_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'social_user', :'social_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'social_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'social_user') \gexec
SELECT format('GRANT SELECT (id,username,created_at,updated_at,details,admin,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,system_account) ON users TO %I', :'social_user') \gexec
-- PostgreSQL requires an UPDATE privilege to lock a user row. This harmless
-- timestamp is the only writable user column; identity/credentials stay private.
SELECT format('GRANT UPDATE (updated_at) ON users TO %I', :'social_user') \gexec
SELECT format('GRANT SELECT ON links TO %I', :'social_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON friendships,leashes,surrenders,message_threads,message_thread_participants,messages,notifications,kink_havers,scoops TO %I', :'social_user') \gexec
SELECT format('GRANT SELECT,INSERT ON comments,history_events,kinks,node_social_events TO %I', :'social_user') \gexec
SELECT format('GRANT UPDATE (works_on_e621) ON kinks TO %I', :'social_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_social_events TO %I', :'social_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE friendships_id_seq,leashes_id_seq,surrenders_id_seq,message_threads_id_seq,message_thread_participants_id_seq,messages_id_seq,notifications_id_seq,kink_havers_id_seq,kinks_id_seq,scoops_id_seq,comments_id_seq,history_events_id_seq,node_social_events_id_seq TO %I', :'social_user') \gexec
SQL
