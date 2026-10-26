-- Community interest search uses PostgreSQL trigram similarity.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
