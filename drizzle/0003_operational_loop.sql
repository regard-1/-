CREATE TABLE `studio_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`audience` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`salutation` text DEFAULT '' NOT NULL,
	`phone_suffix` text DEFAULT '' NOT NULL,
	`purchased_products` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`concerns` text DEFAULT '' NOT NULL,
	`contraindications` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`screenshot` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `price` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `specification` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `applicable` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `effect` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `usage_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `studio_materials` ADD `precautions` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `studio_conversations` ADD `customer_id` text;
--> statement-breakpoint
CREATE INDEX `studio_customers_owner_idx` ON `studio_customers` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX `studio_customers_updated_idx` ON `studio_customers` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `studio_issues_user_idx` ON `studio_issues` (`user_id`);
--> statement-breakpoint
CREATE INDEX `studio_issues_status_idx` ON `studio_issues` (`status`);
--> statement-breakpoint
CREATE INDEX `studio_issues_created_idx` ON `studio_issues` (`created_at`);
