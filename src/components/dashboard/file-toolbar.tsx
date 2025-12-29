import { LayoutGrid, List, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface FileToolbarProps {
  viewMode: "grid" | "list"
  onViewModeChange: (mode: "grid" | "list") => void
  searchQuery: string
  onSearchChange: (query: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
  currentPath: string[]
  onNavigate: (index: number) => void
}

export function FileToolbar({
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  currentPath,
  onNavigate,
}: FileToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      {/* Breadcrumb Navigation - Hidden on mobile (title shown in main header) */}
      <div className="hidden lg:flex items-center gap-1 text-sm">
        {currentPath.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate(index)}
              className={cn(
                "h-8 px-2 rounded-lg",
                index === currentPath.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {segment}
            </Button>
          </div>
        ))}
      </div>

      {/* View controls */}
      <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-9 rounded-lg">
              <span className="text-sm">
                {sortBy === "date" ? "Tarih" : sortBy === "name" ? "Ad" : "Boyut"}
              </span>
              <ChevronRight className="w-4 h-4 rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSortChange("date")}>Son değiştirme</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("name")}>Ad</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("size")}>Boyut</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-muted/50 rounded-lg p-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-md",
              viewMode === "list" && "bg-background shadow-sm"
            )}
            onClick={() => onViewModeChange("list")}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-md",
              viewMode === "grid" && "bg-background shadow-sm"
            )}
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
