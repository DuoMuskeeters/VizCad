import { useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";

// 🔧 DEV MODE: Set to true to bypass auth checks locally
const DEV_BYPASS_AUTH = false;

// Routes that require authentication
const protectedRoutes = ["/dashboard", "/admin"];

export function SessionGuard({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: session, isPending, error } = useSession();

    useEffect(() => {
        // Skip auth checks in dev mode
        if (DEV_BYPASS_AUTH) return;

        // Only check for protected routes
        const isProtectedRoute = protectedRoutes.some(route =>
            location.pathname.startsWith(route)
        );

        if (!isProtectedRoute) return;

        // Wait for session to load
        if (isPending) return;

        // If no session and on protected route, redirect to login
        if (!session && isProtectedRoute) {
            navigate({
                to: "/login",
                search: { redirect: location.pathname }
            });
        }
    }, [session, isPending, location.pathname, navigate]);

    // Check session periodically (every 5 minutes)
    useEffect(() => {
        // Skip in dev mode
        if (DEV_BYPASS_AUTH) return;

        const checkSession = async () => {
            try {
                const response = await fetch("/api/auth/get-session", {
                    credentials: "include",
                });

                if (!response.ok || response.status === 401) {
                    // Session expired
                    const isProtectedRoute = protectedRoutes.some(route =>
                        location.pathname.startsWith(route)
                    );

                    if (isProtectedRoute) {
                        navigate({ to: "/login" });
                    }
                }
            } catch (error) {
                console.error("Session check failed:", error);
            }
        };

        // Check every 5 minutes
        const interval = setInterval(checkSession, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [location.pathname, navigate]);

    return <>{children}</>;
}
