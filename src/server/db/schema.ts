import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const workspaceKinds = ["personal", "company"] as const;
const memberRoles = ["owner", "admin", "member", "commenter", "guest"] as const;
const invitationRoles = ["admin", "member", "commenter"] as const;
const invitationStatuses = ["pending", "accepted", "rejected", "canceled"] as const;
const projectModes = ["team", "restricted"] as const;
const guestLevels = ["view", "comment", "download"] as const;
const accessLevels = [...guestLevels, "edit"] as const;
const linkLevels = ["view", "download"] as const;
const fileAccessSources = ["uploader", "grant"] as const;
const actorKinds = ["user", "link", "system"] as const;
const accessOutcomes = ["allowed", "denied"] as const;
const migrationSources = ["file_shares", "file_invitations"] as const;
const migrationOutcomes = ["mapped", "ineligible", "quarantined"] as const;
const uploadStatuses = ["pending", "completed", "expired", "rejected"] as const;
export const storageDeletionReasons = ["upload_rejected", "upload_expired", "upload_canceled", "purged", "trash_retention"] as const;
export const securityEvents = ["sign_in_succeeded", "sign_in_failed", "password_reset_requested", "link_opened", "link_password_failed", "file_downloaded"] as const;

const sqlValues = (values: readonly string[]) => sql.join(values.map((value) => sql.raw(`'${value}'`)), sql`, `);

// Better Auth requires these core tables

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  // Admin plugin fields
  role: text("role").default("user"), // user, admin
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("banReason"),
  banExpires: integer("banExpires", { mode: "timestamp" }),
  // New field for user storage quota in GB
  storageQuotaGb: integer("storageQuotaGb").default(5).notNull(), // Default 5GB
});

// Better Auth organization plugin tables with VizCad constraints.
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  metadata: text("metadata"),
  kind: text("kind", { enum: workspaceKinds }).notNull(),
  personalOwnerUserId: text("personalOwnerUserId").unique().references(() => user.id, { onDelete: "restrict" }),
  archivedAt: integer("archivedAt", { mode: "timestamp" }),
  onboardingCompletedAt: integer("onboardingCompletedAt", { mode: "timestamp" }),
}, (t) => [
  check("organization_kind_check", sql`${t.kind} IN (${sqlValues(workspaceKinds)})`),
  check("organization_personal_owner_check", sql`(${t.kind} = 'personal') = (${t.personalOwnerUserId} IS NOT NULL)`),
]);

export const member = sqliteTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "restrict" }),
  role: text("role", { enum: memberRoles }).default("member").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("member_organization_user_uq").on(t.organizationId, t.userId),
  uniqueIndex("member_single_owner_uq").on(t.organizationId).where(sql`${t.role} = 'owner'`),
  index("member_user_organization_idx").on(t.userId, t.organizationId),
  index("member_organization_role_idx").on(t.organizationId, t.role),
  check("member_role_check", sql`${t.role} IN (${sqlValues(memberRoles)})`),
]);

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
  email: text("email").notNull(),
  role: text("role", { enum: invitationRoles }).notNull(),
  status: text("status", { enum: invitationStatuses }).default("pending").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  inviterId: text("inviterId").notNull().references(() => user.id, { onDelete: "restrict" }),
  acceptedByUserId: text("acceptedByUserId").references(() => user.id, { onDelete: "restrict" }),
}, (t) => [
  uniqueIndex("invitation_pending_organization_email_uq").on(t.organizationId, t.email).where(sql`${t.status} = 'pending'`),
  index("invitation_email_status_expiry_idx").on(t.email, t.status, t.expiresAt),
  index("invitation_organization_status_expiry_idx").on(t.organizationId, t.status, t.expiresAt),
  check("invitation_role_check", sql`${t.role} IN (${sqlValues(invitationRoles)})`),
  check("invitation_status_check", sql`${t.status} IN (${sqlValues(invitationStatuses)})`),
]);

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("activeOrganizationId").references(() => organization.id, { onDelete: "set null" }),
}, (t) => [
  index("session_active_organization_idx").on(t.activeOrganizationId),
]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspaceId").notNull().references(() => organization.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  accessMode: text("accessMode", { enum: projectModes }).default("team").notNull(),
  createdByUserId: text("createdByUserId").notNull().references(() => user.id, { onDelete: "restrict" }),
  creatorManagerUserId: text("creatorManagerUserId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  archivedAt: integer("archivedAt", { mode: "timestamp" }),
}, (t) => [
  uniqueIndex("projects_workspace_id_uq").on(t.workspaceId, t.id),
  index("projects_workspace_archive_name_idx").on(t.workspaceId, t.archivedAt, t.name, t.id),
  foreignKey({
    name: "projects_creator_membership_fk",
    columns: [t.workspaceId, t.creatorManagerUserId],
    foreignColumns: [member.organizationId, member.userId],
  }).onDelete("restrict"),
  check("projects_mode_check", sql`${t.accessMode} IN (${sqlValues(projectModes)})`),
  check("projects_manager_check", sql`${t.creatorManagerUserId} = ${t.createdByUserId}`),
  check("projects_name_check", sql`length(trim(${t.name})) > 0`),
]);

// Files table for CAD file metadata
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  r2Key: text("r2Key").notNull().unique(), // Unique key in R2 bucket
  size: integer("size").notNull(), // File size in bytes
  mimeType: text("mimeType").notNull(), // MIME type of the file
  extension: text("extension").notNull(), // File extension
  status: text("status", { enum: ['pending', 'uploaded', 'failed'] }).default('pending').notNull(), // Upload status
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }), // Foreign key to user table
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  // Soft delete for trash functionality
  isDeleted: integer("isDeleted", { mode: "boolean" }).default(false).notNull(),
  deletedAt: integer("deletedAt", { mode: "timestamp" }),
  thumbnailR2Key: text("thumbnailR2Key"),
  workspaceId: text("workspaceId").references(() => organization.id, { onDelete: "restrict" }),
  projectId: text("projectId").references(() => projects.id, { onDelete: "restrict" }),
  // 0014 (docs/09 §1.4): all nullable, legacy never writes them. NULL contentEtag: legacy object, the ETag comparison is skipped.
  // NULL currentVersionNumber: COUNT(file_versions) + 1. NULL currentUploadedByUserId: userId. NULL deletedByUserId: unknown.
  contentEtag: text("contentEtag"),
  currentVersionNumber: integer("currentVersionNumber"),
  currentUploadedByUserId: text("currentUploadedByUserId").references(() => user.id, { onDelete: "set null" }),
  deletedByUserId: text("deletedByUserId").references(() => user.id, { onDelete: "set null" }),
}, (t) => [
  uniqueIndex("files_workspace_id_uq").on(t.workspaceId, t.id),
  index("files_workspace_deleted_updated_idx").on(t.workspaceId, t.isDeleted, t.updatedAt, t.id),
  index("files_workspace_project_deleted_updated_idx").on(t.workspaceId, t.projectId, t.isDeleted, t.updatedAt, t.id),
]);

// ============================================
// COLLABORATION TABLES
// ============================================

// Starred files - users can star files for quick access
export const fileStars = sqliteTable("file_stars", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  // Not unique: legacy may hold duplicate stars; UNIQUE comes with the cutover dedup (docs/09 §1.5).
  index("file_stars_user_file_idx").on(t.userId, t.fileId),
  index("file_stars_file_user_idx").on(t.fileId, t.userId),
]);

// File activities - track user interactions for "Recent Files"
export const fileActivities = sqliteTable("file_activities", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  action: text("action", { enum: ['viewed', 'edited', 'downloaded', 'shared'] }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

// File shares - both link-based and user-based sharing
export const fileShares = sqliteTable("file_shares", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  sharedByUserId: text("sharedByUserId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sharedWithUserId: text("sharedWithUserId")
    .references(() => user.id, { onDelete: "cascade" }), // null for link shares
  shareType: text("shareType", { enum: ['link', 'user'] }).notNull(),
  permission: text("permission", { enum: ['view', 'edit', 'admin'] }).default('view').notNull(),
  shareToken: text("shareToken").unique(), // Unique token for link sharing
  password: text("password"), // Optional password protection
  expiresAt: integer("expiresAt", { mode: "timestamp" }), // Optional expiry date
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

// File invitations - pending invites for users without an account
export const fileInvitations = sqliteTable("file_invitations", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  invitedByUserId: text("invitedByUserId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  permission: text("permission", { enum: ['view', 'edit', 'admin'] }).default('view').notNull(),
  token: text("token").notNull().unique(), // Unique token for signup redirection
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type FileInvitation = typeof fileInvitations.$inferSelect;
export type NewFileInvitation = typeof fileInvitations.$inferInsert;

// File versions - track version history
export const fileVersions = sqliteTable("file_versions", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  versionNumber: integer("versionNumber").notNull(),
  r2Key: text("r2Key").notNull(), // R2 key for this version
  size: integer("size").notNull(), // Version file size
  changeNote: text("changeNote"), // Optional description of changes
  uploadedByUserId: text("uploadedByUserId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  // 0014: NULL means a legacy snapshot (no ETag check, no thumbnail).
  contentEtag: text("contentEtag"),
  thumbnailR2Key: text("thumbnailR2Key"),
}, (t) => [
  // Not unique: legacy races produced duplicate (fileId, versionNumber) rows.
  index("file_versions_file_version_idx").on(t.fileId, t.versionNumber),
]);

// File comments - discussion on files
export const fileComments = sqliteTable("file_comments", {
  id: text("id").primaryKey(),
  fileId: text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  parentId: text("parentId"), // For reply threads, references fileComments.id
  content: text("content").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  // 0014. NULL scope: cannot be proven, closed to guests (docs/08 §4). The migration SQL adds
  // CHECK (authorScopeAtWrite IN ('internal', 'guest')); drizzle cannot express a column check on an existing table.
  authorScopeAtWrite: text("authorScopeAtWrite", { enum: ["internal", "guest"] }),
  versionNumber: integer("versionNumber"),
  deletedAt: integer("deletedAt", { mode: "timestamp" }),
}, (t) => [
  index("file_comments_file_created_idx").on(t.fileId, t.createdAt, t.id),
]);

// ============================================
// BLOG TABLES
// ============================================

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(), // UUID
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(), // Markdown/MDX content
  coverImage: text("coverImage"),

  // SEO Fields
  metaTitle: text("metaTitle"),
  metaDescription: text("metaDescription"),
  keywords: text("keywords", { mode: "json" }).$type<string[]>(), // Array of strings

  // Structure & Metadata
  tableOfContents: integer("tableOfContents", { mode: "boolean" }).default(true).notNull(),
  publishedAt: integer("publishedAt", { mode: "timestamp" }),
  status: text("status", { enum: ['draft', 'published', 'archived'] }).default('draft').notNull(),
  category: text("category").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>(), // Array of strings
  readTime: integer("readTime").notNull(), // In minutes
  featured: integer("featured", { mode: "boolean" }).default(false).notNull(),
  views: integer("views").default(0).notNull(),

  authorId: text("authorId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export type BlogPost = typeof posts.$inferSelect;
export type NewBlogPost = typeof posts.$inferInsert;

// Author profiles - for richer blog author metadata
export const authorProfiles = sqliteTable("author_profiles", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Display name for the author
  bio: text("bio"), // Short biography
  role: text("role"), // e.g. "Senior Engineer", "Editor"
  avatarUrl: text("avatarUrl"), // Custom avatar URL
  socialLinks: text("socialLinks", { mode: "json" }).$type<Record<string, string>>(), // JSON object for social links
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export type AuthorProfile = typeof authorProfiles.$inferSelect;
export type NewAuthorProfile = typeof authorProfiles.$inferInsert;

export type BlogPostWithAuthor = BlogPost & {
  author: AuthorProfile | null;
};

// ============================================
// SURVEY TABLES
// ============================================

export const surveyResponses = sqliteTable("survey_responses", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // "Google Search", "Social Media", etc. or "dismissed"
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});


export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type NewSurveyResponse = typeof surveyResponses.$inferInsert;

// ============================================
// ACTIVITY LOGGING
// ============================================

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g. "file_upload", "login", "signup"
  entityId: text("entityId"), // ID of the affected entity (fileId, etc.)
  entityType: text("entityType"), // "file", "user", "comment"
  details: text("details", { mode: "json" }).$type<string>(), // JSON string metadata
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export const projectAccess = sqliteTable("project_access", {
  workspaceId: text("workspaceId").notNull(),
  projectId: text("projectId").notNull(),
  userId: text("userId").notNull(),
  level: text("level", { enum: accessLevels }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  grantedByUserId: text("grantedByUserId").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.userId] }),
  index("project_access_membership_expiry_idx").on(t.workspaceId, t.userId, t.expiresAt),
  foreignKey({
    name: "project_access_project_fk",
    columns: [t.workspaceId, t.projectId],
    foreignColumns: [projects.workspaceId, projects.id],
  }).onDelete("restrict"),
  foreignKey({
    name: "project_access_membership_fk",
    columns: [t.workspaceId, t.userId],
    foreignColumns: [member.organizationId, member.userId],
  }).onDelete("cascade"),
  check("project_access_level_check", sql`${t.level} IN (${sqlValues(accessLevels)})`),
]);

export const fileAccess = sqliteTable("file_access", {
  workspaceId: text("workspaceId").notNull(),
  fileId: text("fileId").notNull(),
  userId: text("userId").notNull(),
  level: text("level", { enum: accessLevels }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  grantedByUserId: text("grantedByUserId").references(() => user.id, { onDelete: "set null" }),
  source: text("source", { enum: fileAccessSources }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.fileId, t.userId] }),
  index("file_access_membership_expiry_idx").on(t.workspaceId, t.userId, t.expiresAt),
  foreignKey({
    name: "file_access_file_fk",
    columns: [t.workspaceId, t.fileId],
    foreignColumns: [files.workspaceId, files.id],
  }).onDelete("restrict"),
  foreignKey({
    name: "file_access_membership_fk",
    columns: [t.workspaceId, t.userId],
    foreignColumns: [member.organizationId, member.userId],
  }).onDelete("cascade"),
  check("file_access_level_check", sql`${t.level} IN (${sqlValues(accessLevels)})`),
  check("file_access_source_check", sql`${t.source} IN (${sqlValues(fileAccessSources)})`),
]);

export const resourceInvitations = sqliteTable("resource_invitations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspaceId").notNull(),
  projectId: text("projectId"),
  fileId: text("fileId"),
  email: text("email").notNull(),
  level: text("level", { enum: guestLevels }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  accessExpiresAt: integer("accessExpiresAt", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: invitationStatuses }).notNull(),
  tokenDigest: text("tokenDigest").notNull().unique(),
  inviterId: text("inviterId").notNull().references(() => user.id, { onDelete: "restrict" }),
  acceptedByUserId: text("acceptedByUserId").references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("resource_invitations_pending_project_email_uq").on(t.projectId, t.email)
    .where(sql`${t.status} = 'pending' AND ${t.projectId} IS NOT NULL`),
  uniqueIndex("resource_invitations_pending_file_email_uq").on(t.fileId, t.email)
    .where(sql`${t.status} = 'pending' AND ${t.fileId} IS NOT NULL`),
  index("resource_invitations_workspace_status_expiry_idx").on(t.workspaceId, t.status, t.expiresAt),
  foreignKey({
    name: "resource_invitations_project_fk",
    columns: [t.workspaceId, t.projectId],
    foreignColumns: [projects.workspaceId, projects.id],
  }).onDelete("restrict"),
  foreignKey({
    name: "resource_invitations_file_fk",
    columns: [t.workspaceId, t.fileId],
    foreignColumns: [files.workspaceId, files.id],
  }).onDelete("restrict"),
  check("resource_invitations_target_check", sql`(${t.projectId} IS NULL) <> (${t.fileId} IS NULL)`),
  check("resource_invitations_expiry_check", sql`${t.accessExpiresAt} > ${t.expiresAt}`),
  check("resource_invitations_level_check", sql`${t.level} IN (${sqlValues(guestLevels)})`),
  check("resource_invitations_status_check", sql`${t.status} IN (${sqlValues(invitationStatuses)})`),
]);

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  workspaceId: text("workspaceId").notNull(),
  fileId: text("fileId").notNull(),
  createdByUserId: text("createdByUserId").references(() => user.id, { onDelete: "set null" }),
  tokenDigest: text("tokenDigest").notNull().unique(),
  tokenCiphertext: text("tokenCiphertext").notNull(),
  tokenKeyVersion: integer("tokenKeyVersion").notNull(),
  publicSharerLabel: text("publicSharerLabel"),
  level: text("level", { enum: linkLevels }).notNull(),
  passwordHash: text("passwordHash"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  legacyMaxExpiresAt: integer("legacyMaxExpiresAt", { mode: "timestamp" }),
  revokedAt: integer("revokedAt", { mode: "timestamp" }),
  revision: integer("revision").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("share_links_workspace_file_revoked_idx").on(t.workspaceId, t.fileId, t.revokedAt),
  index("share_links_workspace_creator_revoked_idx").on(t.workspaceId, t.createdByUserId, t.revokedAt),
  // One active new link per file (docs/09 §4.1); links mapped from legacy (legacyMaxExpiresAt set) are outside the rule.
  uniqueIndex("share_links_one_active_uq").on(t.fileId).where(sql`${t.revokedAt} IS NULL AND ${t.legacyMaxExpiresAt} IS NULL`),
  foreignKey({
    name: "share_links_file_fk",
    columns: [t.workspaceId, t.fileId],
    foreignColumns: [files.workspaceId, files.id],
  }).onDelete("restrict"),
  check("share_links_level_check", sql`${t.level} IN (${sqlValues(linkLevels)})`),
  check("share_links_revision_check", sql`${t.revision} >= 1`),
  check("share_links_legacy_expiry_check", sql`${t.legacyMaxExpiresAt} IS NULL
    OR (${t.expiresAt} IS NOT NULL AND ${t.expiresAt} <= ${t.legacyMaxExpiresAt})`),
]);

// Audit references are snapshots so deletion of the actor or target preserves the event.
export const accessLog = sqliteTable("access_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspaceId").notNull(),
  actorKind: text("actorKind", { enum: actorKinds }).notNull(),
  actorUserId: text("actorUserId"),
  linkId: text("linkId"),
  targetKind: text("targetKind").notNull(),
  targetId: text("targetId").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome", { enum: accessOutcomes }).notNull(),
  requestId: text("requestId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  reason: text("reason"),
}, (t) => [
  index("access_log_workspace_created_idx").on(t.workspaceId, t.createdAt, t.id),
  index("access_log_workspace_target_created_idx").on(t.workspaceId, t.targetKind, t.targetId, t.createdAt, t.id),
  index("access_log_workspace_actor_created_idx").on(t.workspaceId, t.actorUserId, t.createdAt, t.id),
  check("access_log_actor_check", sql`
    (${t.actorKind} = 'user' AND ${t.actorUserId} IS NOT NULL AND ${t.linkId} IS NULL)
    OR (${t.actorKind} = 'link' AND ${t.actorUserId} IS NULL AND ${t.linkId} IS NOT NULL)
    OR (${t.actorKind} = 'system' AND ${t.actorUserId} IS NULL AND ${t.linkId} IS NULL)`),
  check("access_log_outcome_check", sql`${t.outcome} IN (${sqlValues(accessOutcomes)})`),
]);

export const legacyAccessMigration = sqliteTable("legacy_access_migration", {
  sourceTable: text("sourceTable", { enum: migrationSources }).notNull(),
  sourceId: text("sourceId").notNull(),
  outcome: text("outcome", { enum: migrationOutcomes }).notNull(),
  targetId: text("targetId"),
  reason: text("reason"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.sourceTable, t.sourceId] }),
  index("legacy_access_migration_source_outcome_idx").on(t.sourceTable, t.outcome),
  check("legacy_access_migration_source_check", sql`${t.sourceTable} IN (${sqlValues(migrationSources)})`),
  check("legacy_access_migration_outcome_check", sql`${t.outcome} IN (${sqlValues(migrationOutcomes)})`),
  check("legacy_access_migration_target_check", sql`${t.outcome} <> 'mapped' OR ${t.targetId} IS NOT NULL`),
]);

/**
 * Write guard for D1 batches (no interactive transactions). A program appends
 * `INSERT INTO batch_guard (ok) SELECT CASE WHEN <precondition> THEN 1 ELSE 0 END` to its batch; a false
 * precondition fails the CHECK and rolls the whole batch back. A trigger deletes every row right after it
 * is inserted, so the table stays empty.
 */
export const batchGuard = sqliteTable("batch_guard", {
  ok: integer("ok").notNull(),
}, (t) => [
  check("batch_guard_failed", sql`${t.ok} = 1`),
]);

/**
 * Browser uploads in flight (docs/09 §2.5). The R2 key is minted here on the server and never comes from the client.
 * `fileId` and `targetFileId` are snapshots without a foreign key, so purging a file never waits on its sessions;
 * the workspace, user and project keys are RESTRICT.
 */
export const uploadSessions = sqliteTable("upload_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspaceId").notNull().references(() => organization.id, { onDelete: "restrict" }),
  projectId: text("projectId"),
  /** The file this object belongs to: a fresh id for a new file, the target file for a new version. */
  fileId: text("fileId").notNull(),
  /** Set only for a new version of an existing file. */
  targetFileId: text("targetFileId"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "restrict" }),
  r2Key: text("r2Key").notNull(),
  objectId: text("objectId").notNull(),
  name: text("name").notNull(),
  extension: text("extension").notNull(),
  declaredSize: integer("declaredSize").notNull(),
  status: text("status", { enum: uploadStatuses }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  completedAt: integer("completedAt", { mode: "timestamp" }),
}, (t) => [
  uniqueIndex("upload_sessions_r2_key_uq").on(t.r2Key),
  index("upload_sessions_user_status_idx").on(t.userId, t.status),
  index("upload_sessions_status_expiry_idx").on(t.status, t.expiresAt),
  index("upload_sessions_workspace_status_idx").on(t.workspaceId, t.status, t.expiresAt),
  foreignKey({
    name: "upload_sessions_project_fk",
    columns: [t.workspaceId, t.projectId],
    foreignColumns: [projects.workspaceId, projects.id],
  }).onDelete("restrict"),
  check("upload_sessions_status_check", sql`${t.status} IN (${sqlValues(uploadStatuses)})`),
  check("upload_sessions_size_check", sql`${t.declaredSize} > 0`),
  check("upload_sessions_completed_check", sql`(${t.status} = 'completed') = (${t.completedAt} IS NOT NULL)`),
  check("upload_sessions_target_check", sql`${t.targetFileId} IS NULL OR ${t.targetFileId} = ${t.fileId}`),
]);

/**
 * R2 keys waiting to be deleted (docs/09 §5.3). The row is written in the same D1 batch that drops the last
 * reference, so the order is always D1 first, R2 second; the worker never deletes a key D1 still references.
 */
export const storageDeletions = sqliteTable("storage_deletions", {
  key: text("key").primaryKey(),
  reason: text("reason", { enum: storageDeletionReasons }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("lastError"),
  notBefore: integer("notBefore", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("storage_deletions_not_before_idx").on(t.notBefore),
  check("storage_deletions_reason_check", sql`${t.reason} IN (${sqlValues(storageDeletionReasons)})`),
  check("storage_deletions_attempts_check", sql`${t.attempts} >= 0`),
]);

/**
 * Security log (docs/09 §7.2a, D21): the only table with IP and user agent. No foreign keys (snapshots), no workspace
 * endpoint reads it; platform admins only. Rows are deleted after 90 days by the daily cron.
 */
export const securityLog = sqliteTable("security_log", {
  id: text("id").primaryKey(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  event: text("event", { enum: securityEvents }).notNull(),
  userId: text("userId"),
  workspaceId: text("workspaceId"),
  targetId: text("targetId"),
  ip: text("ip"),
  userAgent: text("userAgent"),
  requestId: text("requestId").notNull(),
}, (t) => [
  index("security_log_created_idx").on(t.createdAt),
  index("security_log_event_created_idx").on(t.event, t.createdAt),
  check("security_log_event_check", sql`${t.event} IN (${sqlValues(securityEvents)})`),
  check("security_log_user_agent_check", sql`${t.userAgent} IS NULL OR length(${t.userAgent}) <= 256`),
]);
