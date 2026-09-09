CREATE TABLE `studio_budgets` (
	`month` text PRIMARY KEY NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`ceiling` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`audience` text NOT NULL,
	`product` text NOT NULL,
	`content` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `studio_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `studio_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`audience` text NOT NULL,
	`scene` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`reservation` integer NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`elapsed_ms` integer,
	`feedback` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`must_change` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_users_username_unique` ON `studio_users` (`username`);--> statement-breakpoint
CREATE TABLE `studio_material_versions` (
	`material_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`material_id`, `version`)
);
