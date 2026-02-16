CREATE TABLE `author_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`role` text,
	`avatarUrl` text,
	`socialLinks` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_profiles_userId_unique` ON `author_profiles` (`userId`);