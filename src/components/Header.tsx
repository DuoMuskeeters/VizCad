"use client"

import { Link, useLocation } from "@tanstack/react-router"

export default function Header() {
  const location = useLocation()
  const isAppPage = location.pathname === "/app"

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
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo - Ana sayfaya yönlendir */}
          <Link to="/" className="flex-shrink-0">
            <img src="/vizcad-logo.png" alt="VizCad" className="h-28 w-auto" />
          </Link>

          {/* Navigation Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <button
              onClick={() => handleNavClick("features")}
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => handleNavClick("about")}
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              About Us
            </button>
            <button
              onClick={() => handleNavClick("contact")}
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              Contact
            </button>
            <Link
              to="/app"
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              onClick={() => handleNavClick("application")}
            >
              Application
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-gray-600 hover:text-gray-900 p-2">
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
