ALTER TABLE `studio_juzi_contacts` ADD `upstream_chat_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `studio_juzi_contacts_chat_idx` ON `studio_juzi_contacts` (`upstream_chat_id`);
