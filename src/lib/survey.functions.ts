import { createServerFn } from "@tanstack/react-start";
import { logSurveyResponse } from "./survey.server";

export const submitSurveyResponse = createServerFn({ method: "POST" })
    .inputValidator((data: { source: string }) => data)
    .handler(async ({ data }) => {
        await logSurveyResponse(data.source);
        return { success: true };
    });
