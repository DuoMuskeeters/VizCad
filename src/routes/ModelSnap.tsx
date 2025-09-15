"use client"

import React, { useState, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ModeToggle } from "@/components/mode-toggle"
import { PaletteSelector } from "@/components/palette-selector"
import ThumbnailGenerator from "@/components/ThumbnailGenerator"
import {
  Upload,
  Download,
  File,
  Image as ImageIcon,
  Settings,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  Sun,
  Moon,
  Palette,
  Camera,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { detectLanguage, seoContent } from "@/utils/language"

export const Route = createFileRoute("/ModelSnap")({
  head: () => {
    const lang = detectLanguage()
    const content = {
      title: "ModelSnap - VizCad",
      description: "Convert STL files to high-quality PNG images instantly. Professional 3D model visualization tool.",
      keywords: "ModelSnap, STL to PNG, 3D converter, STL viewer, PNG generator, 3D visualization",
      ogTitle: "ModelSnap - VizCad",
      ogDescription: "Convert STL files to high-quality PNG images instantly. Professional 3D model visualization tool.",
      twitterTitle: "ModelSnap - VizCad",
      twitterDescription: "Convert STL files to high-quality PNG images instantly. Professional 3D model visualization tool.",
    }
    
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
    modelColorHex: "#bfc7ff",
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0]
      if (file.name.toLowerCase().endsWith('.stl')) {
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
      if (file.name.toLowerCase().endsWith('.stl')) {
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

  const handleDownload = (format: 'png' | 'jpg' | 'csv') => {
    if (generatedImage) {
      const link = document.createElement('a')
      const baseName = selectedFile ? selectedFile.name.replace('.stl', '') : 'stl-image'
      
      if (format === 'csv') {
        // CSV için basit bir veri oluştur
        const csvData = `Name,Format,Size,Generated\n${baseName},${format},${settings.width}x${settings.height},${new Date().toISOString()}`
        const blob = new Blob([csvData], { type: 'text/csv' })
        link.href = URL.createObjectURL(blob)
        link.download = `${baseName}.csv`
      } else {
        // PNG ve JPG için mevcut görüntüyü kullan
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

  const handleGenerate = () => {
    if (selectedFile) {
      setIsGenerating(true)
      setError(null)
    }
  }

  // Preview box should maintain aspect ratio while fitting in reasonable space
  const previewWidthNum = Math.max(1, settings.width)
  const previewHeightNum = Math.max(1, settings.height)
  const aspectRatio = previewWidthNum / previewHeightNum
  
  // Calculate preview dimensions maintaining aspect ratio
  const maxPreviewWidth = 600
  const maxPreviewHeight = 450
  
  let previewWidth: number
  let previewHeight: number
  
  if (aspectRatio >= 1) {
    // Width is larger or equal to height
    previewWidth = Math.min(maxPreviewWidth, previewWidthNum)
    previewHeight = previewWidth / aspectRatio
    
    if (previewHeight > maxPreviewHeight) {
      previewHeight = maxPreviewHeight
      previewWidth = previewHeight * aspectRatio
    }
  } else {
    // Height is larger than width
    previewHeight = Math.min(maxPreviewHeight, previewHeightNum)
    previewWidth = previewHeight * aspectRatio
    
    if (previewWidth > maxPreviewWidth) {
      previewWidth = maxPreviewWidth
      previewHeight = previewWidth / aspectRatio
    }
  }
  
  const previewCssWidth = `${Math.round(previewWidth)}px`
  const previewCssHeight = `${Math.round(previewHeight)}px`
  const cardHorizontalPadding = 48 // px-6 content + px-6 header
  const cardWidthPx = Math.round(previewWidth) + cardHorizontalPadding
  const leftPanelWidthPx = 420
  const gapPx = 16
  const totalWidthPx = leftPanelWidthPx + cardWidthPx + gapPx

  // Auto-regenerate image when file or settings change
  React.useEffect(() => {
    if (!selectedFile) return
    setIsGenerating(true)
    setGeneratedImage(null)
  }, [selectedFile, settings.width, settings.height, settings.view, settings.wireframe, settings.smooth, settings.background, settings.backgroundHex, settings.modelColorHex])

  return (
    <div className="bg-background text-foreground pt-16 min-h-screen">
      {/* Hero Header Section */}
      <div className="border-b border-border/50 bg-gradient-to-r from-background to-muted/30">
        <div className="mx-auto px-6 py-8 max-w-4xl text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            ModelSnap - Professional 3D Thumbnails
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            Transform STL files into high-quality preview images with instant visualization. 
            Live editing controls let you see changes immediately as you perfect your thumbnails.
          </p>
        </div>
      </div>

      <div className="mx-auto px-3 py-2">
        <div className="mx-auto max-w-full flex flex-col lg:flex-row gap-2 items-start lg:items-start justify-center" style={{ width: totalWidthPx }}>
          {/* Left Panel - Settings with File Upload */}
          <div className="w-full lg:w-[420px] flex-shrink-0 space-y-1 text-[13px]">
            {/* Settings */}
            <Card>
              <CardHeader className="py-1.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings className="w-4 h-4" />
                  Settings & Upload
                </CardTitle>
                <CardDescription className="text-xs">
                  Upload your STL file and customize the output
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 py-1.5">
                {/* File Upload Section */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">STL File</span>
                    {selectedFile && (
                      <Badge variant="outline" className="text-xs">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`border-2 border-dashed rounded-md p-2 text-center transition-colors ${
                      isDragOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {selectedFile ? (
                      <div className="space-y-0.5">
                        <File className="w-5 h-5 text-primary mx-auto" />
                        <p className="font-medium text-xs truncate">{selectedFile.name}</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <Upload className="w-5 h-5 text-muted-foreground mx-auto" />
                        <p className="font-medium text-xs">Drop STL file here</p>
                        <p className="text-[11px] text-muted-foreground">or click to browse</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={openFileDialog}
                      className="flex-1 h-8 text-xs"
                      disabled={isGenerating}
                      size="sm"
                    >
                      <Upload className="w-3.5 h-3.5 mr-2" />
                      {selectedFile ? 'Change File' : 'Choose File'}
                    </Button>
                    {selectedFile && (
                      <Button
                        variant="outline"
                        onClick={handleReset}
                        disabled={isGenerating}
                        size="sm"
                        className="h-8"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".stl"
                    onChange={handleFileChange}
                  />

                  {error && (
                    <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-xs text-destructive">{error}</span>
                    </div>
                  )}
                </div>
                {/* Size presets (custom inputs removed) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Size</span>
                    <span className="text-[11px] text-muted-foreground">pixels</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { w: 512, h: 512, label: '512×512', ratio: '1:1' },
                      { w: 800, h: 600, label: '800×600', ratio: '4:3' },
                      { w: 1280, h: 720, label: '1280×720', ratio: '16:9' },
                    ].map((s) => (
                      <button
                        key={s.label}
                        className={`h-10 rounded-md border text-xs flex flex-col items-center justify-center ${settings.width===s.w && settings.height===s.h ? `border-primary text-primary bg-primary/10` : `border-input hover:bg-accent`}`}
                        onClick={() => setSettings(prev => ({ ...prev, width: s.w, height: s.h }))}
                      >
                        <span className="font-medium">{s.label}</span>
                        <span className="text-[10px] opacity-70">{s.ratio}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera view segmented */}
                <div className="space-y-2">
                  <span className="text-xs font-medium">Camera view</span>
                  <div className="grid grid-cols-4 gap-2">
                    {['isometric','front','side','top'].map((v) => (
                      <button
                        key={v}
                        className={`h-8 rounded-md border text-xs capitalize ${settings.view===v ? `border-primary text-primary bg-primary/10` : `border-input hover:bg-accent`}`}
                        onClick={() => setSettings(prev => ({ ...prev, view: v }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors – professional compact layout with theme swatches */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Model color</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {['#22c55e','#0ea5e9','#f59e0b','#ef4444'].map((c, i) => (
                          <button key={i} className="w-4 h-4 rounded border" style={{ backgroundColor: c }} onClick={() => setSettings(prev=>({ ...prev, modelColorHex: c }))} />
                        ))}
                      </div>
                      <div className="w-6 h-6 rounded border" style={{ backgroundColor: settings.modelColorHex }}></div>
                      <input
                        type="color"
                        value={settings.modelColorHex}
                        onChange={(e) => setSettings(prev => ({ ...prev, modelColorHex: e.target.value }))}
                      />
                      <input
                        type="text"
                        value={settings.modelColorHex}
                        onChange={(e) => setSettings(prev => ({ ...prev, modelColorHex: e.target.value }))}
                        className="border rounded px-2 py-1 h-8 w-28 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Background color</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {['#ffffff','#111827','#f1f5f9','#0ea5e9'].map((c, i) => (
                          <button key={i} className="w-4 h-4 rounded border" style={{ backgroundColor: c }} onClick={() => setSettings(prev=>({ ...prev, backgroundHex: c }))} />
                        ))}
                      </div>
                      <div className="w-6 h-6 rounded border" style={{ backgroundColor: settings.backgroundHex }}></div>
                      <input
                        type="color"
                        value={settings.backgroundHex}
                        onChange={(e) => setSettings(prev => ({ ...prev, backgroundHex: e.target.value }))}
                      />
                      <input
                        type="text"
                        value={settings.backgroundHex}
                        onChange={(e) => setSettings(prev => ({ ...prev, backgroundHex: e.target.value }))}
                        className="border rounded px-2 py-1 h-8 w-28 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Display toggles (reduced spacing) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">Wireframe</label>
                    <label className="relative inline-flex items-center cursor-pointer ml-auto">
                      <input type="checkbox" className="sr-only" checked={settings.wireframe} onChange={(e)=>setSettings(p=>({...p, wireframe: e.target.checked}))} />
                      <div className={`w-9 h-5 rounded-full relative transition-colors ${settings.wireframe?`bg-primary`:`bg-muted`}`}>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.wireframe?`translate-x-4`:`translate-x-0`}`} />
                      </div>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">Smooth</label>
                    <label className="relative inline-flex items-center cursor-pointer ml-auto">
                      <input type="checkbox" className="sr-only" checked={settings.smooth} onChange={(e)=>setSettings(p=>({...p, smooth: e.target.checked}))} />
                      <div className={`w-9 h-5 rounded-full relative transition-colors ${settings.smooth?`bg-primary`:`bg-muted`}`}>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.smooth?`translate-x-4`:`translate-x-0`}`} />
                      </div>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

             {/* Generate Button removed per request */}
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 min-h-0">
            <Card className="inline-block" style={{ width: cardWidthPx }}>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4" />
                  Preview
                </CardTitle>
                <CardDescription className="text-xs">
                  {selectedFile ? (
                    <div className="flex items-center gap-4">
                      <span>Preview of {selectedFile.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {settings.width}×{settings.height} 
                        {aspectRatio === 1 ? ' (1:1)' : 
                         Math.abs(aspectRatio - 16/9) < 0.01 ? ' (16:9)' : 
                         Math.abs(aspectRatio - 4/3) < 0.01 ? ' (4:3)' : 
                         ` (${aspectRatio.toFixed(2)}:1)`}
                      </Badge>
                    </div>
                  ) : "Upload an STL file to see preview"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col">
                <div className="bg-muted/20 rounded-md border border-border flex items-center justify-center mx-auto" style={{ width: previewCssWidth, height: previewCssHeight }}>
                  {!selectedFile ? (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium">No file selected</p>
                      <p className="text-xs">Upload an STL file to see the preview</p>
                    </div>
                  ) : (
                    <div className="w-full h-full relative flex items-center justify-center">
                      {isGenerating && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                          <div className="text-center">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                            <p className="text-xs text-muted-foreground">Generating preview...</p>
                          </div>
                        </div>
                      )}
                      {generatedImage && (
                        <img src={generatedImage} alt="preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      )}
                      {/* Hidden generator just to produce image */}
                      <div className="hidden">
                        <ThumbnailGenerator
                          key={`${settings.width}x${settings.height}-${settings.view}-${settings.wireframe}-${settings.smooth}-${settings.background}-${settings.backgroundHex}-${settings.modelColorHex}-${selectedFile?.name}`}
                          file={selectedFile}
                          onThumbnailGenerated={handleThumbnailGenerated}
                          onError={handleError}
                          width={settings.width}
                          height={settings.height}
                          background={settings.background as 'white' | 'black' | 'transparent'}
                          view={settings.view as 'isometric' | 'front' | 'side' | 'top'}
                          wireframe={settings.wireframe}
                          smooth={settings.smooth}
                          backgroundHex={settings.backgroundHex}
                          modelColorHex={settings.modelColorHex}
                        />
                      </div>
                    </div>
                  )}
                </div>

                 <div className="p-3 bg-muted/20 rounded-md border border-border mt-2">
                   <div className="flex items-center gap-2 mb-2">
                     <CheckCircle className="w-4 h-4 text-green-500" />
                     <span className="text-xs font-medium">Export</span>
                   </div>
                   <div className="grid grid-cols-3 gap-2">
                     <Button onClick={() => handleDownload('png')} className='h-7 text-xs' size='sm'>
                       <Download className="w-3 h-3 mr-1" /> PNG
                     </Button>
                     <Button onClick={() => handleDownload('jpg')} variant='outline' className='h-7 text-xs' size='sm'>
                       <Download className="w-3 h-3 mr-1" /> JPG
                     </Button>
                     <Button onClick={() => handleDownload('csv')} variant='outline' className='h-7 text-xs' size='sm'>
                       <Download className="w-3 h-3 mr-1" /> CSV
                     </Button>
                   </div>
                 </div>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  )
}
