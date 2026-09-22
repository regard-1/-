ALTER TABLE studio_juzi_contacts ADD COLUMN tags TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_juzi_contacts ADD COLUMN remark TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_juzi_contacts ADD COLUMN profile_json TEXT;
ALTER TABLE studio_juzi_contacts ADD COLUMN last_profile_updated_at BIGINT;
ALTER TABLE studio_outreach_tasks ADD COLUMN plan_day TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_outreach_tasks ADD COLUMN strategy_type TEXT DEFAULT 'care' NOT NULL;
ALTER TABLE studio_outreach_tasks ADD COLUMN profile_snapshot TEXT;
ALTER TABLE studio_outreach_tasks ADD COLUMN profile_updates TEXT;

CREATE TABLE IF NOT EXISTS studio_customer_profile_updates (
    id TEXT PRIMARY KEY NOT NULL,
    contact_id TEXT NOT NULL,
    local_customer_id TEXT,
    message_id TEXT,
    updates_json TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_customer_profile_updates_contact_idx ON studio_customer_profile_updates (contact_id);
CREATE INDEX IF NOT EXISTS studio_outreach_tasks_plan_day_idx ON studio_outreach_tasks (plan_day);
