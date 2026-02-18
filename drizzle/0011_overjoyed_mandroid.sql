CREATE TABLE `file_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`invitedByUserId` text NOT NULL,
	`email` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_invitations_token_unique` ON `file_invitations` (`token`);