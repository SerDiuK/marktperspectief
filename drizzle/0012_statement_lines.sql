DELETE FROM `income` WHERE `source` IN ('degiro', 'saxo');--> statement-breakpoint
DELETE FROM `fees` WHERE `broker` IN ('degiro', 'saxo');
