import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { FileToolbar } from "./file-toolbar";
import { FileList } from "./file-list";
import { UploadModal } from "./upload-modal";

// Define interfaces
interface StorageSummary {
  usedBytes: number;
  quotaGb: number;
  quotaBytes: number;
}

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

export function DashboardLayout() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("my-files");
  const [currentPath, setCurrentPath] = useState<string[]>(["Dosyalarım"]);
  const [refreshFileListTrigger, setRefreshFileListTrigger] = useState(0);

  // State for fetched data
  const [files, setFiles] = useState<FileItem[]>([]);
  const [storageSummary, setStorageSummary] = useState<StorageSummary>({ usedBytes: 0, quotaGb: 0, quotaBytes: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch data on mount and when refresh trigger changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/files/list');
        if (!response.ok) {
          throw new Error('Veri çekme başarısız oldu');
        }
        const data = await response.json();
        setFiles(data.files || []);
        setStorageSummary(data.storageSummary || { usedBytes: 0, quotaGb: 0, quotaBytes: 0 });
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Bilinmeyen bir hata oluştu'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [refreshFileListTrigger]);


  const handleFolderClick = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
  };

  const handleNavigate = (index: number) => {
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const handleUploadModalOpenChange = useCallback((open: boolean) => {
    setUploadModalOpen(open);
    // If modal is closing, trigger file list refresh
    if (!open) {
      setRefreshFileListTrigger(prev => prev + 1);
    }
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onUploadClick={() => setUploadModalOpen(true)}
        storageSummary={storageSummary} // Pass storage summary to Sidebar
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <FileToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            currentPath={currentPath}
            onNavigate={handleNavigate}
          />
          <FileList
            viewMode={viewMode}
            searchQuery={searchQuery}
            sortBy={sortBy}
            onFolderClick={handleFolderClick}
            files={files} // Pass files from state
            isLoading={isLoading}
            error={error}
          />
        </div>
      </main>

      <UploadModal open={uploadModalOpen} onOpenChange={handleUploadModalOpenChange} />
    </div>
  );
}
