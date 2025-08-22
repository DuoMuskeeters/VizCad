import { Download } from "lucide-react";
import { Button } from "../ui/button";

export function OutputTab() {
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
          <Button className="w-full text-sm" style={{ backgroundColor: "rgb(var(--primary))", color: "rgb(var(--primary-foreground))" }}
            onMouseEnter={(e)=>((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgb(var(--primary-hover))")}
            onMouseLeave={(e)=>((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgb(var(--primary))")}
          >
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