"use client"

import { useState, useEffect } from "react"
import { DemoContainer } from "./DemoContainer"
import { Cursor } from "./Cursor"
import {
    Share2,
    Copy,
    Check,
    FileBox,
    LayoutDashboard,
    Folder,
    Users,
    UploadCloud,
    ChevronLeft,
    Download,
    Settings,
    Box,
    MoreVertical,
    MessageSquare,
    Send,
    Navigation,
    Layers,
    Palette,
    Lightbulb,
    ImageIcon,
    Eye,
    Move3d,
    Lock,
    Upload,
    RotateCcw,
    ZoomIn,
    ZoomOut,
    Maximize,
    Info,
    Edit3,
    Trash2,
    Camera,
    X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// --- Mock Components ---
const BatmanModelMock = ({ filter }: { filter?: string }) => (
    <div className="w-full h-full bg-white flex items-center justify-center relative overflow-hidden animate-in fade-in zoom-in duration-700">
        <img
            src="/images/demo/batman-viewer.png"
            alt="3D Viewer Content"
            className={cn("w-full h-full object-contain p-4 transition-all duration-1000", filter)}
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.classList.add('bg-slate-100');
            }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
            <div className="relative w-32 h-48 opacity-20 bg-slate-500" style={{
                clipPath: 'polygon(50% 0%, 70% 20%, 80% 15%, 85% 35%, 80% 50%, 90% 90%, 80% 100%, 50% 90%, 20% 100%, 10% 90%, 20% 50%, 15% 35%, 20% 15%, 30% 20%)'
            }} />
        </div>
    </div>
)

export const StudioDemo = () => {
    // States
    const [studioView, setStudioView] = useState<'empty' | 'loading' | 'viewer'>('empty')
    const [activeScene, setActiveScene] = useState('plain-white')
    const [isRenderModalOpen, setIsRenderModalOpen] = useState(false)
    const [isFlash, setIsFlash] = useState(false)

    // Animation States
    const [dragFile, setDragFile] = useState(false)
    const [dragOverSidebar, setDragOverSidebar] = useState(false)
    const [cursor, setCursor] = useState({ x: 105, y: 80, clicking: false })

    const getElementPos = (id: string, defaultPos: { x: number, y: number }) => {
        const el = document.getElementById(id)
        const container = document.getElementById("demo-studio-container")

        if (!el || !container) return { ...defaultPos, clicking: false }

        const elRect = el.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        const x = ((elRect.left + elRect.width / 2 - containerRect.left) / containerRect.width) * 100
        const y = ((elRect.top + elRect.height / 2 - containerRect.top) / containerRect.height) * 100

        return { x, y, clicking: false }
    }

    // Scenes
    const studioScenes = [
        { id: "plain-white", name: "Plain White", preview: "bg-gradient-to-br from-gray-50 to-white", filter: "" },
        { id: "3point-faded", name: "3 Point Faded", preview: "bg-gradient-to-br from-gray-200 via-gray-100 to-white", filter: "brightness-110 contrast-105" },
        { id: "simple-office", name: "Simple Office", preview: "bg-gradient-to-br from-blue-100 via-gray-100 to-white", filter: "brightness-105 sepia-[.2]" },
        { id: "warm-studio", name: "Warm Studio", preview: "bg-gradient-to-br from-orange-100 via-yellow-100 to-white", filter: "sepia-[.4] contrast-110 saturate-[1.2]" },
    ]

    useEffect(() => {
        const runSequence = async () => {
            // --- RESET ---
            setStudioView('empty')
            setActiveScene('plain-white')
            setIsRenderModalOpen(false)
            setDragFile(false)
            setDragOverSidebar(false)
            setCursor({ x: 110, y: 80, clicking: false })

            await new Promise(r => setTimeout(r, 1000))

            // 1. DRAG FILE TO SIDEBAR
            setCursor({ x: 80, y: 95, clicking: false })
            await new Promise(r => setTimeout(r, 800))

            // Grab
            setCursor(prev => ({ ...prev, clicking: true }))
            setDragFile(true)
            await new Promise(r => setTimeout(r, 300))

            // Drag to Sidebar
            setCursor(getElementPos("demo-studio-dropzone", { x: 10, y: 25 }))
            await new Promise(r => setTimeout(r, 800))
            setDragOverSidebar(true)
            await new Promise(r => setTimeout(r, 300))

            // Drop
            setCursor(prev => ({ ...prev, clicking: false }))
            setDragFile(false)
            setDragOverSidebar(false)
            await new Promise(r => setTimeout(r, 200))

            // 2. LOAD
            setStudioView('loading')
            await new Promise(r => setTimeout(r, 1200))
            setStudioView('viewer')
            await new Promise(r => setTimeout(r, 800))

            // 3. SELECT "WARM STUDIO" (Index 3 - Bottom Right of grid)
            setCursor(getElementPos("demo-studio-scene-warm-studio", { x: 12, y: 45 }))
            await new Promise(r => setTimeout(r, 1000))

            // Click
            setCursor(prev => ({ ...prev, clicking: true }))
            setActiveScene('warm-studio')
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))
            await new Promise(r => setTimeout(r, 1500))

            // 4. CLICK CAMERA (Floating Controls)
            setCursor(getElementPos("demo-studio-camera", { x: 58, y: 8 }))
            await new Promise(r => setTimeout(r, 1200))

            // Click
            setCursor(prev => ({ ...prev, clicking: true }))
            setIsFlash(true) // FLASH
            await new Promise(r => setTimeout(r, 100))
            setIsFlash(false)
            await new Promise(r => setTimeout(r, 100))

            setCursor(prev => ({ ...prev, clicking: false }))
            setIsRenderModalOpen(true)
            await new Promise(r => setTimeout(r, 3000)) // Show result

            // 5. CLOSE MODAL (Optional, or just reset)
            setCursor(getElementPos("demo-studio-modal-close", { x: 72, y: 25 })) // Close button position
            await new Promise(r => setTimeout(r, 1000))
            setCursor(prev => ({ ...prev, clicking: true }))
            setIsRenderModalOpen(false)
            setCursor(prev => ({ ...prev, clicking: false }))

            await new Promise(r => setTimeout(r, 2000))
        }

        const interval = setInterval(() => {
            runSequence()
        }, 18000)

        runSequence()
        return () => clearInterval(interval)
    }, [])

    return (
        <DemoContainer id="demo-studio-container" className="bg-slate-50 relative">
            {/* FLUID LAYOUT: Scale 0.6 */}
            <div className="relative w-[166.6%] h-[166.6%] bg-slate-50 text-slate-900 scale-[0.6] origin-top-left font-sans shadow-inner selection:bg-blue-100">

                <div className="absolute inset-0 flex flex-col bg-slate-50">
                    {/* Top Toolbar */}
                    <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-100">
                                <Navigation className="w-4 h-4" />
                            </Button>
                            <div className="text-sm font-medium text-slate-700">
                                {studioView === 'viewer' ? 'batman_v2.stl' : 'No File Selected'}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="bg-blue-600 text-white hover:bg-blue-700 font-medium px-4 h-8 text-xs shadow-sm shadow-blue-600/20">
                                Try VizCad
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden relative">
                        {/* Sidebar */}
                        <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                            {/* Tabs */}
                            <div className="border-b border-slate-200 flex">
                                {[
                                    { icon: Layers, label: "Scenes", active: true },
                                    { icon: Palette, label: "Appearance", active: false },
                                    { icon: Lightbulb, label: "Lights", active: false },
                                    { icon: ImageIcon, label: "Output", active: false }
                                ].map((tab, i) => (
                                    <div key={i} className={cn(
                                        "flex-1 flex flex-col items-center gap-1 py-3 px-1 cursor-default transition-colors",
                                        tab.active ? "text-blue-600 bg-blue-50/50 border-b-2 border-blue-600" : "text-slate-400"
                                    )}>
                                        <tab.icon className="w-4 h-4" />
                                        <span className="text-[10px] font-medium">{tab.label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Sidebar Content */}
                            <div className="p-4 space-y-6 overflow-y-auto">
                                {/* Upload Area */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-2">Upload Model</h3>
                                    <div id="demo-studio-dropzone" className={cn(
                                        "border-2 border-dashed rounded-lg p-3 text-center transition-all duration-300 group",
                                        dragOverSidebar ? "border-blue-500 bg-blue-50 scale-105" : "border-slate-300 hover:border-slate-400"
                                    )}>
                                        <Upload className={cn("h-5 w-5 mx-auto mb-1 transition-colors", dragOverSidebar ? "text-blue-500" : "text-slate-400")} />
                                        <p className="text-[10px] text-slate-500">
                                            {dragOverSidebar ? "Drop here!" : "Drag & Drop or Browse"}
                                        </p>
                                    </div>
                                </div>

                                {/* Studio Scenes Grid */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-3">Studio Scenes</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {studioScenes.map((scene) => (
                                            <div id={`demo-studio-scene-${scene.id}`} key={scene.id} className={cn(
                                                "relative cursor-pointer rounded-lg border-2 overflow-hidden transition-all hover:border-blue-200",
                                                activeScene === scene.id ? "border-blue-500 ring-2 ring-blue-500/10" : "border-slate-100"
                                            )}>
                                                <div className={cn("h-16 w-full", scene.preview)} />
                                                <div className="p-1.5 bg-white">
                                                    <div className="text-[10px] font-bold text-slate-700 truncate">{scene.name}</div>
                                                </div>
                                                {activeScene === scene.id && (
                                                    <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Background Color (ADDED per user loss) */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-3">Custom Background Color</h3>
                                    <div>
                                        <label className="text-[10px] text-slate-500 mb-2 block">Solid Color</label>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded border border-slate-300 bg-white cursor-pointer shadow-sm"></div>
                                            <div className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-[10px] font-mono text-slate-600">#ffffff</div>
                                            <Button size="sm" variant="outline" className="text-[10px] h-8 px-2">Pick</Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Properties (Teaser) (ADDED per user loss) */}
                                <div className="pt-2 border-t border-slate-100 space-y-2 opacity-60">
                                    <h3 className="text-sm font-bold text-slate-900">Properties</h3>
                                    <div className="bg-slate-50 rounded p-2 text-[10px] space-y-1">
                                        <div className="flex justify-between"><span>Resolution</span><span className="font-bold">1920x1080</span></div>
                                        <div className="flex justify-between"><span>Camera</span><span className="font-bold">Perspective</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 bg-slate-50/50 relative flex flex-col min-w-0 p-4">
                            {/* Viewer Container */}
                            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col group">

                                {/* Floating Controls (with Camera) */}
                                {studioView === 'viewer' && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                                        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-lg border border-slate-200 rounded-full px-3 py-1.5 animate-in slide-in-from-top-4 fade-in duration-700">
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><Eye className="w-3.5 h-3.5 text-slate-600" /></div>
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><Move3d className="w-3.5 h-3.5 text-slate-600" /></div>
                                            <div className="w-px h-4 bg-slate-200 mx-1" />
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><Lock className="w-3.5 h-3.5 text-red-500" /></div>
                                            <div className="w-px h-4 bg-slate-200 mx-1" />
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><ZoomIn className="w-3.5 h-3.5 text-slate-600" /></div>
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><ZoomOut className="w-3.5 h-3.5 text-slate-600" /></div>
                                            <div className="w-px h-4 bg-slate-200 mx-1" />
                                            <div id="demo-studio-camera" className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors cursor-pointer"><Camera className="w-3.5 h-3.5" /></div>
                                        </div>
                                    </div>
                                )}

                                {/* Empty State */}
                                <div className={cn(
                                    "absolute inset-0 flex flex-col items-center justify-center transition-all duration-500",
                                    studioView === 'empty' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none scale-95"
                                )}>
                                    <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                        <Upload className="w-10 h-10 text-slate-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 mb-2">Welcome to VizCad Render Studio</h3>
                                    <p className="text-slate-500 mb-6 text-center max-w-sm">Upload a 3D model file to start creating photorealistic renders. Configure lighting, materials, and camera settings for professional results</p>
                                    <div className="flex gap-2 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-md">STL</span>
                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-md">OBJ</span>
                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-md">STEP</span>
                                    </div>
                                </div>

                                {/* Loading */}
                                <div className={cn(
                                    "absolute inset-0 flex flex-col items-center justify-center bg-white z-20 transition-all duration-300",
                                    studioView === 'loading' ? "opacity-100" : "opacity-0 pointer-events-none"
                                )}>
                                    <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-4" />
                                    <p className="text-slate-600 font-medium animate-pulse">Processing Model...</p>
                                </div>

                                {/* Viewer Content with Filter */}
                                <div className={cn(
                                    "flex-1 relative transition-opacity duration-700 h-full",
                                    studioView === 'viewer' ? "opacity-100" : "opacity-0"
                                )}>
                                    <BatmanModelMock filter={studioScenes.find(s => s.id === activeScene)?.filter} />
                                </div>

                                {/* FLASH EFFECT */}
                                <div className={cn(
                                    "absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-200",
                                    isFlash ? "opacity-90" : "opacity-0"
                                )} />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[10px] text-slate-500 shrink-0 z-20">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Ready</span>
                            {studioView === 'viewer' && <><span>•</span> <span>Model: batman_v2.stl</span></>}
                        </div>
                        <div className="flex items-center gap-4">
                            <span>1920x1080</span>
                            <span>•</span>
                            <span>High Quality</span>
                        </div>
                    </div>
                </div>

                {/* --- RENDER RESULT MODAL --- */}
                <div className={cn(
                    "absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 transition-all duration-300",
                    isRenderModalOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                )}>
                    <div className={cn(
                        "bg-white h-[95%] aspect-[453/751] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transform transition-all duration-500",
                        isRenderModalOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-8"
                    )}>
                        <div className="h-12 border-b border-slate-100 flex items-center justify-between px-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-600" /> Render Result</h3>
                            <div className="flex gap-2">
                                <Button id="demo-studio-modal-close" size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-100" onClick={() => setIsRenderModalOpen(false)}><X className="w-4 h-4" /></Button>
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-50 flex items-center justify-center p-2">
                            {/* Rendered Image (Same mock, but filtered) */}
                            <div className="w-full h-full bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200 animate-in zoom-in duration-500">
                                <img
                                    src="/images/demo/batman-viewer.png"
                                    className={cn("w-full h-full object-contain", studioScenes.find(s => s.id === 'warm-studio')?.filter)}
                                />
                            </div>
                        </div>
                        <div className="h-14 border-t border-slate-100 flex items-center justify-end px-4 gap-2 bg-white">
                            <Button variant="outline" size="sm">Share</Button>
                            <Button size="sm" className="bg-blue-600 text-white gap-2"><Download className="w-4 h-4" /> Download</Button>
                        </div>
                    </div>
                </div>

                {/* --- DRAGGING GHOST --- */}
                <div className={cn(
                    "absolute pointer-events-none z-50 flex items-center gap-3 bg-white p-3 rounded-xl shadow-2xl border border-blue-200 ring-2 ring-blue-500 transition-all duration-700 ease-in-out",
                    dragFile ? "opacity-100 scale-100" : "opacity-0 scale-50"
                )} style={{
                    left: `${cursor.x - 5}%`,
                    top: `${cursor.y - 5}%`,
                    transform: `rotate(${dragFile ? '4deg' : '0deg'})`
                }}>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Box className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-slate-800">batman_v2.stl</div>
                        <div className="text-xs text-slate-500">2.4 MB</div>
                    </div>
                </div>

            </div>
            <Cursor x={cursor.x} y={cursor.y} clicking={cursor.clicking} />
        </DemoContainer>
    )
}
