CREATE TABLE `dividend_events` (
	`instrument_id` text NOT NULL,
	`ex_date` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`instrument_id`, `ex_date`),
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
