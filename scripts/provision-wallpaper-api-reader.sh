#!/bin/sh
# Run inside the database container as its admin, after Node schema setup.
set -eu
: "${WALLPAPER_API_DB_USER:?required}"
: "${WALLPAPER_API_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=api_user="$WALLPAPER_API_DB_USER" --set=api_password="$WALLPAPER_API_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'api_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'api_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'api_user', :'api_password') \gexec
SELECT format('ALTER ROLE %I SET default_transaction_read_only = on', :'api_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'api_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (id, expires, terms, blacklist, post_url, post_thumbnail_url, created_at, updated_at, response_type, response_text, post_description, last_ping, last_ping_user_agent, user_id, set_by_id, friends_only, never_expires) ON links TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (id, username, deleted_at) ON users TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (set_count, is_reporter, is_cutie, is_supporter) ON users TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (custom_url) ON links TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (id, sender_id, receiver_id, confirmed) ON friendships TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (id, friendship_id, master_id, pet_id, flair) ON leashes TO %I', :'api_user') \gexec
-- schema.rb cannot represent SQL functions. Also install this after schema:load.
CREATE OR REPLACE FUNCTION public.walltaker_api_authenticate(supplied_key text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT id FROM public.users
  WHERE deleted_at IS NULL AND api_key = supplied_key AND length(supplied_key) > 0
  ORDER BY id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.walltaker_api_authenticate(text) FROM PUBLIC;
SELECT format('GRANT EXECUTE ON FUNCTION public.walltaker_api_authenticate(text) TO %I', :'api_user') \gexec
SELECT format('GRANT SELECT (id, link_id, user_id, set_by_id, e621_post_id, post_url, post_thumbnail_url, tags, created_at, updated_at) ON past_links TO %I', :'api_user') \gexec
SQL
