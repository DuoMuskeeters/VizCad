CREATE TABLE `file_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`fileId` text NOT NULL,
	`modelR2Key` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`updatedByUserId` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspaceId`,`fileId`) REFERENCES `files`(`workspaceId`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_scenes_revision_check" CHECK("file_scenes"."revision" >= 1),
	CONSTRAINT "file_scenes_body_check" CHECK(length("file_scenes"."body") <= 131072)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_scenes_file_model_uq` ON `file_scenes` (`fileId`,`modelR2Key`);--> statement-breakpoint
CREATE INDEX `file_scenes_file_updated_idx` ON `file_scenes` (`fileId`,`updatedAt`);