CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`r2Key` text NOT NULL,
	`size` integer NOT NULL,
	`mimeType` text NOT NULL,
	`extension` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_r2Key_unique` ON `files` (`r2Key`);