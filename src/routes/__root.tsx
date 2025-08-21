import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "../components/Header";
import { SEO } from "@/components/SEO";

export const Route = createRootRoute({
  component: () => (
    <>
      {/* Global SEO meta tags */}
      <SEO />
      <Header />
      <main className="bg-background">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </>
  ),
});
