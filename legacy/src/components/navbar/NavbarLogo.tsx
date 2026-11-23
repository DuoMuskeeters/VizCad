"use client"

import { Link } from "@tanstack/react-router"

export function NavbarLogo() {
    return (
        <Link to="/" className="flex items-center flex-shrink-0">
            <span className="text-xl lg:text-2xl font-bold text-foreground">
                <span className="text-cyan-500">Viz</span>Cad
            </span>
        </Link>
    )
}
