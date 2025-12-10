import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { getDb } from "@/db/client";
import { Resend } from "resend";

export function getAuth(d1: D1Database, env: Cloudflare.Env, requestUrl?: string) {
  const db = getDb(d1);
  const resend = new Resend(env.RESEND_API_KEY);

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
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        try {
          const result = await resend.emails.send({
            from: "VizCad <noreply@viz-cad.com>",
            to: user.email,
            subject: "Verify your VizCad account",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #0891b2;">Welcome to VizCad!</h1>
                <p>Hi ${user.name},</p>
                <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
                <a href="${url}" style="display: inline-block; background-color: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
                  Verify Email
                </a>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link: ${url}</p>
                <p style="color: #666; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
              </div>
            `,
          });
        } catch (error) {
          throw error;
        }
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      callbackURL: "/dashboard",
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPasswordEmail: async ({ user, url }: { user: any; url: string }) => {
        try {
          const result = await resend.emails.send({
            from: "VizCad <noreply@viz-cad.com>",
            to: user.email,
            subject: "Reset your VizCad password",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #0891b2;">Reset Your Password</h1>
                <p>Hi ${user.name},</p>
                <p>You requested to reset your password. Click the button below to set a new password:</p>
                <a href="${url}" style="display: inline-block; background-color: #0891b2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
                  Reset Password
                </a>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link: ${url}</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
              </div>
            `,
          });
        } catch (error) {
          throw error;
        }
      },
    },
    plugins: [
      admin(), // Admin plugin for user management
    ],
  });
}

export type Auth = ReturnType<typeof getAuth>;
