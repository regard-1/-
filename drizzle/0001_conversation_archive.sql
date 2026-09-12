CREATE TABLE `studio_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`usage_id` text NOT NULL,
	`user_id` text NOT NULL,
	`audience` text NOT NULL,
	`scene` text NOT NULL,
	`messages` text NOT NULL,
	`reply` text,
	`next_step` text,
	`followups` text,
	`resources` text,
	`supplement` text,
	`salutation` text,
	`needs` text,
	`goal` text,
	`instruction` text,
	`status` text NOT NULL,
	`feedback` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_conversations_user_idx` ON `studio_conversations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `studio_conversations_created_idx` ON `studio_conversations` (`created_at`);
