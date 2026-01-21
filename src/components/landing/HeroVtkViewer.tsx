"use client"

import { useEffect, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { VtkApp } from "@/components/VtkApp.client"

interface HeroVtkViewerProps {
    modelUrl: string
    className?: string
}

export const HeroVtkViewer = ({ modelUrl, className = "" }: HeroVtkViewerProps) => {
    const [modelFile, setModelFile] = useState<File | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { theme } = useTheme()
    const [mounted, setMounted] = useState(false)
    const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light")

    // Avoid hydration mismatch and detect system theme
    useEffect(() => {
        setMounted(true)
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        setSystemTheme(mediaQuery.matches ? "dark" : "light")
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light")
        mediaQuery.addEventListener("change", handler)
        return () => mediaQuery.removeEventListener("change", handler)
    }, [])

    useEffect(() => {
        const loadModel = async () => {
            try {
                setIsLoading(true)
                setError(null)

                const response = await fetch(modelUrl)
                if (!response.ok) {
                    throw new Error("Model yüklenemedi")
                }

                const blob = await response.blob()
                const fileName = modelUrl.split("/").pop() || "model.stl"
                const file = new File([blob], fileName, { type: blob.type })

                setModelFile(file)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Bilinmeyen hata")
            } finally {
                setIsLoading(false)
            }
        }

        loadModel()
    }, [modelUrl])

    // Background color based on theme
    const resolvedTheme = theme === "system" ? systemTheme : theme
    const backgroundColor: [number, number, number] = mounted && resolvedTheme === "dark"
        ? [0.09, 0.09, 0.11] // hsl(240, 10%, 3.9%) approx
        : [1, 1, 1] // white for light mode

    if (error) {
        return (
            <div className={`flex items-center justify-center ${className}`}>
                <p className="text-muted-foreground text-sm">3D model yüklenemedi</p>
            </div>
        )
    }

    if (isLoading || !mounted) {
        return (
            <div className={`flex items-center justify-center ${className}`}>
                <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">Model yükleniyor...</span>
                </div>
            </div>
        )
    }

    return (
        <div className={`overflow-hidden ${className}`}>
            <VtkApp
                file={modelFile}
                viewMode="orbit"
                displayState={{
                    wireframe: false,
                    grid: false,
                    axes: false,
                    smooth: true,
                }}
                perspective={true}
                viewLocked={false}
                minimal={true}
                autoRotate={true}
                rotationSpeed={0.2}
                backgroundColor={backgroundColor}
                initialZoom={1}
                initialView="bottom"
                cameraAngles={{
                    azimuth: 0,
                    elevation: 90,
                }}
            />
        </div>
    )
}
