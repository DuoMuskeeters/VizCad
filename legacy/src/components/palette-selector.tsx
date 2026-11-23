"use client"

import { usePalette } from "./palette-provider"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Palette } from "lucide-react"

export function PaletteSelector() {
  const { currentPalette, setPalette, availablePalettes } = usePalette()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Select color palette</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {Object.entries(availablePalettes).map(([key, palette]) => (
          <DropdownMenuItem key={key} onClick={() => setPalette(key)} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: `rgb(${palette.primary})` }} />
            <span>{palette.name}</span>
            {currentPalette === key && <span className="ml-auto text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
