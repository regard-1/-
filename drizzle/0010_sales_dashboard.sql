CREATE TABLE `studio_sales_targets` (
	`business_day` text PRIMARY KEY NOT NULL,
	`target_amount` real DEFAULT 0 NOT NULL,
	`youzan_actual` real DEFAULT 0 NOT NULL,
	`tianmao_actual` real DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studio_sales_targets_day_idx` ON `studio_sales_targets` (`business_day`);
