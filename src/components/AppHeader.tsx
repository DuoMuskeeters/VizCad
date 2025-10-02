import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PaletteSelector } from "./palette-selector"
import { ModeToggle } from "./mode-toggle"
import LanguageSwitcher from "./LanguageSwitcher"
import React from "react"
import { useTheme } from "./theme-provider"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Menu } from "lucide-react"

export default function AppHeader() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const isAppPage = location.pathname === "/app"

  // State for mobile menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

  // Determine if current page is contact
  const isContactPage = location.pathname === "/contact"

  // Get resolved theme (requires next-themes)
  // If you use another theme provider, adjust accordingly
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { theme } = useTheme()
  const resolvedTheme =
    theme === "system"
      ? typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme

  const handleNavClick = (sectionId: string) => {
    if (location.pathname !== "/") {
      navigate({ to: "/" }).then(() => {
        setTimeout(() => {
          const element = document.getElementById(sectionId)
          if (element) {
            element.scrollIntoView({ behavior: "smooth" })
          }
        }, 100)
      })
    } else {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth" })
      }
    }
    setIsMobileMenuOpen(false)
  }

  const handleContactClick = () => {
    if (location.pathname !== "/contact") {
      navigate({ to: "/contact" })
    }
  }

  const buttonClass = isContactPage
    ? "text-muted-foreground font-medium cursor-default text-sm lg:text-base px-2 py-1 rounded-md"
    : "text-muted-foreground hover:text-foreground font-medium transition-all duration-200 cursor-pointer text-sm lg:text-base px-2 py-1 rounded-md hover:bg-accent hover:shadow-sm transform hover:scale-102"

  const headerInlineStyle: React.CSSProperties | undefined =
    resolvedTheme === "dark"
      ? {
          backgroundColor: "rgba(2,6,23,0.9)",
          borderBottomColor: "rgba(51,65,85,0.6)",
          color: "rgb(248 250 252)",
          backdropFilter: "blur(8px)",
        }
      : {
          backgroundColor: "rgba(255,255,255,0.95)",
          borderBottomColor: "rgba(229,231,235,1)",
          color: "rgb(15 23 42)",
          backdropFilter: "blur(8px)",
        }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b shadow-sm"
      style={headerInlineStyle}
    >
      <nav className="w-full px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo - Sol taraf */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <span className="text-2xl font-bold" style={{ color: resolvedTheme === "dark" ? "white" : "rgb(15 23 42)" }}>
              <span className="text-cyan-500">Viz</span>Cad
            </span>
          </Link>

          {/* Navigation Menu - Sağ taraf */}
          <div className="hidden md:flex items-center space-x-6">
            <Link
              to="/ModelSnap"
              className={buttonClass}
            >
              ModelSnap
            </Link>
            <Link
              to="/faq"
              className={buttonClass}
            >
              {t("nav_faq")}
            </Link>
            <Link
              to="/contact"
              className={buttonClass}
            >
              {t("nav_contact")}
            </Link>
            <button
              onClick={() => handleNavClick("about")}
              className={buttonClass}
            >
              {t("nav_about")}
            </button>
            <PaletteSelector />
            <ModeToggle />
            <LanguageSwitcher />
            {!isAppPage && (
              <Link
                to="/app"
                search={{}}
                className="font-medium px-3 py-2 lg:px-4 lg:py-2 rounded-lg transition-all duration-200 hover:shadow-md text-sm lg:text-base transform hover:scale-102 hover:brightness-105"
                style={{
                  backgroundColor: "rgb(var(--primary))",
                  color: "rgb(15 23 42)",
                }}
              >
                {t("nav_launch_app")}
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full border border-border/60 hover:bg-accent"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-4 space-y-3">
                <div className="flex flex-col gap-1">
                  <DropdownMenuItem
                    onSelect={() => handleNavClick("features")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("nav_features")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    <Link to="/ModelSnap">ModelSnap</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    <Link to="/faq">{t("nav_faq")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="text-sm font-medium text-muted-foreground hover:text-foreground">
                    <Link to="/contact">{t("nav_contact")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => handleNavClick("about")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("nav_about")}
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator />

                <div className="flex items-center justify-between gap-2">
                  <PaletteSelector />
                  <ModeToggle />
                  <LanguageSwitcher />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>
    </header>
  )
}