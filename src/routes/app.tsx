"use client"

import React, { useState, useRef } from "react"

import { VtkApp } from "@/components/vtk"
import { Button } from "@/components/ui/button"
import { createFileRoute } from "@tanstack/react-router"
import {
  Upload,
  type File,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Settings,
  Download,
  Share2,
  Eye,
  Grid3X3,
  Palette,
  Info,
  Camera,
  Lightbulb,
  ImageIcon,
  Layers,
  Plus,
  Trash2,
  Edit3,
  MoreVertical,
  Lock,
  Clock,
  X,
  Square,
  Zap,
  Target,
  Sun,
} from "lucide-react"

export const Route = createFileRoute("/app")({
  component: AppPage,
})

function AppPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("scenes")
  const [showUnavailableModal, setShowUnavailableModal] = useState(false)
  const [clickedFeature, setClickedFeature] = useState("")

  // Developer mode - set to true to see all tabs
  const isDeveloper = true // Set this to false for production

  // Unified file input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Unified file change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0])
    }
  }

  // Open file dialog programmatically
  const openFileDialog = () => {
    // Always allow file dialog, even if a file is already selected
    if (fileInputRef.current) fileInputRef.current.value = ""
    fileInputRef.current?.click()
  }

  // Drag & drop handlers
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
      setSelectedFile(files[0])
    }
  }

  const tabs = [
    { id: "scenes", label: "Scenes", icon: Layers, available: true },
    { id: "lights", label: "Lights", icon: Lightbulb, available: isDeveloper },
    { id: "camera", label: "Camera", icon: Camera, available: isDeveloper },
    { id: "materials", label: "Materials", icon: Palette, available: isDeveloper },
    { id: "output", label: "Output", icon: ImageIcon, available: isDeveloper },
  ]

  const handleTabClick = (tab: any) => {
    if (tab.available) {
      setActiveTab(tab.id)
    } else {
      setClickedFeature(tab.label)
      setShowUnavailableModal(true)
    }
  }

  const renderTabContent = () => {
    const currentTab = tabs.find((tab) => tab.id === activeTab)

    if (!currentTab?.available && !isDeveloper) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-6 max-w-sm">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
                {currentTab && <currentTab.icon className="w-10 h-10 text-blue-400" />}
              </div>
              <div className="absolute -top-1 -right-1 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-gray-900">{currentTab?.label} Module</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                This advanced feature is currently in development. Our team is working to bring you professional-grade{" "}
                {currentTab?.label?.toLowerCase()} tools.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">In Development</span>
              </div>
              <p className="text-xs text-gray-500">Expected release: Q2 2025</p>
            </div>
          </div>
        </div>
      )
    }

    switch (activeTab) {
      case "scenes":
        return (
          <ScenesTab
            onFileChange={handleFileChange}
            onBrowseClick={openFileDialog}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragOver={isDragOver}
            selectedFile={selectedFile}
          />
        )
      case "lights":
        return <LightsTab />
      case "camera":
        return <CameraTab />
      case "materials":
        return <MaterialsTab />
      case "output":
        return <OutputTab />
      default:
        return (
          <ScenesTab
            onFileChange={handleFileChange}
            onBrowseClick={openFileDialog}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragOver={isDragOver}
            selectedFile={selectedFile}
          />
        )
    }
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col pt-16">
      {/* Unavailable Feature Modal */}
      {showUnavailableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md mx-4 shadow-2xl">
      <div className="flex items-center gap-4 min-h-0">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
                  <Lock className="w-8 h-8 text-blue-400" />
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-gray-900">{clickedFeature} Not Available</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  The {clickedFeature.toLowerCase()} module is currently under development. We're working hard to bring
                  you this feature as soon as possible.
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Coming in Q2 2025</span>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => setShowUnavailableModal(false)}
                  >
                    Got it
                  </Button>
                  <Button
                    className="flex-1 bg-blue-500 hover:bg-blue-600"
                    onClick={() => {
                      setShowUnavailableModal(false)
                      // Here you could add notification signup logic
                    }}
                  >
                    Notify me
                  </Button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowUnavailableModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-gray-700">
            {selectedFile ? selectedFile.name : "No file selected"}
          </div>
          {isDeveloper && (
            <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Developer Mode</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* File Operations */}
          <Button variant="ghost" size="sm" className="p-2">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Render Studio */}
        {sidebarOpen && (
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <div className="flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab)}
                      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-all duration-200 relative group ${
                        activeTab === tab.id && tab.available
                          ? "text-cyan-600 bg-cyan-50 border-b-2 border-cyan-600"
                          : !tab.available && !isDeveloper
                            ? "text-gray-400 cursor-pointer opacity-60 hover:opacity-80"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <div className="relative">
                        <Icon className={`h-4 w-4 ${!tab.available && !isDeveloper ? "opacity-50" : ""}`} />
                        {!tab.available && !isDeveloper && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                            <Lock className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </div>
                      <span className={!tab.available && !isDeveloper ? "opacity-50" : ""}>{tab.label}</span>

                      {/* Tooltip for unavailable tabs */}
                      {!tab.available && !isDeveloper && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                          <div className="text-center">
                            <div className="font-medium">{tab.label} Module</div>
                            <div className="text-gray-300 mt-1">Coming in Q2 2025</div>
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto transition-all duration-300">{renderTabContent()}</div>
          </div>
        )}

        {/* Main Viewer Area */}
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
          {selectedFile ? (
            <div className="flex-1 p-4 min-h-0">
              <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden relative min-h-[500px]">
                {/* View Controls Bar - Sahnenin üstünde */}
                <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
                  {/* Sol taraf - View presets */}
                  <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-200">
                    <span className="text-xs font-medium text-gray-700 mr-2">View:</span>
                    {["Front", "Back", "Left", "Right", "Top", "Bottom", "ISO"].map((view) => (
                      <Button
                        key={view}
                        size="sm"
                        variant={view === "ISO" ? "default" : "ghost"}
                        className={`text-xs px-2 py-1 h-6 ${
                          view === "ISO"
                            ? "bg-cyan-500 hover:bg-cyan-600 text-white"
                            : "hover:bg-gray-100 text-gray-600"
                        }`}
                        onClick={() => {
                          // Kamera görünümü ayarla event'i gönder
                          const event = new CustomEvent("setView", {
                            detail: { view },
                          })
                          window.dispatchEvent(event)
                        }}
                      >
                        {view}
                      </Button>
                    ))}
                  </div>

                  {/* Sağ taraf - View options */}
                  <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-200">
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <Palette className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-1 text-gray-600 hover:text-gray-900"
                      title="Zoom In (Mouse Wheel)"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-1 text-gray-600 hover:text-gray-900"
                      title="Zoom Out (Mouse Wheel)"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="p-1 text-gray-600 hover:text-gray-900"
                      title="Reset View"
                      onClick={() => {
                        const event = new CustomEvent("resetCamera", {})
                        window.dispatchEvent(event)
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <VtkApp file={selectedFile} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Welcome to VizCad Render Studio</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Upload a 3D model file to start creating photorealistic renders. Configure lighting, materials, and
                  camera settings for professional results.
                </p>
                <div className="space-y-3">
                  <Button className="bg-cyan-500 hover:bg-cyan-600 px-6 py-3" onClick={openFileDialog}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Your Model
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".stl,.obj,.ply,.3mf"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>Supported formats:</span>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">STL</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">OBJ</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">PLY</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">3MF</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">Ready</span>
          {selectedFile && (
            <>
              <span>•</span>
              <span>Model: {selectedFile.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>Resolution: 1920x1080</span>
          <span>•</span>
          <span>Quality: High</span>
          <Button variant="ghost" size="sm" className="p-1">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Scenes Tab Component'i güncelleyelim
function ScenesTab({
  onFileChange,
  onBrowseClick,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  selectedFile,
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBrowseClick: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  isDragOver: boolean
  selectedFile: File | null
}) {
  const [selectedStudio, setSelectedStudio] = useState("plain-white")
  const [customColor, setCustomColor] = useState("#ffffff")
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null)
  const [currentMode, setCurrentMode] = useState<"studio" | "custom">("studio")
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const [currentBackgroundMode, setCurrentBackgroundMode] = useState<"studio" | "custom-color" | "custom-image">(
    "studio",
  )

  const studioScenes = [
    {
      id: "plain-white",
      name: "Plain White",
      description: "Clean white background",
      gradient: "bg-white border-2 border-gray-200",
      preview: "bg-gradient-to-br from-gray-50 to-white",
      backgroundColor: "#ffffff",
    },
    {
      id: "3point-faded",
      name: "3-Point Faded",
      description: "Professional studio lighting",
      gradient: "bg-gradient-to-br from-gray-100 via-gray-50 to-white",
      preview: "bg-gradient-to-br from-gray-200 via-gray-100 to-white",
      backgroundColor: "#f0f0f5",
    },
    {
      id: "simple-office",
      name: "Simple Office",
      description: "Soft office environment",
      gradient: "bg-gradient-to-br from-blue-50 via-gray-50 to-white",
      preview: "bg-gradient-to-br from-blue-100 via-gray-100 to-white",
      backgroundColor: "#e6e6e6",
    },
    {
      id: "warm-studio",
      name: "Warm Studio",
      description: "Warm ambient lighting",
      gradient: "bg-gradient-to-br from-orange-50 via-yellow-50 to-white",
      preview: "bg-gradient-to-br from-orange-100 via-yellow-100 to-white",
      backgroundColor: "#faf5e6",
    },
  ]

  // Studio scene uygulama fonksiyonu
  const applyStudioScene = (sceneId: string) => {
    setSelectedStudio(sceneId)
    setCurrentBackgroundMode("studio")
    setBackgroundImage(null) // Clear background image

    // Studio scene event'i gönder
    const event = new CustomEvent("applyStudioScene", {
      detail: { sceneId },
    })
    window.dispatchEvent(event)
  }

  // Custom background uygulama fonksiyonu - Her zaman uygula
  const applyCustomBackground = (color: string) => {
    setCustomColor(color)
    setCurrentBackgroundMode("custom-color")
    setBackgroundImage(null) // Clear background image

    // Custom background event'i gönder
    const event = new CustomEvent("applyCustomBackground", {
      detail: { color, timestamp: Date.now() },
    })
    window.dispatchEvent(event)
  }

  const handleBackgroundImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      applyBackgroundImage(e.target.files[0])
    }
  }

  const openBackgroundDialog = () => {
    backgroundInputRef.current?.click()
  }

  // Mevcut background rengini al
  const getCurrentBackgroundColor = () => {
    if (currentBackgroundMode === "custom-color") {
      return customColor
    } else if (currentBackgroundMode === "custom-image") {
      return "Custom Image"
    } else {
      const currentScene = studioScenes.find((s) => s.id === selectedStudio)
      return currentScene?.backgroundColor || "#ffffff"
    }
  }

  // Mevcut lighting mode'u al
  const getCurrentLightingMode = () => {
    if (currentBackgroundMode === "custom-color") {
      return "Custom Color"
    } else if (currentBackgroundMode === "custom-image") {
      return "Custom Image"
    } else {
      const currentScene = studioScenes.find((s) => s.id === selectedStudio)
      return currentScene?.name || "Plain White"
    }
  }

  // Background image uygulama fonksiyonu
  const applyBackgroundImage = (imageFile: File) => {
    setBackgroundImage(imageFile)
    setCurrentBackgroundMode("custom-image")

    // Background image event'i gönder
    const event = new CustomEvent("applyBackgroundImage", {
      detail: { imageFile, timestamp: Date.now() },
    })
    window.dispatchEvent(event)
  }

  // Background image temizleme fonksiyonu
  const clearBackgroundImage = () => {
    setBackgroundImage(null)
    if (currentBackgroundMode === "custom-image") {
      // Revert to default studio scene
      applyStudioScene("plain-white")
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* File Upload - Drag & Drop + Click */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Upload Model</h3>
        <div
          className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${
            isDragOver ? "border-cyan-500 bg-cyan-50" : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onBrowseClick}
        >
          <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-600 mb-1">
            {isDragOver ? "Drop your 3D model here" : "Drag & drop 3D model or click to browse"}
          </p>
          <Button size="sm" variant="outline" className="text-xs px-3 py-1 bg-transparent">
            Browse
          </Button>
          <input type="file" accept=".stl,.obj,.ply,.3mf" className="hidden" tabIndex={-1} onChange={onFileChange} />
          {selectedFile && <div className="mt-2 text-xs text-cyan-700">Selected: {selectedFile.name}</div>}
        </div>
      </div>

      {/* Studio Scenes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Studio Scenes</h3>
        <div className="grid grid-cols-2 gap-3">
          {studioScenes.map((scene) => (
            <div
              key={scene.id}
              className={`relative cursor-pointer rounded-lg border-2 transition-all hover:scale-105 ${
                selectedStudio === scene.id && currentMode === "studio"
                  ? "border-cyan-500 ring-2 ring-cyan-200"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => applyStudioScene(scene.id)}
            >
              <div className={`h-20 rounded-t-md ${scene.preview}`}></div>
              <div className="p-2">
                <div className="text-xs font-medium text-gray-900">{scene.name}</div>
                <div className="text-xs text-gray-500 mt-1">{scene.description}</div>
              </div>
              {selectedStudio === scene.id && currentMode === "studio" && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Background Color */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Custom Background</h3>
        <div className="space-y-3">
          {/* Solid Color Section */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">Solid Color</label>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-8 rounded-md border-2 border-gray-300 cursor-pointer shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
                style={{ backgroundColor: customColor }}
                onClick={() => applyCustomBackground(customColor)} // Aynı rengi tekrar uygula
              ></div>
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const newColor = e.target.value
                  setCustomColor(newColor)
                  // Geçerli hex renk kontrolü
                  if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                    applyCustomBackground(newColor)
                  }
                }}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 font-mono min-w-0"
                placeholder="#ffffff"
              />
              <Button
                size="sm"
                variant="outline"
                className="text-xs px-3 py-1 bg-transparent flex-shrink-0"
                onClick={() => setShowColorPicker(!showColorPicker)}
              >
                Pick
              </Button>
            </div>

            {/* Simple Color Picker */}
            {showColorPicker && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="grid grid-cols-8 gap-1 mb-2">
                  {[
                    "#ffffff",
                    "#f8f9fa",
                    "#e9ecef",
                    "#dee2e6",
                    "#ced4da",
                    "#adb5bd",
                    "#6c757d",
                    "#495057",
                    "#000000",
                    "#212529",
                    "#343a40",
                    "#495057",
                    "#6c757d",
                    "#adb5bd",
                    "#ced4da",
                    "#dee2e6",
                    "#ff0000",
                    "#ff4444",
                    "#ff6b6b",
                    "#ff8e8e",
                    "#ffb3b3",
                    "#ffd6d6",
                    "#ffe6e6",
                    "#fff0f0",
                    "#00ff00",
                    "#44ff44",
                    "#6bff6b",
                    "#8eff8e",
                    "#b3ffb3",
                    "#d6ffd6",
                    "#e6ffe6",
                    "#f0fff0",
                    "#0000ff",
                    "#4444ff",
                    "#6b6bff",
                    "#8e8eff",
                    "#b3b3ff",
                    "#d6d6ff",
                    "#e6e6ff",
                    "#f0f0ff",
                    "#ffff00",
                    "#ffff44",
                    "#ffff6b",
                    "#ffff8e",
                    "#ffffb3",
                    "#ffffd6",
                    "#ffffe6",
                    "#fffff0",
                    "#ff00ff",
                    "#ff44ff",
                    "#ff6bff",
                    "#ff8eff",
                    "#ffb3ff",
                    "#ffd6ff",
                    "#ffe6ff",
                    "#fff0ff",
                    "#00ffff",
                    "#44ffff",
                    "#6bffff",
                    "#8effff",
                    "#b3ffff",
                    "#d6ffff",
                    "#e6ffff",
                    "#f0ffff",
                  ].map((color) => (
                    <div
                      key={color}
                      className="w-6 h-6 rounded cursor-pointer border border-gray-300 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setShowColorPicker(false)
                        applyCustomBackground(color)
                      }}
                    ></div>
                  ))}
                </div>
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    applyCustomBackground(e.target.value)
                  }}
                  className="w-full h-8 rounded border border-gray-300 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Background Image Section */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">Background Image</label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                currentBackgroundMode === "custom-image"
                  ? "border-cyan-500 bg-cyan-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={openBackgroundDialog}
            >
              {backgroundImage ? (
                <div className="space-y-2">
                  <ImageIcon className="h-6 w-6 text-cyan-500 mx-auto" />
                  <div className="text-xs text-gray-700 font-medium">{backgroundImage.name}</div>
                  <div className="text-xs text-cyan-600">Active background image</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <ImageIcon className="h-6 w-6 text-gray-400 mx-auto" />
                  <div className="text-xs text-gray-600">Click to upload background image</div>
                  <div className="text-xs text-gray-500">JPG, PNG, WebP supported</div>
                </div>
              )}
            </div>
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBackgroundImageChange}
            />
            {backgroundImage && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-3 py-1 bg-transparent flex-1"
                  onClick={openBackgroundDialog}
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  Change
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs px-3 py-1 bg-transparent text-red-600 hover:text-red-700 hover:border-red-300"
                  onClick={clearBackgroundImage}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scene Properties - Aktif sahne için */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Scene Properties</h3>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Resolution</span>
            <span className="text-gray-900 font-medium">1920×1080</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Lighting Mode</span>
            <span className="text-gray-900 font-medium">{getCurrentLightingMode()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Background</span>
            <div className="flex items-center gap-2">
              {currentBackgroundMode === "custom-image" && backgroundImage ? (
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-500" />
                  <span className="text-gray-900 font-medium">Custom Image</span>
                </div>
              ) : (
                <>
                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: getCurrentBackgroundColor() }}
                  ></div>
                  <span className="text-gray-900 font-medium">{getCurrentBackgroundColor()}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Camera</span>
            <span className="text-gray-900 font-medium">Perspective</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Lights Tab Component
function LightsTab() {
  return (
    <div className="p-4 space-y-6">
      {/* Lights Library */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Lights Library</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: "Area Light", icon: Square },
            { name: "Point Light", icon: Zap },
            { name: "Spot Light", icon: Target },
            { name: "Sun Light", icon: Sun },
          ].map((light) => {
            const Icon = light.icon
            return (
              <div
                key={light.name}
                className="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-center"
              >
                <Icon className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                <span className="text-xs text-gray-700">{light.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current Lights */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Scene Lights</h3>
          <Button size="sm" variant="ghost" className="p-1">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {["Key Light", "Fill Light", "Rim Light"].map((light, index) => (
            <div
              key={light}
              className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                index === 0 ? "border-cyan-500 bg-cyan-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">{light}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="p-1">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="p-1">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {index === 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Intensity</span>
                    <span className="text-gray-900">75%</span>
                  </div>
                  <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="75" />
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Light Properties */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Light Properties</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Brightness</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="75" />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Shadow Softness</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Radius</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="25" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Camera Tab Component
function CameraTab() {
  return (
    <div className="p-4 space-y-6">
      {/* Camera Properties */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Camera Properties</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Focal Length</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>24mm</span>
              <span>200mm</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Aperture (f-stop)</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="40" />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>f/1.4</span>
              <span>f/22</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Focus Distance</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="60" />
          </div>
        </div>
      </div>

      {/* Camera Presets */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Camera Presets</h3>
        <div className="grid grid-cols-2 gap-2">
          {["Front", "Back", "Left", "Right", "Top", "Bottom", "Isometric", "Perspective"].map((preset) => (
            <Button key={preset} variant="outline" size="sm" className="text-xs bg-transparent">
              {preset}
            </Button>
          ))}
        </div>
      </div>

      {/* Depth of Field */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Depth of Field</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Enable DOF</span>
            <input type="checkbox" className="rounded" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Blur Amount</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="30" />
          </div>
        </div>
      </div>

      {/* White Balance */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">White Balance</h3>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {["Daylight", "Tungsten", "Fluorescent", "Custom"].map((wb) => (
              <Button key={wb} variant="outline" size="sm" className="text-xs bg-transparent">
                {wb}
              </Button>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Temperature</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Materials Tab Component
function MaterialsTab() {
  return (
    <div className="p-4 space-y-6">
      {/* Material Library */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Material Library</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: "Metal", color: "bg-gray-400" },
            { name: "Plastic", color: "bg-blue-400" },
            { name: "Glass", color: "bg-cyan-200" },
            { name: "Wood", color: "bg-amber-600" },
            { name: "Fabric", color: "bg-red-400" },
            { name: "Ceramic", color: "bg-white border" },
          ].map((material) => (
            <div
              key={material.name}
              className="aspect-square rounded-lg cursor-pointer hover:scale-105 transition-transform flex items-center justify-center text-xs font-medium"
            >
              <div className={`w-full h-full rounded-lg ${material.color} flex items-center justify-center`}>
                <span className={material.name === "Ceramic" ? "text-gray-700" : "text-white"}>{material.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Materials */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Model Materials</h3>
        <div className="space-y-2">
          {["Main Body", "Details", "Accents"].map((material, index) => (
            <div
              key={material}
              className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                index === 0 ? "border-cyan-500 bg-cyan-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{material}</span>
                <div className="w-4 h-4 bg-gray-400 rounded border border-gray-300"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Material Properties */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Material Properties</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Base Color</label>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-400 rounded border border-gray-300 cursor-pointer"></div>
              <input type="text" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" value="#888888" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Metallic</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="80" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Roughness</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="20" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Transparency</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="0" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Emission</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="0" />
          </div>
        </div>
      </div>

      {/* Textures */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Textures</h3>
        <div className="space-y-2">
          {["Diffuse Map", "Normal Map", "Roughness Map", "Metallic Map"].map((texture) => (
            <div key={texture} className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{texture}</span>
              <Button size="sm" variant="outline" className="text-xs px-2 py-1 bg-transparent">
                Load
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Output Tab Component
function OutputTab() {
  return (
    <div className="p-4 space-y-6">
      {/* Render Settings */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Render Settings</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Resolution</label>
            <select className="w-full text-xs border border-gray-300 rounded px-2 py-1">
              <option>1920x1080 (Full HD)</option>
              <option>2560x1440 (2K)</option>
              <option>3840x2160 (4K)</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Quality</label>
            <select className="w-full text-xs border border-gray-300 rounded px-2 py-1">
              <option>Draft</option>
              <option>Medium</option>
              <option>High</option>
              <option>Ultra</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Samples</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>16</span>
              <span>1024</span>
            </div>
          </div>
        </div>
      </div>

      {/* Post Processing */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Post Processing</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Exposure</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Contrast</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Saturation</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Vignette</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="0" />
          </div>
        </div>
      </div>

      {/* Color Grading */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Color Grading</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Temperature</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Tint</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Highlights</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Shadows</label>
            <input type="range" className="w-full h-1 bg-gray-200 rounded-lg" defaultValue="50" />
          </div>
        </div>
      </div>

      {/* Effects */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Effects</h3>
        <div className="space-y-2">
          {[
            { name: "Lens Flare", enabled: false },
            { name: "Bloom", enabled: true },
            { name: "Sharpen", enabled: false },
            { name: "Denoise", enabled: true },
          ].map((effect) => (
            <div key={effect.name} className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{effect.name}</span>
              <input type="checkbox" className="rounded" defaultChecked={effect.enabled} />
            </div>
          ))}
        </div>
      </div>

      {/* Export Options */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Export</h3>
        <div className="space-y-2">
          <Button className="w-full bg-cyan-500 hover:bg-cyan-600 text-sm">
            <Download className="h-4 w-4 mr-2" />
            Export Image
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="text-xs bg-transparent">
              PNG
            </Button>
            <Button variant="outline" size="sm" className="text-xs bg-transparent">
              JPG
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
