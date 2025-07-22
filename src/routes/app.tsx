"use client"

import React from "react"

import { VtkApp } from "@/components/vtk"
import { Button } from "@/components/ui/button"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
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
  Play,
  Pause,
  Square,
  Sun,
  Zap,
  Target,
  Plus,
  Trash2,
  Edit3,
  Copy,
  MoreVertical,
} from "lucide-react"

export const Route = createFileRoute("/app")({
  component: AppPage,
})


function AppPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("scenes")
  const [isRendering, setIsRendering] = useState(false)

  // Unified file input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Unified file change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  }

  // Open file dialog programmatically
  const openFileDialog = () => {
    // Always allow file dialog, even if a file is already selected
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
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
    { id: "scenes", label: "Scenes", icon: Layers },
    { id: "lights", label: "Lights", icon: Lightbulb },
    { id: "camera", label: "Camera", icon: Camera },
    { id: "materials", label: "Materials", icon: Palette },
    { id: "output", label: "Output", icon: ImageIcon },
  ]

  const renderTabContent = () => {
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
      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium text-gray-700">{selectedFile ? selectedFile.name : "No file selected"}</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Render Controls */}
          <div className="flex items-center gap-1 mr-4">
            <Button
              size="sm"
              className={`px-3 py-2 ${isRendering ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
              onClick={() => setIsRendering(!isRendering)}
            >
              {isRendering ? (
                <>
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Render
                </>
              )}
            </Button>
            {isRendering && (
              <Button variant="ghost" size="sm" className="p-2">
                <Pause className="h-4 w-4" />
              </Button>
            )}
          </div>

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
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? "text-cyan-600 bg-cyan-50 border-b-2 border-cyan-600"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">{renderTabContent()}</div>
          </div>
        )}

        {/* Main Viewer Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {selectedFile ? (
            <div className="flex-1 p-4">
              <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden relative">
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
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="p-1 text-gray-600 hover:text-gray-900">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <VtkApp file={selectedFile} />

                {/* Render Progress Overlay */}
                {isRendering && (
                  <div className="absolute top-20 right-4 bg-black/80 text-white px-3 py-2 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      Rendering... 45%
                    </div>
                  </div>
                )}
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
          <span className={isRendering ? "text-green-600" : "text-gray-600"}>
            {isRendering ? "Rendering..." : "Ready"}
          </span>
          {selectedFile && (
            <>
              <span>•</span>
              <span>Model: {selectedFile.name}</span>
            </>
          )}
          {isRendering && (
            <>
              <span>•</span>
              <span>Progress: 45%</span>
              <span>•</span>
              <span>ETA: 2m 15s</span>
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

// Scenes Tab Component'i daha toplu ve düzenli hale getir
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
  return (
    <div className="p-4 space-y-4">
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
          <Button size="sm" variant="outline" className="text-xs px-3 py-1 ">
            Browse
          </Button>
          <input
            type="file"
            accept=".stl,.obj,.ply,.3mf"
            className="hidden"
            tabIndex={-1}
            onChange={onFileChange}
          />
          {selectedFile && (
            <div className="mt-2 text-xs text-cyan-700">Selected: {selectedFile.name}</div>
          )}
        </div>
      </div>

      {/* Environments - Daha kompakt grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Environments</h3>
        <div className="space-y-1">
          {[
            { name: "Studio Light", gradient: "from-gray-100 to-gray-300" },
            { name: "Outdoor HDRI", gradient: "from-blue-400 to-cyan-300" },
            { name: "Interior Warm", gradient: "from-orange-300 to-yellow-400" },
            { name: "Abstract Space", gradient: "from-purple-400 to-pink-400" },
          ].map((env) => (
            <div
              key={env.name}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors group`}
            >
              <div className={`w-8 h-8 bg-gradient-to-br ${env.gradient} rounded-md flex-shrink-0`}></div>
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{env.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Backplates - Liste formatında */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Backplates</h3>
        <div className="space-y-1">
          {[
            { name: "Pure White", bg: "bg-white border border-gray-200" },
            { name: "Deep Black", bg: "bg-black" },
            { name: "Soft Gradient", bg: "bg-gradient-to-r from-gray-100 to-gray-200" },
            { name: "Custom Image", bg: "bg-gray-100 border-2 border-dashed border-gray-300" },
          ].map((bg) => (
            <div
              key={bg.name}
              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors group"
            >
              <div className={`w-8 h-5 ${bg.bg} rounded flex-shrink-0`}></div>
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{bg.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Current Scenes - Daha kompakt liste */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Active Scenes</h3>
          <Button size="sm" variant="ghost" className="p-1 text-cyan-600 hover:text-cyan-700">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          {[
            { name: "Main Product View", active: true, thumbnail: "bg-cyan-100" },
            { name: "Detail Close-up", active: false, thumbnail: "bg-gray-100" },
            { name: "Exploded Assembly", active: false, thumbnail: "bg-gray-100" },
          ].map((scene) => (
            <div
              key={scene.name}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                scene.active ? "bg-cyan-50 border border-cyan-200" : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <div className={`w-8 h-6 ${scene.thumbnail} rounded border border-gray-200 flex-shrink-0`}></div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${scene.active ? "text-cyan-900" : "text-gray-700"}`}>
                  {scene.name}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" className="p-1">
                  <Edit3 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="p-1">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="p-1 text-red-600 hover:text-red-700">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
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
            <span className="text-gray-600">Environment</span>
            <span className="text-gray-900 font-medium">Studio Light</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Backplate</span>
            <span className="text-gray-900 font-medium">Pure White</span>
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
