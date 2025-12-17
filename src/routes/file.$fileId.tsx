import { useState, useEffect, useCallback, Suspense } from "react";
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
  Reply
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

        // If file is supported 3D format, fetch content for preview
        const ext = data.file.extension.toLowerCase();
        if (['stl', 'obj', 'ply'].includes(ext)) {
          setIsPreviewLoading(true);
          fetch(`/api/files/download?fileId=${fileId}`)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], data.file.name, { type: data.file.mimeType });
              setPreviewFile(file);
            })
            .catch(err => console.error("Preview download failed", err))
            .finally(() => setIsPreviewLoading(false));
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

  // Download file
  const handleDownload = async () => {
    if (!fileData) return;
    try {
      const response = await fetch(`/api/files/download?fileId=${fileId}`);
      if (!response.ok) throw new Error("İndirme başarısız");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileData.file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold truncate max-w-md">{file.name}</h1>
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
                  <Suspense fallback={
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  }>
                    <VtkApp
                      file={previewFile}
                      viewMode="orbit"
                      displayState={{
                        wireframe: false,
                        grid: true,
                        axes: true,
                        smooth: true
                      }}
                    />
                  </Suspense>
                ) : (
                  /* 3D Preview placeholder for unsupported formats or errors */
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <FileBox className="w-16 h-16 opacity-50 mb-2" />
                    <p>Önizleme mevcut değil</p>
                    <p className="text-xs">Dosyayı indirerek görüntüleyebilirsiniz</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* File Info */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Dosya Bilgileri</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sahip</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={file.ownerImage || undefined} />
                      <AvatarFallback>{file.ownerName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{file.ownerName}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oluşturulma</span>
                  <span>{formatDate(file.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Son Güncelleme</span>
                  <span>{formatDate(file.updatedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Boyut</span>
                  <span>{formatSize(file.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Format</span>
                  <Badge variant="secondary">{file.extension.toUpperCase()}</Badge>
                </div>
              </div>
            </Card>

            {/* Stats */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">İstatistikler</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center mb-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-semibold">{stats.shareCount}</div>
                  <div className="text-xs text-muted-foreground">Paylaşım</div>
                </div>
                <div>
                  <div className="flex items-center justify-center mb-1">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-semibold">{stats.commentCount}</div>
                  <div className="text-xs text-muted-foreground">Yorum</div>
                </div>
                <div>
                  <div className="flex items-center justify-center mb-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-semibold">{stats.versionCount}</div>
                  <div className="text-xs text-muted-foreground">Versiyon</div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Comments Section */}
        <Card className="mt-6 p-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5" />
            <h3 className="font-semibold">Yorumlar</h3>
            <Badge variant="secondary">{comments.length}</Badge>
          </div>

          {/* New Comment */}
          <div className="mb-6">
            {replyingTo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Reply className="w-4 h-4" />
                <span>Yanıtlanıyor</span>
                <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                  İptal
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Yorum yazın..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[80px]"
              />
              <Button
                onClick={handleSubmitComment}
                disabled={submittingComment || !newComment.trim()}
                size="icon"
                className="h-auto"
              >
                {submittingComment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Comments List */}
          {commentsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Henüz yorum yok. İlk yorumu siz yapın!
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
        </Card>
      </div>

      {/* Share Modal */}
      <ShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        fileId={fileId}
        fileName={file.name}
      />
    </div>
  );
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
