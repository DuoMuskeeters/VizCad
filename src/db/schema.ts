import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
});

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
});

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
});

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
});

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
});

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
