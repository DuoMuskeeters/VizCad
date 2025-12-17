CREATE TABLE `file_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`userId` text NOT NULL,
	`action` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`userId` text NOT NULL,
	`parentId` text,
	`content` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`sharedByUserId` text NOT NULL,
	`sharedWithUserId` text,
	`shareType` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`shareToken` text,
	`password` text,
	`expiresAt` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sharedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sharedWithUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_shares_shareToken_unique` ON `file_shares` (`shareToken`);--> statement-breakpoint
CREATE TABLE `file_stars` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`versionNumber` integer NOT NULL,
	`r2Key` text NOT NULL,
	`size` integer NOT NULL,
	`changeNote` text,
	`uploadedByUserId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploadedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `files` ADD `isDeleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `deletedAt` integer;