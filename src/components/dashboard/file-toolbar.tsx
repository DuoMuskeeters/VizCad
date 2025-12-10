import { Search, LayoutGrid, List, ChevronDown, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  currentPath,
  onNavigate,
}: FileToolbarProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          {/* Search - centered and wider */}
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Drive'da Ara"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-12 h-12 bg-secondary border-0 rounded-full text-base"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </Button>
          </div>

          {/* User Avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer">
                <AvatarImage src="/diverse-user-avatars.png" />
                <AvatarFallback>AK</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Ahmet Kaya</p>
              <p className="text-xs text-muted-foreground">ahmet@vizcad.com</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center justify-between">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-sm">
            {currentPath.map((segment, index) => (
              <div key={index} className="flex items-center">
                {index > 0 && <ChevronDown className="w-4 h-4 text-muted-foreground rotate-[-90deg] mx-1" />}
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
          <div className="flex items-center gap-2">
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  {sortBy === "date" ? "Son değiştirme" : sortBy === "name" ? "Ad" : "Boyut"}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onSortChange("date")}>Son değiştirme</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSortChange("name")}>Ad</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSortChange("size")}>Boyut</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle */}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", viewMode === "list" && "text-cyan-400")}
                onClick={() => onViewModeChange("list")}
              >
                <List className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", viewMode === "grid" && "text-cyan-400")}
                onClick={() => onViewModeChange("grid")}
              >
                <LayoutGrid className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
