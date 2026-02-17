import { useState, useEffect, useCallback } from "react";
import { Share2, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "react-i18next";

interface ShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: string;
    fileName: string;
    onShareCreated?: () => void;
}

export function ShareModal({ open, onOpenChange, fileId, fileName, onShareCreated }: ShareModalProps) {
    const { t } = useTranslation();
    const { data: session } = useSession();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Initialize share (check existing or create new)
    const initShare = useCallback(async () => {
        if (!session?.session?.token || !open) return;

        setLoading(true);
        setError(null);

        try {
            // 1. Check for existing share
            const checkRes = await fetch(`/api/files/share?fileId=${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${session.session.token}`
                }
            });

            if (checkRes.ok) {
                const data = await checkRes.json() as { shares: Array<{ shareToken: string; isActive: boolean }> };
                const activeShare = data.shares?.find(s => s.isActive && s.shareToken);
                if (activeShare) {
                    setShareUrl(`${window.location.origin}/shared/${activeShare.shareToken}`);
                    setLoading(false);
                    return;
                }
            }

            // 2. If no active share or check failed, create once
            const createRes = await fetch('/api/files/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.session.token}`
                },
                body: JSON.stringify({
                    fileId,
                    shareType: 'link',
                    permission: 'view',
                }),
            });

            if (!createRes.ok) {
                const data = await createRes.json() as { error?: string };
                throw new Error(data.error || t("share_error_generic"));
            }

            const data = await createRes.json() as { shareUrl: string };
            setShareUrl(data.shareUrl);
            onShareCreated?.();
        } catch (err) {
            console.error("Error initializing share:", err);
            setError(err instanceof Error ? err.message : t("share_error_generic"));
        } finally {
            setLoading(false);
        }
    }, [fileId, session, open, t, onShareCreated]);

    useEffect(() => {
        if (open) {
            initShare();
        } else {
            // Reset state when modal closes
            setShareUrl(null);
            setError(null);
            setCopied(false);
        }
    }, [open, initShare]);

    // Copy URL to clipboard
    const handleCopy = async () => {
        if (!shareUrl) return;

        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5" />
                        {t("share_modal_title")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* File name */}
                    <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{fileName}</span>
                    </div>

                    {/* Loading state */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                            <p className="text-sm text-muted-foreground">{t("share_modal_creating")}</p>
                        </div>
                    )}

                    {/* Error state */}
                    {error && !loading && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
                            <p className="text-sm text-red-500">{error}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => initShare()}
                            >
                                {t("try_again", "Tekrar Dene")}
                            </Button>
                        </div>
                    )}

                    {/* URL display and copy */}
                    {shareUrl && !loading && !error && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                {t("share_modal_description")}
                            </p>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={shareUrl}
                                    readOnly
                                    className="flex-1 text-xs"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleCopy}
                                    className="shrink-0"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                            {copied && (
                                <p className="text-xs text-green-600">{t("share_modal_copied")}</p>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
