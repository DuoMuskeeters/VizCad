import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, AlertTriangle, MoreVertical, Eye, Download, Pencil, Trash2, Star, Share2, Info, RotateCcw, X, Calendar, FileBox, User, ChevronLeft, ChevronRight, MessageSquare, HardDrive } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  userImage?: string | null;
  isStarred?: boolean;
  deletedAt?: number;
  thumbnailR2Key?: string | null;
  permission?: 'view' | 'edit' | 'admin';
  commentCount?: number;
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
              className="group bg-card hover:bg-secondary/30 cursor-pointer transition-all duration-300 border-border/40 hover:border-primary/50 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1"
            >
              <div
                className="aspect-[4/3] bg-muted/30 relative cursor-pointer overflow-hidden"
                onClick={() => handlePreview(item)}
              >
                {/* Thumbnails with hover effect */}
                <img
                  src={item.thumbnailR2Key ? `/api/files/thumbnail?fileId=${item.id}` : "/placeholder.svg"}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* Status Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Star Toggle - Top Right */}
                <button
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background transition-all shadow-sm opacity-0 group-hover:opacity-100 transform translate-y-[-10px] group-hover:translate-y-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStar(item);
                  }}
                >
                  <Star className={`w-3.5 h-3.5 ${item.isStarred ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`} />
                </button>

                {/* Owner Mini-Avatar - Bottom Right */}
                <div className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Avatar className="h-6 w-6 border-2 border-background shadow-sm">
                    <AvatarImage src={item.userImage || ""} alt={item.userName || ""} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {item.userName?.[0]?.toUpperCase() || <User className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* File Extension Badge - Top Left */}
                {item.extension && (
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm text-[10px] font-semibold py-0 px-2 h-5 border-border/50"
                  >
                    {item.extension.toUpperCase()}
                  </Badge>
                )}
              </div>

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors pr-1" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* Metadata row */}
                      <div className="flex items-center text-[10.5px] text-muted-foreground whitespace-nowrap bg-secondary/40 px-1.5 py-0.5 rounded">
                        <Calendar className="w-3 h-3 mr-1 opacity-70" />
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center text-[10.5px] text-muted-foreground whitespace-nowrap bg-secondary/40 px-1.5 py-0.5 rounded">
                        <HardDrive className="w-3 h-3 mr-1 opacity-70" />
                        {formatSize(item.size)}
                      </div>
                      {item.commentCount && item.commentCount > 0 ? (
                        <div className="flex items-center text-[10.5px] text-primary whitespace-nowrap bg-primary/10 px-1.5 py-0.5 rounded animate-in fade-in zoom-in duration-300">
                          <MessageSquare className="w-3 h-3 mr-1 fill-primary/20" />
                          {item.commentCount}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 -mr-1">
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
            className="group grid grid-cols-12 gap-2 px-3 py-4 md:gap-4 md:px-4 md:py-2.5 rounded-xl hover:bg-secondary/40 cursor-pointer items-center border border-transparent hover:border-border/50 transition-all duration-200"
            onClick={() => handlePreview(item)}
          >
            <div className="col-span-10 md:col-span-6 flex items-center gap-3 min-w-0">
              <Checkbox className="hidden md:block h-4 w-4 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />
              <div className="w-14 h-14 md:w-10 md:h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 relative border border-border/40 shadow-sm group-hover:scale-105 transition-transform duration-300">
                <img
                  src={item.thumbnailR2Key ? `/api/files/thumbnail?fileId=${item.id}` : "/placeholder.svg"}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm md:text-[14px] font-semibold truncate group-hover:text-primary transition-colors">{item.name}</span>
                  {item.isStarred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 md:hidden">
                  <span className="text-xs text-muted-foreground">{formatSize(item.size)}</span>
                  <span className="text-xs text-muted-foreground opacity-40">•</span>
                  <span className="text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {item.commentCount && item.commentCount > 0 ? (
                <div className="hidden md:flex items-center text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                  <MessageSquare className="w-3 h-3 mr-1" />
                  {item.commentCount}
                </div>
              ) : null}

              {item.extension && (
                <Badge variant="outline" className="text-[10px] font-bold shrink-0 hidden md:inline-flex bg-background h-5">
                  {item.extension.toUpperCase()}
                </Badge>
              )}
            </div>

            <div className="hidden md:flex col-span-2 items-center gap-2 min-w-0">
              <Avatar className="h-6 w-6 shrink-0 border border-border">
                <AvatarImage src={item.userImage || ""} />
                <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground font-medium">
                  {item.userName?.[0]?.toUpperCase() || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-foreground/80 truncate">{item.userName || item.userId}</span>
            </div>

            <div className="hidden md:block col-span-2 text-xs text-muted-foreground font-medium">
              {new Date(item.updatedAt).toLocaleDateString()}
            </div>

            <div className="hidden md:block col-span-1 text-xs text-muted-foreground font-medium">
              {formatSize(item.size)}
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
