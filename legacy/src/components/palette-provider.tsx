"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"

type ColorPalette = {
  name: string
  primary: string
  primaryHover: string
  primaryForeground: string
  secondary: string
  accent: string
  muted: string
  border: string
}

const colorPalettes: Record<string, ColorPalette> = {
  default: {
    name: "Default",
    primary: "6 182 212", // cyan-500 - original VizCAD color
    primaryHover: "8 145 178", // cyan-600
    primaryForeground: "255 255 255",
    secondary: "14 165 233", // cyan-400
    accent: "34 197 94", // emerald-500
    muted: "148 163 184", // slate-400
    border: "203 213 225", // slate-300
  },
  red: {
    name: "Red",
    primary: "239 68 68", // red-500
    primaryHover: "220 38 38", // red-600
    primaryForeground: "255 255 255",
    secondary: "248 113 113", // red-400
    accent: "251 146 60", // orange-400
    muted: "148 163 184", // slate-400
    border: "203 213 225", // slate-300
  },
  green: {
    name: "Green",
    primary: "34 197 94", // emerald-500
    primaryHover: "22 163 74", // emerald-600
    primaryForeground: "255 255 255",
    secondary: "52 211 153", // emerald-400
    accent: "132 204 22", // lime-500
    muted: "148 163 184", // slate-400
    border: "203 213 225", // slate-300
  },
  orange: {
    name: "Orange",
    primary: "249 115 22", // orange-500
    primaryHover: "234 88 12", // orange-600
    primaryForeground: "255 255 255",
    secondary: "251 146 60", // orange-400
    accent: "245 158 11", // amber-500
    muted: "148 163 184", // slate-400
    border: "203 213 225", // slate-300
  },
}

type PaletteContextType = {
  currentPalette: string
  palette: ColorPalette
  setPalette: (paletteKey: string) => void
  availablePalettes: Record<string, ColorPalette>
}

const PaletteContext = createContext<PaletteContextType | undefined>(undefined)

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [currentPalette, setCurrentPalette] = useState("default")

  useEffect(() => {
    const stored = localStorage.getItem("vizcad-color-palette")
    if (stored && colorPalettes[stored]) {
      setCurrentPalette(stored)
    }
  }, [])

  useEffect(() => {
    const palette = colorPalettes[currentPalette]
    const root = document.documentElement

    // Set CSS custom properties
    root.style.setProperty("--primary", palette.primary)
    root.style.setProperty("--primary-hover", palette.primaryHover)
    root.style.setProperty("--primary-foreground", palette.primaryForeground)
    root.style.setProperty("--secondary", palette.secondary)
    root.style.setProperty("--accent", palette.accent)
    root.style.setProperty("--muted", palette.muted)
    root.style.setProperty("--border", palette.border)
  }, [currentPalette])

  const setPalette = (paletteKey: string) => {
    if (colorPalettes[paletteKey]) {
      setCurrentPalette(paletteKey)
      localStorage.setItem("vizcad-color-palette", paletteKey)
    }
  }

  return (
    <PaletteContext.Provider
      value={{
        currentPalette,
        palette: colorPalettes[currentPalette],
        setPalette,
        availablePalettes: colorPalettes,
      }}
    >
      {children}
    </PaletteContext.Provider>
  )
}

export function usePalette() {
  const context = useContext(PaletteContext)
  if (context === undefined) {
    throw new Error("usePalette must be used within a PaletteProvider")
  }
  return context
}
