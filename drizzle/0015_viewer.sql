CREATE TABLE `derivative_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`fileId` text NOT NULL,
	`sourceR2Key` text NOT NULL,
	`userId` text NOT NULL,
	`r2Key` text NOT NULL,
	`declaredSize` integer NOT NULL,
	`status` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`workspaceId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "derivative_sessions_status_check" CHECK("derivative_sessions"."status" IN ('pending', 'completed', 'expired', 'rejected')),
	CONSTRAINT "derivative_sessions_size_check" CHECK("derivative_sessions"."declaredSize" > 0),
	CONSTRAINT "derivative_sessions_completed_check" CHECK(("derivative_sessions"."status" = 'completed') = ("derivative_sessions"."completedAt" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `derivative_sessions_r2_key_uq` ON `derivative_sessions` (`r2Key`);--> statement-breakpoint
CREATE INDEX `derivative_sessions_status_expiry_idx` ON `derivative_sessions` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `derivative_sessions_file_status_idx` ON `derivative_sessions` (`fileId`,`status`);--> statement-breakpoint
CREATE INDEX `derivative_sessions_user_status_idx` ON `derivative_sessions` (`userId`,`status`);--> statement-breakpoint
ALTER TABLE `file_versions` ADD `derivativeR2Key` text;--> statement-breakpoint
ALTER TABLE `file_versions` ADD `derivativeState` text CHECK(`derivativeState` IS NULL OR `derivativeState` IN ('ready', 'failed', 'too_large'));--> statement-breakpoint
ALTER TABLE `file_versions` ADD `derivativeMeta` text;--> statement-breakpoint
ALTER TABLE `files` ADD `derivativeR2Key` text;--> statement-breakpoint
ALTER TABLE `files` ADD `derivativeState` text CHECK(`derivativeState` IS NULL OR `derivativeState` IN ('ready', 'failed', 'too_large'));--> statement-breakpoint
ALTER TABLE `files` ADD `derivativeMeta` text;