import {                                                                                                                                                                                                                                                                                                                                                                        createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        console.log("=== AUTH GET HANDLER CALLED ===");
        console.log("Request URL:", request.url);
        console.log("Splat params:", params);

        try {
          console.log("ENV object exists:", !!env);
          console.log("ENV keys:", Object.keys(env || {}));

          const d1 = env?.vizcad_auth;

          if (!d1) {
            console.error("D1 database binding not found!");
            return new Response(JSON.stringify({
              error: "Database not configured",
              envKeys: Object.keys(env || {}),
              envType: typeof env,
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

          const auth = getAuth(d1, env, request.url);
          console.log("Auth object created, calling handler...");
          const response = await auth.handler(request);
          console.log("Auth handler response status:", response.status);
          console.log("Auth handler response headers:", Object.fromEntries(response.headers.entries()));
          return response;
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
      POST: async ({ request, params }) => {
        console.log("=== AUTH POST HANDLER CALLED ===");
        console.log("Request URL:", request.url);

        try {
          const d1 = env?.vizcad_auth;

          if (!d1) {
            console.error("D1 database binding not found!");
            return new Response(JSON.stringify({
              error: "Database not configured",
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

          const auth = getAuth(d1, env, request.url);
          console.log("Auth object created, calling handler...");
          const response = await auth.handler(request);
          console.log("Auth handler response status:", response.status);
          return response;
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
