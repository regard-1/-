CREATE TABLE `studio_idp_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_idp_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_idp_codes_expires_idx` ON `studio_idp_codes` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `studio_idp_tokens_expires_idx` ON `studio_idp_tokens` (`expires_at`);
