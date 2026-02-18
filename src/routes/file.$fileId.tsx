import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  Share2,
  MessageSquare,
  Clock,
  Users,
  FileBox,
  Loader2,
  Send,
  MoreVertical,
  Trash2,
  Reply,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  Info,
  HardDrive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareModal } from "@/components/dashboard/share-modal";
import { VtkApp } from "@/components/VtkApp.client";

interface FileDetail {
  id: string;
  name: string;
  r2Key: string;
  size: number;
  mimeType: string;
  extension: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  ownerName: string;
  ownerEmail: string;
  ownerImage: string | null;
}

interface Comment {
  id: string;
  content: string;
  parentId: string | null;
  userId: string;
  userName: string;
  userImage: string | null;
  createdAt: number;
  updatedAt: number;
}

interface FileDetailResponse {
  file: FileDetail;
  permission: string;
  isOwner: boolean;
  stats: {
    shareCount: number;
    commentCount: number;
    versionCount: number;
  };
}

export const Route = createFileRoute("/file/$fileId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: FileDetailPage,
});

function FileDetailPage() {
  const { fileId } = Route.useParams();
  const [fileData, setFileData] = useState<FileDetailResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Camera controls ref
  const cameraControlsRef = useRef<{
    resetCamera: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    setView: (view: string) => void;
  } | null>(null);

  // Fetch file details
  useEffect(() => {
    const fetchFileDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/files/detail?fileId=${fileId}`);
        if (!response.ok) {
          const data = await response.json() as { error?: string };
          throw new Error(data.error || "Dosya yüklenemedi");
        }
        const data = await response.json() as FileDetailResponse;
        setFileData(data);

        // If file is supported 3D format, fetch content for preview using parallel download
        const ext = data.file.extension.toLowerCase();
        if (['stl', 'obj', 'ply', 'step', 'stp', 'iges', 'igs', 'brep'].includes(ext)) {
          setIsPreviewLoading(true);
          // Get presigned URL and download with parallel chunks for better performance
          (async () => {
            try {
              const downloadRes = await fetch(`/api/files/download?fileId=${fileId}`);
              const downloadData = await downloadRes.json() as { url: string; fileName: string; fileSize: number; mimeType: string };

              const chunkSize = 10 * 1024 * 1024; // 10MB
              const { url, fileSize, mimeType } = downloadData;

              if (fileSize < chunkSize) {
                // Small file: single request
                const response = await fetch(url);
                const blob = await response.blob();
                const file = new File([blob], data.file.name, { type: mimeType });
                setPreviewFile(file);
              } else {
                // Large file: parallel chunk download
                const numChunks = Math.ceil(fileSize / chunkSize);
                const promises: Promise<{ index: number; data: ArrayBuffer }>[] = [];

                for (let i = 0; i < numChunks; i++) {
                  const start = i * chunkSize;
                  const end = Math.min(start + chunkSize - 1, fileSize - 1);
                  promises.push(
                    fetch(url, { headers: { 'Range': `bytes=${start}-${end}` } })
                      .then(res => res.arrayBuffer())
                      .then(buffer => ({ index: i, data: buffer }))
                  );
                }

                const results = await Promise.all(promises);
                results.sort((a, b) => a.index - b.index);

                const mergedBuffer = new Uint8Array(fileSize);
                let offset = 0;
                for (const result of results) {
                  mergedBuffer.set(new Uint8Array(result.data), offset);
                  offset += result.data.byteLength;
                }

                const blob = new Blob([mergedBuffer], { type: mimeType });
                const file = new File([blob], data.file.name, { type: mimeType });
                setPreviewFile(file);
              }
            } catch (err) {
              console.error("Preview download failed", err);
            } finally {
              setIsPreviewLoading(false);
            }
          })();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
      } finally {
        setLoading(false);
      }
    };

    fetchFileDetail();
  }, [fileId]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/files/comments?fileId=${fileId}`);
      if (response.ok) {
        const data = await response.json() as { comments: Comment[] };
        setComments(data.comments);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Submit comment
  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await fetch('/api/files/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          content: newComment.trim(),
          parentId: replyingTo,
        }),
      });

      if (!response.ok) {
        throw new Error("Yorum eklenemedi");
      }

      setNewComment("");
      setReplyingTo(null);
      fetchComments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Yorum eklenemedi");
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;

    try {
      const response = await fetch(`/api/files/comments?commentId=${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchComments();
      }
    } catch (err) {
      console.error("Error deleting comment:", err);
    }
  };

  // Download file with parallel chunks for better performance
  const handleDownload = async () => {
    if (!fileData) return;
    try {
      const { downloadFileParallel } = await import('@/lib/parallel-download');
      await downloadFileParallel(fileId, fileData.file.name, (progress) => {
        console.log(`Download progress: ${progress.percent}%`);
      });
    } catch (err) {
      console.error("Download error:", err);
      alert("Dosya indirilemedi");
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !fileData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <FileBox className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Dosya Bulunamadı</h2>
        <p className="text-muted-foreground mb-4">{error || "Dosya yüklenemedi"}</p>
        <Link to="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Dashboard'a Dön
          </Button>
        </Link>
      </div>
    );
  }

  const { file, permission, isOwner, stats } = fileData;

  return (
    <div className="min-h-screen bg-background pt-16">
      {/* Header */}
      <header className="border-b bg-card sticky top-16 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2 group">
                  <h1 className="text-lg font-semibold truncate max-w-sm">{file.name}</h1>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10">
                        <Info className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-80 p-0 overflow-hidden shadow-xl border-primary/20">
                      <div className="bg-primary/5 p-4 border-b border-primary/10">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-sm text-primary">Dosya Detayları</h3>
                          <Badge variant="outline" className="text-[10px] font-bold bg-background">
                            {file.extension.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{file.name}</p>
                      </div>

                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-tight">Sahibi</span>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-5 h-5 border">
                                <AvatarImage src={file.ownerImage || undefined} />
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                  {file.ownerName?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate font-medium text-xs">{file.ownerName}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-tight">Boyut</span>
                            <span className="text-xs font-semibold">{formatSize(file.size)}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-2.5 rounded-lg border border-border/40">
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-wider flex items-center gap-1">
                              <Clock className="w-3 h-3 text-primary/60" /> Oluşturulma
                            </span>
                            <span className="text-[10px] font-medium">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-wider flex items-center gap-1">
                              <RotateCcw className="w-3 h-3 text-primary/60" /> Güncelleme
                            </span>
                            <span className="text-[10px] font-medium">{formatDate(file.updatedAt)}</span>
                          </div>
                        </div>

                        {/* Stats Grid inside Item */}
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div className="bg-background border rounded-lg p-2 text-center">
                            <Users className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                            <div className="text-xs font-bold">{stats.shareCount}</div>
                            <div className="text-[8px] text-muted-foreground font-semibold uppercase">Paylaşım</div>
                          </div>
                          <div className="bg-background border rounded-lg p-2 text-center">
                            <MessageSquare className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                            <div className="text-xs font-bold">{stats.commentCount}</div>
                            <div className="text-[8px] text-muted-foreground font-semibold uppercase">Yorum</div>
                          </div>
                          <div className="bg-background border rounded-lg p-2 text-center">
                            <FileBox className="w-3 h-3 text-muted-foreground mx-auto mb-1" />
                            <div className="text-xs font-bold">{stats.versionCount}</div>
                            <div className="text-[8px] text-muted-foreground font-semibold uppercase">Versiyon</div>
                          </div>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{file.extension.toUpperCase()}</Badge>
                  <span>•</span>
                  <span>{formatSize(file.size)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                İndir
              </Button>
              {(isOwner || permission === 'admin') && (
                <Button variant="outline" size="sm" onClick={() => setShareModalOpen(true)}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Paylaş
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 3D Preview */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden h-[400px] lg:h-[500px]">
              <div className="w-full h-full bg-secondary relative">
                {isPreviewLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Model yükleniyor...</span>
                  </div>
                ) : previewFile ? (
                  <>
                    <Suspense fallback={
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    }>
                      <VtkApp
                        file={previewFile}
                        displayState={{
                          wireframe: false,
                          grid: false,
                          axes: true,
                          smooth: true
                        }}
                        onCameraReady={(controls) => {
                          cameraControlsRef.current = controls;
                        }}
                      />
                    </Suspense>
                    {/* Viewer Controls */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 shadow-lg border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cameraControlsRef.current?.zoomIn()}
                        title="Yakınlaştır"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cameraControlsRef.current?.zoomOut()}
                        title="Uzaklaştır"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <div className="w-px h-6 bg-border" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cameraControlsRef.current?.resetCamera()}
                        title="Sıfırla"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => cameraControlsRef.current?.setView('iso')}
                        title="İzometrik Görünüm"
                      >
                        <Maximize className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  /* 3D Preview placeholder for unsupported formats or errors */
                  (<div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <FileBox className="w-16 h-16 opacity-50 mb-2" />
                    <p>Önizleme mevcut değil</p>
                    <p className="text-xs">Dosyayı indirerek görüntüleyebilirsiniz</p>
                  </div>)
                )}
              </div>
            </Card>
          </div>

          {/* Info Panel */}
          {/* Right Sidebar: Details & Comments */}
          {/* Right Sidebar: Comments matched with 3D Preview height */}
          <div className="lg:col-span-1">
            <Card className="flex flex-col p-0 overflow-hidden shadow-sm border-border/60 h-[450px] lg:h-[500px]">
              <div className="p-4 border-b bg-muted/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Yorumlar</h3>
                  <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">{comments.length}</Badge>
                </div>
              </div>

              {/* Comments List - Scrollable area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {commentsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                    <MessageSquare className="w-8 h-8 opacity-20" />
                    <p className="text-xs">Henüz yorum yok.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.filter(c => !c.parentId).map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        replies={comments.filter(c => c.parentId === comment.id)}
                        onReply={() => setReplyingTo(comment.id)}
                        onDelete={handleDeleteComment}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* New Comment Input - Fixed at bottom of the card */}
              <div className="p-4 border-t bg-card shrink-0">
                {replyingTo && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 bg-secondary/50 px-2 py-1 rounded">
                    <div className="flex items-center gap-1">
                      <Reply className="w-3 h-3" />
                      <span>Yanıtlanıyor...</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)} className="h-4 p-0 px-1 text-[10px] hover:bg-transparent hover:text-foreground">
                      İptal
                    </Button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Yorumunuzu yazın..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[60px] text-xs resize-none focus-visible:ring-primary/30"
                  />
                  <Button
                    onClick={handleSubmitComment}
                    disabled={submittingComment || !newComment.trim()}
                    size="icon"
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg shadow-sm"
                  >
                    {submittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      {/* Share Modal */}
      <ShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        fileId={fileId}
        fileName={file.name}
      />
    </div>
  )
}

// Comment Item Component
interface CommentItemProps {
  comment: Comment;
  replies: Comment[];
  onReply: () => void;
  onDelete: (id: string) => void;
}

function CommentItem({ comment, replies, onReply, onDelete }: CommentItemProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Avatar className="w-8 h-8">
          <AvatarImage src={comment.userImage || undefined} />
          <AvatarFallback>{comment.userName?.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{comment.userName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString('tr-TR')}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onReply}>
                  <Reply className="w-4 h-4 mr-2" /> Yanıtla
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(comment.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Sil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-sm mt-1">{comment.content}</p>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-11 space-y-2 border-l-2 border-border pl-4">
          {replies.map((reply) => (
            <div key={reply.id} className="flex gap-3">
              <Avatar className="w-6 h-6">
                <AvatarImage src={reply.userImage || undefined} />
                <AvatarFallback>{reply.userName?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{reply.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(reply.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                <p className="text-sm mt-1">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
