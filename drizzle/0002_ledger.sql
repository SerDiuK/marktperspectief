CREATE TABLE `corporate_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`broker` text NOT NULL,
	`date` text NOT NULL,
	`instrument_id` text NOT NULL,
	`parent_instrument_id` text,
	`shares` real NOT NULL,
	`cost_fraction` real,
	`raw_import_id` integer,
	`note` text,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`broker` text NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`kind` text NOT NULL,
	`instrument_id` text,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fees_broker_key` ON `fees` (`broker`,`external_key`);--> statement-breakpoint
CREATE TABLE `income` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`broker` text NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`kind` text NOT NULL,
	`instrument_id` text,
	`pay_date` text NOT NULL,
	`amount` real NOT NULL,
	`gross` real,
	`withholding` real,
	`currency` text NOT NULL,
	`voided_at` text,
	`note` text,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_source_key` ON `income` (`source`,`external_key`);--> statement-breakpoint
CREATE TABLE `instrument_aliases` (
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`instrument_id` text NOT NULL,
	PRIMARY KEY(`kind`, `value`),
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`isin` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`kind` text NOT NULL,
	`yahoo_symbol` text,
	`is_benchmark` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_isin_unique` ON `instruments` (`isin`);--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_yahoo_symbol_unique` ON `instruments` (`yahoo_symbol`);--> statement-breakpoint
CREATE TABLE `raw_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`blob_pathname` text NOT NULL,
	`original_name` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`parser_version` integer NOT NULL,
	`status` text NOT NULL,
	`coverage_from` text,
	`coverage_to` text,
	`report` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_imports_sha256_unique` ON `raw_imports` (`sha256`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`broker` text NOT NULL,
	`external_key` text NOT NULL,
	`raw_import_id` integer NOT NULL,
	`instrument_id` text NOT NULL,
	`side` text NOT NULL,
	`trade_date` text NOT NULL,
	`trade_time` text,
	`quantity` real NOT NULL,
	`price` real NOT NULL,
	`currency` text NOT NULL,
	`fees_eur` real DEFAULT 0 NOT NULL,
	`broker_total_eur` real,
	`order_ref` text,
	`superseded_by` text,
	`excluded` integer DEFAULT false NOT NULL,
	`voided_at` text,
	`note` text,
	FOREIGN KEY (`raw_import_id`) REFERENCES `raw_imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_source_key` ON `transactions` (`source`,`external_key`);--> statement-breakpoint
CREATE INDEX `transactions_instrument_date` ON `transactions` (`instrument_id`,`trade_date`);