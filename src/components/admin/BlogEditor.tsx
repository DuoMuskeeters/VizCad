import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ArrowLeft, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { ulid } from "ulid";
import { Link } from "@tanstack/react-router";
import type { BlogPost } from "@/db/schema"; // Ensure this import exists

// Helper to slugify title
const slugify = (text: string) => {
    const trMap: { [key: string]: string } = {
        'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c',
        'Ğ': 'g', 'Ü': 'u', 'Ş': 's', 'İ': 'i', 'Ö': 'o', 'Ç': 'c'
    };
    return text
        .toString()
        .replace(/[ğüşıöçĞÜŞİÖÇ]/g, (match) => trMap[match])
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-") // Replace spaces with -
        .replace(/[^\w\-]+/g, "") // Remove all non-word chars
        .replace(/\-\-+/g, "-"); // Replace multiple - with single -
};

interface BlogEditorProps {
    postId?: string;
}

export function BlogEditor({ postId }: BlogEditorProps) {
    const navigate = useNavigate();
    const sessionQuery = useSession();
    const session = sessionQuery.data;

    // Loading State
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Form State
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [content, setContent] = useState<string>("");
    const [excerpt, setExcerpt] = useState("");
    const [coverImage, setCoverImage] = useState("");
    const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
    const [category, setCategory] = useState("Engineering");
    const [tags, setTags] = useState("");

    // SEO State
    const [metaTitle, setMetaTitle] = useState("");
    const [metaDescription, setMetaDescription] = useState("");
    const [keywords, setKeywords] = useState("");

    // Ref for file input
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Image upload handler
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("slug", slug || "general");

            const res = await fetch("/api/blog/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json() as { error?: string };
                throw new Error(err.error || "Upload failed");
            }

            const data = await res.json() as { url: string; key: string; filename: string };
            setCoverImage(data.url);
        } catch (error: any) {
            console.error("Upload error:", error);
            alert(`Yükleme hatası: ${error.message}`);
        } finally {
            setIsUploading(false);
            if (imageInputRef.current) imageInputRef.current.value = "";
        }
    };

    // Auth Check
    useEffect(() => {
        if (sessionQuery.isPending) return;
        if (!session || session.user.role !== "admin") {
            navigate({ to: "/" });
        }
    }, [session, sessionQuery.isPending, navigate]);

    // Fetch existing post if editing
    useEffect(() => {
        if (!postId) return;

        const fetchPost = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/blog/${postId}`);
                if (!res.ok) throw new Error("Failed to fetch post");
                const post = await res.json() as BlogPost;

                if (post) {
                    setTitle(post.title);
                    setSlug(post.slug);
                    setContent(post.content);
                    setExcerpt(post.excerpt);
                    setCoverImage(post.coverImage || "");
                    setStatus(post.status as "draft" | "published" | "archived");
                    setCategory(post.category);
                    // Handle JSON array or string
                    setTags(Array.isArray(post.tags) ? post.tags.join(", ") : "");

                    setMetaTitle(post.metaTitle || "");
                    setMetaDescription(post.metaDescription || "");
                    setKeywords(Array.isArray(post.keywords) ? post.keywords.join(", ") : "");
                }
            } catch (error) {
                console.error("Failed to fetch post", error);
                alert("Failed to load post. Check console for details.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchPost();
    }, [postId]);


    // Auto-generate slug from title if slug is empty and creating new
    useEffect(() => {
        if (!postId && title && !slug) {
            setSlug(slugify(title));
        }
    }, [title, postId, slug]);

    const handleSave = async () => {
        if (!title || !content || !category) {
            alert("Please fill in required fields (Title, Content, Category)");
            return;
        }

        setIsSaving(true);
        try {
            const newId = postId || crypto.randomUUID();
            const tagArray = tags.split(",").map(t => t.trim()).filter(Boolean);
            const keywordArray = keywords.split(",").map((k: string) => k.trim()).filter(Boolean);

            // Fetch existing post to check current status and publishedAt
            let existingPublishedAt: string | number | Date | null = null;
            if (postId) {
                try {
                    const res = await fetch(`/api/blog/${postId}`);
                    if (res.ok) {
                        const existing = await res.json() as BlogPost;
                        existingPublishedAt = existing?.publishedAt;
                    }
                } catch (e) {
                    console.error("Failed to fetch existing post for comparison", e);
                }
            }

            const postData = {
                id: newId,
                title,
                slug,
                excerpt: excerpt || metaDescription || content.substring(0, 160).replace(/[#*`]/g, "").trim() + "...",
                content,
                coverImage,
                status,
                category,
                tags: tagArray,
                metaTitle: metaTitle || title,
                metaDescription: metaDescription || excerpt || content.substring(0, 160).replace(/[#*`]/g, "").trim() + "...",
                keywords: keywordArray,
                authorId: session?.user.id,
                readTime: Math.ceil((content?.split(/\s+/).length || 0) / 200), // Est. 200 wpm
                tableOfContents: true,
                // Only set publishedAt if it's currently published and doesn't already have a date
                publishedAt: status === 'published' ? (existingPublishedAt || new Date()) : null,
            };

            const method = postId ? "PUT" : "POST";
            const url = postId ? `/api/blog/${postId}` : "/api/blog";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            if (!res.ok) throw new Error("Failed to save");

            alert(postId ? "Post updated!" : "Post created!");
            if (!postId) {
                navigate({ to: "/admin" });
            }
        } catch (err) {
            console.error("Save failed:", err);
            alert("Failed to save post");
        } finally {
            setIsSaving(false);
        }
    };

    const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) {
                // Determine if we should parse frontmatter
                const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
                const match = text.match(frontmatterRegex);

                if (match) {
                    const frontmatter = match[1];
                    const contentBody = text.replace(frontmatterRegex, '').trim();
                    setContent(contentBody);

                    // Basic frontmatter parsing
                    const lines = frontmatter.split('\n');
                    lines.forEach(line => {
                        const parts = line.split(':');
                        if (parts.length >= 2) {
                            const key = parts[0].trim();
                            const value = parts.slice(1).join(':').trim().replace(/^['"](.*)['"]$/, '$1');

                            if (key === 'title') setTitle(value);
                            if (key === 'slug') setSlug(value);
                            if (key === 'description' || key === 'excerpt') setExcerpt(value);
                            if (key === 'tags') setTags(value.replace(/[\[\]]/g, ''));
                            // Add more map logic if needed
                        }
                    });
                } else {
                    setContent(text);
                }
            }
        };
        reader.readAsText(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 md:p-8 pt-24 md:pt-36">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link to="/admin">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {postId ? "Edit Post" : "New Post"}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept=".md,.markdown"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImportMarkdown}
                        />
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Import MD
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Save Post
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="content" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="content">Content</TabsTrigger>
                        <TabsTrigger value="seo">SEO</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="space-y-4">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter post title"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Content (Markdown)</Label>
                                <div data-color-mode="light">
                                    <MDEditor
                                        value={content}
                                        onChange={(val: string | undefined) => setContent(val || "")}
                                        height={500}
                                        preview="live"
                                    />
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="seo" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>SEO Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="metaTitle">Meta Title</Label>
                                    <Input
                                        id="metaTitle"
                                        value={metaTitle}
                                        onChange={(e) => setMetaTitle(e.target.value)}
                                        placeholder="SEO Title (defaults to post title)"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Recommended length: 50-60 characters. Current: {metaTitle.length}
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="metaDescription">Meta Description</Label>
                                    <Textarea
                                        id="metaDescription"
                                        value={metaDescription}
                                        onChange={(e) => setMetaDescription(e.target.value)}
                                        placeholder="SEO Description (defaults to excerpt)"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Recommended length: 150-160 characters. Current: {metaDescription.length}
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="keywords">Keywords</Label>
                                    <Input
                                        id="keywords"
                                        value={keywords}
                                        onChange={(e) => setKeywords(e.target.value)}
                                        placeholder="Comma separated keywords (e.g. 3D Printing, Engineering, CAD)"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Post Settings</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-6 md:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="slug">Slug</Label>
                                    <Input
                                        id="slug"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder="url-friendly-slug"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Select value={status} onValueChange={(v: "draft" | "published" | "archived") => setStatus(v)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="draft">Draft</SelectItem>
                                            <SelectItem value="published">Published</SelectItem>
                                            <SelectItem value="archived">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="category">Category</Label>
                                    <Select value={category} onValueChange={setCategory}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {["Engineering", "3D Printing", "CAD", "Software", "Digital Twin", "Tutorials", "News"].map(c => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="tags">Tags</Label>
                                    <Input
                                        id="tags"
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        placeholder="Comma separated tags"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="coverImage">Cover Image</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="coverImage"
                                            value={coverImage}
                                            onChange={(e) => setCoverImage(e.target.value)}
                                            placeholder="/api/blog/image/blog/..."
                                            className="flex-1"
                                        />
                                        <input
                                            ref={imageInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            disabled={isUploading}
                                            onClick={() => imageInputRef.current?.click()}
                                            title="Resim yükle"
                                        >
                                            {isUploading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Upload className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    {coverImage && (
                                        <div className="mt-2 rounded-md border overflow-hidden">
                                            <img
                                                src={coverImage}
                                                alt="Cover preview"
                                                className="w-full h-40 object-cover"
                                                onError={(e) => (e.currentTarget.style.display = "none")}
                                            />
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
