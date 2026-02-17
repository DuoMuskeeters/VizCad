import { type D1Database } from "@cloudflare/workers-types";
import { getDb } from "@/db/client";
import { activityLogs } from "@/db/schema";
import { ulid } from "ulid";

export type ActivityAction =
    | "login"
    | "signup"
    | "file_upload"
    | "file_view"
    | "file_edit"
    | "file_delete"
    | "file_download"
    | "file_share"
    | "file_rename"
    | "file_version"
    | "file_star"
    | "file_comment";

interface LogActivityParams {
    db: any; // Type as needed, usually ReturnType<typeof getDb>
    userId: string;
    action: ActivityAction;
    entityId?: string;
    entityType?: "file" | "user" | "comment" | "system";
    details?: any;
    request?: Request;
}

export async function logActivity({
    db,
    userId,
    action,
    entityId,
    entityType,
    details,
    request
}: LogActivityParams) {
    try {
        let ipAddress: string | undefined;
        let userAgent: string | undefined;

        if (request) {
            ipAddress = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || undefined;
            userAgent = request.headers.get("User-Agent") || undefined;
        }

        await db.insert(activityLogs).values({
            id: ulid(),
            userId,
            action,
            entityId,
            entityType,
            details: details ? JSON.stringify(details) : undefined,
            ipAddress,
            userAgent,
            createdAt: new Date(),
        });
    } catch (error) {
        // Logging should not block the main action, just log the error
        console.error("Failed to log activity:", error);
    }
}
