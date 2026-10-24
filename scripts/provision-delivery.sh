#!/bin/sh
set -eu
: "${DELIVERY_DB_USER:?required}"
: "${DELIVERY_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
 --set=delivery_user="$DELIVERY_DB_USER" --set=delivery_password="$DELIVERY_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'delivery_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'delivery_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'delivery_user', :'delivery_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'delivery_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'delivery_user') \gexec
SELECT format('GRANT SELECT ON node_wallpaper_events,node_reaction_events,node_link_events,node_account_events,node_social_events,node_tracker_events,node_moderation_events,node_automation_events,node_newsroom_states TO %I', :'delivery_user') \gexec
SELECT format('GRANT UPDATE (delivered_at,delivery_attempts,available_at,updated_at) ON node_wallpaper_events,node_reaction_events,node_link_events,node_account_events,node_social_events,node_tracker_events,node_moderation_events,node_automation_events TO %I', :'delivery_user') \gexec
SELECT format('GRANT UPDATE (effects) ON node_moderation_events TO %I', :'delivery_user') \gexec
SELECT format('GRANT UPDATE (rendered_event_id,updated_at) ON node_newsroom_states TO %I', :'delivery_user') \gexec
SQL
