import { Button } from "../ui/button";

export function AppearanceTab() {
  return (
    <div className="p-4 space-y-6">
      {/* Appearance Library */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Appearance Library</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: "Metal", color: "bg-gray-400" },
            { name: "Plastic", color: "bg-blue-400" },
            { name: "Glass", color: "" },
            { name: "Wood", color: "bg-amber-600" },
            { name: "Fabric", color: "bg-red-400" },
            { name: "Ceramic", color: "bg-white border" },
          ].map((appearance) => (
            <div
              key={appearance.name}
              className="aspect-square rounded-lg cursor-pointer hover:scale-105 transition-transform flex items-center justify-center text-xs font-medium"
            >
              {appearance.name}
            </div>
          ))}
        </div>
      </div>

      {/* Current Appearances */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Model Appearances</h3>
        <div className="space-y-2">
          {[
            "Main Body",
            "Details",
            "Accents",
          ].map((appearance, index) => (
            <div
              key={appearance}
              className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors border-gray-200`}
              style={index === 0 ? { borderColor: "rgb(var(--primary))", backgroundColor: "rgb(var(--primary) / 0.06)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{appearance}</span>
                <div className="w-4 h-4 bg-gray-400 rounded border border-gray-300"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Appearance Properties */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Appearance Properties</h3>
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