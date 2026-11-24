CREATE TABLE `access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`actorKind` text NOT NULL,
	`actorUserId` text,
	`linkId` text,
	`targetKind` text NOT NULL,
	`targetId` text NOT NULL,
	`action` text NOT NULL,
	`outcome` text NOT NULL,
	`requestId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`reason` text,
	CONSTRAINT "access_log_actor_check" CHECK(
    ("access_log"."actorKind" = 'user' AND "access_log"."actorUserId" IS NOT NULL AND "access_log"."linkId" IS NULL)
    OR ("access_log"."actorKind" = 'link' AND "access_log"."actorUserId" IS NULL AND "access_log"."linkId" IS NOT NULL)
    OR ("access_log"."actorKind" = 'system' AND "access_log"."actorUserId" IS NULL AND "access_log"."linkId" IS NULL)),
	CONSTRAINT "access_log_outcome_check" CHECK("access_log"."outcome" IN ('allowed', 'denied'))
);
--> statement-breakpoint
CREATE INDEX `access_log_workspace_created_idx` ON `access_log` (`workspaceId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `access_log_workspace_target_created_idx` ON `access_log` (`workspaceId`,`targetKind`,`targetId`,`createdAt`,`id`);--> statement-breakpoint
CREATE TABLE `file_access` (
	`workspaceId` text NOT NULL,
	`fileId` text NOT NULL,
	`userId` text NOT NULL,
	`level` text NOT NULL,
	`expiresAt` integer,
	`grantedByUserId` text,
	`source` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`fileId`, `userId`),
	FOREIGN KEY (`grantedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspaceId`,`fileId`) REFERENCES `files`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`userId`) REFERENCES `member`(`organizationId`,`userId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "file_access_level_check" CHECK("file_access"."level" IN ('view', 'comment', 'download', 'edit')),
	CONSTRAINT "file_access_source_check" CHECK("file_access"."source" IN ('uploader', 'grant'))
);
--> statement-breakpoint
CREATE INDEX `file_access_membership_expiry_idx` ON `file_access` (`workspaceId`,`userId`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`inviterId` text NOT NULL,
	`acceptedByUserId` text,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acceptedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invitation_role_check" CHECK("invitation"."role" IN ('admin', 'member', 'commenter')),
	CONSTRAINT "invitation_status_check" CHECK("invitation"."status" IN ('pending', 'accepted', 'rejected', 'canceled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_pending_organization_email_uq` ON `invitation` (`organizationId`,`email`) WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `invitation_email_status_expiry_idx` ON `invitation` (`email`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `invitation_organization_status_expiry_idx` ON `invitation` (`organizationId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `legacy_access_migration` (
	`sourceTable` text NOT NULL,
	`sourceId` text NOT NULL,
	`outcome` text NOT NULL,
	`targetId` text,
	`reason` text,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`sourceTable`, `sourceId`),
	CONSTRAINT "legacy_access_migration_source_check" CHECK("legacy_access_migration"."sourceTable" IN ('file_shares', 'file_invitations')),
	CONSTRAINT "legacy_access_migration_outcome_check" CHECK("legacy_access_migration"."outcome" IN ('mapped', 'ineligible', 'quarantined')),
	CONSTRAINT "legacy_access_migration_target_check" CHECK("legacy_access_migration"."outcome" <> 'mapped' OR "legacy_access_migration"."targetId" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `legacy_access_migration_source_outcome_idx` ON `legacy_access_migration` (`sourceTable`,`outcome`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "member_role_check" CHECK("member"."role" IN ('owner', 'admin', 'member', 'commenter', 'guest'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_user_uq` ON `member` (`organizationId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_single_owner_uq` ON `member` (`organizationId`) WHERE "member"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `member_user_organization_idx` ON `member` (`userId`,`organizationId`);--> statement-breakpoint
CREATE INDEX `member_organization_role_idx` ON `member` (`organizationId`,`role`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`createdAt` integer NOT NULL,
	`metadata` text,
	`kind` text NOT NULL,
	`personalOwnerUserId` text,
	`archivedAt` integer,
	`onboardingCompletedAt` integer,
	FOREIGN KEY (`personalOwnerUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "organization_kind_check" CHECK("organization"."kind" IN ('personal', 'company')),
	CONSTRAINT "organization_personal_owner_check" CHECK(("organization"."kind" = 'personal') = ("organization"."personalOwnerUserId" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_personalOwnerUserId_unique` ON `organization` (`personalOwnerUserId`);--> statement-breakpoint
CREATE TABLE `project_access` (
	`workspaceId` text NOT NULL,
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`level` text NOT NULL,
	`expiresAt` integer,
	`grantedByUserId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`projectId`, `userId`),
	FOREIGN KEY (`grantedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`userId`) REFERENCES `member`(`organizationId`,`userId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_access_level_check" CHECK("project_access"."level" IN ('view', 'comment', 'download', 'edit'))
);
--> statement-breakpoint
CREATE INDEX `project_access_membership_expiry_idx` ON `project_access` (`workspaceId`,`userId`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`accessMode` text DEFAULT 'team' NOT NULL,
	`createdByUserId` text NOT NULL,
	`creatorManagerUserId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`archivedAt` integer,
	FOREIGN KEY (`workspaceId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`creatorManagerUserId`) REFERENCES `member`(`organizationId`,`userId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "projects_mode_check" CHECK("projects"."accessMode" IN ('team', 'restricted')),
	CONSTRAINT "projects_manager_check" CHECK("projects"."creatorManagerUserId" = "projects"."createdByUserId"),
	CONSTRAINT "projects_name_check" CHECK(length(trim("projects"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_workspace_id_uq` ON `projects` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `projects_workspace_archive_name_idx` ON `projects` (`workspaceId`,`archivedAt`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `resource_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`projectId` text,
	`fileId` text,
	`email` text NOT NULL,
	`level` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`accessExpiresAt` integer NOT NULL,
	`status` text NOT NULL,
	`tokenDigest` text NOT NULL,
	`inviterId` text NOT NULL,
	`acceptedByUserId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`acceptedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`projectId`) REFERENCES `projects`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspaceId`,`fileId`) REFERENCES `files`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "resource_invitations_target_check" CHECK(("resource_invitations"."projectId" IS NULL) <> ("resource_invitations"."fileId" IS NULL)),
	CONSTRAINT "resource_invitations_expiry_check" CHECK("resource_invitations"."accessExpiresAt" > "resource_invitations"."expiresAt"),
	CONSTRAINT "resource_invitations_level_check" CHECK("resource_invitations"."level" IN ('view', 'comment', 'download')),
	CONSTRAINT "resource_invitations_status_check" CHECK("resource_invitations"."status" IN ('pending', 'accepted', 'rejected', 'canceled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_invitations_tokenDigest_unique` ON `resource_invitations` (`tokenDigest`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_invitations_pending_project_email_uq` ON `resource_invitations` (`projectId`,`email`) WHERE "resource_invitations"."status" = 'pending' AND "resource_invitations"."projectId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `resource_invitations_pending_file_email_uq` ON `resource_invitations` (`fileId`,`email`) WHERE "resource_invitations"."status" = 'pending' AND "resource_invitations"."fileId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `resource_invitations_workspace_status_expiry_idx` ON `resource_invitations` (`workspaceId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`fileId` text NOT NULL,
	`createdByUserId` text,
	`tokenDigest` text NOT NULL,
	`tokenCiphertext` text NOT NULL,
	`tokenKeyVersion` integer NOT NULL,
	`publicSharerLabel` text,
	`level` text NOT NULL,
	`passwordHash` text,
	`expiresAt` integer,
	`legacyMaxExpiresAt` integer,
	`revokedAt` integer,
	`revision` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspaceId`,`fileId`) REFERENCES `files`(`workspaceId`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "share_links_level_check" CHECK("share_links"."level" IN ('view', 'download')),
	CONSTRAINT "share_links_revision_check" CHECK("share_links"."revision" >= 1),
	CONSTRAINT "share_links_legacy_expiry_check" CHECK("share_links"."legacyMaxExpiresAt" IS NULL
    OR ("share_links"."expiresAt" IS NOT NULL AND "share_links"."expiresAt" <= "share_links"."legacyMaxExpiresAt"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_tokenDigest_unique` ON `share_links` (`tokenDigest`);--> statement-breakpoint
CREATE INDEX `share_links_workspace_file_revoked_idx` ON `share_links` (`workspaceId`,`fileId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `share_links_workspace_creator_revoked_idx` ON `share_links` (`workspaceId`,`createdByUserId`,`revokedAt`);--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `workspaceId` text REFERENCES `organization`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `projectId` text REFERENCES `projects`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
CREATE UNIQUE INDEX `files_workspace_id_uq` ON `files` (`workspaceId`,`id`);--> statement-breakpoint
CREATE INDEX `files_workspace_deleted_updated_idx` ON `files` (`workspaceId`,`isDeleted`,`updatedAt`,`id`);--> statement-breakpoint
CREATE INDEX `files_workspace_project_deleted_updated_idx` ON `files` (`workspaceId`,`projectId`,`isDeleted`,`updatedAt`,`id`);--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `activeOrganizationId` text REFERENCES `organization`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `session_active_organization_idx` ON `session` (`activeOrganizationId`);
--> statement-breakpoint
CREATE TRIGGER `organization_identity_immutable`
BEFORE UPDATE OF `kind`, `personalOwnerUserId` ON `organization`
WHEN NEW.kind IS NOT OLD.kind OR NEW.personalOwnerUserId IS NOT OLD.personalOwnerUserId
BEGIN
  SELECT RAISE(ABORT, 'Workspace kind and personal owner are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `projects_workspace_immutable`
BEFORE UPDATE OF `workspaceId` ON `projects`
WHEN NEW.workspaceId IS NOT OLD.workspaceId
BEGIN
  SELECT RAISE(ABORT, 'Project workspace is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `files_project_workspace_insert`
BEFORE INSERT ON `files`
WHEN NEW.projectId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `projects` WHERE id = NEW.projectId AND workspaceId = NEW.workspaceId
)
BEGIN
  SELECT RAISE(ABORT, 'File project must belong to its workspace');
END;
--> statement-breakpoint
CREATE TRIGGER `files_project_workspace_update`
BEFORE UPDATE OF `projectId`, `workspaceId` ON `files`
WHEN NEW.projectId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `projects` WHERE id = NEW.projectId AND workspaceId = NEW.workspaceId
)
BEGIN
  SELECT RAISE(ABORT, 'File project must belong to its workspace');
END;
--> statement-breakpoint
CREATE TRIGGER `share_links_legacy_ceiling_immutable`
BEFORE UPDATE OF `legacyMaxExpiresAt` ON `share_links`
WHEN NEW.legacyMaxExpiresAt IS NOT OLD.legacyMaxExpiresAt
BEGIN
  SELECT RAISE(ABORT, 'Legacy link expiry ceiling is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `file_access_guest_expiry_insert`
BEFORE INSERT ON `file_access`
WHEN NEW.expiresAt IS NULL AND EXISTS (
  SELECT 1 FROM `member` WHERE organizationId = NEW.workspaceId AND userId = NEW.userId AND role = 'guest'
)
BEGIN
  SELECT RAISE(ABORT, 'guest access requires expiresAt');
END;
--> statement-breakpoint
CREATE TRIGGER `file_access_guest_expiry_update`
BEFORE UPDATE ON `file_access`
WHEN NEW.expiresAt IS NULL AND EXISTS (
  SELECT 1 FROM `member` WHERE organizationId = NEW.workspaceId AND userId = NEW.userId AND role = 'guest'
)
BEGIN
  SELECT RAISE(ABORT, 'guest access requires expiresAt');
END;
--> statement-breakpoint
CREATE TRIGGER `project_access_guest_expiry_insert`
BEFORE INSERT ON `project_access`
WHEN NEW.expiresAt IS NULL AND EXISTS (
  SELECT 1 FROM `member` WHERE organizationId = NEW.workspaceId AND userId = NEW.userId AND role = 'guest'
)
BEGIN
  SELECT RAISE(ABORT, 'guest access requires expiresAt');
END;
--> statement-breakpoint
CREATE TRIGGER `project_access_guest_expiry_update`
BEFORE UPDATE ON `project_access`
WHEN NEW.expiresAt IS NULL AND EXISTS (
  SELECT 1 FROM `member` WHERE organizationId = NEW.workspaceId AND userId = NEW.userId AND role = 'guest'
)
BEGIN
  SELECT RAISE(ABORT, 'guest access requires expiresAt');
END;
