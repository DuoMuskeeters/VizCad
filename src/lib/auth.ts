import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";
import { getDb } from "@/db/client";
import { D1Database } from "@cloudflare/workers-types/experimental";

export function getAuth(d1: D1Database, env: any) {
  const db = getDb(d1);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || "http://localhost:5173",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Set to true if you want email verification
    },
    plugins: [
      reactStartCookies(), // Critical for TanStack Start cookie handling
    ],
  });
}

export type Auth = ReturnType<typeof getAuth>;
