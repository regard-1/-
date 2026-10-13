CREATE TABLE `studio_outreach_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`status` text NOT NULL,
	`request_json` text NOT NULL,
	`direction` text DEFAULT 'auto' NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`contact_id` text DEFAULT '' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`existing_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`remaining_count` integer DEFAULT 0 NOT NULL,
	`batches_total` integer DEFAULT 0 NOT NULL,
	`batches_completed` integer DEFAULT 0 NOT NULL,
	`error_json` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `studio_outreach_jobs_status_idx` ON `studio_outreach_jobs` (`status`,`updated_at`);
