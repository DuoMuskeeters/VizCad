import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/db/client";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            return new Response(JSON.stringify({ error: "Database not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env, request.url);
          return await auth.handler(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request }) => {
        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            return new Response(JSON.stringify({ error: "Database not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env, request.url);
          const response = await auth.handler(request);

          // Log activity for successful login/signup
          if (response.ok) {
            const url = new URL(request.url);
            // Sign-in (email or social callback)
            const isSignIn = url.pathname.includes("/sign-in");
            // Sign-up
            const isSignUp = url.pathname.includes("/sign-up");

            if (isSignIn || isSignUp) {
              try {
                // To get the session, we need to extract the cookie from the response headers
                // and pass it as a 'Cookie' header to getSession.
                const setCookie = response.headers.get("set-cookie");

                if (setCookie) {
                  const session = await auth.api.getSession({
                    headers: {
                      cookie: setCookie
                    }
                  });

                  if (session && session.user) {
                    const { logActivity } = await import("@/lib/activity.server");
                    await logActivity({
                      db: getDb(d1),
                      userId: session.user.id,
                      action: isSignUp ? "signup" : "login",
                      entityType: "user",
                      entityId: session.user.id,
                      details: {
                        email: session.user.email,
                        name: session.user.name,
                        method: isSignUp ? "signup" : "login"
                      },
                      request
                    });
                  }
                }
              } catch (err) {
                console.error("Failed to log auth activity:", err);
              }
            }
          }

          return response;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
