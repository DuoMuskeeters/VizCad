import { Folder, MoreVertical, Eye, Download, Pencil, Trash2, Star, Share2, Info, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCallback } from "react";

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
}

interface FileListProps {
  viewMode: "grid" | "list";
  searchQuery: string;
  sortBy: string;
  onFolderClick: (folderName: string) => void;
  files: FileItem[];
  isLoading: boolean;
  error: Error | null;
}

export function FileList({ viewMode, searchQuery, sortBy, onFolderClick, files, isLoading, error }: FileListProps) {
  
  const filteredFiles = files
    .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return a.size - b.size;
      if (sortBy === "date") return b.createdAt - a.createdAt;
      return 0;
    });

  const handleDownload = useCallback(async (file: FileItem) => {
    // TODO: Implement actual download logic using a presigned download URL from backend
    alert(`Dosya indirme isteği: ${file.name}. Henüz indirme özelliği tam olarak entegre edilmedi.`);
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

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredFiles.map((item) => (
          <Card
            key={item.id}
            className="group bg-card hover:bg-secondary/50 cursor-pointer transition-all border-transparent hover:border-border overflow-hidden"
          >
            <div className="aspect-[4/3] bg-secondary/50 relative">
              {/* Thumbnail is not available from R2 by default, placeholder for now */}
              <img
                src={"/placeholder.svg"} // Placeholder for thumbnail
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
                <FileActions item={item} onDownload={handleDownload} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {/* List Header */}
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
        <div className="col-span-6 flex items-center gap-3">
          <Checkbox className="h-4 w-4" />
          <span>Ad</span>
        </div>
        <div className="col-span-2">Sahip</div> {/* Owner info is not directly in files table */}
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
              {/* Thumbnail is not available from R2 by default, placeholder for now */}
              <img
                src={"/placeholder.svg"} // Placeholder for thumbnail
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
            <FileActions item={item} onDownload={handleDownload} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FileActions({ item, onDownload }: { item: FileItem; onDownload: (item: FileItem) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Eye className="w-4 h-4" /> Önizle
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDownload(item)}>
          <Download className="w-4 h-4" /> İndir
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Share2 className="w-4 h-4" /> Paylaş
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Star className="w-4 h-4" /> Yıldızlı'ya ekle
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Pencil className="w-4 h-4" /> Yeniden adlandır
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Info className="w-4 h-4" /> Ayrıntıları görüntüle
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-destructive cursor-pointer">
          <Trash2 className="w-4 h-4" /> Çöp kutusuna taşı
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

