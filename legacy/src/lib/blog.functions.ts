/**
 * blog.functions.ts — createServerFn wrappers for blog data
 * Safe to import from anywhere (loaders, components, etc.)
 */
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { getAllPosts, getPostBySlug, getRelatedPosts } from "./blog.server";

/**
 * Fetch all published posts (sorted by publishedAt DESC).
 * Used by blog index loader.
 */
export const fetchAllPosts = createServerFn({ method: "GET" }).handler(
    async () => {
        return getAllPosts();
    }
);

/**
 * Fetch most viewed posts.
 * Used by blog index for Featured/Popular sections.
 */
export const fetchMostViewedPosts = createServerFn({ method: "GET" })
    .inputValidator((data: { limit: number }) => data)
    .handler(async ({ data }) => {
        const { getMostViewedPosts } = await import("./blog.server");
        return getMostViewedPosts(data.limit);
    });

/**
 * Fetch a single post by slug + its related posts.
 * Used by blog article loader. Throws notFound if post doesn't exist.
 */
export const fetchPostBySlug = createServerFn({ method: "GET" })
    .inputValidator((data: { slug: string }) => data)
    .handler(async ({ data }) => {
        const post = await getPostBySlug(data.slug);

        if (!post) {
            throw notFound();
        }

        const relatedPosts = await getRelatedPosts(post, 3);
        return { post, relatedPosts };
    });

/**
 * Increment view count for a post.
 */
export const fetchIncrementView = createServerFn({ method: "POST" })
    .inputValidator((data: { slug: string }) => data)
    .handler(async ({ data }) => {
        const { incrementPostViews } = await import("./blog.server");
        await incrementPostViews(data.slug);
    });
