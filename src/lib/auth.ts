import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { reactStartCookies } from "better-auth/react-start";
import { admin } from "better-auth/plugins";
import { getDb } from "@/db/client";

export function getAuth(d1: D1Database, env: Cloudflare.Env, requestUrl?: string) {
  const db = getDb(d1);

  // Derive baseURL from request or env
  let baseURL = env.BETTER_AUTH_URL;
  if (!baseURL && requestUrl) {
    const url = new URL(requestUrl);
    baseURL = `${url.protocol}//${url.host}`;
  }
  baseURL = baseURL || "http://localhost:5173";

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Set to true if you want email verification
    },
    plugins: [
      reactStartCookies(), // Critical for TanStack Start cookie handling
      admin(), // Admin plugin for user management
    ],
  });
}

export type Auth = ReturnType<typeof getAuth>;
