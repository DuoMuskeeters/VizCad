import { createFileRoute } from "@tanstack/react-router";
import { BlogEditor } from "@/components/admin/BlogEditor";

export const Route = createFileRoute("/admin/blog/$postId")({
    component: BlogEditorPage,
});

function BlogEditorPage() {
    const { postId } = Route.useParams();
    return <BlogEditor postId={postId} />;
}
