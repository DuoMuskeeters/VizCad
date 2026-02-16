/**
 * blog.server.ts — Server-only DB query helpers for blog
 * Only import this inside server function handlers or API routes.
 */
import { env } from "cloudflare:workers";
import { getDb } from "@/db/client";
import { posts, authorProfiles, user } from "@/db/schema";
import { eq, desc, ne, and } from "drizzle-orm";
import type { BlogPost, BlogPostWithAuthor } from "@/db/schema";

function getDatabase() {
    const d1 = env?.vizcad_auth;
    if (!d1) throw new Error("D1 Binding 'vizcad_auth' not found");
    return getDb(d1);
}

/**
 * Get all posts, optionally filtered by status.
 * Sorted by publishedAt DESC, then createdAt DESC.
 */
export async function getAllPosts(status?: "draft" | "published" | "archived"): Promise<BlogPostWithAuthor[]> {
    const db = getDatabase();

    const whereClause = status ? eq(posts.status, status) : undefined;

    const results = await db
        .select({
            post: posts,
            author: authorProfiles,
        })
        .from(posts)
        .leftJoin(authorProfiles, eq(posts.authorId, authorProfiles.userId))
        .where(whereClause)
        .orderBy(desc(posts.publishedAt), desc(posts.createdAt));

    return results.map(r => ({
        ...r.post,
        author: r.author
    }));
}

/**
 * Get a single post by slug.
 */
export async function getPostBySlug(slug: string): Promise<BlogPostWithAuthor | null> {
    const db = getDatabase();
    const result = await db
        .select({
            post: posts,
            author: authorProfiles,
        })
        .from(posts)
        .leftJoin(authorProfiles, eq(posts.authorId, authorProfiles.userId))
        .where(eq(posts.slug, slug))
        .limit(1);

    if (!result[0]) return null;

    return {
        ...result[0].post,
        author: result[0].author
    };
}

/**
 * Get a single post by ID.
 */
export async function getPostById(id: string): Promise<BlogPostWithAuthor | null> {
    const db = getDatabase();
    const result = await db
        .select({
            post: posts,
            author: authorProfiles,
        })
        .from(posts)
        .leftJoin(authorProfiles, eq(posts.authorId, authorProfiles.userId))
        .where(eq(posts.id, id))
        .limit(1);

    if (!result[0]) return null;

    return {
        ...result[0].post,
        author: result[0].author
    };
}

/**
 * Get related posts based on category and shared tags.
 * Excludes the given post. Returns only published posts.
 */
export async function getRelatedPosts(post: BlogPost, limit: number = 3): Promise<BlogPostWithAuthor[]> {
    const db = getDatabase();

    // Fetch published posts in the same category (excluding current)
    const candidates = await db
        .select({
            post: posts,
            author: authorProfiles,
        })
        .from(posts)
        .leftJoin(authorProfiles, eq(posts.authorId, authorProfiles.userId))
        .where(
            and(
                eq(posts.status, "published"),
                ne(posts.id, post.id)
            )
        )
        .orderBy(desc(posts.publishedAt), desc(posts.createdAt));

    // Score by category match + shared tags
    const postTags = post.tags || [];

    const scored = candidates.map((row) => {
        const p = row.post;
        let score = 0;
        if (p.category === post.category) score += 2;
        const pTags = p.tags || [];
        score += pTags.filter((t) => postTags.includes(t)).length;
        return { post: { ...p, author: row.author }, score };
    });

    // Sort by score desc, take top N
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.post);
}
