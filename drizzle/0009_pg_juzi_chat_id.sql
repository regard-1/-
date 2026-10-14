ALTER TABLE studio_juzi_contacts ADD COLUMN IF NOT EXISTS upstream_chat_id TEXT DEFAULT '' NOT NULL;
CREATE INDEX IF NOT EXISTS studio_juzi_contacts_chat_idx ON studio_juzi_contacts (upstream_chat_id);
