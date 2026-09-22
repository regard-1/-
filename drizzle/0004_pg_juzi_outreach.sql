CREATE TABLE IF NOT EXISTS studio_juzi_bots (
    im_bot_id TEXT PRIMARY KEY NOT NULL,
    bot_name TEXT DEFAULT '' NOT NULL,
    owner_user_id TEXT,
    last_synced_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_juzi_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    im_contact_id TEXT NOT NULL UNIQUE,
    external_user_id TEXT DEFAULT '' NOT NULL,
    display_name TEXT DEFAULT '' NOT NULL,
    phone_suffix TEXT DEFAULT '' NOT NULL,
    gender INTEGER DEFAULT 0 NOT NULL,
    im_bot_id TEXT NOT NULL,
    friendship_status INTEGER DEFAULT 0 NOT NULL,
    local_customer_id TEXT,
    match_status TEXT DEFAULT 'unmatched' NOT NULL,
    last_synced_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_juzi_contacts_bot_idx ON studio_juzi_contacts (im_bot_id);
CREATE INDEX IF NOT EXISTS studio_juzi_contacts_customer_idx ON studio_juzi_contacts (local_customer_id);

CREATE TABLE IF NOT EXISTS studio_outreach_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    contact_id TEXT NOT NULL,
    local_customer_id TEXT,
    audience TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' NOT NULL,
    reason TEXT DEFAULT '' NOT NULL,
    recommended_message TEXT DEFAULT '' NOT NULL,
    next_action TEXT DEFAULT '' NOT NULL,
    stop_rule TEXT DEFAULT '' NOT NULL,
    status TEXT DEFAULT 'draft' NOT NULL,
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_outreach_tasks_status_idx ON studio_outreach_tasks (status);
CREATE INDEX IF NOT EXISTS studio_outreach_tasks_created_idx ON studio_outreach_tasks (created_at);

CREATE TABLE IF NOT EXISTS studio_outreach_messages (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT,
    contact_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    request_id TEXT,
    external_request_id TEXT UNIQUE,
    message_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending' NOT NULL,
    error TEXT DEFAULT '' NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_outreach_messages_created_idx ON studio_outreach_messages (created_at);
