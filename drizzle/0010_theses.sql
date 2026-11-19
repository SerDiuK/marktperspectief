CREATE TABLE `theses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`instrument_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`pillars` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `theses_external_key_unique` ON `theses` (`external_key`);