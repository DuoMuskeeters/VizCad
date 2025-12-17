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
