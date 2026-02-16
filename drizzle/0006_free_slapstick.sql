CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`content` text NOT NULL,
	`coverImage` text,
	`metaTitle` text,
	`metaDescription` text,
	`keywords` text,
	`tableOfContents` integer DEFAULT true NOT NULL,
	`publishedAt` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`category` text NOT NULL,
	`tags` text,
	`readTime` integer NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`authorId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);