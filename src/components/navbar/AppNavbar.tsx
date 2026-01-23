"use client"

import { Link, useNavigate, useLocation } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PaletteSelector } from "../palette-selector"
import { ModeToggle } from "../mode-toggle"
import LanguageSwitcher from "../LanguageSwitcher"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Menu, User, LogOut, Shield, LayoutDashboard, Box, Search, X } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useState, useEffect } from "react"
import { NavbarLogo } from "./NavbarLogo"

interface AppNavbarProps {
    searchQuery?: string
    onSearchChange?: (query: string) => void
}

export function AppNavbar({ searchQuery = "", onSearchChange }: AppNavbarProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()
    const [isClient, setIsClient] = useState(false)
    const [localSearch, setLocalSearch] = useState(searchQuery)
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

    const sessionQuery = useSession()
    const session = isClient ? sessionQuery.data : null

    // Check page type
    const isDashboard = location.pathname.startsWith("/dashboard")
    const isAppPage = location.pathname === "/app"

    useEffect(() => {
        setIsClient(true)
    }, [])

    useEffect(() => {
        setLocalSearch(searchQuery)
    }, [searchQuery])

    const handleSignOut = async () => {
        await signOut()
        navigate({ to: "/" })
    }

    const handleSearchChange = (value: string) => {
        setLocalSearch(value)
        onSearchChange?.(value)
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border shadow-sm">
            <nav className="w-full px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16 gap-4">
                    {/* Left Side - Logo */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        <NavbarLogo />

                        {/* App indicator badge - only on /app page */}
                        {isAppPage && (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
                                <Box className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium text-primary">{t("nav_3d_viewer")}</span>
                            </div>
                        )}
                    </div>

                    {/* Center - Search Bar (Dashboard only, desktop) */}
                    {isDashboard && onSearchChange && (
                        <div className="hidden md:flex flex-1 max-w-xl mx-4">
                            <div className="relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Dosyalarda ara..."
                                    value={localSearch}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="pl-10 pr-4 h-10 bg-muted/50 border-border rounded-full text-sm focus-visible:ring-primary"
                                />
                                {localSearch && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                        onClick={() => handleSearchChange("")}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Right Side - Desktop */}
                    <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                        {/* Quick Links - hide on dashboard */}
                        {!isDashboard && (
                            <div className="flex items-center gap-1 mr-2">
                                <Link
                                    to="/faq"
                                    className="text-muted-foreground hover:text-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-accent transition-colors"
                                >
                                    {t("nav_faq")}
                                </Link>
                                <Link
                                    to="/contact"
                                    className="text-muted-foreground hover:text-foreground text-sm font-medium px-3 py-2 rounded-lg hover:bg-accent transition-colors"
                                >
                                    {t("nav_contact")}
                                </Link>
                            </div>
                        )}

                        {/* Theme and Language Controls */}
                        <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1">
                            <PaletteSelector />
                            <ModeToggle />
                            <LanguageSwitcher />
                        </div>

                        {/* User Menu */}
                        {session ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="rounded-full px-3 py-2 text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2 h-10"
                                    >
                                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                                            <User className="h-4 w-4 text-primary" />
                                        </div>
                                        <span className="hidden lg:inline max-w-[100px] truncate">{session.user.name}</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                                        {session.user.email}
                                    </div>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/dashboard" className="cursor-pointer">
                                            <LayoutDashboard className="mr-2 h-4 w-4" />
                                            Dashboard
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link to="/app" className="cursor-pointer">
                                            <Box className="mr-2 h-4 w-4" />
                                            3D Viewer
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
                                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Sign Out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Link
                                to="/login"
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-5 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                            >
                                {t("nav_sign_in")}
                            </Link>
                        )}
                    </div>

                    {/* Mobile - Search + Menu */}
                    <div className="flex md:hidden items-center gap-2">
                        {/* Mobile Search Toggle (Dashboard only) */}
                        {isDashboard && onSearchChange && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 rounded-full"
                                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                            >
                                <Search className="h-5 w-5" />
                            </Button>
                        )}

                        {/* User indicator on mobile */}
                        {session && isClient && (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                            </div>
                        )}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-full border border-border hover:bg-accent"
                                    aria-label="Open menu"
                                >
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-4 space-y-3">
                                {/* App Links */}
                                <div className="flex flex-col gap-1">
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/app">
                                            <Box className="mr-2 h-4 w-4" />
                                            {t("nav_3d_viewer")}
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/dashboard">
                                            <LayoutDashboard className="mr-2 h-4 w-4" />
                                            {t("nav_dashboard")}
                                        </Link>
                                    </DropdownMenuItem>
                                </div>

                                <DropdownMenuSeparator />

                                {/* Navigation Links */}
                                <div className="flex flex-col gap-1">
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/ModelSnap">ModelSnap</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/faq">{t("nav_faq")}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/contact">{t("nav_contact")}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <a href="/#about" className="w-full">{t("nav_about")}</a>
                                    </DropdownMenuItem>
                                </div>

                                <DropdownMenuSeparator />

                                {/* User Section */}
                                {session ? (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                                                {session.user.email}
                                            </div>
                                            {session.user.role === "admin" && (
                                                <DropdownMenuItem asChild className="text-sm font-medium">
                                                    <Link to="/admin">
                                                        <Shield className="mr-2 h-4 w-4" />
                                                        Admin Panel
                                                    </Link>
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem onClick={handleSignOut} className="text-sm font-medium text-destructive">
                                                <LogOut className="mr-2 h-4 w-4" />
                                                Sign Out
                                            </DropdownMenuItem>
                                        </div>
                                        <DropdownMenuSeparator />
                                    </>
                                ) : (
                                    <>
                                        <DropdownMenuItem asChild className="text-sm font-medium">
                                            <Link to="/login" className="flex items-center justify-center bg-primary text-primary-foreground rounded-lg py-2">
                                                {t("nav_sign_in")}
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}

                                {/* Theme and Language Controls */}
                                <div className="flex items-center justify-between gap-2 px-2">
                                    <PaletteSelector />
                                    <ModeToggle />
                                    <LanguageSwitcher />
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Mobile Search Bar (expandable) */}
                {isDashboard && onSearchChange && mobileSearchOpen && (
                    <div className="md:hidden pb-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Dosyalarda ara..."
                                value={localSearch}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                className="pl-10 pr-10 h-10 bg-muted/50 border-border rounded-full text-sm"
                                autoFocus
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                onClick={() => {
                                    handleSearchChange("")
                                    setMobileSearchOpen(false)
                                }}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </nav>
        </header>
    )
}
