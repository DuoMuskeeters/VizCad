import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verify-email")({
    component: VerifyEmailPage,
});

function VerifyEmailPage() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("");

    useEffect(() => {
        const verifyEmail = async () => {
            const params = new URLSearchParams(window.location.search);
            const token = params.get("token");

            if (!token) {
                setStatus("error");
                setMessage("No verification token found");
                return;
            }

            try {
                const result = await authClient.verifyEmail({ query: { token } });

                if (result.error) {
                    setStatus("error");
                    setMessage(result.error.message || "Verification failed");
                } else {
                    setStatus("success");
                    setMessage("Email verified successfully!");
                    // Redirect to dashboard after 2 seconds
                    setTimeout(() => {
                        navigate({ to: "/dashboard" });
                    }, 2000);
                }
            } catch (err: any) {
                setStatus("error");
                setMessage(err.message || "Verification failed");
            }
        };

        verifyEmail();
    }, [navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 pt-24">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">
                        {status === "loading" && "🔄 Verifying..."}
                        {status === "success" && "✅ Email Verified!"}
                        {status === "error" && "❌ Verification Failed"}
                    </CardTitle>
                    <CardDescription>{message}</CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    {status === "success" && (
                        <p className="text-muted-foreground">
                            Redirecting to dashboard...
                        </p>
                    )}
                    {status === "error" && (
                        <div className="space-y-2">
                            <p className="text-muted-foreground">
                                The verification link may have expired or is invalid.
                            </p>
                            <Button onClick={() => navigate({ to: "/login" })}>
                                Go to Login
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
