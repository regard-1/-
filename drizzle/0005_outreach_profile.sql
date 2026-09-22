ALTER TABLE `studio_juzi_contacts` ADD `tags` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_juzi_contacts` ADD `remark` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_juzi_contacts` ADD `profile_json` text;
--> statement-breakpoint
ALTER TABLE `studio_juzi_contacts` ADD `last_profile_updated_at` integer;
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `plan_day` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `strategy_type` text DEFAULT 'care' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `profile_snapshot` text;
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `profile_updates` text;
--> statement-breakpoint
CREATE TABLE `studio_customer_profile_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`local_customer_id` text,
	`message_id` text,
	`updates_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_customer_profile_updates_contact_idx` ON `studio_customer_profile_updates` (`contact_id`);
--> statement-breakpoint
CREATE INDEX `studio_outreach_tasks_plan_day_idx` ON `studio_outreach_tasks` (`plan_day`);
