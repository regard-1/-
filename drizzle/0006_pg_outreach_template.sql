ALTER TABLE studio_juzi_contacts ADD COLUMN IF NOT EXISTS confirmed_salutation TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_juzi_contacts ADD COLUMN IF NOT EXISTS reply_status_override INTEGER DEFAULT 0 NOT NULL;
CREATE TABLE IF NOT EXISTS studio_outreach_templates (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT DEFAULT '' NOT NULL,
    content TEXT DEFAULT '' NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL,
    created_by TEXT NOT NULL,
    updated_at BIGINT NOT NULL
);
ALTER TABLE studio_outreach_tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'strategy' NOT NULL;
ALTER TABLE studio_outreach_tasks ADD COLUMN IF NOT EXISTS template_id TEXT;
CREATE INDEX IF NOT EXISTS studio_outreach_templates_active_idx ON studio_outreach_templates (active);
CREATE INDEX IF NOT EXISTS studio_outreach_tasks_source_idx ON studio_outreach_tasks (source);
