"use client"

import type React from "react"

import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useTheme } from "./theme-provider"
import { ModeToggle } from "@/components/mode-toggle"
import { PaletteSelector } from "@/components/palette-selector"

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAppPage = location.pathname === "/app"
  const isFaqPage = location.pathname === "/faq"
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { theme } = useTheme()
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    // Resolve 'system' -> matchMedia
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      setResolvedTheme(mq.matches ? "dark" : "light")
      const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? "dark" : "light")
      try {
        mq.addEventListener("change", handler)
      } catch (e) {
        mq.addListener(handler)
      }
      return () => {
        try {
          mq.removeEventListener("change", handler)
        } catch (e) {
          mq.removeListener(handler)
        }
      }
    }
    setResolvedTheme(theme === "dark" ? "dark" : "light")
  }, [theme])

  const handleNavClick = (sectionId: string) => {
    setIsMobileMenuOpen(false) // Close mobile menu on navigation
    if (isAppPage || isFaqPage) {
      navigate({ to: "/" }).then(() => {
        // Wait for navigation to complete, then scroll to section
        setTimeout(() => {
          const element = document.getElementById(sectionId)
          if (element) {
            element.scrollIntoView({ behavior: "smooth" })
          }
        }, 100)
      })
    } else {
      // Ana sayfadaysak direkt scroll yap
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth" })
      }
    }
  }

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
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
      style={headerInlineStyle}
    >
      <nav className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo - Sol taraf */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <span className="text-xl sm:text-2xl font-bold text-foreground">
              <span style={{ color: "rgb(var(--primary))" }}>Viz</span>Cad
            </span>
          </Link>

          {/* Desktop Navigation Menu */}
          <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
            <button
              onClick={() => handleNavClick("features")}
              className="text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer text-sm lg:text-base"
              style={{ "--tw-text-opacity": "1" } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(var(--primary))")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              Features
            </button>
            <button
              onClick={() => handleNavClick("about")}
              className="text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer text-sm lg:text-base"
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(var(--primary))")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              About Us
            </button>
            <Link
              to="/faq"
              className="text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer text-sm lg:text-base"
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(var(--primary))")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              FAQ
            </Link>
            <button
              onClick={() => handleNavClick("contact")}
              className="text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer text-sm lg:text-base"
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgb(var(--primary))")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              Contact
            </button>
            <PaletteSelector />
            <ModeToggle />
            <Link
              to="/app"
              className="text-white font-medium px-3 py-2 lg:px-4 lg:py-2 rounded-lg transition-all duration-200 hover:shadow-md text-sm lg:text-base"
              style={
                {
                  backgroundColor: "rgb(var(--primary))",
                  "--tw-bg-opacity": "1",
                } as React.CSSProperties
              }
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgb(var(--primary-hover))")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgb(var(--primary))")}
            >
              Launch App
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            <PaletteSelector />
            <ModeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-accent transition-colors"
            >
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12M6 12h12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border shadow-lg">
            <div className="px-4 py-4 space-y-3">
              <button
                onClick={() => handleNavClick("features")}
                className="w-full text-left text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-accent"
              >
                Features
              </button>
              <button
                onClick={() => handleNavClick("about")}
                className="w-full text-left text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-accent"
              >
                About Us
              </button>
              <Link
                to="/faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-left text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-accent"
              >
                FAQ
              </Link>
              <button
                onClick={() => handleNavClick("contact")}
                className="w-full text-left text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-accent"
              >
                Contact
              </button>
              <Link
                to="/app"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-white font-medium px-4 py-3 rounded-lg transition-all duration-200 hover:shadow-md text-center"
                style={
                  {
                    backgroundColor: "rgb(var(--primary))",
                  } as React.CSSProperties
                }
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgb(var(--primary-hover))")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgb(var(--primary))")}
              >
                Launch App
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
