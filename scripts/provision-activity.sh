#!/bin/sh
set -eu
: "${ACTIVITY_DB_USER:?required}"
: "${ACTIVITY_DB_PASSWORD:?required}"
: "${WALLPAPER_WRITER_DB_USER:?required}"
: "${SOCIAL_DB_USER:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
 --set=activity_user="$ACTIVITY_DB_USER" --set=activity_password="$ACTIVITY_DB_PASSWORD" \
 --set=writer_user="$WALLPAPER_WRITER_DB_USER" --set=social_user="$SOCIAL_DB_USER" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'activity_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'activity_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'activity_user', :'activity_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'activity_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,username,details,created_at,updated_at,deleted_at,admin,set_count,viewing_link_id,mascot,pervert) ON users TO %I', :'activity_user') \gexec
SELECT format('GRANT UPDATE (updated_at) ON users TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT ON links,past_links,link_abilities,kinks,kink_havers,wallpaper_clients,emoji_link_decorations TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,pet_id,master_id,flair) ON leashes TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,sender_id,receiver_id,confirmed) ON friendships TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,user_id,controller_user_id,friendship_id,pending,accepted_consequences,expires_at,logged_in) ON surrenders TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT,INSERT ON history_events,ahoy_visits,node_activity_receipts TO %I', :'activity_user') \gexec
SELECT format('GRANT UPDATE (user_id) ON ahoy_visits TO %I', :'activity_user') \gexec
SELECT format('GRANT INSERT (visit_id,user_id,name,properties,time),SELECT (id,time) ON ahoy_events TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,ip_address) ON banned_ips TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,created_at) ON nuttracker_orgasms TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id,is_closed) ON reports TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (id) ON solid_queue_ready_executions,solid_queue_claimed_executions,solid_queue_scheduled_executions,solid_queue_failed_executions TO %I', :'activity_user') \gexec
SELECT format('GRANT SELECT (status,run_at) ON node_automation_jobs TO %I', :'activity_user') WHERE to_regclass('public.node_automation_jobs') IS NOT NULL \gexec
SELECT format('GRANT USAGE ON SEQUENCE history_events_id_seq,ahoy_visits_id_seq,ahoy_events_id_seq,node_activity_receipts_id_seq TO %I', :'activity_user') \gexec
-- Wallpaper activity commits with its wallpaper/history/outbox transaction.
SELECT format('GRANT SELECT (admin) ON users TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id,user_id,controller_user_id,friendship_id,pending,accepted_consequences,expires_at,logged_in) ON surrenders TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id,sender_id,receiver_id,confirmed) ON friendships TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (pet_id,master_id) ON leashes TO %I', :'writer_user') \gexec
SELECT format('GRANT INSERT,SELECT (id) ON history_events TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id,visit_token,visitor_token) ON ahoy_visits TO %I', :'writer_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE history_events_id_seq TO %I', :'writer_user') \gexec
-- Comments already persist their activity atomically in the social transaction.
SELECT format('GRANT SELECT (id,visit_token,visitor_token) ON ahoy_visits TO %I', :'social_user') \gexec
SQL
