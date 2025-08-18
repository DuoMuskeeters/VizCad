import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "../components/Header";

export const Route = createRootRoute({
  component: () => (
    <>
      <Header />
      <main className="bg-background pt-14 sm:pt-16 min-h-screen">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </>
  ),
});
