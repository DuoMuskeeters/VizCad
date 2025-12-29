"use client"

import { Link, useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "../ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { User, LogOut, Shield, LayoutDashboard } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useState, useEffect } from "react"

export function NavbarUserMenu() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [isClient, setIsClient] = useState(false)

    const sessionQuery = useSession()
    const session = isClient ? sessionQuery.data : null

    useEffect(() => {
        setIsClient(true)
    }, [])

    const handleSignOut = async () => {
        await signOut()
        navigate({ to: "/" })
    }

    // Loading state
    if (!isClient) {
        return (
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        )
    }

    // Not logged in
    if (!session) {
        return (
            <Link
                to="/login"
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-4 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex items-center justify-center"
            >
                {t("nav_sign_in")}
            </Link>
        )
    }

    // Logged in - show user menu
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="rounded-full px-3 py-2 text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap flex items-center gap-2 h-10"
                >
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="hidden sm:inline max-w-[100px] truncate">{session.user.name}</span>
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
                    {t("nav_sign_out") || "Sign Out"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
