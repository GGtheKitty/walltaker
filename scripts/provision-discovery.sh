#!/bin/sh
# Run as PostgreSQL's administrator. No writes, credentials, or session tokens.
set -eu
: "${DISCOVERY_DB_USER:?required}"
: "${DISCOVERY_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=discovery_user="$DISCOVERY_DB_USER" --set=discovery_password="$DISCOVERY_DB_PASSWORD" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'discovery_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'discovery_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'discovery_user', :'discovery_password') \gexec
SELECT format('ALTER ROLE %I SET default_transaction_read_only=on', :'discovery_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'discovery_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT (id,username,details,created_at,updated_at,deleted_at,set_count,viewing_link_id,mascot,pervert) ON users TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT ON links,past_links,link_abilities,wallpaper_clients,kinks,kink_havers,scoops,emoji_link_decorations TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT (id,pet_id,master_id,flair) ON leashes TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT (id,sender_id,receiver_id,confirmed) ON friendships TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT (profile_id) ON users TO %I', :'discovery_user') \gexec
SELECT format('GRANT SELECT (id,user_id,content) ON profiles TO %I', :'discovery_user') \gexec
SQL
