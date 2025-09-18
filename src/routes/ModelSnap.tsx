"use client"

import React, { useState, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import ThumbnailGenerator from "@/components/ThumbnailGenerator"
import {
  Upload,
  Download,
  File,
  ImageIcon,
  Settings,
  RotateCcw,
  Eye,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { detectLanguage, seoContent } from "@/utils/language"

export const Route = createFileRoute("/ModelSnap")({
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].modelSnap
    
    return {
      title: content.title,
      meta: [
        {
          name: "description",
          content: content.description,
        },
        {
          name: "keywords",
          content: content.keywords,
        },
        {
          property: "og:title",
          content: content.ogTitle,
        },
        {
          property: "og:description",
          content: content.ogDescription,
        },
        {
          property: "og:url",
          content: "https://vizcad.com/modelsnap",
        },
        {
          property: "og:image",
          content: "https://vizcad.com/og-modelsnap.png",
        },
        {
          name: "twitter:title",
          content: content.twitterTitle,
        },
        {
          name: "twitter:description",
          content: content.twitterDescription,
        },
        {
          name: "twitter:image",
          content: "https://vizcad.com/twitter-modelsnap.png",
        },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://vizcad.com/modelsnap",
        },
      ],
    }
  },
  component: StlToPngPage,
})

function StlToPngPage() {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState({
    width: 800,
    height: 600,
    background: "white",
    view: "isometric",
    wireframe: false,
    smooth: true,
    backgroundHex: "#ffffff",
    modelColorHex: "#15803d",
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0]
      if (file.name.toLowerCase().endsWith(".stl")) {
        setSelectedFile(file)
        setError(null)
        setGeneratedImage(null)
      } else {
        setError("Please select a valid STL file")
      }
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files[0]) {
      const file = files[0]
      if (file.name.toLowerCase().endsWith(".stl")) {
        setSelectedFile(file)
        setError(null)
        setGeneratedImage(null)
      } else {
        setError("Please select a valid STL file")
      }
    }
  }

  const handleThumbnailGenerated = (thumbnail: string) => {
    setGeneratedImage(thumbnail)
    setIsGenerating(false)
  }

  const handleError = (error: string) => {
    setError(error)
    setIsGenerating(false)
  }

  const handleDownload = (format: "png" | "jpg" | "csv") => {
    if (generatedImage) {
      const link = document.createElement("a")
      const baseName = selectedFile ? selectedFile.name.replace(".stl", "") : "stl-image"

      if (format === "csv") {
        const csvData = `Name,Format,Size,Generated\n${baseName},${format},${settings.width}x${settings.height},${new Date().toISOString()}`
        const blob = new Blob([csvData], { type: "text/csv" })
        link.href = URL.createObjectURL(blob)
        link.download = `${baseName}.csv`
      } else {
        link.href = generatedImage
        link.download = `${baseName}.${format}`
      }

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setGeneratedImage(null)
    setError(null)
    setIsGenerating(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  React.useEffect(() => {
    if (!selectedFile) return
    setIsGenerating(true)
    setGeneratedImage(null)
  }, [
    selectedFile,
    settings.width,
    settings.height,
    settings.view,
    settings.wireframe,
    settings.smooth,
    settings.background,
    settings.backgroundHex,
    settings.modelColorHex,
  ])

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20"> {/* Header yüksekliği kadar padding-top ekledim */}
      <div className="border-b bg-gradient-to-br from-background via-card to-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Convert STL to PNG</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Transform your 3D models into stunning preview images with professional-grade rendering.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-foreground" />
                <span>Instant Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-foreground" />
                <span>High Quality</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-foreground" />
                <span>No Upload Required</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
          <div className="lg:col-span-2 space-y-4">
            {/* File Upload Card */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="w-4 h-4 text-primary-foreground" />
                  Upload STL File
                </CardTitle>
                <CardDescription className="text-sm">Drag and drop your STL file or click to browse</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
                    isDragOver
                      ? "border-primary bg-primary/5 scale-[1.02]"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={openFileDialog}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <File className="w-10 h-10 text-primary-foreground mx-auto" />
                      <div>
                        <p className="font-medium text-foreground truncate text-sm">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                      <div>
                        <p className="font-medium text-foreground text-sm">Drop your STL file here</p>
                        <p className="text-xs text-muted-foreground">or click to browse files</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={openFileDialog} className="flex-1 h-9 text-sm" disabled={isGenerating}>
                    <Upload className="w-3 h-3 mr-2" />
                    {selectedFile ? "Change File" : "Choose File"}
                  </Button>
                  {selectedFile && (
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={isGenerating}
                      className="h-9 px-3 bg-transparent"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                <input ref={fileInputRef} type="file" className="hidden" accept=".stl" onChange={handleFileChange} />

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                    <span className="text-xs text-destructive">{error}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Settings Card */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-primary-foreground" />
                  Render Settings
                </CardTitle>
                <CardDescription>Customize your image output</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Image Size</label>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { w: 512, h: 512, label: "512×512", ratio: "Square" },
                      { w: 800, h: 600, label: "800×600", ratio: "Standard" },
                      { w: 1280, h: 720, label: "1280×720", ratio: "Widescreen" },
                    ].map((size) => (
                      <button
                        key={size.label}
                        className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                          settings.width === size.w && settings.height === size.h
                            ? "border-primary bg-primary/20 text-primary-foreground"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                        onClick={() => setSettings((prev) => ({ ...prev, width: size.w, height: size.h }))}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{size.label}</p>
                            <p className="text-sm opacity-70">{size.ratio}</p>
                          </div>
                          <div className="w-8 h-6 border rounded bg-muted/50"></div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Camera View</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["isometric", "front", "side", "top"].map((view) => (
                      <button
                        key={view}
                        className={`p-3 rounded-lg border-2 text-sm font-medium capitalize transition-all duration-200 ${
                          settings.view === view
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                        onClick={() => setSettings((prev) => ({ ...prev, view }))}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">Model Color</label>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        {["#15803d", "#0ea5e9", "#f59e0b", "#ef4444"].map((color) => (
                          <button
                            key={color}
                            className="w-8 h-8 rounded-lg border-2 border-border hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => setSettings((prev) => ({ ...prev, modelColorHex: color }))}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={settings.modelColorHex}
                        onChange={(e) => setSettings((prev) => ({ ...prev, modelColorHex: e.target.value }))}
                        className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">Background Color</label>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        {["#ffffff", "#111827", "#f1f5f9", "#0ea5e9"].map((color) => (
                          <button
                            key={color}
                            className="w-8 h-8 rounded-lg border-2 border-border hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => setSettings((prev) => ({ ...prev, backgroundHex: color }))}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={settings.backgroundHex}
                        onChange={(e) => setSettings((prev) => ({ ...prev, backgroundHex: e.target.value }))}
                        className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Wireframe</label>
                    <button
                      className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all duration-200 ${
                        settings.wireframe
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                      onClick={() => setSettings((prev) => ({ ...prev, wireframe: !prev.wireframe }))}
                    >
                      {settings.wireframe ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Smooth</label>
                    <button
                      className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all duration-200 ${
                        settings.smooth
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                      onClick={() => setSettings((prev) => ({ ...prev, smooth: !prev.smooth }))}
                    >
                      {settings.smooth ? "On" : "Off"}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="lg:col-span-3">
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="w-4 h-4 text-primary-foreground" />
                  Preview
                </CardTitle>
                <CardDescription className="flex items-center gap-3 text-sm">
                  {selectedFile ? (
                    <>
                      <span>Preview of {selectedFile.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {settings.width}×{settings.height}
                      </Badge>
                    </>
                  ) : (
                    "Upload an STL file to see preview"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative bg-muted/20 rounded-lg border-2 border-dashed border-border h-[300px] md:h-[350px] lg:h-[400px] flex items-center justify-center">
                  {!selectedFile ? (
                    <div className="text-center text-muted-foreground space-y-3">
                      <ImageIcon className="w-12 h-12 mx-auto opacity-50" />
                      <div>
                        <p className="text-base font-medium">No file selected</p>
                        <p className="text-sm">Upload an STL file to see the preview</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full relative flex items-center justify-center">
                      {isGenerating && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                          <div className="text-center space-y-2">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary-foreground" />
                            <p className="text-sm text-muted-foreground">Generating preview...</p>
                          </div>
                        </div>
                      )}
                      {generatedImage && (
                        <img
                          src={generatedImage || "/placeholder.svg"}
                          alt="STL Preview"
                          className="max-w-full max-h-full object-contain rounded-lg"
                        />
                      )}
                      {/* Hidden generator component */}
                      <div className="hidden">
                        <ThumbnailGenerator
                          key={`${settings.width}x${settings.height}-${settings.view}-${settings.wireframe}-${settings.smooth}-${settings.background}-${settings.backgroundHex}-${settings.modelColorHex}-${selectedFile?.name}`}
                          file={selectedFile}
                          onThumbnailGenerated={handleThumbnailGenerated}
                          onError={handleError}
                          width={settings.width}
                          height={settings.height}
                          background={settings.background as "white" | "black" | "transparent"}
                          view={settings.view as "isometric" | "front" | "side" | "top"}
                          wireframe={settings.wireframe}
                          smooth={settings.smooth}
                          backgroundHex={settings.backgroundHex}
                          modelColorHex={settings.modelColorHex}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {generatedImage && (
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Download className="w-4 h-4 text-primary-foreground" />
                        Export Options
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          onClick={() => handleDownload("png")}
                          className="h-9 text-sm"
                          disabled={!generatedImage}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          PNG
                        </Button>
                        <Button
                          onClick={() => handleDownload("jpg")}
                          variant="outline"
                          className="h-9 text-sm"
                          disabled={!generatedImage}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          JPG
                        </Button>
                        <Button
                          onClick={() => handleDownload("csv")}
                          variant="outline"
                          className="h-9 text-sm"
                          disabled={!generatedImage}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          CSV
                        </Button> 
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
