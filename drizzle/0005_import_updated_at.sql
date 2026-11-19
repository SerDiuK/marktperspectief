ALTER TABLE `raw_imports` ADD `updated_at` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `raw_imports` SET `updated_at` = `uploaded_at`;
