"use client"

import { Link, useLocation } from "@tanstack/react-router"
import { useState } from "react"

export default function Header() {
  const location = useLocation()
  const isAppPage = location.pathname === "/app"
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleNavClick = (sectionId: string) => {
    setIsMobileMenuOpen(false) // Close mobile menu on navigation
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

          {/* Desktop Navigation Menu */}
          <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
            <button
              onClick={() => handleNavClick("features")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer text-sm lg:text-base"
            >
              Features
            </button>
            <button
              onClick={() => handleNavClick("about")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer text-sm lg:text-base"
            >
              About Us
            </button>
            <button
              onClick={() => handleNavClick("contact")}
              className="text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer text-sm lg:text-base"
            >
              Contact
            </button>
            <Link
              to="/app"
              className="bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-3 py-2 lg:px-4 lg:py-2 rounded-lg transition-all duration-200 hover:shadow-md text-sm lg:text-base"
            >
              Launch App
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
          <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-lg">
            <div className="px-4 py-4 space-y-3">
              <button
                onClick={() => handleNavClick("features")}
                className="w-full text-left text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-gray-50"
              >
                Features
              </button>
              <button
                onClick={() => handleNavClick("about")}
                className="w-full text-left text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-gray-50"
              >
                About Us
              </button>
              <button
                onClick={() => handleNavClick("contact")}
                className="w-full text-left text-gray-700 hover:text-cyan-600 font-medium transition-colors cursor-pointer py-2 px-2 rounded-lg hover:bg-gray-50"
              >
                Contact
              </button>
              <Link
                to="/app"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-4 py-3 rounded-lg transition-all duration-200 hover:shadow-md text-center"
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
