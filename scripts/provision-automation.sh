#!/bin/sh
set -eu
: "${AUTOMATION_DB_USER:?required}"
: "${AUTOMATION_DB_PASSWORD:?required}"
: "${WALLPAPER_WRITER_DB_USER:?required}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=automation_user="$AUTOMATION_DB_USER" --set=automation_password="$AUTOMATION_DB_PASSWORD" \
  --set=writer_user="$WALLPAPER_WRITER_DB_USER" --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'automation_user') WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname=:'automation_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'automation_user', :'automation_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'automation_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT (id,username,deleted_at,system_account,mascot,pervert) ON users TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT ON links,link_abilities,kinks,kink_havers,past_links,node_wallpaper_events,scoops TO %I', :'automation_user') \gexec
SELECT format('GRANT UPDATE (was_shown,updated_at) ON scoops TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT,INSERT,UPDATE ON node_automation_jobs,node_automation_schedules TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT ON node_newsroom_states TO %I', :'automation_user') \gexec
SELECT format('GRANT UPDATE (generation,kind,entry,story,busy_until,throttle_until,updated_at) ON node_newsroom_states TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_automation_events TO %I', :'automation_user') \gexec
SELECT format('GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_automation_events TO %I', :'automation_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE node_automation_jobs_id_seq,node_automation_events_id_seq TO %I', :'automation_user') \gexec
-- Handoff of these two legacy job classes is transactional and bounded. Keep
-- the original jobs and failure history; only retire their execution pointers.
SELECT format('GRANT SELECT ON solid_queue_jobs TO %I', :'automation_user') \gexec
SELECT format('GRANT UPDATE (finished_at,updated_at) ON solid_queue_jobs TO %I', :'automation_user') \gexec
SELECT format('GRANT SELECT (job_id),DELETE ON solid_queue_ready_executions,solid_queue_scheduled_executions,solid_queue_claimed_executions,solid_queue_blocked_executions TO %I', :'automation_user') \gexec
-- Wallpaper persistence remains with the existing writer role. The additional
-- reads recheck consent/policy before an automated write commits.
SELECT format('GRANT SELECT ON links,link_abilities,kinks,kink_havers TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT (username,mascot,pervert) ON users TO %I', :'writer_user') \gexec
SELECT format('GRANT SELECT,INSERT ON node_automation_jobs TO %I', :'writer_user') \gexec
SELECT format('GRANT USAGE ON SEQUENCE node_automation_jobs_id_seq TO %I', :'writer_user') \gexec
-- Existing moderation installations can inspect the new queue after rerunning
-- their provisioning script; no job mutation is granted to administrators' DB role.
SQL
