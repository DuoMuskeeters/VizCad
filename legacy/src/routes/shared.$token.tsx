"use client";

import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/shared/$token")({
    loader: async ({ params }) => {
        try {
            const response = await fetch(`/api/shared/${params.token}`);
            if (!response.ok) return null;
            return await response.json() as { file: { name: string; extension: string }; thumbnailUrl: string | null };
        } catch {
            return null;
        }
    },
    head: ({ loaderData }) => {
        const fileName = loaderData?.file?.name || "Shared File";
        const title = `${fileName} - VizCAD Share`;
        const description = "View this 3D model on VizCAD";
        const image = loaderData?.thumbnailUrl || "https://vizcad.io/og-image.png"; // Fallback image

        return {
            meta: [
                { title },
                { name: "description", content: description },
                { property: "og:title", content: title },
                { property: "og:description", content: description },
                { property: "og:image", content: image },
                { property: "twitter:card", content: "summary_large_image" },
                { property: "twitter:title", content: title },
                { property: "twitter:description", content: description },
                { property: "twitter:image", content: image },
                { name: "robots", content: "noindex, nofollow" },
            ],
        };
    },
    component: SharedRedirectPage,
});

function SharedRedirectPage() {
    const { t } = useTranslation();
    const params = Route.useParams();
    const navigate = useNavigate();

    useEffect(() => {
        // Redirect to /app with shareToken parameter
        navigate({
            to: "/app",
            search: { shareToken: params.token },
            replace: true,
        });
    }, [params.token, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">{t("share_redirecting")}</p>
            </div>
        </div>
    );
}
