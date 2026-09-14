CREATE TABLE IF NOT EXISTS studio_users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL,
    must_change INTEGER DEFAULT 1 NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_users_username_unique ON studio_users (username);

CREATE TABLE IF NOT EXISTS studio_budgets (
    month TEXT PRIMARY KEY NOT NULL,
    spent BIGINT DEFAULT 0 NOT NULL,
    reserved BIGINT DEFAULT 0 NOT NULL,
    ceiling BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_rate_limits (
    key TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    csrf TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES studio_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS studio_usage (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    month TEXT NOT NULL,
    audience TEXT NOT NULL,
    scene TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    reservation BIGINT NOT NULL,
    cost BIGINT DEFAULT 0 NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    elapsed_ms INTEGER,
    feedback TEXT,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_usage_user_idx ON studio_usage (user_id);
CREATE INDEX IF NOT EXISTS studio_usage_month_idx ON studio_usage (month);

CREATE TABLE IF NOT EXISTS studio_materials (
    id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    audience TEXT NOT NULL,
    product TEXT NOT NULL,
    content TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_material_versions (
    material_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY(material_id, version),
    FOREIGN KEY (material_id) REFERENCES studio_materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS studio_conversations (
    id TEXT PRIMARY KEY NOT NULL,
    usage_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    audience TEXT NOT NULL,
    scene TEXT NOT NULL,
    messages TEXT NOT NULL,
    reply TEXT,
    next_step TEXT,
    followups TEXT,
    resources TEXT,
    supplement TEXT,
    salutation TEXT,
    needs TEXT,
    goal TEXT,
    instruction TEXT,
    status TEXT NOT NULL,
    feedback TEXT,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_conversations_user_idx ON studio_conversations (user_id);
CREATE INDEX IF NOT EXISTS studio_conversations_created_idx ON studio_conversations (created_at);
CREATE INDEX IF NOT EXISTS studio_conversations_usage_idx ON studio_conversations (usage_id);
