import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, X, FileBox, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/lib/auth-client";
import ThumbnailGenerator from "../ThumbnailGenerator.client";

interface FileUploadState {
    id: string;
    file: File;
    name: string;
    size: string;
    progress: number;
    status: "pending-thumbnail" | "pending-upload" | "uploading" | "uploaded" | "failed";
    message?: string;
    thumbnail?: string;
    isSupported3D: boolean;
}

interface UploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploadComplete?: () => void;
}

const SUPPORTED_3D_EXTENSIONS = ['stl', 'obj', 'ply', 'step', 'stp', 'iges', 'igs', 'brep'];

export function UploadModal({ open, onOpenChange, onUploadComplete }: UploadModalProps) {
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

                // 1. Get Presigned URL
                const presignedRes = await fetch("/api/files/presigned-upload", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: fileState.name,
                        type: fileState.file.type || 'application/octet-stream',
                        size: fileState.file.size,
                        withThumbnail: !!fileState.thumbnail
                    })
                });

                if (!presignedRes.ok) {
                    const errText = await presignedRes.text();
                    console.error("Presigned API Hatası:", errText);
                    let errMsg = "Presigned URL alınamadı";
                    try {
                        const errJson = JSON.parse(errText);
                        if (errJson.error) errMsg = errJson.error;
                    } catch (e) { }
                    throw new Error(errMsg);
                }

                const { fileId, uploadUrl, key, thumbnail } = (await presignedRes.json()) as {
                    fileId: string;
                    uploadUrl: string;
                    key: string;
                    thumbnail?: { uploadUrl: string; key: string };
                };

                // 2. Upload Main File to R2 (XHR for progress)
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", uploadUrl);
                    xhr.setRequestHeader("Content-Type", fileState.file.type || 'application/octet-stream');

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
                            resolve();
                        } else {
                            reject(new Error(`Yükleme hatası: ${xhr.statusText}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error("Ağ hatası"));
                    xhr.send(fileState.file);
                });

                // 3. Upload Thumbnail (if exists)
                if (fileState.thumbnail && thumbnail?.uploadUrl) {
                    try {
                        // Base64 to Blob
                        const res = await fetch(fileState.thumbnail); // fetch handles data URI
                        const blob = await res.blob();

                        await fetch(thumbnail.uploadUrl, {
                            method: "PUT",
                            body: blob,
                            headers: { "Content-Type": "image/png" }
                        });
                    } catch (err) {
                        console.warn("Thumbnail upload failed:", err);
                    }
                }

                // 4. Complete Upload
                const completeRes = await fetch("/api/files/complete-upload", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        fileId,
                        name: fileState.name,
                        size: fileState.file.size,
                        type: fileState.file.type || 'application/octet-stream',
                        key,
                        thumbnailKey: thumbnail?.key
                    })
                });

                if (!completeRes.ok) {
                    const errText = await completeRes.text();
                    let errMsg = "Yükleme tamamlanamadı";
                    try {
                        const errJson = JSON.parse(errText);
                        if (errJson.error) errMsg = errJson.error;
                    } catch (e) { }
                    throw new Error(errMsg);
                }

                // Success
                setFilesToUpload((prev) =>
                    prev.map((f) =>
                        f.id === fileState.id ? { ...f, progress: 100, status: "uploaded", message: "Yüklendi." } : f
                    )
                );

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

    // Watch for files ready to upload
    useEffect(() => {
        filesToUpload.forEach(file => {
            if (file.status === "pending-upload") {
                uploadFile(file);
            }
        });
    }, [filesToUpload, uploadFile]);

    // Watch for all uploads complete
    useEffect(() => {
        if (filesToUpload.length > 0) {
            const allCompleted = filesToUpload.every(
                f => f.status === "uploaded" || f.status === "failed"
            );
            const someUploaded = filesToUpload.some(f => f.status === "uploaded");

            if (allCompleted && someUploaded) {
                // Delay to show completion status briefly
                const timer = setTimeout(() => {
                    handleOpenChange(false);
                    onUploadComplete?.();
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [filesToUpload, handleOpenChange, onUploadComplete]);

    const handleFileChange = useCallback(
        (selectedFiles: FileList | null) => {
            if (!selectedFiles) return;

            const newFiles: FileUploadState[] = [];

            Array.from(selectedFiles).forEach((file) => {
                const extension = file.name.split('.').pop()?.toLowerCase() || '';
                const isSupported3D = SUPPORTED_3D_EXTENSIONS.includes(extension);
                const isStepFormat = ['step', 'stp', 'iges', 'igs', 'brep'].includes(extension);
                const MAX_STEP_SIZE = 5 * 1024 * 1024; // 5MB

                if (isStepFormat && file.size > MAX_STEP_SIZE) {
                    alert(`${file.name} dosyası 5MB sınırını aşıyor. STEP/IGES dosyaları en fazla 5MB olabilir.`);
                    return;
                }

                newFiles.push({
                    id: `${file.name}-${file.lastModified}-${Math.random()}`,
                    file: file,
                    name: file.name,
                    size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                    progress: 0,
                    status: isSupported3D ? "pending-thumbnail" : "pending-upload",
                    isSupported3D
                });
            });

            setFilesToUpload((prevFiles) => [...prevFiles, ...newFiles]);
        },
        []
    );

    const handleThumbnailGenerated = useCallback((id: string, thumbnail: string) => {
        setFilesToUpload(prev => prev.map(f => {
            if (f.id === id) {
                return {
                    ...f,
                    thumbnail,
                    status: "pending-upload",
                    message: "Thumbnail hazır, yükleniyor..."
                };
            }
            return f;
        }));
    }, []);

    const handleThumbnailError = useCallback((id: string, error: string) => {
        console.warn(`Thumbnail generation failed for ${id}:`, error);
        // Proceed without thumbnail
        setFilesToUpload(prev => prev.map(f => {
            if (f.id === id) {
                return {
                    ...f,
                    status: "pending-upload",
                    message: "Thumbnail oluşturulamadı, yine de yükleniyor..."
                };
            }
            return f;
        }));
    }, []);

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
                    accept=".step,.iges,.stl,.obj,.ply"
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
                    <p className="text-xs text-muted-foreground mt-3">Desteklenen: STL, OBJ, PLY (Thumbnail), STEP, IGES</p>
                </div>

                {/* Hidden Thumbnail Generators */}
                <div className="hidden">
                    {filesToUpload.map(file => (
                        file.status === "pending-thumbnail" && file.isSupported3D && (
                            <ThumbnailGenerator
                                key={file.id}
                                file={file.file as File}
                                width={200}
                                height={200}
                                onThumbnailGenerated={(thumb) => handleThumbnailGenerated(file.id, thumb)}
                                onError={(err) => handleThumbnailError(file.id, err)}
                            />
                        )
                    ))}
                </div>

                {/* File List */}
                {filesToUpload.length > 0 && (
                    <div className="space-y-3 mt-4 max-h-60 overflow-y-auto">
                        {filesToUpload.map((file) => (
                            <div key={file.id} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                                {file.thumbnail ? (
                                    <img src={file.thumbnail} alt="Thumbnail" className="w-10 h-10 object-cover rounded bg-white" />
                                ) : (
                                    <FileBox className="w-10 h-10 p-2 text-muted-foreground shrink-0 bg-background rounded" />
                                )}

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
                                            <div className="flex items-center justify-between mt-2 mb-1">
                                                <span className="text-xs text-muted-foreground">
                                                    {file.status === "pending-thumbnail" ? "Thumbnail oluşturuluyor..." : "Yükleniyor..."}
                                                </span>
                                                <span className="text-xs font-medium">{file.progress}%</span>
                                            </div>
                                            <Progress value={file.progress} className="h-1" />
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
