import { cn } from "@/lib/utils"
import {
  FolderOpen,
  Settings,
  Cpu,
  HardDrive,
  Plus,
  Clock,
  Star,
  Trash2,
  Users,
  Upload,
  FolderPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface StorageSummary {
  usedBytes: number;
  quotaGb: number;
  quotaBytes: number;
}

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
  onUploadClick: () => void
  storageSummary: StorageSummary
}

const navItems = [
  { id: "my-files", label: "Dosyalarım", icon: FolderOpen },
  { id: "shared", label: "Benimle Paylaşılan", icon: Users },
  { id: "recent", label: "Son Kullanılanlar", icon: Clock },
  { id: "starred", label: "Yıldızlı", icon: Star },
  { id: "trash", label: "Çöp Kutusu", icon: Trash2 },
]

export function Sidebar({ activeSection, onSectionChange, onUploadClick, storageSummary }: SidebarProps) {
  const { usedBytes, quotaBytes, quotaGb } = storageSummary;
  
  // Convert usedBytes to GB for display
  const storageUsedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
  
  // Calculate percentage, handle division by zero
  const storagePercent = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;

  return (
    <div className="flex flex-col h-full w-56 bg-card border-r border-border">
      {/* Logo */}
      <div className="h-16 flex items-center px-4">
        <a href="/" className="flex items-center gap-3">
          <span className="text-2xl font-extrabold text-foreground ml-2 select-none" style={{ letterSpacing: '0.5px' }}>
            <span className="text-cyan-500">Viz</span>Cad
          </span>
        </a>
      </div>

      <div className="px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="w-full justify-start gap-3 bg-secondary hover:bg-secondary/80 text-foreground shadow-md rounded-2xl h-12">
              <Plus className="w-5 h-5" />
              <span className="font-medium">Yeni</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={onUploadClick} className="gap-3 cursor-pointer">
              <Upload className="w-4 h-4" />
              Dosya Yükle
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 cursor-pointer">
              <FolderPlus className="w-4 h-4" />
              Yeni Klasör
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex-1 py-2 px-2">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onSectionChange(item.id)}
            className={cn(
              "w-full justify-start gap-3 rounded-full h-10 px-4 font-normal",
              activeSection === item.id
                ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span>{item.label}</span>
          </Button>
        ))}
      </nav>

      {/* Storage + Settings at bottom */}
      <div className="p-4 border-t border-border space-y-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <HardDrive className="w-4 h-4" />
            <span>Depolama</span>
          </div>
          <Progress value={storagePercent} className="h-1.5 mb-1" />
          <p className="text-xs text-muted-foreground">
            {storageUsedGb} GB / {quotaGb} GB
          </p>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground rounded-full h-10 px-4"
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span>Ayarlar</span>
        </Button>
      </div>
    </div>
  )
}
