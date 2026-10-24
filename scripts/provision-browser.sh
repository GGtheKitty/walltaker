#!/bin/sh
set -eu
: "${BROWSER_DB_USER:?required}"
: "${BROWSER_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
 --set=browser_user="$BROWSER_DB_USER" --set=browser_password="$BROWSER_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'browser_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'browser_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'browser_user', :'browser_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'browser_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'browser_user') \gexec
SELECT format('GRANT SELECT (id,username,details,admin,created_at,updated_at,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,system_account) ON users TO %I', :'browser_user') \gexec
SELECT format('GRANT SELECT ON links,past_links,link_abilities,profiles,comments,messages,message_threads,message_thread_participants,friendships,leashes,surrenders,kinks,kink_havers,user_icons,notifications,wallpaper_clients,emoji_link_decorations,banned_ips,reports,nut_pledges,scoops,nuttracker_orgasms,site_settings TO %I', :'browser_user') \gexec
SELECT format('GRANT SELECT (id,user_id,ip,visit_token,visitor_token,started_at) ON ahoy_visits TO %I', :'browser_user') \gexec
SELECT format('GRANT SELECT ON node_wallpaper_events,node_reaction_events,node_link_events,node_account_events,node_social_events,node_tracker_events,node_moderation_events TO %I', :'browser_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_browser_sessions,node_browser_legacy_sessions TO %I', :'browser_user') \gexec
SELECT format('GRANT UPDATE (revoked_at) ON node_browser_sessions,node_browser_legacy_sessions TO %I', :'browser_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE node_browser_sessions_id_seq TO %I', :'browser_user') \gexec
SQL
