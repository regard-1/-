ALTER TABLE `studio_juzi_contacts` ADD `confirmed_salutation` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_juzi_contacts` ADD `reply_status_override` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `studio_outreach_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `source` text DEFAULT 'strategy' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_outreach_tasks` ADD `template_id` text;
--> statement-breakpoint
CREATE INDEX `studio_outreach_templates_active_idx` ON `studio_outreach_templates` (`active`);
--> statement-breakpoint
CREATE INDEX `studio_outreach_tasks_source_idx` ON `studio_outreach_tasks` (`source`);
