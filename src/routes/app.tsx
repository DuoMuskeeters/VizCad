"use client"

import type React from "react"

import { VtkApp } from "@/components/vtk"
import { Button } from "@/components/ui/button"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  Upload,
  File,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move3D,
  Settings,
  Download,
  Share2,
  Eye,
  EyeOff,
  Grid3X3,
  Palette,
  Info,
} from "lucide-react"

export const Route = createFileRoute("/app")({
  component: AppPage,
})

function AppPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0])
    }
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
      setFile(files[0])
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
          <div className="text-sm font-medium text-gray-700">{file ? file.name : "No file selected"}</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="p-2">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <Move3D className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
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
        {/* Left Sidebar */}
        {sidebarOpen && (
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
            {/* File Upload Section */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload File</h3>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragOver ? "border-cyan-400 bg-cyan-50" : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">Drag & drop your file here</p>
                <p className="text-xs text-gray-500 mb-3">or</p>
                <label className="cursor-pointer">
                  <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600">
                    Browse Files
                  </Button>
                  <input type="file" className="hidden" accept=".stl,.obj,.ply,.3mf" onChange={handleFileChange} />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">Supported: STL, OBJ, PLY, 3MF</p>
            </div>

            {/* File Info */}
            {file && (
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">File Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600 truncate">{file.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">Size: {(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  <div className="text-xs text-gray-500">Type: {file.type || "Unknown"}</div>
                </div>
              </div>
            )}

            {/* View Controls */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">View Controls</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Wireframe</span>
                  <Button variant="ghost" size="sm" className="p-1">
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Grid</span>
                  <Button variant="ghost" size="sm" className="p-1">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Material</span>
                  <Button variant="ghost" size="sm" className="p-1">
                    <Palette className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Model Properties */}
            {file && (
              <div className="p-4 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Model Properties</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Vertices:</span>
                    <span className="text-gray-900">--</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Faces:</span>
                    <span className="text-gray-900">--</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Volume:</span>
                    <span className="text-gray-900">--</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Surface Area:</span>
                    <span className="text-gray-900">--</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Viewer Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {file ? (
            <div className="flex-1 p-4">
              <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <VtkApp file={file} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Welcome to VizCad Viewer</h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Upload a 3D model file to start visualizing. Drag and drop your STL, OBJ, or PLY files into the
                  sidebar or click the browse button to get started.
                </p>
                <div className="space-y-3">
                  <label className="cursor-pointer">
                    <Button className="bg-cyan-500 hover:bg-cyan-600 px-6 py-3">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Your First File
                    </Button>
                    <input type="file" className="hidden" accept=".stl,.obj,.ply,.3mf" onChange={handleFileChange} />
                  </label>
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
          <span>Ready</span>
          {file && (
            <>
              <span>•</span>
              <span>File loaded: {file.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="p-1">
            <Info className="h-4 w-4" />
          </Button>
          <span>VizCad v1.0</span>
        </div>
      </div>
    </div>
  )
}
