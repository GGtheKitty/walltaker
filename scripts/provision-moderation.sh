#!/bin/sh
set -eu
: "${MODERATION_DB_USER:?required}"
: "${MODERATION_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
 --set=moderation_user="$MODERATION_DB_USER" --set=moderation_password="$MODERATION_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'moderation_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'moderation_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'moderation_user', :'moderation_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'moderation_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT (id,username,email,details,created_at,updated_at,admin,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,deleted_username,system_account,password_reset_token,password_reset_sent_at) ON users TO %I', :'moderation_user') \gexec
SELECT format('GRANT UPDATE (username,email,username_changed_at,details,set_count,profile_id,viewing_link_id,quarantined,flagged,is_reporter,is_cutie,is_supporter,deleted_at,password_reset_token,password_reset_sent_at,updated_at) ON users TO %I', :'moderation_user') \gexec
SELECT format('GRANT DELETE ON users TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE ON invite_codes,site_settings,emoji_link_decorations,user_icons,wallpaper_clients,profiles,profile_domains,banned_ips,reports TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT,UPDATE,DELETE ON links,history_events,past_links,nut_pledges,nuttracker_orgasms,scoops,friendships,surrenders,leashes,messages,message_thread_participants,comments,notifications,kink_havers,ahoy_events,ahoy_visits,surveys,form_elements,survey_responses,survey_response_answers TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT ON kinks,message_threads,link_abilities,solid_queue_ready_executions,solid_queue_claimed_executions,solid_queue_scheduled_executions,solid_queue_failed_executions TO %I', :'moderation_user') \gexec
SELECT format('GRANT DELETE ON link_abilities TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT,DELETE ON node_account_events,node_tracker_events,node_social_events,node_link_events,node_wallpaper_events,node_reaction_events TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_moderation_events TO %I', :'moderation_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_moderation_events TO %I', :'moderation_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE invite_codes_id_seq,site_settings_id_seq,emoji_link_decorations_id_seq,user_icons_id_seq,wallpaper_clients_id_seq,profiles_id_seq,profile_domains_id_seq,banned_ips_id_seq,reports_id_seq,node_moderation_events_id_seq TO %I', :'moderation_user') \gexec
SELECT format('GRANT SELECT ON node_automation_jobs TO %I', :'moderation_user') WHERE to_regclass('public.node_automation_jobs') IS NOT NULL \gexec
SELECT format('GRANT SELECT,DELETE ON node_activity_receipts TO %I', :'moderation_user') WHERE to_regclass('public.node_activity_receipts') IS NOT NULL \gexec
SELECT
 format('GRANT SELECT,UPDATE (revoked_at) ON node_browser_sessions,node_browser_legacy_sessions TO %I', :'moderation_user') WHERE to_regclass('public.node_browser_sessions') IS NOT NULL \gexec
SQL
