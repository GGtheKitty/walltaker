CREATE TABLE node_browser_sessions (
 id bigserial PRIMARY KEY,token_digest varchar(64) NOT NULL UNIQUE,user_id bigint NOT NULL,
 original_actor_id bigint,surrender_id bigint,legacy_fingerprints jsonb NOT NULL DEFAULT '[]',
 remember boolean NOT NULL DEFAULT false,expires_at timestamp NOT NULL,revoked_at timestamp,
 created_at timestamp NOT NULL,updated_at timestamp NOT NULL
);
CREATE INDEX ON node_browser_sessions(user_id);
CREATE INDEX ON node_browser_sessions(original_actor_id);
CREATE INDEX ON node_browser_sessions(surrender_id);
CREATE INDEX ON node_browser_sessions(expires_at);
CREATE TABLE node_browser_legacy_sessions (
 fingerprint varchar(64) PRIMARY KEY,user_id bigint,expires_at timestamp NOT NULL,revoked_at timestamp,created_at timestamp NOT NULL
);
CREATE INDEX ON node_browser_legacy_sessions(user_id);
