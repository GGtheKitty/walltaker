CREATE TABLE node_automation_jobs (
 id bigserial PRIMARY KEY, job_key varchar(160) NOT NULL UNIQUE, kind varchar NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}',
 status varchar NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 attempts integer NOT NULL DEFAULT 0, run_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 locked_at timestamp, locked_by varchar, last_error varchar, completed_at timestamp,
 created_at timestamp NOT NULL, updated_at timestamp NOT NULL
);
CREATE INDEX ON node_automation_jobs(run_at,id) WHERE status='queued';
CREATE INDEX ON node_automation_jobs(locked_at) WHERE status='running';
CREATE TABLE node_automation_schedules(name varchar PRIMARY KEY,next_run_at timestamp NOT NULL,created_at timestamp NOT NULL,updated_at timestamp NOT NULL);
CREATE TABLE node_newsroom_states (
 id bigserial PRIMARY KEY,generation bigint NOT NULL DEFAULT 0,rendered_event_id bigint,kind varchar,
 entry jsonb NOT NULL DEFAULT '{}',story jsonb NOT NULL DEFAULT '{}',busy_until timestamp,throttle_until timestamp,
 created_at timestamp NOT NULL,updated_at timestamp NOT NULL
);
INSERT INTO node_newsroom_states(id,created_at,updated_at) VALUES(1,now(),now());
CREATE TABLE node_automation_events (
 id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE,generation bigint NOT NULL,
 effects jsonb NOT NULL DEFAULT '{}',delivered_at timestamp,delivery_attempts integer NOT NULL DEFAULT 0,
 available_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,created_at timestamp NOT NULL,updated_at timestamp NOT NULL
);
CREATE INDEX ON node_automation_events(available_at) WHERE delivered_at IS NULL;
