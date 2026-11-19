CREATE TABLE `__new_corporate_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`broker` text NOT NULL,
	`date` text NOT NULL,
	`instrument_id` text NOT NULL,
	`shares` real NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_corporate_actions`("id", "broker", "date", "instrument_id", "shares") SELECT "id", "broker", "date", "instrument_id", "shares" FROM `corporate_actions`;--> statement-breakpoint
DROP TABLE `corporate_actions`;--> statement-breakpoint
ALTER TABLE `__new_corporate_actions` RENAME TO `corporate_actions`;--> statement-breakpoint
CREATE TABLE `__new_fees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`broker` text NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_fees`("id", "broker", "external_key", "raw_import_id", "date", "amount", "currency") SELECT "id", "broker", "external_key", "raw_import_id", "date", "amount", "currency" FROM `fees`;--> statement-breakpoint
DROP TABLE `fees`;--> statement-breakpoint
ALTER TABLE `__new_fees` RENAME TO `fees`;--> statement-breakpoint
CREATE UNIQUE INDEX `fees_broker_key` ON `fees` (`broker`,`external_key`);--> statement-breakpoint
ALTER TABLE `income` DROP COLUMN `withholding`;--> statement-breakpoint
ALTER TABLE `income` DROP COLUMN `voided_at`;--> statement-breakpoint
ALTER TABLE `income` DROP COLUMN `note`;--> statement-breakpoint
ALTER TABLE `instruments` DROP COLUMN `kind`;--> statement-breakpoint
ALTER TABLE `instruments` DROP COLUMN `is_benchmark`;--> statement-breakpoint
ALTER TABLE `option_trades` DROP COLUMN `currency`;--> statement-breakpoint
ALTER TABLE `raw_imports` DROP COLUMN `blob_pathname`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `broker_total_eur`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `excluded`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `note`;
