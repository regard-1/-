CREATE TABLE IF NOT EXISTS studio_outreach_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    created_by TEXT NOT NULL,
    status TEXT NOT NULL,
    request_json TEXT NOT NULL,
    direction TEXT DEFAULT 'auto' NOT NULL,
    tag TEXT DEFAULT '' NOT NULL,
    audience TEXT DEFAULT '' NOT NULL,
    contact_id TEXT DEFAULT '' NOT NULL,
    total_count BIGINT DEFAULT 0 NOT NULL,
    created_count BIGINT DEFAULT 0 NOT NULL,
    existing_count BIGINT DEFAULT 0 NOT NULL,
    skipped_count BIGINT DEFAULT 0 NOT NULL,
    failed_count BIGINT DEFAULT 0 NOT NULL,
    remaining_count BIGINT DEFAULT 0 NOT NULL,
    batches_total BIGINT DEFAULT 0 NOT NULL,
    batches_completed BIGINT DEFAULT 0 NOT NULL,
    error_json TEXT,
    created_at BIGINT NOT NULL,
    started_at BIGINT,
    updated_at BIGINT NOT NULL,
    finished_at BIGINT
);

CREATE INDEX IF NOT EXISTS studio_outreach_jobs_status_idx ON studio_outreach_jobs (status, updated_at);
