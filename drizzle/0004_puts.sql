CREATE TABLE `option_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`broker` text NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`instrument_id` text NOT NULL,
	`strike` real NOT NULL,
	`expiry` text NOT NULL,
	`side` text NOT NULL,
	`trade_date` text NOT NULL,
	`contracts` integer NOT NULL,
	`premium` real NOT NULL,
	`currency` text NOT NULL,
	`fees_eur` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `option_trades_broker_key` ON `option_trades` (`broker`,`external_key`);