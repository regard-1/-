CREATE TABLE IF NOT EXISTS studio_idp_codes (
    code_hash TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    state TEXT DEFAULT '' NOT NULL,
    user_id TEXT NOT NULL,
    expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_idp_tokens (
    token_hash TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_idp_codes_expires_idx ON studio_idp_codes (expires_at);
CREATE INDEX IF NOT EXISTS studio_idp_tokens_expires_idx ON studio_idp_tokens (expires_at);
