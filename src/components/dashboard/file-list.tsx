import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, AlertTriangle, MoreVertical, Eye, Download, Pencil, Trash2, Star, Share2, Info, RotateCcw, X, Calendar, FileBox, User, ChevronLeft, ChevronRight } from "lucide-react";
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
  permission?: 'view' | 'edit' | 'admin';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [shareFileName, setShareFileName] = useState("");

  // Local files state for optimistic updates
  const [localFiles, setLocalFiles] = useState<FileItem[]>(files);

  // Sync local files with prop
  useEffect(() => {
    setLocalFiles(files);
  }, [files]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset page when files or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [files, searchQuery, activeSection]);

  const itemsPerPage = isMobile ? 10 : 20;

  const filteredFiles = localFiles
    .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return a.size - b.size;
      if (sortBy === "date") {
        const dateA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
        const dateB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
        return dateB - dateA;
      }
      return 0;
    });

  // Pagination
  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
  const paginatedFiles = filteredFiles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Download file with parallel chunks
  const handleDownload = useCallback(async (file: FileItem) => {
    try {
      setActionLoading(file.id);

      // Dynamic import to avoid SSR issues
      const { downloadFileParallel } = await import('@/lib/parallel-download');

      await downloadFileParallel(file.id, file.name, (progress) => {
        // Optional: Could add progress UI here
        console.log(`Download progress: ${progress.percent}%`);
      });

    } catch (err) {
      console.error("Download error:", err);
      alert(t("dashboard.list.actions.download") + " " + t("dashboard.upload.failed") + ": " + (err instanceof Error ? err.message : t("share_error_generic")));
    } finally {
      setActionLoading(null);
    }
  }, [t]);

  // Toggle star
  const handleToggleStar = useCallback(async (file: FileItem) => {
    // Optimistic update
    setLocalFiles(prev => prev.map(f =>
      f.id === file.id ? { ...f, isStarred: !f.isStarred } : f
    ));

    try {
      const response = await fetch('/api/files/star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (!response.ok) {
        // Revert on error
        setLocalFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, isStarred: file.isStarred } : f
        ));
        throw new Error("Yıldız işlemi başarısız");
      }
    } catch (err) {
      console.error("Star toggle error:", err);
    }
  }, []);

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
      alert(t("dashboard.list.actions.move_to_trash") + " " + t("dashboard.upload.failed") + ": " + (err instanceof Error ? err.message : t("share_error_generic")));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh, t]);

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
      alert(t("dashboard.list.actions.restore") + " " + t("dashboard.upload.failed") + ": " + (err instanceof Error ? err.message : t("share_error_generic")));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh, t]);

  // Permanently delete
  const handlePermanentDelete = useCallback(async (file: FileItem) => {
    if (!confirm(t("dashboard.list.actions.delete_confirm"))) {
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
      alert(t("dashboard.list.actions.permanent_delete") + " " + t("dashboard.upload.failed") + ": " + (err instanceof Error ? err.message : t("share_error_generic")));
    } finally {
      setActionLoading(null);
    }
  }, [onRefresh, t]);

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
      alert(t("dashboard.rename.title") + " " + t("dashboard.upload.failed") + ": " + (err instanceof Error ? err.message : t("share_error_generic")));
    } finally {
      setActionLoading(null);
    }
  }, [renameFileId, newFileName, onRefresh, t]);

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

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

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
        <p className="text-destructive font-medium">{t("dashboard.list.error_title")}</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (filteredFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p className="text-lg">{t("dashboard.list.empty_title")}</p>
        <p className="text-sm mt-2">
          {activeSection === 'my-files' && t("dashboard.list.empty_desc_my_files")}
          {activeSection === 'starred' && t("dashboard.list.empty_desc_starred")}
          {activeSection === 'recent' && t("dashboard.list.empty_desc_recent")}
          {activeSection === 'trash' && t("dashboard.list.empty_desc_trash")}
        </p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {paginatedFiles.map((item) => (
            <Card
              key={item.id}
              className="group bg-card hover:bg-secondary/50 cursor-pointer transition-all border-transparent hover:border-border overflow-hidden"
            >
              <div
                className="aspect-[4/3] bg-secondary/50 relative cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handlePreview(item)}
              >
                {/* Yıldız toggle butonu */}
                <button
                  className="absolute top-2 right-2 z-10 p-1 rounded-full bg-background/80 hover:bg-background transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStar(item);
                  }}
                  title={item.isStarred ? t("dashboard.list.actions.unstar") : t("dashboard.list.actions.star")}
                >
                  <Star className={`w-4 h-4 ${item.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`} />
                </button>
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
                    t={t}
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
          t={t}
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
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {t("dashboard.list.pagination.page", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {/* List Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
          <div className="col-span-6 flex items-center gap-3">
            <Checkbox className="h-4 w-4" />
            <span>{t("dashboard.list.name")}</span>
          </div>
          <div className="col-span-2">{t("dashboard.list.owner")}</div>
          <div className="col-span-2">{t("dashboard.list.last_modified")}</div>
          <div className="col-span-1">{t("dashboard.list.size")}</div>
          <div className="col-span-1"></div>
        </div>

        {/* List Items */}
        {paginatedFiles.map((item) => (
          <div
            key={item.id}
            className="group grid grid-cols-12 gap-2 px-3 py-4 md:gap-4 md:px-4 md:py-2.5 rounded-lg hover:bg-secondary/50 cursor-pointer items-center"
            onClick={() => handlePreview(item)}
          >
            <div className="col-span-10 md:col-span-6 flex items-center gap-3 min-w-0">
              <Checkbox className="hidden md:block h-4 w-4 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />
              <div className="w-14 h-14 md:w-8 md:h-8 rounded bg-secondary overflow-hidden shrink-0 relative">
                <img
                  src={item.thumbnailR2Key ? `/api/files/thumbnail?fileId=${item.id}` : "/placeholder.svg"}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Yıldız toggle butonu */}
              <button
                className="shrink-0 p-1 rounded hover:bg-secondary transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStar(item);
                }}
                title={item.isStarred ? t("dashboard.list.actions.unstar") : t("dashboard.list.actions.star")}
              >
                <Star className={`w-4 h-4 ${item.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`} />
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-base md:text-sm font-medium truncate">{item.name}</span>
                <span className="text-sm md:text-xs text-muted-foreground md:hidden mt-0.5">
                  {(item.size / 1024 / 1024).toFixed(2)} MB • {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {item.extension && (
                <Badge variant="outline" className="text-xs font-normal shrink-0 hidden md:inline-flex">
                  {item.extension.toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="hidden md:block col-span-2 text-sm text-muted-foreground truncate">{item.userName || item.userId}</div>
            <div className="hidden md:block col-span-2 text-sm text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString()}
            </div>
            <div className="hidden md:block col-span-1 text-sm text-muted-foreground">
              {(item.size / 1024 / 1024).toFixed(2)} MB
            </div>
            <div className="col-span-2 md:col-span-1 flex justify-end">
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
                t={t}
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
        t={t}
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
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {t("dashboard.list.pagination.page", { current: currentPage, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
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
  t: (key: string) => string;
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
  t,
}: FileActionsProps) {
  const isLoading = actionLoading === item.id;
  const isTrash = activeSection === 'trash';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isTrash ? (
          <>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onRestore(item)}>
              <RotateCcw className="w-4 h-4" /> {t("dashboard.list.actions.restore")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive cursor-pointer" onClick={() => onPermanentDelete(item)}>
              <X className="w-4 h-4" /> {t("dashboard.list.actions.permanent_delete")}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onPreview(item)}>
              <Eye className="w-4 h-4" /> {t("dashboard.list.actions.preview")}
            </DropdownMenuItem>

            {(item.permission === 'admin' || item.permission === 'edit') && (
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDownload(item)}>
                <Download className="w-4 h-4" /> {t("dashboard.list.actions.download")}
              </DropdownMenuItem>
            )}

            {item.permission === 'admin' && (
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onShare(item)}>
                <Share2 className="w-4 h-4" /> {t("dashboard.list.actions.share")}
              </DropdownMenuItem>
            )}

            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onToggleStar(item)}>
              <Star className="w-4 h-4" /> {activeSection === 'starred' ? t("dashboard.list.actions.unstar") : t("dashboard.list.actions.star")}
            </DropdownMenuItem>

            {item.permission !== 'view' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onOpenRename(item)}>
                  <Pencil className="w-4 h-4" /> {t("dashboard.list.actions.rename")}
                </DropdownMenuItem>
              </>
            )}

            {item.permission === 'admin' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-destructive cursor-pointer" onClick={() => onMoveToTrash(item)}>
                  <Trash2 className="w-4 h-4" /> {t("dashboard.list.actions.move_to_trash")}
                </DropdownMenuItem>
              </>
            )}
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
  t: (key: string) => string;
}

function RenameDialog({ open, onOpenChange, newFileName, onNewFileNameChange, onSubmit, loading, t }: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dashboard.rename.title")}</DialogTitle>
        </DialogHeader>
        <Input
          value={newFileName}
          onChange={(e) => onNewFileNameChange(e.target.value)}
          placeholder={t("dashboard.rename.placeholder")}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSubmit();
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("dashboard.rename.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={loading || !newFileName.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("dashboard.rename.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
