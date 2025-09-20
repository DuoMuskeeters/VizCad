"use client"

import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PaletteSelector } from "./palette-selector"
import { ModeToggle } from "./mode-toggle"
import LanguageSwitcher from "./LanguageSwitcher"
import React from "react"
import { useTheme } from "./theme-provider"

export default function Header() {
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
    isAppPage && resolvedTheme === "dark"
      ? {
          backgroundColor: "rgba(2,6,23,0.9)",
          borderBottomColor: "rgba(51,65,85,0.6)",
          color: "rgb(248 250 252)",
          backdropFilter: "blur(8px)",
        }
      : undefined

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <nav className="w-full px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo - Sol taraf */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <span className="text-2xl  font-bold text-gray-900">
              <span className="text-cyan-500">Viz</span>Cad
            </span>
          </Link>

          {/* Navigation Menu - Sağ taraf */}
          <div className="hidden md:flex items-center space-x-6">
            <button
              onClick={() => handleNavClick("features")}
              className={buttonClass}
            >
              {t("nav_features")}
            </button>
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
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-gray-700 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
    </header>
  )
}