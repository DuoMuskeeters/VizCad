import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/f7d4380817b99e51934be568665309c2f16017e63bffac747be3b5512632a7d2.sqlite",
    },
});