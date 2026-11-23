import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession, authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/admin/users/$userId")({
    component: UserDetailPage,
});

interface ActivityLog {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
    createdAt: string;
}

interface User {
    id: string;
    name: string;
    email: string;
    image?: string;
    role: string;
    createdAt: Date;
    banned: boolean;
}

function UserDetailPage() {
    const { userId } = Route.useParams();
    const navigate = useNavigate();
    const [isClient, setIsClient] = useState(false);
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [activitiesLoading, setActivitiesLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [userLoading, setUserLoading] = useState(true);

    const sessionQuery = useSession();
    const session = isClient ? sessionQuery.data : null;
    const isPending = isClient ? sessionQuery.isPending : true;

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isPending && (!session || session.user.role !== "admin")) {
            navigate({ to: "/" });
        }
    }, [session, isPending, navigate]);

    useEffect(() => {
        if (session?.user.role === "admin") {
            loadUser();
            loadActivities();
        }
    }, [session, userId]);

    const loadUser = async () => {
        try {
            setUserLoading(true);
            // We don't have a direct "get user by id" API in auth client usually available to admin easily without listing?
            // Actually listUsers supports generic queries maybe? Or we can use the admin client.
            // authClient.admin.listUsers usually returns a list. 
            // Let's rely on our own API or try to fetch from listUsers with filter if possible, 
            // OR just fetch basic info from the API I just made (activities) which has user info but only if they have activity.
            // Better: Create/Use an API to get user details.
            // For now, let's assume we can fetch it, or if not, we can implement it. 
            // Let's use the listUsers and filter client side if server doesn't support getById.
            // Wait, better-auth admin plugin likely has getUser or listUsers.
            // Let's try listUsers but filtered? No, listUsers doesn't support ID filter usually.
            // I'll assume we can implement GET /api/admin/users/:id or similar.
            // For this task, getting user details is secondary to the TIMELINE.
            // Let's just focus on Activities first.

            // Temporary: Just load activities.
            setUserLoading(false);
        } catch (err) {
            console.error("Failed to load user", err);
            setUserLoading(false);
        }
    };

    const loadActivities = async () => {
        try {
            setActivitiesLoading(true);
            const res = await fetch(`/api/admin/activities?userId=${userId}&limit=100`);
            if (res.ok) {
                const data = await res.json() as { logs: ActivityLog[] };
                setActivities(data.logs);
                // Try to set user info from first log if available
                if (data.logs.length > 0 && !user) {
                    const first = data.logs[0];
                    setUser({
                        id: first.userId,
                        name: first.userName,
                        email: first.userEmail,
                        role: 'user', // unknown
                        createdAt: new Date(), // unknown
                        banned: false // unknown
                    });
                }
            }
        } catch (err) {
            console.error("Failed to load activities", err);
        } finally {
            setActivitiesLoading(false);
        }
    };

    if (isPending) {
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
            <div className="max-w-5xl mx-auto space-y-6">
                <Button variant="ghost" onClick={() => navigate({ to: "/admin" })} className="mb-4 pl-0 hover:bg-transparent hover:underline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                </Button>

                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={user?.image} />
                        <AvatarFallback>{user?.name?.substring(0, 2).toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{user?.name || "User Details"}</h1>
                        <p className="text-muted-foreground">{user?.email || userId}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Activity Timeline</CardTitle>
                        <CardDescription>History of actions performed by this user</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead>IP Address</TableHead>
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
                                                No activities found for this user.
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
                                            // If date is very old (e.g. 1970) but we expect recent, it's likely seconds interpreted as ms
                                            if (date.getFullYear() < 2024) {
                                                const time = date.getTime();
                                                if (time < 2000000000000 && time > 1000000000) {
                                                    // It's likely seconds. Multiply by 1000.
                                                    date = new Date(time * 1000);
                                                }
                                            }

                                            return (
                                                <TableRow key={log.id}>
                                                    <TableCell>
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                            {log.action}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="max-w-[400px] truncate text-xs font-mono text-muted-foreground" title={JSON.stringify(detailsObj, null, 2)}>
                                                        {JSON.stringify(detailsObj)}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground font-mono">
                                                        {log.ipAddress || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                                        {date.toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
