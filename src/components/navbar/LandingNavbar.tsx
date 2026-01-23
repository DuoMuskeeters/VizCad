"use client"

import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { PaletteSelector } from "../palette-selector"
import { ModeToggle } from "../mode-toggle"
import LanguageSwitcher from "../LanguageSwitcher"
import { Button } from "../ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Menu, User, LogOut, Shield, LayoutDashboard, Box } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useState, useEffect } from "react"
import { NavbarLogo } from "./NavbarLogo"

export function LandingNavbar() {
    const { t } = useTranslation()
    const location = useLocation()
    const navigate = useNavigate()
    const [isClient, setIsClient] = useState(false)

    const sessionQuery = useSession()
    const session = isClient ? sessionQuery.data : null

    useEffect(() => {
        setIsClient(true)
    }, [])

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

    const handleSignOut = async () => {
        await signOut()
        navigate({ to: "/" })
    }

    const navLinkClass = "text-muted-foreground hover:text-foreground font-medium transition-all duration-200 text-sm lg:text-base px-3 lg:px-4 py-2 rounded-lg hover:bg-accent whitespace-nowrap"

    return (
        <header className="fixed top-4 lg:top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-6xl">
            <div className="bg-background border border-border rounded-2xl shadow-lg px-4 sm:px-6 py-3">
                <nav className="w-full">
                    {/* Desktop View */}
                    <div className="hidden lg:flex items-center justify-between w-full gap-4">
                        {/* Logo */}
                        <NavbarLogo />

                        {/* Nav Links - Center */}
                        <div className="flex items-center gap-1 lg:gap-2">
                            <Link to="/app" className={navLinkClass}>
                                {t("nav_3d_viewer")}
                            </Link>
                            <Link to="/faq" className={navLinkClass}>
                                {t("nav_faq")}
                            </Link>
                            <Link to="/contact" className={navLinkClass}>
                                {t("nav_contact")}
                            </Link>
                            <button onClick={() => handleNavClick("about")} className={navLinkClass}>
                                {t("nav_about")}
                            </button>
                        </div>

                        {/* Right Side - Theme, Language, User */}
                        <div className="flex items-center gap-2 lg:gap-3">
                            <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1">
                                <PaletteSelector />
                                <ModeToggle />
                                <LanguageSwitcher />
                            </div>

                            {session ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="rounded-full px-3 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex items-center gap-2 h-10"
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
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-5 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap"
                                >
                                    {t("nav_sign_in")}
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Mobile & Tablet View */}
                    <div className="flex lg:hidden items-center justify-between w-full">
                        {/* Logo */}
                        <NavbarLogo />

                        {/* Mobile Menu */}
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
                                {/* App Links - Always visible */}
                                <div className="flex flex-col gap-1">
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/app">
                                            <Box className="mr-2 h-4 w-4" />
                                            3D Viewer
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/dashboard">
                                            <LayoutDashboard className="mr-2 h-4 w-4" />
                                            Dashboard
                                        </Link>
                                    </DropdownMenuItem>
                                </div>

                                <DropdownMenuSeparator />

                                {/* Navigation Links */}
                                <div className="flex flex-col gap-1">
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/faq">{t("nav_faq")}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="text-sm font-medium">
                                        <Link to="/contact">{t("nav_contact")}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => handleNavClick("about")}
                                        className="text-sm font-medium"
                                    >
                                        {t("nav_about")}
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
                </nav>
            </div>
        </header>
    )
}
