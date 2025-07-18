import { Box } from "lucide-react"
import { Link } from "@tanstack/react-router"

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <Box className="h-7 w-7 text-gray-900" />
            <span className="text-xl font-semibold text-gray-900">VizCad</span>
          </div>

          {/* Navigation Menu */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900 font-medium">
              Features
            </a>
            <a href="#about" className="text-gray-600 hover:text-gray-900 font-medium">
              About Us
            </a>
            <a href="#contact" className="text-gray-600 hover:text-gray-900 font-medium">
              Contact
            </a>
            <Link to="/app" className="text-gray-600 hover:text-gray-900 font-medium">
              Log In
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
