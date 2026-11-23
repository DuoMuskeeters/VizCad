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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEffect, useState, useMemo } from "react";
import { Loader2, ArrowUpDown, HardDrive, File as FileIcon, FileText, Plus, Edit, Trash2, ExternalLink, User as UserIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  banned: boolean;
  banReason?: string;
  createdAt: Date;
}

interface StorageStat {
  userId: string;
  userName: string;
  userEmail: string;
  fileCount: number;
  totalSize: number;
}

interface UserFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  authorId: string;
  publishedAt: Date | null;
  createdAt: Date;
  views: number;
}

interface SurveyResponse {
  id: string;
  source: string;
  createdAt: string;
}

interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string; // JSON string
  ipAddress?: string;
  createdAt: string;
}

function AdminPage() {
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Pagination & Sorting State
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof User | null>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Storage Stats State
  const [storageStats, setStorageStats] = useState<StorageStat[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [selectedUserForStorage, setSelectedUserForStorage] = useState<StorageStat | null>(null);
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Blog State
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Activity Logs State
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Survey State
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);

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

  // Load users on mount
  useEffect(() => {
    if (session?.user.role === "admin") {
      loadUsers();
      loadStorageStats();
      loadPosts();
      loadSurveyResponses();
      loadActivities();
    }
  }, [session]);

  const loadActivities = async () => {
    try {
      setActivitiesLoading(true);
      const res = await fetch("/api/admin/activities?limit=50");
      if (res.ok) {
        const data = await res.json() as { logs: ActivityLog[] };
        setActivities(data.logs);
      }
    } catch (err) {
      console.error("Failed to load activity logs", err);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadSurveyResponses = async () => {
    try {
      setSurveyLoading(true);
      const res = await fetch("/api/admin/survey");
      if (res.ok) {
        const data = await res.json() as { responses: SurveyResponse[] };
        setSurveyResponses(data.responses);
      }
    } catch (err) {
      console.error("Failed to load survey responses", err);
    } finally {
      setSurveyLoading(false);
    }
  }


  const loadPosts = async () => {
    try {
      setPostsLoading(true);
      const res = await fetch("/api/blog");
      if (res.ok) {
        const data = await res.json();
        setPosts(data as BlogPost[]);
      }
    } catch (err) {
      console.error("Failed to load posts", err);
    } finally {
      setPostsLoading(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      const res = await fetch(`/api/blog/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await loadPosts();
    } catch (err) {
      console.error("Failed to delete post", err);
      alert("Failed to delete post");
    }
  };

  const loadUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await authClient.admin.listUsers({
        query: {
          limit: 1000,
        },
      });
      if (response.data) {
        setUsers(response.data.users as User[]);
      }
    } catch (err: any) {
      setUsersError(err.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      setStorageLoading(true);
      const res = await fetch("/api/admin/storage-stats");
      if (res.ok) {
        const data = await res.json() as { stats: StorageStat[] };
        setStorageStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load storage stats", err);
    } finally {
      setStorageLoading(false);
    }
  };

  const loadUserFiles = async (userId: string) => {
    try {
      setFilesLoading(true);
      const res = await fetch(`/api/admin/user-files?userId=${userId}`);
      if (res.ok) {
        const data = await res.json() as { files: UserFile[] };
        setUserFiles(data.files);
      }
    } catch (err) {
      console.error("Failed to load user files", err);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleOpenStorageDetails = (stat: StorageStat) => {
    setSelectedUserForStorage(stat);
    setIsSheetOpen(true);
    loadUserFiles(stat.userId);
  };

  // User Management Actions
  const handleSetRole = async (userId: string, newRole: "user" | "admin") => {
    try {
      setActionLoading(userId);
      await authClient.admin.setRole({ userId, role: newRole });
      await loadUsers();
    } catch (err: any) {
      setUsersError(err.message || "Failed to update role");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    const reason = prompt("Ban reason (optional):");
    try {
      setActionLoading(userId);
      await authClient.admin.banUser({ userId, banReason: reason || undefined });
      await loadUsers();
    } catch (err: any) {
      setUsersError(err.message || "Failed to ban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      setActionLoading(userId);
      await authClient.admin.unbanUser({ userId });
      await loadUsers();
    } catch (err: any) {
      setUsersError(err.message || "Failed to unban user");
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
      await authClient.admin.removeUser({ userId });
      await loadUsers();
    } catch (err: any) {
      setUsersError(err.message || "Failed to remove user");
    } finally {
      setActionLoading(null);
    }
  };

  // Derived Users for Display
  const sortedUsers = useMemo(() => {
    let sorted = [...users];
    if (sortField) {
      sorted.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [users, sortField, sortOrder]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedUsers.slice(start, start + pageSize);
  }, [sortedUsers, currentPage, pageSize]);

  const totalPages = Math.ceil(users.length / pageSize);

  const toggleSort = (field: keyof User) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isPending || usersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pt-20 md:pt-30">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, permissions, and monitor storage usage.</p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="blog">Blog</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="survey">Survey</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Total: {users.length} users</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Pages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 / page</SelectItem>
                      <SelectItem value="20">20 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {usersError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-md">
                    {usersError}
                  </div>
                )}

                {/* Responsive Table View */}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px] cursor-pointer" onClick={() => toggleSort("name")}>
                          Name <ArrowUpDown className="ml-1 h-3 w-3 inline" />
                        </TableHead>
                        <TableHead className="min-w-[200px] cursor-pointer" onClick={() => toggleSort("email")}>
                          Email <ArrowUpDown className="ml-1 h-3 w-3 inline" />
                        </TableHead>
                        <TableHead className="min-w-[100px]">Role</TableHead>
                        <TableHead className="min-w-[100px]">Status</TableHead>
                        <TableHead className="min-w-[120px] cursor-pointer" onClick={() => toggleSort("createdAt")}>
                          Created <ArrowUpDown className="ml-1 h-3 w-3 inline" />
                        </TableHead>
                        <TableHead className="min-w-[250px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{user.email}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.role === "admin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              }`}>
                              {user.role}
                            </span>
                          </TableCell>
                          <TableCell>
                            {user.banned ? (
                              <span className="text-red-500 font-medium">Banned</span>
                            ) : (
                              <span className="text-green-500 font-medium">Active</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {user.id !== session.user.id && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSetRole(user.id, user.role === "admin" ? "user" : "admin")}
                                    disabled={actionLoading === user.id}
                                  >
                                    {user.role === "admin" ? "Demote" : "Promote"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={user.banned ? "text-green-600" : "text-red-600"}
                                    onClick={() => user.banned ? handleUnbanUser(user.id) : handleBanUser(user.id)}
                                    disabled={actionLoading === user.id}
                                  >
                                    {user.banned ? "Unban" : "Ban"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    asChild
                                  >
                                    <Link to="/admin/users/$userId" params={{ userId: user.id }}>
                                      View
                                    </Link>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveUser(user.id)}
                                    disabled={actionLoading === user.id}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>



                {/* Pagination Controls */}
                <div className="flex items-center justify-between space-x-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blog" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Blog Posts</CardTitle>
                  <CardDescription>Manage your blog content</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <Link to="/admin/authors">
                      <UserIcon className="mr-2 h-4 w-4" />
                      Authors
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/admin/blog/new">
                      <Plus className="mr-2 h-4 w-4" />
                      New Post
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Published</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {postsLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : posts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No posts found. Create one to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        posts.map((post) => (
                          <TableRow key={post.id}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span>{post.title}</span>
                                <span className="text-xs text-muted-foreground">/{post.slug}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${post.status === "published"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                                  }`}
                              >
                                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {post.views || 0}
                            </TableCell>
                            <TableCell>
                              {post.publishedAt
                                ? new Date(post.publishedAt).toLocaleDateString()
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  title="View"
                                >
                                  <Link to="/blog/$slug" params={{ slug: post.slug }} target="_blank">
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  title="Edit"
                                >
                                  <Link to="/admin/blog/$postId" params={{ postId: post.id }}>
                                    <Edit className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleDeletePost(post.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="storage">
            <Card>
              <CardHeader>
                <CardTitle>Storage Usage</CardTitle>
                <CardDescription>Overview of user storage consumption</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Files</TableHead>
                        <TableHead className="text-right">Total Size</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storageStats.map((stat) => (
                        <TableRow key={stat.userId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{stat.userName}</div>
                              <div className="text-xs text-muted-foreground">{stat.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{stat.fileCount}</TableCell>
                          <TableCell className="text-right font-mono">{formatBytes(stat.totalSize)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenStorageDetails(stat)}>
                              <HardDrive className="h-4 w-4 mr-2" />
                              View Files
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {storageStats.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No storage data available.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="survey">
            <Card>
              <CardHeader>
                <CardTitle>Survey Responses</CardTitle>
                <CardDescription>User feedback on where they heard about us</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Stats Section */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Opened</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {surveyResponses.filter(r => r.source === "Opened").length}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Dismissed (X)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {surveyResponses.filter(r => r.source === "Dismissed").length}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Responses</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {surveyResponses.filter(r => r.source !== "Opened" && r.source !== "Dismissed").length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Breakdown */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                  {Object.entries(surveyResponses.reduce((acc, curr) => {
                    if (curr.source !== "Opened" && curr.source !== "Dismissed") {
                      acc[curr.source] = (acc[curr.source] || 0) + 1;
                    }
                    return acc;
                  }, {} as Record<string, number>)).map(([source, count]) => (
                    <Card key={source}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium truncate" title={source}>{source}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{count}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {surveyLoading ? (
                        <TableRow>
                          <TableCell colSpan={2} className="h-24 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : surveyResponses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                            No survey responses found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        surveyResponses.map((response) => (
                          <TableRow key={response.id}>
                            <TableCell className="font-medium">{response.source}</TableCell>
                            <TableCell>
                              {new Date(response.createdAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activities</CardTitle>
                <CardDescription>Monitor user actions across the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activitiesLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : activities.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No activities recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        activities.map((log) => {
                          let detailsObj = {};
                          try {
                            detailsObj = log.details ? JSON.parse(log.details) : {};
                          } catch (e) {
                            detailsObj = { raw: log.details };
                          }

                          // Fix for timestamp issue (detecting seconds vs ms)
                          let date = new Date(log.createdAt);
                          const now = new Date();
                          // If date is very old (e.g. 1970) but we expect recent, it's likely seconds interpreted as ms
                          if (date.getFullYear() < 2024) {
                            const secondsTimestamp = new Date(log.createdAt).getTime();
                            const time = date.getTime();
                            if (time < 2000000000000 && time > 1000000000) {
                              date = new Date(time * 1000);
                            }
                          }

                          return (
                            <TableRow key={log.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{log.userName || "Unknown"}</div>
                                  <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                  {log.action}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-[300px] truncate text-xs font-mono text-muted-foreground" title={JSON.stringify(detailsObj, null, 2)}>
                                {JSON.stringify(detailsObj)}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                {date.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User Files</SheetTitle>
            <SheetDescription>
              Viewing files for {selectedUserForStorage?.userName}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
              <div>
                <div className="text-sm font-medium">Total Storage Used</div>
                <div className="text-2xl font-bold">{formatBytes(selectedUserForStorage?.totalSize || 0)}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-right">Total Files</div>
                <div className="text-2xl font-bold text-right">{selectedUserForStorage?.fileCount || 0}</div>
              </div>
            </div>

            {filesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {userFiles.map(file => (
                  <div key={file.id} className="flex items-center gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                    <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center text-primary">
                      <FileIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(file.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="text-sm font-mono whitespace-nowrap">
                      {formatBytes(file.size)}
                    </div>
                  </div>
                ))}
                {userFiles.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No files found for this user.
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
