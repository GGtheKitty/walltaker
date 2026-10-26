CREATE TABLE node_bot_settings (
  name text PRIMARY KEY CHECK (name IN ('pornbot','ki','warren','taylor')),
  enabled boolean NOT NULL DEFAULT true,
  normal_tags text CHECK (length(normal_tags) <= 2000),
  perverted_tags text CHECK (length(perverted_tags) <= 2000),
  interval_seconds integer CHECK (interval_seconds BETWEEN 60 AND 86400),
  cooldown_seconds integer CHECK (cooldown_seconds BETWEEN 0 AND 604800),
  round_limit integer CHECK (round_limit BETWEEN 1 AND 60),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- NULL overrides retain the existing application defaults, including the
-- deployment's initial PORNBOT_INTERVAL_SECONDS. Saving makes them explicit.
INSERT INTO node_bot_settings(name) VALUES ('pornbot'),('ki'),('warren'),('taylor');
ALTER TABLE node_automation_schedules ADD COLUMN last_checked_at timestamp;
CREATE INDEX node_automation_bot_pending ON node_automation_jobs ((payload->>'bot'),status)
  WHERE kind IN ('bot-round','bot-link') AND status IN ('queued','running','failed');
