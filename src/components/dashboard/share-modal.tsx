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

    // Check for existing share when modal opens
    const checkExistingShare = useCallback(async () => {
        if (!session?.session?.token || !open) return;

        try {
            const response = await fetch(`/api/files/share?fileId=${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${session.session.token}`
                }
            });

            if (response.ok) {
                const data = await response.json() as { shares: Array<{ shareToken: string; isActive: boolean }> };
                // Find active link share
                const activeShare = data.shares?.find(s => s.isActive && s.shareToken);
                if (activeShare) {
                    setShareUrl(`${window.location.origin}/shared/${activeShare.shareToken}`);
                }
            }
        } catch (err) {
            console.error("Error checking existing shares:", err);
        }
    }, [fileId, session, open]);

    useEffect(() => {
        if (open) {
            checkExistingShare();
        } else {
            // Reset state when modal closes
            setError(null);
            setCopied(false);
        }
    }, [open, checkExistingShare]);

    // Create share link
    const handleCreateShare = async () => {
        if (!session?.session?.token) {
            setError(t("share_error_no_session", "Oturum bulunamadı"));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/files/share', {
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

            if (!response.ok) {
                const data = await response.json() as { error?: string };
                throw new Error(data.error || t("share_error_generic"));
            }

            const data = await response.json() as { shareUrl: string };
            setShareUrl(data.shareUrl);
            onShareCreated?.();
        } catch (err) {
            console.error("Error creating share:", err);
            setError(err instanceof Error ? err.message : t("share_error_generic"));
        } finally {
            setLoading(false);
        }
    };

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
                                onClick={() => setError(null)}
                            >
                                {t("share_modal_close")}
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

                    {/* Create share button (when no URL exists) */}
                    {!shareUrl && !loading && !error && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <p className="text-sm text-muted-foreground mb-4">
                                {t("share_modal_description_create", "Bu dosya için paylaşım linki oluşturun")}
                            </p>
                            <Button onClick={handleCreateShare} className="gap-2">
                                <Share2 className="w-4 h-4" />
                                {t("share_modal_create_link", "Paylaşım Linki Oluştur")}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
