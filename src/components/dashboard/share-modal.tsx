import { useState, useEffect, useCallback } from "react";
import {
    Share2, Copy, Check, Loader2, AlertCircle,
    UserPlus, Trash2, User, Globe, Mail,
    ShieldCheck, Eye, Edit2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: string;
    fileName: string;
    onShareCreated?: () => void;
}

interface ShareRecord {
    id: string;
    shareType: 'link' | 'user';
    permission: 'view' | 'edit' | 'admin';
    shareToken: string | null;
    sharedWithUserId: string | null;
    sharedWithUserName: string | null;
    sharedWithUserEmail: string | null;
    isActive: boolean;
    createdAt: string;
}

interface InvitationRecord {
    id: string;
    email: string;
    permission: 'view' | 'edit' | 'admin';
    createdAt: string;
}

export function ShareModal({ open, onOpenChange, fileId, fileName, onShareCreated }: ShareModalProps) {
    const { t } = useTranslation();
    const { data: session } = useSession();

    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // New collaboration state
    const [email, setEmail] = useState("");
    const [invitePermission, setInvitePermission] = useState<"view" | "edit">("view");
    const [shares, setShares] = useState<ShareRecord[]>([]);
    const [invitations, setInvitations] = useState<InvitationRecord[]>([]);

    // Fetch shares and invitations
    const fetchData = useCallback(async () => {
        if (!session?.session?.token || !open) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/files/share?fileId=${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${session.session.token}`
                }
            });

            if (res.ok) {
                const data = await res.json() as { shares: ShareRecord[]; invitations: InvitationRecord[] };
                setShares(data.shares || []);
                setInvitations(data.invitations || []);

                // Find potential link share for the URL display
                const linkShare = data.shares?.find((s: ShareRecord) => s.shareType === 'link' && s.isActive);
                if (linkShare) {
                    setShareUrl(`${window.location.origin}/shared/${linkShare.shareToken}`);
                } else {
                    setShareUrl(null);
                }
            }
        } catch (err) {
            console.error("Error fetching share data:", err);
        } finally {
            setLoading(false);
        }
    }, [fileId, session, open]);

    useEffect(() => {
        if (open) {
            fetchData();
        } else {
            setShareUrl(null);
            setError(null);
            setCopied(false);
            setEmail("");
        }
    }, [open, fetchData]);

    // Handle Copy
    const handleCopy = async () => {
        if (!shareUrl) return;
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Handle Create/Update Link Share
    const handleToggleLink = async () => {
        if (!session?.session?.token) return;
        setLoading(true);
        try {
            const linkShare = shares.find(s => s.shareType === 'link');

            if (linkShare && linkShare.isActive) {
                // Deactivate
                await fetch('/api/files/share', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.session.token}`
                    },
                    body: JSON.stringify({ shareId: linkShare.id, isActive: false }),
                });
            } else if (linkShare) {
                // Reactivate
                await fetch('/api/files/share', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.session.token}`
                    },
                    body: JSON.stringify({ shareId: linkShare.id, isActive: true }),
                });
            } else {
                // Create new
                await fetch('/api/files/share', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.session.token}`
                    },
                    body: JSON.stringify({ fileId, shareType: 'link', permission: 'view' }),
                });
            }
            await fetchData();
            onShareCreated?.();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Handle Invite
    const handleInvite = async () => {
        if (!email || !session?.session?.token) return;
        setActionLoading('invite');
        try {
            const res = await fetch('/api/files/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.session.token}`
                },
                body: JSON.stringify({
                    fileId,
                    shareType: 'user',
                    email,
                    permission: invitePermission
                }),
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || "Davet gönderilemedi");
            }

            setEmail("");
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error");
        } finally {
            setActionLoading(null);
        }
    };

    // Handle Removal
    const handleRemove = async (id: string) => {
        if (!session?.session?.token) return;
        setActionLoading(id);
        try {
            await fetch(`/api/files/share?shareId=${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.session.token}`
                },
            });
            await fetchData();
        } finally {
            setActionLoading(null);
        }
    };

    // Handle Permission Change
    const handlePermissionChange = async (id: string, newPermission: string) => {
        if (!session?.session?.token) return;
        setActionLoading(id);
        try {
            await fetch('/api/files/share', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.session.token}`
                },
                body: JSON.stringify({ shareId: id, permission: newPermission }),
            });
            await fetchData();
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
                <div className="p-6 pb-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Share2 className="w-5 h-5 text-primary" />
                            {t("share_modal_title")}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                        {fileName}
                    </p>
                </div>

                <div className="px-6 pb-6 space-y-6">
                    {/* Invite Section */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium">{t("invite_people", "Kişi Davet Et")}</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="email@example.com"
                                    className="pl-9"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                                />
                            </div>
                            <Select
                                value={invitePermission}
                                onValueChange={(v: any) => setInvitePermission(v)}
                            >
                                <SelectTrigger className="w-[100px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="view">{t("role_viewer", "İzleyici")}</SelectItem>
                                    <SelectItem value="edit">{t("role_editor", "Düzenleyici")}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleInvite}
                                disabled={!email || actionLoading === 'invite'}
                            >
                                {actionLoading === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                <span className="ml-2 hidden sm:inline">{t("invite", "Davet Et")}</span>
                            </Button>
                        </div>
                        {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>

                    <Separator />

                    {/* Manage Access Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">{t("manage_access", "Erişimi Yönet")}</h3>
                            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        </div>

                        <ScrollArea className="h-[240px] pr-4 -mr-4">
                            <div className="space-y-4">
                                {/* Owner (Static for now) */}
                                <div className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <ShieldCheck className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{session?.user?.name || "Owner"}</p>
                                            <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-[10px] uppercase">{t("role_owner", "Sahip")}</Badge>
                                </div>

                                {/* Active Shares */}
                                {shares.filter(s => s.shareType === 'user').map(share => (
                                    <div key={share.id} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                                                <User className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="max-w-[180px] sm:max-w-none">
                                                <p className="text-sm font-medium truncate">{share.sharedWithUserName}</p>
                                                <p className="text-xs text-muted-foreground truncate">{share.sharedWithUserEmail}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Select
                                                value={share.permission}
                                                onValueChange={(v) => handlePermissionChange(share.id, v)}
                                                disabled={!!actionLoading}
                                            >
                                                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted focus:ring-0 text-xs w-[90px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="view">{t("role_viewer", "İzleyici")}</SelectItem>
                                                    <SelectItem value="edit">{t("role_editor", "Düzenleyici")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                                onClick={() => handleRemove(share.id)}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === share.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {/* Invitations */}
                                {invitations.map(invite => (
                                    <div key={invite.id} className="flex items-center justify-between group grayscale-[0.5] opacity-80">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                                                <Mail className="w-4 h-4 text-amber-600" />
                                            </div>
                                            <div className="max-w-[180px] sm:max-w-none">
                                                <p className="text-sm font-medium truncate italic">{t("pending_invitation", "Bekleyen Davet")}</p>
                                                <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Select
                                                value={invite.permission}
                                                onValueChange={(v) => handlePermissionChange(invite.id, v)}
                                                disabled={!!actionLoading}
                                            >
                                                <SelectTrigger className="h-8 border-none bg-transparent hover:bg-muted focus:ring-0 text-xs w-[90px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="view">{t("role_viewer", "İzleyici")}</SelectItem>
                                                    <SelectItem value="edit">{t("role_editor", "Düzenleyici")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                                onClick={() => handleRemove(invite.id)}
                                                disabled={!!actionLoading}
                                            >
                                                {actionLoading === invite.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                {/* No shared users indicator */}
                                {shares.filter(s => s.shareType === 'user').length === 0 && invitations.length === 0 && !loading && (
                                    <div className="py-4 text-center">
                                        <p className="text-xs text-muted-foreground">{t("no_shared_users", "Henüz kimseyle paylaşılmadı.")}</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <Separator />

                {/* Footer Section - Link Sharing */}
                <div className="p-6 bg-muted/30">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium">{t("link_sharing", "Bağlantı Paylaşımı")}</h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-primary"
                            onClick={handleToggleLink}
                        >
                            {shares.find(s => s.shareType === 'link' && s.isActive) ? t("disable_link", "Kapat") : t("enable_link", "Bağlantı Oluştur")}
                        </Button>
                    </div>

                    {shareUrl ? (
                        <div className="flex gap-2">
                            <Input
                                value={shareUrl}
                                readOnly
                                className="h-9 text-xs bg-white"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopy}
                                className="h-9 px-4"
                            >
                                {copied ? <Check className="w-3 h-3 mr-2 text-green-500" /> : <Copy className="w-3 h-3 mr-2" />}
                                {copied ? t("copied", "Kopyalandı") : t("copy", "Kopyala")}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center p-3 rounded-lg border border-dashed border-gray-300">
                            <p className="text-xs text-muted-foreground">{t("link_not_active", "Bağlantı paylaşımı kapalı.")}</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
