#!/bin/sh
# Run as the database admin after Node schema setup has created the event table.
set -eu
: "${WALLPAPER_WRITER_DB_USER:?required}"
: "${WALLPAPER_WRITER_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=writer_user="$WALLPAPER_WRITER_DB_USER" --set=writer_password="$WALLPAPER_WRITER_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'writer_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'writer_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'writer_user', :'writer_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'writer_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id, user_id, blacklist, theme, min_score, friends_only, never_expires, expires) ON links TO %I', :'writer_user') \gexec
SELECT format('GRANT UPDATE (e621_post_id, post_url, post_thumbnail_url, post_description, set_by_id, response_type, response_text, updated_at) ON links TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id, deleted_at, set_count) ON users TO %I', :'writer_user') \gexec
SELECT format('GRANT UPDATE (set_count, updated_at) ON users TO %I', :'writer_user') \gexec
SELECT format('GRANT INSERT (link_id, user_id, e621_post_id, post_url, post_thumbnail_url, set_by_id, tags, ahoy_visit_id, created_at, updated_at), SELECT (id) ON past_links TO %I', :'writer_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE past_links_id_seq, node_wallpaper_events_id_seq TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT, INSERT ON node_wallpaper_events TO %I', :'writer_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts, available_at, updated_at) ON node_wallpaper_events TO %I', :'writer_user') \gexec
-- Reactions change only wallpaper state and their associated activity records.
SELECT format('GRANT SELECT (set_by_id, post_url) ON links TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (username) ON users TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (id, link_id, e621_post_id, post_url, post_thumbnail_url, created_at), DELETE ON past_links TO %I', :'writer_user') \gexec
SELECT format('GRANT INSERT (user_id, notification_type, text, link, created_at, updated_at), SELECT (id) ON notifications TO %I', :'writer_user') \gexec
SELECT format('GRANT INSERT (user_id, link_id, content, created_at, updated_at), SELECT (id) ON comments TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (user_id, created_at), INSERT (user_id, caused_by_user_id, rating, is_ruined, created_at, updated_at) ON nuttracker_orgasms TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (user_id, year, past_link_id, failed_on), UPDATE (past_link_id, failed_on, updated_at) ON nut_pledges TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (key, value) ON site_settings TO %I', :'writer_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE notifications_id_seq, comments_id_seq, nuttracker_orgasms_id_seq, node_reaction_events_id_seq TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT, INSERT ON node_reaction_events TO %I', :'writer_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts, available_at, updated_at) ON node_reaction_events TO %I', :'writer_user') \gexec
SQL
