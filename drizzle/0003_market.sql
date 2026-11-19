CREATE TABLE `fx_daily` (
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`per_eur` real NOT NULL,
	PRIMARY KEY(`currency`, `date`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`value_cents` integer NOT NULL,
	`cost_basis_cents` integer NOT NULL,
	`inflow_cents` integer NOT NULL,
	`outflow_cents` integer NOT NULL,
	`twr_index` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_daily` (
	`instrument_id` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	PRIMARY KEY(`instrument_id`, `date`),
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
