import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);

  // Always call useSession, but only use after client mount
  const sessionQuery = useSession();
  const session = isClient ? sessionQuery.data : null;
  const isPending = isClient ? sessionQuery.isPending : true;

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [session, isPending, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background p-8 pt-30">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Welcome, {session.user.name}!</CardTitle>
            <CardDescription>
              You're successfully logged in to your VizCad account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Email</div>
              <div className="font-medium">{session.user.email}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">User ID</div>
              <div className="font-mono text-sm">{session.user.id}</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Account Created</div>
              <div className="text-sm">
                {new Date(session.user.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button variant="destructive" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Information</CardTitle>
            <CardDescription>Current session details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Session Expires</div>
              <div className="text-sm">
                {new Date(session.session.expiresAt).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
