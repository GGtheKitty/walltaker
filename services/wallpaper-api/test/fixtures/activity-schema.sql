CREATE TABLE node_activity_receipts(
 id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE,payload_digest varchar(64) NOT NULL,
 operation varchar NOT NULL,result jsonb NOT NULL DEFAULT '{}',user_id bigint,
 created_at timestamp NOT NULL,updated_at timestamp NOT NULL
);
CREATE INDEX ON node_activity_receipts(user_id);
CREATE INDEX ON history_events(user_id,id DESC);
CREATE INDEX ON ahoy_visits(started_at);
CREATE INDEX ON ahoy_events(time);
CREATE TABLE node_moderation_events(
 id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE,payload_digest varchar(64) NOT NULL,
 operation varchar NOT NULL,user_id bigint,result jsonb NOT NULL DEFAULT '{}',effects jsonb NOT NULL DEFAULT '{}',
 delivered_at timestamp,delivery_attempts integer DEFAULT 0,available_at timestamp DEFAULT now(),
 created_at timestamp NOT NULL,updated_at timestamp NOT NULL
);
