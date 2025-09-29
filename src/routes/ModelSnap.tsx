import React, { useState, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import ThumbnailGenerator from "@/components/ThumbnailGenerator"
import {
  Upload,
  Download,
  Settings,
  RotateCcw,
  RefreshCw,
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
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
    <div className="min-h-screen bg-background pt-16 sm:pt-20">
      {/* Kompakt Header */}
      <div className="container mx-auto px-4 py-3">
        <h1 className="text-3xl font-bold text-foreground text-center">{t("modelsnap.title")}</h1>
        <p className="text-xl text-muted-foreground mt-0.5 text-center">{t("modelsnap.subtitle")}</p>
      </div>
      <div className="container mx-auto px-4 py-4 flex justify-center">
        {/* Tek Satır Layout - Desktop'ta yatay, Mobile'da dikey */}
        <div className="flex flex-col gap-3 max-w-[1600px] mx-auto w-full justify-center items-stretch md:flex-row md:items-start">
          {/* Sol: Dosya Yükleme ve Ayarlar */}
          <div className="flex flex-col gap-3 w-full md:w-1/3">
            {/* Dosya Yükleme Kartı */}
            <div className="w-full">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    {t("modelsnap.uploadFile")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="space-y-1">
                        <Upload className="w-6 h-6 text-primary mx-auto" />
                        <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="w-7 h-7 text-muted-foreground mx-auto" />
                        <p className="text-xs text-foreground font-medium">{t("modelsnap.dropFile")}</p>
                        <p className="text-xs text-muted-foreground">{t("modelsnap.orClick")}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      size="sm" 
                      className="flex-1 h-8 text-xs"
                      disabled={isGenerating}
                    >
                      {selectedFile ? t("modelsnap.change") : t("modelsnap.upload")}
                    </Button>
                    {selectedFile && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        disabled={isGenerating}
                        className="h-8 px-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <input ref={fileInputRef} type="file" className="hidden" accept=".stl" onChange={handleFileChange} />

                  {error && (
                    <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            {/* Ayarlar Kartı */}
            <div className="w-full">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Settings className="w-4 h-4" />
                    {t("modelsnap.settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Size */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">{t("modelsnap.size")}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { w: 512, h: 512, label: "512x512" },
                        { w: 800, h: 600, label: "800x600" },
                        { w: 1280, h: 720, label: "1280x720" },
                      ].map((size) => (
                        <button
                          key={size.label}
                          className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                            settings.width === size.w && settings.height === size.h
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => setSettings((prev) => ({ ...prev, width: size.w, height: size.h }))}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* View */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">{t("modelsnap.view")}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: t("modelsnap.viewFront"), value: "front" },
                        { label: t("modelsnap.viewSide"), value: "side" },
                        { label: t("modelsnap.viewTop"), value: "top" },
                        { label: "ISO", value: "isometric" }
                      ].map((view) => (
                        <button
                          key={view.value}
                          className={`px-1.5 py-1.5 rounded text-xs font-medium capitalize border transition-colors ${
                            settings.view === view.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => setSettings((prev) => ({ ...prev, view: view.value }))}
                        >
                          {view.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("modelsnap.modelColor")}</label>
                      <div className="flex gap-1.5">
                        {["#15803d", "#0ea5e9", "#f59e0b", "#ef4444"].map((color) => (
                          <button
                            key={color}
                            className="w-7 h-7 rounded border-2 border-border hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => setSettings((prev) => ({ ...prev, modelColorHex: color }))}
                          />
                        ))}
                        <input
                          type="color"
                          value={settings.modelColorHex}
                          onChange={(e) => setSettings((prev) => ({ ...prev, modelColorHex: e.target.value }))}
                          className="w-7 h-7 rounded border-2 border-border cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("modelsnap.background")}</label>
                      <div className="flex gap-1.5">
                        {["#ffffff", "#111827", "#f1f5f9", "#0ea5e9"].map((color) => (
                          <button
                            key={color}
                            className="w-7 h-7 rounded border-2 border-border hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            onClick={() => setSettings((prev) => ({ ...prev, backgroundHex: color }))}
                          />
                        ))}
                        <input
                          type="color"
                          value={settings.backgroundHex}
                          onChange={(e) => setSettings((prev) => ({ ...prev, backgroundHex: e.target.value }))}
                          className="w-7 h-7 rounded border-2 border-border cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("modelsnap.wireframe")}</label>
                      <button
                        className={`w-full px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          settings.wireframe
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setSettings((prev) => ({ ...prev, wireframe: !prev.wireframe }))}
                      >
                        {settings.wireframe ? t("modelsnap.on") : t("modelsnap.off")}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("modelsnap.smooth")}</label>
                      <button
                        className={`w-full px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          settings.smooth
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-primary/50"
                        }`}
                        onClick={() => setSettings((prev) => ({ ...prev, smooth: !prev.smooth }))}
                      >
                        {settings.smooth ? t("modelsnap.on") : t("modelsnap.off")}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sağ: Önizleme */}
          <div className="w-full md:w-2/3">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t("modelsnap.preview")}</CardTitle>
                  {selectedFile && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {settings.width}×{settings.height}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative bg-muted/20 rounded-lg border aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {!selectedFile ? (
                    <div className="text-center text-muted-foreground">
                      <Upload className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t("modelsnap.uploadToPreview")}</p>
                    </div>
                  ) : (
                    <>
                      {isGenerating && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                          <div className="text-center space-y-2">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary" />
                            <p className="text-xs text-muted-foreground">{t("modelsnap.generating")}</p>
                          </div>
                        </div>
                      )}
                      {generatedImage && (
                        <img
                          src={generatedImage}
                          alt={t("modelsnap.previewAlt")}
                          className="max-w-full max-h-full object-contain"
                        />
                      )}
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
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            {generatedImage && (
              <div className="flex gap-2 mt-4 w-full max-w-[800px]">
                <Button
                  onClick={() => handleDownload("png")}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  PNG
                </Button>
                <Button
                  onClick={() => handleDownload("jpg")}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  JPG
                </Button>
                <Button
                  onClick={() => handleDownload("csv")}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  CSV
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
