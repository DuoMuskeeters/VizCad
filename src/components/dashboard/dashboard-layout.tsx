import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { FileToolbar } from "./file-toolbar";
import { FileList } from "./file-list";
import { UploadModal } from "./upload-modal";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

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
  isStarred?: boolean;
  deletedAt?: number;
}

// Map section to API endpoint
const sectionToEndpoint: Record<string, string> = {
  'my-files': '/api/files/list',
  'starred': '/api/files/starred',
  'recent': '/api/files/recent',
  'trash': '/api/files/trash',
  'shared': '/api/files/shared-with-me',
};

// Map section to title
const sectionToTitle: Record<string, string> = {
  'my-files': 'Dosyalarım',
  'starred': 'Yıldızlı',
  'recent': 'Son Kullanılanlar',
  'trash': 'Çöp Kutusu',
  'shared': 'Benimle Paylaşılan',
};

export function DashboardLayout() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("my-files");
  const [currentPath, setCurrentPath] = useState<string[]>(["Dosyalarım"]);
  const [refreshFileListTrigger, setRefreshFileListTrigger] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State for fetched data
  const [files, setFiles] = useState<FileItem[]>([]);
  const [storageSummary, setStorageSummary] = useState<StorageSummary>({ usedBytes: 0, quotaGb: 0, quotaBytes: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch data based on active section
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const endpoint = sectionToEndpoint[activeSection] || '/api/files/list';
        const response = await fetch(endpoint);

        if (!response.ok) {
          if (response.status === 404) {
            setFiles([]);
            return;
          }
          throw new Error('Veri çekme başarısız oldu');
        }

        const data = await response.json() as { files?: FileItem[]; storageSummary?: StorageSummary };
        setFiles(data.files || []);

        if (activeSection === 'my-files' && data.storageSummary) {
          setStorageSummary(data.storageSummary);
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Bilinmeyen bir hata oluştu'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeSection, refreshFileListTrigger]);

  // Update path when section changes
  useEffect(() => {
    setCurrentPath([sectionToTitle[activeSection] || 'Dosyalarım']);
  }, [activeSection]);

  const handleFolderClick = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
  };

  const handleNavigate = (index: number) => {
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const handleUploadModalOpenChange = useCallback((open: boolean) => {
    setUploadModalOpen(open);
    if (!open) {
      setRefreshFileListTrigger(prev => prev + 1);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshFileListTrigger(prev => prev + 1);
  }, []);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  return (
    <div className="flex h-screen bg-background pt-16">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          onUploadClick={() => setUploadModalOpen(true)}
          storageSummary={storageSummary}
        />
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            onUploadClick={() => {
              setUploadModalOpen(true);
              setSidebarOpen(false);
            }}
            storageSummary={storageSummary}
          />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {/* Mobile Header with Menu Button */}
          <div className="flex items-center gap-3 mb-4 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="h-10 w-10 rounded-full border border-border"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground">
              {sectionToTitle[activeSection]}
            </h1>
          </div>

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
            files={files}
            isLoading={isLoading}
            error={error}
            activeSection={activeSection}
            onRefresh={handleRefresh}
          />
        </div>
      </main>

      <UploadModal
        open={uploadModalOpen}
        onOpenChange={handleUploadModalOpenChange}
        onUploadComplete={handleRefresh}
      />
    </div>
  );
}
