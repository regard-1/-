CREATE TABLE `studio_juzi_bots` (
	`im_bot_id` text PRIMARY KEY NOT NULL,
	`bot_name` text DEFAULT '' NOT NULL,
	`owner_user_id` text,
	`last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_juzi_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`im_contact_id` text NOT NULL UNIQUE,
	`external_user_id` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`phone_suffix` text DEFAULT '' NOT NULL,
	`gender` integer DEFAULT 0 NOT NULL,
	`im_bot_id` text NOT NULL,
	`friendship_status` integer DEFAULT 0 NOT NULL,
	`local_customer_id` text,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_outreach_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`local_customer_id` text,
	`audience` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`recommended_message` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`stop_rule` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_outreach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`contact_id` text NOT NULL,
	`direction` text NOT NULL,
	`content` text NOT NULL,
	`request_id` text,
	`external_request_id` text UNIQUE,
	`message_id` text UNIQUE,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_juzi_contacts_bot_idx` ON `studio_juzi_contacts` (`im_bot_id`);
--> statement-breakpoint
CREATE INDEX `studio_juzi_contacts_customer_idx` ON `studio_juzi_contacts` (`local_customer_id`);
--> statement-breakpoint
CREATE INDEX `studio_outreach_tasks_status_idx` ON `studio_outreach_tasks` (`status`);
--> statement-breakpoint
CREATE INDEX `studio_outreach_tasks_created_idx` ON `studio_outreach_tasks` (`created_at`);
--> statement-breakpoint
CREATE INDEX `studio_outreach_messages_created_idx` ON `studio_outreach_messages` (`created_at`);
