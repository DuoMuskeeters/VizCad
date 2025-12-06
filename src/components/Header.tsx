"use client"

import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PaletteSelector } from "./palette-selector"
import { ModeToggle } from "./mode-toggle"
import LanguageSwitcher from "./LanguageSwitcher"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Menu, User, LogOut, Shield } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useState, useEffect } from "react"

export default function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const isAppPage = location.pathname === "/app"
  const [isClient, setIsClient] = useState(false)

  // Always call useSession, but only use it after client mount
  const sessionQuery = useSession()
  const session = isClient ? sessionQuery.data : null

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
  }

  useEffect(() => {
    setIsClient(true)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: "/" })
  }

  return (
    <header className="fixed top-6 lg:top-6 top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl mb-4 lg:mb-0">
      <div className="bg-background border border-border rounded-full shadow-xl px-2 sm:px-4 lg:px-6 py-2 lg:py-3 min-w-0 overflow-hidden">
        <nav className="w-full space-y-2 min-[730px]:space-y-0">
          {/* Masaüstü ve tablet görünümü */}
          <div className="hidden min-[730px]:flex items-center justify-between w-full">
            <Link to="/" className="flex items-center pl-2 flex-shrink-0">
              <span className="text-xl lg:text-2xl font-bold text-foreground">
                <span className="text-cyan-500">Viz</span>Cad
              </span>
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-4 flex-1 min-w-0">
              <Link
                to="/ModelSnap"
                className="text-muted-foreground hover:text-foreground font-medium transition-all duration-200 text-base px-2 lg:px-4 py-2 rounded-md hover:bg-accent hover:shadow-sm transform hover:scale-102 whitespace-nowrap"
              >
                ModelSnap
              </Link>
              <Link
                to="/faq"
                className="text-muted-foreground hover:text-foreground font-medium transition-all duration-200 text-base px-2 lg:px-4 py-2 rounded-md hover:bg-accent hover:shadow-sm transform hover:scale-102 whitespace-nowrap"
              >
                {t("nav_faq")}
              </Link>
              <Link
                to="/contact"
                className="text-muted-foreground hover:text-foreground font-medium transition-all duration-200 text-base px-2 lg:px-4 py-2 rounded-md hover:bg-accent hover:shadow-sm transform hover:scale-102 whitespace-nowrap"
              >
                {t("nav_contact")}
              </Link>
              <button
                onClick={() => handleNavClick("about")}
                className="text-muted-foreground hover:text-foreground font-medium transition-all duration-200 text-base px-2 lg:px-4 py-2 rounded-md hover:bg-accent hover:shadow-sm transform hover:scale-102 whitespace-nowrap"
              >
                {t("nav_about")}
              </button>
            </div>

            <div className="hidden min-[730px]:flex items-center gap-2 lg:gap-3 flex-shrink-0">
              <div className="hidden min-[730px]:flex lg:hidden items-center gap-1 bg-accent/30 rounded-full px-1.5 py-1">
                <PaletteSelector />
                <ModeToggle />
                <LanguageSwitcher />
              </div>

              <div className="hidden lg:flex items-center gap-1 bg-accent/30 rounded-full p-1.5">
                <PaletteSelector />
                <ModeToggle />
                <LanguageSwitcher />
              </div>

              {session ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="rounded-full px-4 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      <span className="hidden lg:inline">{session.user.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    {session.user.role === "admin" && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer">
                          <Shield className="mr-2 h-4 w-4" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link
                  to="/login"
                  className="hidden min-[686px]:flex bg-primary hover:bg-primary/90 text-white rounded-full px-4 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap items-center justify-center min-w-[120px]"
                >
                  Sign In
                </Link>
              )}

            </div>
          </div>

          {/* Mobil görünüm */}
          <div className="flex min-[730px]:hidden items-center justify-between gap-2 w-full">
            <Link to="/" className="flex items-center gap-3">
              <span className="text-xl lg:text-2xl font-bold text-foreground">
                <span className="text-cyan-500">Viz</span>Cad
              </span>
            </Link>

            <div className="flex-1 flex justify-center">
              {!session && (
                <Link
                  to="/login"
                  className="bg-primary hover:bg-primary/90 text-white rounded-full px-5 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap min-w-[100px] flex items-center justify-center"
                >
                  {t("nav_sign_in")}
                </Link>
              )}
            </div>

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

                {session ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <DropdownMenuItem asChild className="text-sm font-medium">
                        <Link to="/dashboard">
                          <User className="mr-2 h-4 w-4" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut} className="text-sm font-medium cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild className="text-sm font-medium">
                      <Link to="/login">Sign In</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  <PaletteSelector />
                  <ModeToggle />
                  <LanguageSwitcher />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </header>
  )
}