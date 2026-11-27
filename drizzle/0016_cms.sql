CREATE TABLE `author_translations` (
	`authorId` text NOT NULL,
	`locale` text NOT NULL,
	`bio` text,
	`jobTitle` text,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`authorId`, `locale`),
	FOREIGN KEY (`authorId`) REFERENCES `author_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "author_translations_locale_check" CHECK("author_translations"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "author_translations_length_check" CHECK(("author_translations"."bio" IS NULL OR length("author_translations"."bio") <= 600) AND ("author_translations"."jobTitle" IS NULL OR length("author_translations"."jobTitle") <= 80))
);
--> statement-breakpoint
CREATE TABLE `cache_purges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`reason` text NOT NULL,
	`createdAt` integer NOT NULL,
	`notBefore` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	CONSTRAINT "cache_purges_kind_check" CHECK("cache_purges"."kind" IN ('url', 'host')),
	CONSTRAINT "cache_purges_attempts_check" CHECK("cache_purges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cache_purges_target_uq` ON `cache_purges` (`kind`,`target`,`notBefore`);--> statement-breakpoint
CREATE INDEX `cache_purges_not_before_idx` ON `cache_purges` (`notBefore`);--> statement-breakpoint
CREATE TABLE `cms_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`r2Key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`variants` text,
	`alt` text,
	`createdAt` integer NOT NULL,
	`createdByUserId` text,
	FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "cms_assets_mime_check" CHECK("cms_assets"."mime" IN ('image/webp', 'image/png', 'image/jpeg', 'image/gif', 'image/avif')),
	CONSTRAINT "cms_assets_size_check" CHECK("cms_assets"."bytes" > 0 AND "cms_assets"."width" > 0 AND "cms_assets"."height" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_assets_r2Key_unique` ON `cms_assets` (`r2Key`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_assets_sha256_unique` ON `cms_assets` (`sha256`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`company` text,
	`message` text NOT NULL,
	`locale` text NOT NULL,
	`createdAt` integer NOT NULL,
	`emailedAt` integer,
	`emailAttempts` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contact_messages_locale_check" CHECK("contact_messages"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "contact_messages_length_check" CHECK(length("contact_messages"."name") <= 80 AND ("contact_messages"."company" IS NULL OR length("contact_messages"."company") <= 120) AND length("contact_messages"."message") <= 4000),
	CONSTRAINT "contact_messages_attempts_check" CHECK("contact_messages"."emailAttempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `contact_messages_created_idx` ON `contact_messages` (`createdAt`);--> statement-breakpoint
CREATE TABLE `legal_acceptances` (
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`locale` text NOT NULL,
	`acceptedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `kind`, `version`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "legal_acceptances_locale_check" CHECK("legal_acceptances"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "legal_acceptances_kind_check" CHECK("legal_acceptances"."kind" IN ('privacy', 'terms', 'cookies', 'subprocessors', 'kvkk'))
);
--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`locale` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`contentMd` text NOT NULL,
	`contentHtml` text NOT NULL,
	`changeSummary` text,
	`effectiveAt` integer NOT NULL,
	`publishedAt` integer,
	`createdAt` integer NOT NULL,
	`createdByUserId` text,
	FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "legal_documents_locale_check" CHECK("legal_documents"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "legal_documents_kind_check" CHECK("legal_documents"."kind" IN ('privacy', 'terms', 'cookies', 'subprocessors', 'kvkk')),
	CONSTRAINT "legal_documents_version_check" CHECK("legal_documents"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_documents_kind_locale_version_uq` ON `legal_documents` (`kind`,`locale`,`version`);--> statement-breakpoint
CREATE TABLE `page_seo` (
	`pageKey` text NOT NULL,
	`locale` text NOT NULL,
	`title` text,
	`description` text,
	`ogAssetId` text,
	`draftTitle` text,
	`draftDescription` text,
	`draftOgAssetId` text,
	`live` integer DEFAULT false NOT NULL,
	`updatedAt` integer NOT NULL,
	`updatedByUserId` text,
	`publishedAt` integer,
	PRIMARY KEY(`pageKey`, `locale`),
	FOREIGN KEY (`ogAssetId`) REFERENCES `cms_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`draftOgAssetId`) REFERENCES `cms_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "page_seo_locale_check" CHECK("page_seo"."locale" IN ('en', 'tr', 'de', 'es', 'fr'))
);
--> statement-breakpoint
CREATE TABLE `post_drafts` (
	`postId` text NOT NULL,
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`contentMd` text NOT NULL,
	`metaTitle` text,
	`metaDescription` text,
	`keywords` text,
	`coverAlt` text,
	`ogAssetId` text,
	`revision` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updatedByUserId` text,
	PRIMARY KEY(`postId`, `locale`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ogAssetId`) REFERENCES `cms_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "post_drafts_locale_check" CHECK("post_drafts"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "post_drafts_revision_check" CHECK("post_drafts"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `post_slug_redirects` (
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`postId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`locale`, `slug`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_slug_redirects_locale_check" CHECK("post_slug_redirects"."locale" IN ('en', 'tr', 'de', 'es', 'fr'))
);
--> statement-breakpoint
CREATE TABLE `post_translations` (
	`postId` text NOT NULL,
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`contentMd` text NOT NULL,
	`contentHtml` text NOT NULL,
	`toc` text NOT NULL,
	`readTimeMin` integer NOT NULL,
	`metaTitle` text,
	`metaDescription` text,
	`keywords` text,
	`coverAlt` text,
	`ogAssetId` text,
	`publishedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`updatedByUserId` text,
	PRIMARY KEY(`postId`, `locale`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ogAssetId`) REFERENCES `cms_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "post_translations_locale_check" CHECK("post_translations"."locale" IN ('en', 'tr', 'de', 'es', 'fr')),
	CONSTRAINT "post_translations_title_check" CHECK(length("post_translations"."title") <= 120 AND length("post_translations"."excerpt") <= 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_translations_locale_slug_uq` ON `post_translations` (`locale`,`slug`);--> statement-breakpoint
CREATE INDEX `post_translations_locale_published_idx` ON `post_translations` (`locale`,"publishedAt" DESC);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updatedAt` integer NOT NULL,
	`updatedByUserId` text,
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_texts` (
	`key` text NOT NULL,
	`locale` text NOT NULL,
	`value` text,
	`draftValue` text,
	`updatedAt` integer NOT NULL,
	`updatedByUserId` text,
	`publishedAt` integer,
	PRIMARY KEY(`key`, `locale`),
	FOREIGN KEY (`updatedByUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_texts_locale_check" CHECK("site_texts"."locale" IN ('en', 'tr', 'de', 'es', 'fr'))
);
--> statement-breakpoint
ALTER TABLE `author_profiles` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `author_profiles` ADD `avatarAssetId` text REFERENCES cms_assets(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `author_profiles_slug_uq` ON `author_profiles` (`slug`);--> statement-breakpoint
ALTER TABLE `posts` ADD `revision` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `coverAssetId` text REFERENCES cms_assets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `updatedByUserId` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `posts_status_published_idx` ON `posts` (`status`,`publishedAt`);--> statement-breakpoint
-- docs/12 §1.4: a user who authored posts cannot be deleted (posts.authorId is ON DELETE CASCADE since legacy 0006).
-- better-auth deleteUser removes session, account, then user as separate statements without a transaction, so
-- account is guarded too: otherwise an author would lose every sign-in method and keep the user row.
CREATE TRIGGER `user_delete_guard_author`
BEFORE DELETE ON `user`
WHEN EXISTS (SELECT 1 FROM `posts` WHERE `authorId` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'author_has_posts');
END;
--> statement-breakpoint
CREATE TRIGGER `account_delete_guard_author`
BEFORE DELETE ON `account`
WHEN EXISTS (SELECT 1 FROM `posts` WHERE `authorId` = OLD.`userId`)
BEGIN
  SELECT RAISE(ABORT, 'author_has_posts');
END;
--> statement-breakpoint
-- docs/12 §1.3: a published legal version is immutable; a new text is a new version.
CREATE TRIGGER `legal_documents_published_immutable`
BEFORE UPDATE ON `legal_documents`
WHEN OLD.`publishedAt` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legal_document_published');
END;
--> statement-breakpoint
CREATE TRIGGER `legal_documents_published_undeletable`
BEFORE DELETE ON `legal_documents`
WHEN OLD.`publishedAt` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legal_document_published');
END;
