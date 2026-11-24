CREATE TABLE `security_log` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`event` text NOT NULL,
	`userId` text,
	`workspaceId` text,
	`targetId` text,
	`ip` text,
	`userAgent` text,
	`requestId` text NOT NULL,
	CONSTRAINT "security_log_event_check" CHECK("security_log"."event" IN ('sign_in_succeeded', 'sign_in_failed', 'password_reset_requested', 'link_opened', 'link_password_failed', 'file_downloaded')),
	CONSTRAINT "security_log_user_agent_check" CHECK("security_log"."userAgent" IS NULL OR length("security_log"."userAgent") <= 256)
);
--> statement-breakpoint
CREATE INDEX `security_log_created_idx` ON `security_log` (`createdAt`);--> statement-breakpoint
CREATE INDEX `security_log_event_created_idx` ON `security_log` (`event`,`createdAt`);--> statement-breakpoint
CREATE TABLE `storage_deletions` (
	`key` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`createdAt` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`notBefore` integer NOT NULL,
	CONSTRAINT "storage_deletions_reason_check" CHECK("storage_deletions"."reason" IN ('upload_rejected', 'upload_expired', 'upload_canceled', 'purged', 'trash_retention')),
	CONSTRAINT "storage_deletions_attempts_check" CHECK("storage_deletions"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `storage_deletions_not_before_idx` ON `storage_deletions` (`notBefore`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text,
	`fileId` text NOT NULL,
	`targetFileId` text,
	`userId` text NOT NULL,
	`r2Key` text NOT NULL,
	`objectId` text NOT NULL,
	`name` text NOT NULL,
	`extension` text NOT NULL,
	`declaredSize` integer NOT NULL,
	`status` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`workspaceId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "upload_sessions_status_check" CHECK("upload_sessions"."status" IN ('pending', 'completed', 'expired', 'rejected')),
	CONSTRAINT "upload_sessions_size_check" CHECK("upload_sessions"."declaredSize" > 0),
	CONSTRAINT "upload_sessions_completed_check" CHECK(("upload_sessions"."status" = 'completed') = ("upload_sessions"."completedAt" IS NOT NULL)),
	CONSTRAINT "upload_sessions_target_check" CHECK("upload_sessions"."targetFileId" IS NULL OR "upload_sessions"."targetFileId" = "upload_sessions"."fileId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_r2_key_uq` ON `upload_sessions` (`r2Key`);--> statement-breakpoint
CREATE INDEX `upload_sessions_user_status_idx` ON `upload_sessions` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `upload_sessions_status_expiry_idx` ON `upload_sessions` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `upload_sessions_workspace_status_idx` ON `upload_sessions` (`workspaceId`,`status`,`expiresAt`);--> statement-breakpoint
ALTER TABLE `file_comments` ADD `authorScopeAtWrite` text CHECK (`authorScopeAtWrite` IN ('internal', 'guest'));--> statement-breakpoint
ALTER TABLE `file_comments` ADD `versionNumber` integer;--> statement-breakpoint
ALTER TABLE `file_comments` ADD `deletedAt` integer;--> statement-breakpoint
CREATE INDEX `file_comments_file_created_idx` ON `file_comments` (`fileId`,`createdAt`,`id`);--> statement-breakpoint
ALTER TABLE `file_versions` ADD `contentEtag` text;--> statement-breakpoint
ALTER TABLE `file_versions` ADD `thumbnailR2Key` text;--> statement-breakpoint
CREATE INDEX `file_versions_file_version_idx` ON `file_versions` (`fileId`,`versionNumber`);--> statement-breakpoint
ALTER TABLE `files` ADD `contentEtag` text;--> statement-breakpoint
ALTER TABLE `files` ADD `currentVersionNumber` integer;--> statement-breakpoint
ALTER TABLE `files` ADD `currentUploadedByUserId` text REFERENCES `user`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `files` ADD `deletedByUserId` text REFERENCES `user`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `access_log_workspace_actor_created_idx` ON `access_log` (`workspaceId`,`actorUserId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `file_stars_user_file_idx` ON `file_stars` (`userId`,`fileId`);--> statement-breakpoint
CREATE INDEX `file_stars_file_user_idx` ON `file_stars` (`fileId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_one_active_uq` ON `share_links` (`fileId`) WHERE "share_links"."revokedAt" IS NULL AND "share_links"."legacyMaxExpiresAt" IS NULL;