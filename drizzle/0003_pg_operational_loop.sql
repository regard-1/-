CREATE TABLE IF NOT EXISTS studio_customers (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    audience TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    salutation TEXT DEFAULT '' NOT NULL,
    phone_suffix TEXT DEFAULT '' NOT NULL,
    purchased_products TEXT DEFAULT '' NOT NULL,
    interests TEXT DEFAULT '' NOT NULL,
    concerns TEXT DEFAULT '' NOT NULL,
    contraindications TEXT DEFAULT '' NOT NULL,
    notes TEXT DEFAULT '' NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_customers_owner_idx ON studio_customers (owner_user_id);
CREATE INDEX IF NOT EXISTS studio_customers_updated_idx ON studio_customers (updated_at);

CREATE TABLE IF NOT EXISTS studio_issues (
    id TEXT PRIMARY KEY NOT NULL,
    generation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    screenshot TEXT,
    status TEXT DEFAULT 'open' NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_issues_user_idx ON studio_issues (user_id);
CREATE INDEX IF NOT EXISTS studio_issues_status_idx ON studio_issues (status);
CREATE INDEX IF NOT EXISTS studio_issues_created_idx ON studio_issues (created_at);

ALTER TABLE studio_materials ADD COLUMN price TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_materials ADD COLUMN specification TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_materials ADD COLUMN applicable TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_materials ADD COLUMN effect TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_materials ADD COLUMN usage_notes TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_materials ADD COLUMN precautions TEXT DEFAULT '' NOT NULL;
ALTER TABLE studio_conversations ADD COLUMN customer_id TEXT;
