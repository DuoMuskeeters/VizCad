import { Edit3, ImageIcon, Trash2, Upload } from "lucide-react"
import { Button } from "../ui/button"
import { useRef, useState } from "react"
import { useVtkScene } from "../scene"

export function ScenesTab({
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
  const {
      vtkContainerRef,
      rendererRef,
      renderWindowRef,
      actorRef,
      mapperRef,
      readerRef,
      lightsRef,
      floorActorRef,
      backgroundPlaneRef,
      setBackground,
      addLight,
      resize,
      clearAllLights,
      clearFloor,
      clearBackgroundPlane,
    } = useVtkScene();
  
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const [selectedStudio, setSelectedStudio] = useState("plain-white")
  const [customColor, setCustomColor] = useState("#ffffff")
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null)
  const [currentMode, setCurrentMode] = useState<"studio" | "custom">("studio")
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