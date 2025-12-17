import { useState, useCallback } from "react";
import { Copy, Link2, Mail, Loader2, X, Check, Calendar, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface ShareModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileId: string;
    fileName: string;
    onShareCreated?: () => void;
}

interface ShareItem {
    id: string;
    shareType: 'link' | 'user';
    permission: 'view' | 'edit' | 'admin';
    shareToken: string | null;
    expiresAt: number | null;
    isActive: boolean;
    createdAt: number;
    sharedWithUserId: string | null;
    sharedWithUserName: string | null;
    sharedWithUserEmail: string | null;
}

export function ShareModal({ open, onOpenChange, fileId, fileName, onShareCreated }: ShareModalProps) {
    const [activeTab, setActiveTab] = useState<'link' | 'user'>('link');
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Link share settings
    const [permission, setPermission] = useState<'view' | 'edit' | 'admin'>('view');
    const [useExpiry, setUseExpiry] = useState(false);
    const [expiryDays, setExpiryDays] = useState(7);
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');

    // User share settings
    const [email, setEmail] = useState('');
    const [userPermission, setUserPermission] = useState<'view' | 'edit' | 'admin'>('view');

    // Existing shares
    const [shares, setShares] = useState<ShareItem[]>([]);
    const [sharesLoading, setSharesLoading] = useState(false);

    // Load existing shares when modal opens
    const loadShares = useCallback(async () => {
        setSharesLoading(true);
        try {
            const response = await fetch(`/api/files/share?fileId=${fileId}`);
            if (response.ok) {
                const data = await response.json() as { shares: ShareItem[] };
                setShares(data.shares);
            }
        } catch (error) {
            console.error("Error loading shares:", error);
        } finally {
            setSharesLoading(false);
        }
    }, [fileId]);

    // Create link share
    const handleCreateLinkShare = async () => {
        setLoading(true);
        try {
            const body: Record<string, unknown> = {
                fileId,
                shareType: 'link',
                permission,
            };

            if (useExpiry) {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + expiryDays);
                body.expiresAt = expiryDate.getTime();
            }

            if (usePassword && password) {
                body.password = password;
            }

            const response = await fetch('/api/files/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const data = await response.json() as { error?: string };
                throw new Error(data.error || 'Paylaşım oluşturulamadı');
            }

            const data = await response.json() as { shareUrl: string };
            setShareUrl(data.shareUrl);
            loadShares();
            onShareCreated?.();
        } catch (error) {
            console.error("Error creating link share:", error);
            alert(error instanceof Error ? error.message : 'Paylaşım oluşturulamadı');
        } finally {
            setLoading(false);
        }
    };

    // Create user share
    const handleCreateUserShare = async () => {
        if (!email.trim()) {
            alert('E-posta adresi gerekli');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/files/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId,
                    shareType: 'user',
                    permission: userPermission,
                    email: email.trim(),
                }),
            });

            if (!response.ok) {
                const data = await response.json() as { error?: string };
                throw new Error(data.error || 'Paylaşım oluşturulamadı');
            }

            setEmail('');
            loadShares();
            onShareCreated?.();
        } catch (error) {
            console.error("Error creating user share:", error);
            alert(error instanceof Error ? error.message : 'Paylaşım oluşturulamadı');
        } finally {
            setLoading(false);
        }
    };

    // Copy link to clipboard
    const handleCopyLink = () => {
        if (shareUrl) {
            navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Delete share
    const handleDeleteShare = async (shareId: string) => {
        try {
            const response = await fetch(`/api/files/share?shareId=${shareId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                loadShares();
            }
        } catch (error) {
            console.error("Error deleting share:", error);
        }
    };

    // Reset state when modal opens/closes
    const handleOpenChange = (newOpen: boolean) => {
        if (newOpen) {
            loadShares();
            setShareUrl(null);
            setCopied(false);
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link2 className="w-5 h-5" />
                        Paylaş: {fileName}
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'link' | 'user')}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="link" className="gap-2">
                            <Link2 className="w-4 h-4" />
                            Link ile Paylaş
                        </TabsTrigger>
                        <TabsTrigger value="user" className="gap-2">
                            <Mail className="w-4 h-4" />
                            Kullanıcıya Paylaş
                        </TabsTrigger>
                    </TabsList>

                    {/* Link Share Tab */}
                    <TabsContent value="link" className="space-y-4 mt-4">
                        {shareUrl ? (
                            <div className="space-y-3">
                                <Label>Paylaşım Linki</Label>
                                <div className="flex gap-2">
                                    <Input value={shareUrl} readOnly className="font-mono text-sm" />
                                    <Button onClick={handleCopyLink} variant="outline" size="icon">
                                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setShareUrl(null)}
                                >
                                    Yeni Link Oluştur
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label>Yetki Seviyesi</Label>
                                    <Select value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit' | 'admin')}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="view">Görüntüleme</SelectItem>
                                            <SelectItem value="edit">Düzenleme</SelectItem>
                                            <SelectItem value="admin">Yönetici</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">Son kullanma tarihi</span>
                                    </div>
                                    <Switch checked={useExpiry} onCheckedChange={setUseExpiry} />
                                </div>

                                {useExpiry && (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={expiryDays}
                                            onChange={(e) => setExpiryDays(parseInt(e.target.value) || 1)}
                                            min={1}
                                            max={365}
                                            className="w-20"
                                        />
                                        <span className="text-sm text-muted-foreground">gün sonra geçersiz olacak</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm">Şifre koruması</span>
                                    </div>
                                    <Switch checked={usePassword} onCheckedChange={setUsePassword} />
                                </div>

                                {usePassword && (
                                    <Input
                                        type="password"
                                        placeholder="Şifre girin"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                )}

                                <Button
                                    onClick={handleCreateLinkShare}
                                    className="w-full"
                                    disabled={loading}
                                >
                                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Link Oluştur
                                </Button>
                            </>
                        )}
                    </TabsContent>

                    {/* User Share Tab */}
                    <TabsContent value="user" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label>E-posta Adresi</Label>
                            <Input
                                type="email"
                                placeholder="kullanici@ornek.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Yetki Seviyesi</Label>
                            <Select value={userPermission} onValueChange={(v) => setUserPermission(v as 'view' | 'edit' | 'admin')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="view">Görüntüleme</SelectItem>
                                    <SelectItem value="edit">Düzenleme</SelectItem>
                                    <SelectItem value="admin">Yönetici</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            onClick={handleCreateUserShare}
                            className="w-full"
                            disabled={loading || !email.trim()}
                        >
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Kullanıcıyı Davet Et
                        </Button>
                    </TabsContent>
                </Tabs>

                {/* Existing Shares */}
                {shares.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <Label className="text-sm font-medium">Mevcut Paylaşımlar</Label>
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                            {shares.map((share) => (
                                <div key={share.id} className="flex items-center justify-between p-2 bg-secondary rounded-lg">
                                    <div className="flex items-center gap-2">
                                        {share.shareType === 'link' ? (
                                            <Link2 className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <Mail className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <span className="text-sm">
                                            {share.shareType === 'link'
                                                ? 'Link paylaşımı'
                                                : share.sharedWithUserEmail || share.sharedWithUserName}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                            {share.permission === 'view' ? 'Görüntüleme' :
                                                share.permission === 'edit' ? 'Düzenleme' : 'Yönetici'}
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleDeleteShare(share.id)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
