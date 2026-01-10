import { AwsClient } from "aws4fetch";

export const getR2Client = (env: any) => {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        throw new Error("R2 credentials not configured");
    }

    return new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: "s3",
        region: "auto",
    });
};
