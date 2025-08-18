"use client"

import { Link, useLocation } from "@tanstack/react-router"
import { useState } from "react"

export default function Header() {
  const location = useLocation()
  const isAppPage = location.pathname === "/app"
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleNavClick = (sectionId: string) => {
    if (isAppPage) {
      // App sayfasındaysak ana sayfaya git ve section'a scroll yap
      window.location.href = `/#${sectionId}`
    } else {
      // Ana sayfadaysak direkt scroll yap
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: "smooth" })
      }
    }
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <nav className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo - Sol taraf */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <span className="text-xl sm:text-2xl font-bold text-gray-900">
              <span className="text-cyan-500">Viz</span>Cad
            </span>
          </Link>

          {/* Navigation Menu - Desktop */}
          <div className="hidden md:flex items-center space-x-6">
            <button
              onClick={() => handleNavClick("features")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => handleNavClick("about")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer"
            >
              About Us
            </button>
            <button
              onClick={() => handleNavClick("contact")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer"
            >
              Contact
            </button>
            <Link
              to="/app"
              className="bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-md"
            >
              Launch App
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Toggle mobile menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12M6 12l12 12"
                  />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white/95 backdrop-blur-md">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <button
                onClick={() => handleNavClick("features")}
                className="block w-full text-left px-3 py-2 text-gray-700 hover:text-cyan-600 hover:bg-gray-50 rounded-md font-medium transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => handleNavClick("about")}
                className="block w-full text-left px-3 py-2 text-gray-700 hover:text-cyan-600 hover:bg-gray-50 rounded-md font-medium transition-colors"
              >
                About Us
              </button>
              <button
                onClick={() => handleNavClick("contact")}
                className="block w-full text-left px-3 py-2 text-gray-700 hover:text-cyan-600 hover:bg-gray-50 rounded-md font-medium transition-colors"
              >
                Contact
              </button>
              <Link
                to="/app"
                className="block w-full text-center bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md mt-2"
                onClick={() => setIsMobileMenuOpen(false)}
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
