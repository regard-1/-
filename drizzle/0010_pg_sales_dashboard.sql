CREATE TABLE IF NOT EXISTS studio_sales_targets (
    business_day TEXT PRIMARY KEY NOT NULL,
    target_amount DOUBLE PRECISION DEFAULT 0 NOT NULL,
    youzan_actual DOUBLE PRECISION DEFAULT 0 NOT NULL,
    tianmao_actual DOUBLE PRECISION DEFAULT 0 NOT NULL,
    updated_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_sales_targets_day_idx ON studio_sales_targets (business_day);
