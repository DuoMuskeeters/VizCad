import React, { useState, useCallback, useRef } from "react";
import { Upload, X, FileBox, CheckCircle, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/lib/auth-client";

interface FileUploadState {
  id: string; // Used as a unique key for the list item
  file: File;
  name: string;
  size: string;
  progress: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
  message?: string;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<FileUploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  const resetUploadState = useCallback(() => {
    setFilesToUpload([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      resetUploadState();
    }
    onOpenChange(newOpen);
  }, [onOpenChange, resetUploadState]);

  const uploadFile = useCallback(
    async (fileState: FileUploadState) => {
      if (!session?.session.token) {
        setFilesToUpload((prev) =>
          prev.map((f) => (f.id === fileState.id ? { ...f, status: "failed", message: "Kimlik doğrulama token'ı yok." } : f))
        );
        return;
      }

      setFilesToUpload((prev) =>
        prev.map((f) => (f.id === fileState.id ? { ...f, status: "uploading", message: "Yükleniyor..." } : f))
      );

      try {
        const token = session.session.token;
        const formData = new FormData();
        formData.append("file", fileState.file);

        // Use XMLHttpRequest to get progress updates
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/files/upload");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setFilesToUpload((prev) =>
              prev.map((f) => (f.id === fileState.id ? { ...f, progress: percent } : f))
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setFilesToUpload((prev) =>
              prev.map((f) =>
                f.id === fileState.id ? { ...f, progress: 100, status: "uploaded", message: "Yüklendi." } : f
              )
            );
          } else {
            const errorResponse = JSON.parse(xhr.responseText);
            throw new Error(errorResponse.error || `Yükleme Hatası: ${xhr.statusText}`);
          }
        };

        xhr.onerror = () => {
          throw new Error("Ağ hatası veya sunucuya ulaşılamadı.");
        };

        xhr.send(formData);

      } catch (error) {
        console.error("Dosya yükleme hatası:", error);
        setFilesToUpload((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? { ...f, status: "failed", message: (error as Error).message || "Yükleme başarısız." }
              : f
          )
        );
      }
    },
    [session]
  );

  const handleFileChange = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return;

      const newFiles: FileUploadState[] = Array.from(selectedFiles).map((file) => ({
        id: `${file.name}-${file.lastModified}`, // Create a simple unique ID
        file: file,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        progress: 0,
        status: "pending",
      }));

      setFilesToUpload((prevFiles) => [...prevFiles, ...newFiles]);
      newFiles.forEach((fileState) => uploadFile(fileState));
    },
    [uploadFile]
  );
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleFileChange]);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Dosya Yükle</DialogTitle>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files)}
          accept=".step,.iges,.stl,.obj" // Supported CAD formats
        />

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
            ${isDragging ? "border-cyan-500 bg-cyan-500/10" : "border-border"}
          `}
        >
          <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">Dosyaları sürükle bırak veya</p>
          <Button variant="outline" size="sm">
            Dosya Seç
          </Button>
          <p className="text-xs text-muted-foreground mt-3">STEP, IGES, STL, OBJ formatları desteklenir</p>
        </div>

        {/* File List */}
        {filesToUpload.length > 0 && (
          <div className="space-y-3 mt-4 max-h-60 overflow-y-auto">
            {filesToUpload.map((file) => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                <FileBox className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                  {file.status === "failed" ? (
                    <div className="flex items-center text-red-500 text-xs mt-1">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      <span>{file.message || "Hata"}</span>
                    </div>
                  ) : file.status === "uploaded" ? (
                    <div className="flex items-center text-green-500 text-xs mt-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      <span>{file.message || "Yüklendi"}</span>
                    </div>
                  ) : (
                    <>
                      <Progress value={file.progress} className="h-1 mt-2" />
                      <p className="text-xs text-muted-foreground mt-1">{file.message || "Yükleniyor..."}</p>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => {
                  setFilesToUpload(prev => prev.filter(f => f.id !== file.id));
                }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
