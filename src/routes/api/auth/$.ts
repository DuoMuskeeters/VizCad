import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";

// Access Cloudflare bindings globally in TanStack Start
declare global {
  var cloudflare: {
    env: {
      vizcad_auth: any;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL: string;
    };
  };
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          // In TanStack Start with Cloudflare, bindings are in context.cloudflare.env
          const d1 = (context as any)?.cloudflare?.env?.vizcad_auth;
          const env = (context as any)?.cloudflare?.env;

          if (!d1) {
            console.error("D1 database binding not found!");
            console.error("context:", context);
            return new Response(JSON.stringify({
              error: "Database not configured",
              hasCloudflare: !!(context as any)?.cloudflare,
              hasEnv: !!(context as any)?.cloudflare?.env,
              envKeys: (context as any)?.cloudflare?.env ? Object.keys((context as any).cloudflare.env) : []
            }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            console.error("BETTER_AUTH_SECRET not found in environment!");
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env);
          return await auth.handler(request);
        } catch (error) {
          console.error("Auth GET error:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          const stack = error instanceof Error ? error.stack : undefined;
          return new Response(JSON.stringify({ error: message, stack }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async ({ request, context }) => {
        try {
          // In TanStack Start with Cloudflare, bindings are in context.cloudflare.env
          const d1 = (context as any)?.cloudflare?.env?.vizcad_auth;
          const env = (context as any)?.cloudflare?.env;

          if (!d1) {
            console.error("D1 database binding not found!");
            return new Response(JSON.stringify({
              error: "Database not configured",
              hasCloudflare: !!(context as any)?.cloudflare,
              hasEnv: !!(context as any)?.cloudflare?.env,
            }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!env?.BETTER_AUTH_SECRET) {
            console.error("BETTER_AUTH_SECRET not found in environment!");
            return new Response(JSON.stringify({ error: "Auth secret not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const auth = getAuth(d1, env);
          return await auth.handler(request);
        } catch (error) {
          console.error("Auth POST error:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          const stack = error instanceof Error ? error.stack : undefined;
          return new Response(JSON.stringify({ error: message, stack }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
