import { Outlet, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import Header from "../components/Header"
import { ThemeProvider } from "../components/theme-provider"
import { PaletteProvider } from "../components/palette-provider"

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <PaletteProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Header />
          <main className="bg-background">
            <Outlet />
          </main>
          <TanStackRouterDevtools />
        </div>
      </PaletteProvider>
    </ThemeProvider>
  ),
})
