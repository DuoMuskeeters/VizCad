import { Edit3, ImageIcon, Trash2, Upload } from "lucide-react"
import { Button } from "../ui/button"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useVtkScene } from "../scene"

export function ScenesTab({
  onFileChange,
  onBrowseClick,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  selectedFile,
  perspective,
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBrowseClick: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  isDragOver: boolean
  selectedFile: File | null
  perspective: boolean
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedStudio, setSelectedStudio] = useState("plain-white")
  const [customColor, setCustomColor] = useState("#ffffff")
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [currentMode, setCurrentMode] = useState<"studio" | "custom">("studio")
  const [currentBackgroundMode, setCurrentBackgroundMode] = useState<"studio" | "custom-color" | "custom-image">(
    "studio",
  )

  const { t } = useTranslation()
  const studioScenes = [
    {
      id: "plain-white",
      name: t("scene_plainWhite"),
      description: t("scene_plainWhite_desc"),
      gradient: "bg-white border-2 border-gray-200",
      preview: "bg-gradient-to-br from-gray-50 to-white",
      backgroundColor: "#ffffff",
    },
    {
      id: "3point-faded",
      name: t("scene_3PointFaded"),
      description: t("scene_3PointFaded_desc"),
      gradient: "bg-gradient-to-br from-gray-100 via-gray-50 to-white",
      preview: "bg-gradient-to-br from-gray-200 via-gray-100 to-white",
      backgroundColor: "#f0f0f5",
    },
    {
      id: "simple-office",
      name: t("scene_simpleOffice"),
      description: t("scene_simpleOffice_desc"),
      gradient: "bg-gradient-to-br from-blue-50 via-gray-50 to-white",
      preview: "bg-gradient-to-br from-blue-100 via-gray-100 to-white",
      backgroundColor: "#e6e6e6",
    },
    {
      id: "warm-studio",
      name: t("scene_warmStudio"),
      description: t("scene_warmStudio_desc"),
      gradient: "bg-gradient-to-br from-orange-50 via-yellow-50 to-white",
      preview: "bg-gradient-to-br from-orange-100 via-yellow-100 to-white",
      backgroundColor: "#faf5e6",
    },
  ]

  // Styles that follow palette variables
  const dragStyle = isDragOver
    ? { borderColor: "rgb(var(--primary))", backgroundColor: "rgb(var(--primary) / 0.06)" }
    : undefined

  // Studio scene uygulama fonksiyonu
  const applyStudioScene = (sceneId: string) => {
    setSelectedStudio(sceneId)
    setCurrentBackgroundMode("studio")
  // background image özelliği kaldırıldı

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
  // background image özelliği kaldırıldı

    // Custom background event'i gönder
    const event = new CustomEvent("applyCustomBackground", {
      detail: { color, timestamp: Date.now() },
    })
    window.dispatchEvent(event)
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
  return currentScene?.name || t("scene_plainWhite")
    }
  }


  return (
    <div className="p-4 space-y-6">
      {/* File Upload - Drag & Drop + Click */}
      <div>
  <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("scene_uploadModel")}</h3>
        <div
          className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer`}
          style={dragStyle}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onBrowseClick}
        >
            <Upload className="h-5 w-5 mx-auto mb-1" style={{ color: "rgb(var(--muted-foreground))" }} />
          <p className="text-xs text-gray-600 mb-1">
            {isDragOver ? t("scene_dropModel") : t("scene_dragDropOrBrowse")}
          </p>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs px-3 py-1 bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                  setTimeout(() => fileInputRef.current?.click(), 0);
                }
              }}
            >
            {t("scene_browse")}
          </Button>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".stl,.obj,.ply" 
            className="hidden" 
            tabIndex={-1} 
            onChange={onFileChange} 
          />
          {selectedFile && <div className="mt-2 text-xs" style={{ color: "rgb(var(--primary))" }}>Selected: {selectedFile.name}</div>}
        </div>
      </div>

      {/* Studio Scenes */}
      <div>
  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("scene_studioScenes")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {studioScenes.map((scene) => (
            <div
              key={scene.id}
              className={`relative cursor-pointer rounded-lg border-2 transition-all hover:scale-105`}
              onClick={() => applyStudioScene(scene.id)}
              style={
                selectedStudio === scene.id && currentMode === "studio"
                  ? { borderColor: "rgb(var(--primary))", boxShadow: "0 0 0 4px rgb(var(--primary) / 0.08)" }
                  : undefined
              }
            >
              <div className={`h-20 rounded-t-md ${scene.preview}`}></div>
              <div className="p-2">
                <div className="text-xs font-medium text-gray-900">{scene.name}</div>
                <div className="text-xs text-gray-500 mt-1">{scene.description}</div>
              </div>
              {selectedStudio === scene.id && currentMode === "studio" && (
                <div
                  className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgb(var(--primary))" }}
                >
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Background Color */}
      <div>
  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t("scene_customBackground")}</h3>
        <div className="space-y-3">
          {/* Solid Color Section */}
          <div>
            <label className="text-xs text-gray-600 mb-2 block">{t("scene_solidColor")}</label>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-8 rounded-md border-2 border-gray-300 cursor-pointer shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
                style={{ backgroundColor: customColor }}
                onClick={() => setShowColorPicker(!showColorPicker)} // Artık paleti aç/kapat
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
                {t("scene_pick")}
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

        </div>
      </div>

      {/* Scene Properties - Aktif sahne için */}
      <div>
  <h3 className="text-sm font-semibold text-gray-900 mb-2">{t("scene_properties")}</h3>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{t("scene_resolution")}</span>
            <span className="text-gray-900 font-medium">1920×1080</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{t("scene_lightingMode")}</span>
            <span className="text-gray-900 font-medium">{getCurrentLightingMode()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{t("scene_background")}</span>
            <div className="flex items-center gap-2">
              <>
                <div
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: getCurrentBackgroundColor() }}
                ></div>
                <span className="text-gray-900 font-medium">{getCurrentBackgroundColor()}</span>
              </>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{t("scene_camera")}</span>
            <span className="text-gray-900 font-medium">
              {perspective ? t("scene_perspective") : t("scene_orthographic")}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}