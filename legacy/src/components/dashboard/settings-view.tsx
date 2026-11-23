import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Shield,
    Users,
    FileText,
    ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShareModal } from "./share-modal";

interface SharedFile {
    id: string;
    name: string;
    mimeType: string;
    extension: string;
    updatedAt: number;
}

interface SettingsViewProps {
    files: any[]; // We can use more specific type if needed, but the layout passes the files from API
    onRefresh: () => void;
}

export function SettingsView({ files, onRefresh }: SettingsViewProps) {
    const { t } = useTranslation();
    const [selectedFileForShare, setSelectedFileForShare] = useState<{ id: string; name: string } | null>(null);

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10 px-1 italic-not-really">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.sidebar.settings")}</h1>
                <p className="text-muted-foreground italic">
                    {t("settings_description", "Hesap ayarlarınızı ve dosya izinlerinizi buradan yönetebilirsiniz.")}
                </p>
            </header>

            <Separator />

            <div className="grid gap-6">
                {/* Sharing & Collaboration Section */}
                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            <CardTitle className="text-lg">{t("settings_sharing_title", "Paylaşım ve İşbirliği")}</CardTitle>
                        </div>
                        <CardDescription>
                            {t("settings_sharing_desc", "Başkalarıyla paylaştığınız tüm dosyaları ve erişim izinlerini buradan takip edebilirsiniz.")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {files.length > 0 ? (
                                <div className="rounded-xl border border-border/40 overflow-hidden">
                                    <div className="bg-muted/30 px-4 py-2 border-b border-border/40 flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        <span>{t("dashboard.list.header_name", "Dosya Adı")}</span>
                                        <span>{t("dashboard.list.actions.label", "Eylemler")}</span>
                                    </div>
                                    <div className="divide-y divide-border/40">
                                        {files.map((file) => (
                                            <div key={file.id} className="flex items-center justify-between p-4 bg-background hover:bg-muted/10 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{file.name}</p>
                                                        <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                                                            {new Date(file.updatedAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="gap-2 h-8 rounded-lg"
                                                    onClick={() => setSelectedFileForShare({ id: file.id, name: file.name })}
                                                >
                                                    <Shield className="w-3.5 h-3.5" />
                                                    <span className="text-xs">{t("manage_access", "Erişimi Yönet")}</span>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border/60">
                                    <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-sm text-muted-foreground">
                                        {t("no_shared_files", "Henüz kimseyle bir dosya paylaşmadınız.")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

            </div>

            {selectedFileForShare && (
                <ShareModal
                    open={!!selectedFileForShare}
                    onOpenChange={(open) => !open && setSelectedFileForShare(null)}
                    fileId={selectedFileForShare.id}
                    fileName={selectedFileForShare.name}
                    onShareCreated={onRefresh}
                />
            )}
        </div>
    );
}
