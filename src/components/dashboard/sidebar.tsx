import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  Settings,
  HardDrive,
  Clock,
  Star,
  Trash2,
  Users,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

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

export function Sidebar({ activeSection, onSectionChange, onUploadClick, storageSummary }: SidebarProps) {
  const { t } = useTranslation();
  const { usedBytes, quotaBytes, quotaGb } = storageSummary;

  const navItems = [
    { id: "my-files", label: t("dashboard.sidebar.my_files"), icon: FolderOpen },
    { id: "shared", label: t("dashboard.sidebar.shared"), icon: Users },
    { id: "recent", label: t("dashboard.sidebar.recent"), icon: Clock },
    { id: "starred", label: t("dashboard.sidebar.starred"), icon: Star },
    { id: "trash", label: t("dashboard.sidebar.trash"), icon: Trash2 },
  ]

  // Convert usedBytes to GB for display
  const storageUsedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);

  // Calculate percentage, handle division by zero
  const storagePercent = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0;

  return (
    <div className="flex flex-col h-full w-full lg:w-56 bg-card border-r border-border">
      {/* Upload Button */}
      <div className="px-3 py-4">
        <Button
          onClick={onUploadClick}
          className="w-full justify-start gap-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-xl h-11"
        >
          <Upload className="w-5 h-5" />
          <span className="font-medium">{t("dashboard.sidebar.upload_button")}</span>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onSectionChange(item.id)}
            className={cn(
              "w-full justify-start gap-3 rounded-lg h-10 px-3 font-normal transition-colors",
              activeSection === item.id
                ? "bg-primary/15 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Button>
        ))}
      </nav>

      {/* Storage + Settings at bottom */}
      <div className="p-4 border-t border-border space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="w-4 h-4" />
            <span>{t("dashboard.sidebar.storage")}</span>
          </div>
          <Progress value={storagePercent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {t("dashboard.sidebar.used_of", { usedGb: storageUsedGb, quotaGb: quotaGb })}
          </p>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground rounded-lg h-10 px-3"
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span>{t("dashboard.sidebar.settings")}</span>
        </Button>
      </div>
    </div>
  )
}
