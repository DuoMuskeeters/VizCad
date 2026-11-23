import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Edit, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
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
import { createFileRoute } from "@tanstack/react-router";

// --- Component ---

export const Route = createFileRoute("/admin/authors")({
    component: AdminAuthorsPage,
});

function AdminAuthorsPage() {
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
            setError(null);
            const res = await fetch("/api/admin/authors");
            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || "Loading failed");
            }
            const data = await res.json() as { profiles: any[] };
            setProfiles(data.profiles);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Profil listesi yüklenemedi.");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (profile: any) => {
        setEditingId(profile.userId);
        setFormData({
            name: profile.authorName || profile.userName,
            bio: profile.authorBio || "",
            role: profile.authorRole || "",
            avatarUrl: profile.authorAvatar || "",
        });
    };

    const handleSave = async () => {
        if (!editingId) return;
        try {
            setLoading(true);
            const res = await fetch("/api/admin/authors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: editingId,
                    ...formData
                })
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || "Save failed");
            }

            setEditingId(null);
            await loadProfiles();
        } catch (e: any) {
            alert(e.message || "Failed to save");
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
                        <CardTitle>Admin Authors</CardTitle>
                        <CardDescription>Manage how administrators appear as authors on blog posts.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading && !profiles.length ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                        ) : error ? (
                            <div className="p-8 text-center text-red-500 font-medium bg-red-50 rounded-lg">{error}</div>
                        ) : profiles.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">Admin rolünde yazar bulunamadı.</div>
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
