#!/bin/sh
set -eu

: "${DB_USER:?DB_USER must be set}"
: "${DB_PASSWORD:?DB_PASSWORD must be set}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_user="$DB_USER" \
  --set=app_password="$DB_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'app_user',
  :'app_password'
) \gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'database_name', :'app_user') \gexec
SQL
