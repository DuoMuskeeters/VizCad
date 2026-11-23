import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { surveyResponses } from "@/db/schema";
import { ulid } from "ulid";

function getDatabase() {
    const d1 = env?.vizcad_auth;
    if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
    return getDb(d1);
}

export async function logSurveyResponse(source: string) {
    const db = getDatabase();
    await db.insert(surveyResponses).values({
        id: ulid(),
        source,
        createdAt: new Date(),
    });
}
