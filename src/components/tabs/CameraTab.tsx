import { Button } from "../ui/button";

// Camera Tab Component
export function CameraTab() {
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