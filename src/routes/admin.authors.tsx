import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useEffect, useState } from "react";
import { Loader2, Plus, Edit, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/db/client";
import { authorProfiles, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";

// --- Server Functions ---

export const getAuthorProfile = createServerFn({ method: "GET" })
    .handler(async ({ context }) => {
        // We need to fetch current user's profile
        // But strictly speaking we want to list ALL authors or manage current user's author profile?
        // The plan implies an admin panel to manage profiles.
        // Let's implement fetching all profiles for now, or at least the current user's.
        // To keep it simple for the first iteration, let's just fetch the current user's profile to edit.
        // But wait, the request was "admin panel author details update". 
        // Let's list all users and allow editing their author profile.

        const d1 = env?.vizcad_auth;
        if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
        const db = getDb(d1);

        const profiles = await db.select({
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            authorName: authorProfiles.name,
            authorBio: authorProfiles.bio,
            authorRole: authorProfiles.role,
            authorAvatar: authorProfiles.avatarUrl,
        })
            .from(user)
            .leftJoin(authorProfiles, eq(user.id, authorProfiles.userId))
            .all();

        return profiles;
    });

// Define input schema interface
interface UpdateAuthorProfileInput {
    userId: string;
    name: string;
    bio: string;
    role: string;
    avatarUrl: string;
}

export const updateAuthorProfile = createServerFn({ method: "POST" })
    .inputValidator((data: UpdateAuthorProfileInput) => data)
    .handler(async ({ data }) => {
        const d1 = env?.vizcad_auth;
        if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
        const db = getDb(d1);

        // Check if profile exists
        const existing = await db.select().from(authorProfiles).where(eq(authorProfiles.userId, data.userId)).get();

        if (existing) {
            await db.update(authorProfiles).set({
                name: data.name,
                bio: data.bio,
                role: data.role,
                avatarUrl: data.avatarUrl,
                updatedAt: new Date(),
            }).where(eq(authorProfiles.userId, data.userId));
        } else {
            await db.insert(authorProfiles).values({
                id: crypto.randomUUID(),
                userId: data.userId,
                name: data.name,
                bio: data.bio,
                role: data.role,
                avatarUrl: data.avatarUrl,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }

        return { success: true };
    });

// --- Component ---

export const Route = createFileRoute("/admin/authors")({
    component: AdminAuthorsPage,
});

function AdminAuthorsPage() {
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        bio: "",
        role: "",
        avatarUrl: "",
    });

    const sessionQuery = useSession();

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        try {
            setLoading(true);
            const data = await getAuthorProfile();
            setProfiles(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (profile: any) => {
        setEditingId(profile.userId);
        setFormData({
            name: profile.authorName || profile.userName, // Default to user name if no author name
            bio: profile.authorBio || "",
            role: profile.authorRole || "",
            avatarUrl: profile.authorAvatar || "",
        });
    };

    const handleSave = async () => {
        if (!editingId) return;
        try {
            setLoading(true);
            await updateAuthorProfile({
                data: {
                    userId: editingId,
                    ...formData
                }
            });
            setEditingId(null);
            await loadProfiles();
        } catch (e) {
            alert("Failed to save");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-8 pt-24">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/admin">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">Author Management</h1>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Authors</CardTitle>
                        <CardDescription>Manage how authors appear on blog posts.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading && !profiles.length ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Display Name</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profiles.map(p => (
                                        <TableRow key={p.userId}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{p.userName}</div>
                                                    <div className="text-xs text-muted-foreground">{p.userEmail}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{p.authorName || "-"}</TableCell>
                                            <TableCell>{p.authorRole || "-"}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleEdit(p)}>
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Edit Profile
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Edit Dialog/Card - Keeping it simple, showing inline or overlay would be better but simple conditional render for now */}
                {editingId && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-lg">
                            <CardHeader>
                                <CardTitle>Edit Author Profile</CardTitle>
                                <CardDescription>Update author details for blog posts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Display Name</Label>
                                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Dr. Jane Doe" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Role / Title</Label>
                                    <Input value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} placeholder="e.g. Senior Editor" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Bio</Label>
                                    <Textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} placeholder="Short biography..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Avatar URL (Optional)</Label>
                                    <Input value={formData.avatarUrl} onChange={e => setFormData({ ...formData, avatarUrl: e.target.value })} placeholder="https://..." />
                                </div>

                                <div className="flex justify-end gap-2 mt-4">
                                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                    <Button onClick={handleSave} disabled={loading}>
                                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Profile
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
