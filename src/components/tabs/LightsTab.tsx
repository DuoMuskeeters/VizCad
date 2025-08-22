import { Eye, MoreVertical, Plus, Square, Sun, Target, Zap } from "lucide-react"
import { Button } from "../ui/button"

export function LightsTab() {
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
              className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors border-gray-200`}
              style={index === 0 ? { borderColor: "rgb(var(--primary))", backgroundColor: "rgb(var(--primary) / 0.06)" } : undefined}
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