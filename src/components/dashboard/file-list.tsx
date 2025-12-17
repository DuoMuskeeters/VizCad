import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, AlertTriangle, MoreVertical, Eye, Download, Pencil, Trash2, Star, Share2, Info, RotateCcw, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShareModal } from "./share-modal";

interface FileItem {
  id: string;
  name: string;
  r2Key: string;
  size: number;
  mimeType: string;
  extension: string;
  status: 'pending' | 'uploaded' | 'failed';
  userId: string;
  createdAt: number;
  updatedAt: number;
  userName?: string;
  isStarred?: boolean;
  deletedAt?: number;
  thumbnailR2Key?: string | null;
}

interface FileListProps {
  viewMode: "grid" | "list";
  searchQuery: string;
  sortBy: string;
  onFolderClick: (folderName: string) => void;
  files: FileItem[];
  isLoading: boolean;
  error: Error | null;
  activeSection: string;
  onRefresh: () => void;
}

export function FileList({
  viewMode,
  searchQuery,
  sortBy,
  onFolderClick,
  files,
  isLoading,
  error,
  activeSection,
  onRefresh
}: FileListProps) {
  const navigate = useNavigate();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [shareFileName, setShareFileName] = useState("");

  const filteredFiles = files
    .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return a.size - b.size;
      if (sortBy === "date") return b.createdAt - a.createdAt;
      return 0;
    });

  // Download file
  const handleDownload = useCallback(async (file: FileItem) => {
    try {
      setActionLoading(file.id);
      const response = await fetch(`/api/files/download?fileId=${file.id}`);
      if (!response.ok) {
        throw new Error("İndirme başarısız");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
      alert("Dosya indirilemedi: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Toggle star
  const handleToggleStar = useCallback(async (file: FileItem) => {
    try {
      setActionLoading(file.id);
      const response = await fetch('/api/files/star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (!response.ok) {
        throw new Error("Yıldız eklenemedi");
      }
      onRefresh();
    } catch (err) {
      console.error("Star toggle error:", err);
      alert("Yıldız işlemi başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh]);

  // Move to trash
  const handleMoveToTrash = useCallback(async (file: FileItem) => {
    try {
      setActionLoading(file.id);
      const response = await fetch('/api/files/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (!response.ok) {
        throw new Error("Silinemedi");
      }
      onRefresh();
    } catch (err) {
      console.error("Trash error:", err);
      alert("Silme işlemi başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh]);

  // Restore from trash
  const handleRestore = useCallback(async (file: FileItem) => {
    try {
      setActionLoading(file.id);
      const response = await fetch('/api/files/trash', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (!response.ok) {
        throw new Error("Geri yüklenemedi");
      }
      onRefresh();
    } catch (err) {
      console.error("Restore error:", err);
      alert("Geri yükleme başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh]);

  // Permanently delete
  const handlePermanentDelete = useCallback(async (file: FileItem) => {
    if (!confirm("Bu dosyayı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      return;
    }
    try {
      setActionLoading(file.id);
      const response = await fetch(`/api/files/trash?fileId=${file.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error("Kalıcı silinemedi");
      }
      onRefresh();
    } catch (err) {
      console.error("Permanent delete error:", err);
      alert("Kalıcı silme başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh]);

  // Open rename dialog
  const handleOpenRename = useCallback((file: FileItem) => {
    setRenameFileId(file.id);
    setNewFileName(file.name);
    setRenameDialogOpen(true);
  }, []);

  // Submit rename
  const handleRenameSubmit = useCallback(async () => {
    if (!renameFileId || !newFileName.trim()) return;
    try {
      setActionLoading(renameFileId);
      const response = await fetch('/api/files/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: renameFileId, newName: newFileName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Yeniden adlandırılamadı");
      }
      setRenameDialogOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Rename error:", err);
      alert("Yeniden adlandırma başarısız: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setActionLoading(null);
    }
  }, [renameFileId, newFileName, onRefresh]);

  // Navigate to file preview
  const handlePreview = useCallback((file: FileItem) => {
    navigate({ to: '/file/$fileId', params: { fileId: file.id } });
  }, [navigate]);

  // Open share modal
  const handleOpenShare = useCallback((file: FileItem) => {
    setShareFileId(file.id);
    setShareFileName(file.name);
    setShareModalOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-destructive/10 rounded-lg">
        <AlertTriangle className="w-8 h-8 text-destructive mb-2" />
        <p className="text-destructive font-medium">Dosyalar yüklenemedi</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (filteredFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p className="text-lg">Bu bölümde dosya bulunamadı</p>
        <p className="text-sm mt-2">
          {activeSection === 'my-files' && "Dosya yüklemek için 'Yeni' butonunu kullanın"}
          {activeSection === 'starred' && "Henüz yıldızlı dosyanız yok"}
          {activeSection === 'recent' && "Son görüntülenen dosya yok"}
          {activeSection === 'trash' && "Çöp kutusu boş"}
        </p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredFiles.map((item) => (
            <Card
              key={item.id}
              className="group bg-card hover:bg-secondary/50 cursor-pointer transition-all border-transparent hover:border-border overflow-hidden"
            >
              <div className="aspect-[4/3] bg-secondary/50 relative">
                <img
                  src={item.thumbnailR2Key ? `/api/files/thumbnail?fileId=${item.id}` : "/placeholder.svg"}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                {item.extension && (
                  <Badge
                    variant="secondary"
                    className="absolute bottom-2 left-2 bg-background/90 text-xs font-normal"
                  >
                    {item.extension.toUpperCase()}
                  </Badge>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <FileActions
                    item={item}
                    activeSection={activeSection}
                    actionLoading={actionLoading}
                    onDownload={handleDownload}
                    onToggleStar={handleToggleStar}
                    onMoveToTrash={handleMoveToTrash}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                    onOpenRename={handleOpenRename}
                    onPreview={handlePreview}
                    onShare={handleOpenShare}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
        <RenameDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          newFileName={newFileName}
          onNewFileNameChange={setNewFileName}
          onSubmit={handleRenameSubmit}
          loading={actionLoading === renameFileId}
        />
        {shareFileId && (
          <ShareModal
            open={shareModalOpen}
            onOpenChange={setShareModalOpen}
            fileId={shareFileId}
            fileName={shareFileName}
            onShareCreated={onRefresh}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {/* List Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
          <div className="col-span-6 flex items-center gap-3">
            <Checkbox className="h-4 w-4" />
            <span>Ad</span>
          </div>
          <div className="col-span-2">Sahip</div>
          <div className="col-span-2">Son değiştirme</div>
          <div className="col-span-1">Boyut</div>
          <div className="col-span-1"></div>
        </div>

        {/* List Items */}
        {filteredFiles.map((item) => (
          <div
            key={item.id}
            className="group grid grid-cols-12 gap-4 px-4 py-2.5 rounded-lg hover:bg-secondary/50 cursor-pointer items-center"
          >
            <div className="col-span-6 flex items-center gap-3 min-w-0">
              <Checkbox className="h-4 w-4 opacity-0 group-hover:opacity-100" />
              <div className="w-8 h-8 rounded bg-secondary overflow-hidden shrink-0">
                <img
                  src={item.thumbnailR2Key ? `/api/files/thumbnail?fileId=${item.id}` : "/placeholder.svg"}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm truncate">{item.name}</span>
              {item.extension && (
                <Badge variant="outline" className="text-xs font-normal shrink-0">
                  {item.extension.toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="col-span-2 text-sm text-muted-foreground truncate">{item.userName || item.userId}</div>
            <div className="col-span-2 text-sm text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString()}
            </div>
            <div className="col-span-1 text-sm text-muted-foreground">
              {(item.size / 1024 / 1024).toFixed(2)} MB
            </div>
            <div className="col-span-1 flex justify-end">
              <FileActions
                item={item}
                activeSection={activeSection}
                actionLoading={actionLoading}
                onDownload={handleDownload}
                onToggleStar={handleToggleStar}
                onMoveToTrash={handleMoveToTrash}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                onOpenRename={handleOpenRename}
                onPreview={handlePreview}
                onShare={handleOpenShare}
              />
            </div>
          </div>
        ))}
      </div>
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        newFileName={newFileName}
        onNewFileNameChange={setNewFileName}
        onSubmit={handleRenameSubmit}
        loading={actionLoading === renameFileId}
      />
      {shareFileId && (
        <ShareModal
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
          fileId={shareFileId}
          fileName={shareFileName}
          onShareCreated={onRefresh}
        />
      )}
    </>
  );
}

// File Actions Dropdown Component
interface FileActionsProps {
  item: FileItem;
  activeSection: string;
  actionLoading: string | null;
  onDownload: (item: FileItem) => void;
  onToggleStar: (item: FileItem) => void;
  onMoveToTrash: (item: FileItem) => void;
  onRestore: (item: FileItem) => void;
  onPermanentDelete: (item: FileItem) => void;
  onOpenRename: (item: FileItem) => void;
  onPreview: (item: FileItem) => void;
  onShare: (item: FileItem) => void;
}

function FileActions({
  item,
  activeSection,
  actionLoading,
  onDownload,
  onToggleStar,
  onMoveToTrash,
  onRestore,
  onPermanentDelete,
  onOpenRename,
  onPreview,
  onShare,
}: FileActionsProps) {
  const isLoading = actionLoading === item.id;
  const isTrash = activeSection === 'trash';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isTrash ? (
          <>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onRestore(item)}>
              <RotateCcw className="w-4 h-4" /> Geri Yükle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive cursor-pointer" onClick={() => onPermanentDelete(item)}>
              <X className="w-4 h-4" /> Kalıcı Olarak Sil
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onPreview(item)}>
              <Eye className="w-4 h-4" /> Önizle
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDownload(item)}>
              <Download className="w-4 h-4" /> İndir
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onShare(item)}>
              <Share2 className="w-4 h-4" /> Paylaş
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onToggleStar(item)}>
              <Star className="w-4 h-4" /> {activeSection === 'starred' ? "Yıldızı Kaldır" : "Yıldızlı'ya ekle"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onOpenRename(item)}>
              <Pencil className="w-4 h-4" /> Yeniden adlandır
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer">
              <Info className="w-4 h-4" /> Ayrıntıları görüntüle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive cursor-pointer" onClick={() => onMoveToTrash(item)}>
              <Trash2 className="w-4 h-4" /> Çöp kutusuna taşı
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Rename Dialog Component
interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newFileName: string;
  onNewFileNameChange: (name: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

function RenameDialog({ open, onOpenChange, newFileName, onNewFileNameChange, onSubmit, loading }: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dosyayı Yeniden Adlandır</DialogTitle>
        </DialogHeader>
        <Input
          value={newFileName}
          onChange={(e) => onNewFileNameChange(e.target.value)}
          placeholder="Yeni dosya adı"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSubmit();
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={onSubmit} disabled={loading || !newFileName.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
