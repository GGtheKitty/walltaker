#!/bin/sh
# Run as the database admin after Node schema setup. Credentials stay in private env.
set -eu
: "${LINK_MANAGER_DB_USER:?required}"
: "${LINK_MANAGER_DB_PASSWORD:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=manager_user="$LINK_MANAGER_DB_USER" --set=manager_password="$LINK_MANAGER_DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'manager_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'manager_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'manager_user', :'manager_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'manager_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT, DELETE ON links TO %I', :'manager_user') \gexec
SELECT format('GRANT INSERT (user_id,expires,terms,blacklist,friends_only,never_expires,theme,min_score,custom_url,wizard_page,ahoy_visit_id,created_at,updated_at) ON links TO %I', :'manager_user') \gexec
SELECT format('GRANT UPDATE (expires,terms,blacklist,friends_only,never_expires,theme,min_score,custom_url,wizard_page,forked_from_id,updated_at) ON links TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (id,deleted_at,set_count,admin,viewing_link_id), UPDATE (mascot,pervert,viewing_link_id,updated_at) ON users TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (id,sender_id,receiver_id,confirmed) ON friendships TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (id,friendship_id,user_id,pending,expires_at,accepted_consequences) ON surrenders TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (friendship_id,master_id,pet_id) ON leashes TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT, INSERT, DELETE ON link_abilities TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (link_id), DELETE ON comments,history_events,emoji_link_decorations TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT (link_id), UPDATE (link_id) ON past_links,scoops TO %I', :'manager_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE links_id_seq,link_abilities_id_seq,node_link_events_id_seq TO %I', :'manager_user') \gexec
SELECT format('GRANT SELECT, INSERT ON node_link_events TO %I', :'manager_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_link_events TO %I', :'manager_user') \gexec
SQL
