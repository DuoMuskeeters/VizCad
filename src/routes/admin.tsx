import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason?: string;
  createdAt: Date;
}

function AdminPage() {
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const sessionQuery = useSession();
  const session = isClient ? sessionQuery.data : null;
  const isPending = isClient ? sessionQuery.isPending : true;

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if user is admin
  useEffect(() => {
    if (!isPending && (!session || session.user.role !== "admin")) {
      navigate({ to: "/" });
    }
  }, [session, isPending, navigate]);

  // Load users
  useEffect(() => {
    if (session?.user.role === "admin") {
      loadUsers();
    }
  }, [session]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await authClient.admin.listUsers({
        query: {
          limit: 100,
        },
      });
      if (response.data) {
        setUsers(response.data.users as User[]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleSetRole = async (userId: string, newRole: "user" | "admin") => {
    try {
      setActionLoading(userId);
      await authClient.admin.setRole({
        userId,
        role: newRole,
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    const reason = prompt("Ban reason (optional):");
    try {
      setActionLoading(userId);
      await authClient.admin.banUser({
        userId,
        banReason: reason || undefined,
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to ban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      setActionLoading(userId);
      await authClient.admin.unbanUser({
        userId,
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to unban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) {
      return;
    }
    try {
      setActionLoading(userId);
      await authClient.admin.removeUser({
        userId,
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to remove user");
    } finally {
      setActionLoading(null);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-8 pt-30">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">👤 Admin Panel</CardTitle>
            <CardDescription>
              Manage users, roles, and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-md">
                {error}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">{user.name}</td>
                      <td className="p-3 font-mono text-sm">{user.email}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${user.role === "admin"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            }`}
                        >
                          {user.role || "user"}
                        </span>
                      </td>
                      <td className="p-3">
                        {user.banned ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Banned
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2 flex-wrap">
                          {user.id !== session.user.id && (
                            <>
                              {user.role !== "admin" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSetRole(user.id, "admin")}
                                  disabled={actionLoading === user.id}
                                >
                                  Make Admin
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSetRole(user.id, "user")}
                                  disabled={actionLoading === user.id}
                                >
                                  Remove Admin
                                </Button>
                              )}

                              {!user.banned ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-600"
                                  onClick={() => handleBanUser(user.id)}
                                  disabled={actionLoading === user.id}
                                >
                                  Ban
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  onClick={() => handleUnbanUser(user.id)}
                                  disabled={actionLoading === user.id}
                                >
                                  Unban
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveUser(user.id)}
                                disabled={actionLoading === user.id}
                              >
                                Delete
                              </Button>
                            </>
                          )}

                          {user.id === session.user.id && (
                            <span className="text-sm text-muted-foreground italic">
                              (You)
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Total: {users.length} users
              </div>
              <Button variant="outline" onClick={loadUsers}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
