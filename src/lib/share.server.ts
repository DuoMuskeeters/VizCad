import { eq, and } from "drizzle-orm";
import { fileInvitations, fileShares } from "@/db/schema";
import { ulid } from "ulid";
import { logActivity } from "@/lib/activity.server";

/**
 * Converts pending file invitations to active file shares for a newly registered user.
 */
export async function convertInvitationsToShares(db: any, email: string, userId: string, request?: Request) {
    try {
        const invites = await db
            .select()
            .from(fileInvitations)
            .where(eq(fileInvitations.email, email));

        if (invites.length === 0) return;

        for (const invite of invites) {
            // Check if already shared (just in case)
            const existingShare = await db
                .select()
                .from(fileShares)
                .where(and(
                    eq(fileShares.fileId, invite.fileId),
                    eq(fileShares.sharedWithUserId, userId)
                ))
                .limit(1);

            if (existingShare.length === 0) {
                await db.insert(fileShares).values({
                    id: ulid(),
                    fileId: invite.fileId,
                    sharedByUserId: invite.invitedByUserId,
                    sharedWithUserId: userId,
                    shareType: 'user',
                    permission: invite.permission,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            // Remove the invitation
            await db.delete(fileInvitations).where(eq(fileInvitations.id, invite.id));

            // Log activity
            await logActivity({
                db,
                userId: invite.invitedByUserId, // Original sharer
                action: "file_share",
                entityId: invite.fileId,
                entityType: "file",
                details: {
                    type: "invite_accepted",
                    acceptedByEmail: email,
                    acceptedByUserId: userId
                },
                request
            });
        }
    } catch (error) {
        console.error("Failed to convert invitations to shares:", error);
    }
}
