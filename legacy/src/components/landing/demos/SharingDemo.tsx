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
    Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// --- Mock Components ---
const BatmanModelMock = () => (
    <div className="w-full h-full bg-white flex items-center justify-center relative overflow-hidden animate-in fade-in zoom-in duration-700">
        <img
            src="/images/demo/batman-viewer.png"
            alt="3D Viewer Content"
            className="w-full h-full object-contain p-4"
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

export const SharingDemo = () => {
    // Top-level mode: 'studio' (Scenario 1) or 'dashboard' (Scenario 2)
    const [scenario, setScenario] = useState<'studio' | 'dashboard'>('studio')

    // Inner states
    const [studioView, setStudioView] = useState<'empty' | 'loading' | 'viewer'>('empty')
    const [dashView, setDashView] = useState<'list' | 'detail'>('list')

    // Shared UI states
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isCopied, setIsCopied] = useState(false)
    const [dragFile, setDragFile] = useState(false)
    const [dragOverSidebar, setDragOverSidebar] = useState(false) // New state for drop zone hover
    const [cursor, setCursor] = useState({ x: 105, y: 80, clicking: false })

    const getElementPos = (id: string, defaultPos: { x: number, y: number }) => {
        const el = document.getElementById(id)
        const container = document.getElementById("demo-sharing-container")

        if (!el || !container) return { ...defaultPos, clicking: false }

        const elRect = el.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()

        const x = ((elRect.left + elRect.width / 2 - containerRect.left) / containerRect.width) * 100
        const y = ((elRect.top + elRect.height / 2 - containerRect.top) / containerRect.height) * 100

        return { x, y, clicking: false }
    }

    // Static scenes for sidebar - PLAIN WHITE ACTIVE
    const studioScenes = [
        { id: "plain-white", name: "Plain White", preview: "bg-gradient-to-br from-gray-50 to-white", active: true },
        { id: "3point-faded", name: "3 Point Faded", preview: "bg-gradient-to-br from-gray-200 via-gray-100 to-white" },
        { id: "simple-office", name: "Simple Office", preview: "bg-gradient-to-br from-blue-100 via-gray-100 to-white" },
        { id: "warm-studio", name: "Warm Studio", preview: "bg-gradient-to-br from-orange-100 via-yellow-100 to-white" },
    ]

    // Static comments for dashboard view
    const comments = [
        { id: 1, author: "Sarah Miller", text: "Is it good? Waiting for approval.", time: "2m ago", initials: "SM", color: "bg-purple-600" },
        { id: 2, author: "Me", text: "Good job", time: "Just now", initials: "F", color: "bg-pink-600" }
    ]

    useEffect(() => {
        const runSequence = async () => {
            // ==========================================
            // SEQUENCE 1: STUDIO (Upload to Sidebar -> Share)
            // ==========================================

            // --- RESET TO STUDIO ---
            setScenario('studio')
            setStudioView('empty')
            setIsModalOpen(false)
            setIsCopied(false)
            setDragFile(false)
            setDragOverSidebar(false)
            setCursor({ x: 110, y: 80, clicking: false }) // Out of frame

            await new Promise(r => setTimeout(r, 1000))

            // 1. DRAG FILE (Simulated)
            // Move to pick up
            setCursor({ x: 80, y: 95, clicking: false })
            await new Promise(r => setTimeout(r, 800))

            // Grab
            setCursor(prev => ({ ...prev, clicking: true }))
            setDragFile(true)
            await new Promise(r => setTimeout(r, 300))

            // Drag to Sidebar Drop Zone (Left side)
            setCursor(getElementPos("demo-sharing-dropzone", { x: 12, y: 25 }))
            await new Promise(r => setTimeout(r, 800))
            setDragOverSidebar(true) // Visual feedback
            await new Promise(r => setTimeout(r, 300))

            // Drop
            setCursor(prev => ({ ...prev, clicking: false }))
            setDragFile(false)
            setDragOverSidebar(false)
            await new Promise(r => setTimeout(r, 200))

            // 2. LOADING -> VIEWER
            setStudioView('loading')
            await new Promise(r => setTimeout(r, 1200))
            setStudioView('viewer')
            await new Promise(r => setTimeout(r, 1200))

            // 3. SHARE & COPY
            // Click Share (Top Right in App Toolbar)
            setCursor(getElementPos("demo-sharing-button-studio", { x: 92, y: 5 }))
            await new Promise(r => setTimeout(r, 1000))
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))

            setIsModalOpen(true)
            await new Promise(r => setTimeout(r, 600))

            // Click Copy
            setCursor(getElementPos("demo-sharing-copy", { x: 74, y: 55 }))
            await new Promise(r => setTimeout(r, 1000))
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setIsCopied(true)
            setCursor(prev => ({ ...prev, clicking: false }))

            await new Promise(r => setTimeout(r, 1500))


            // ==========================================
            // TRANSITION TO DASHBOARD
            // ==========================================
            setScenario('dashboard')
            setDashView('list')
            setIsModalOpen(false)
            setIsCopied(false)

            // Move cursor out briefly during transition
            setCursor({ x: 110, y: 50, clicking: false })
            await new Promise(r => setTimeout(r, 1000))

            // ==========================================
            // SEQUENCE 2: DASHBOARD (List -> Detail -> Share)
            // ==========================================

            // 1. SELECT FILE
            setCursor(getElementPos("demo-sharing-file", { x: 45, y: 55 }))
            await new Promise(r => setTimeout(r, 1000))

            // Click
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))

            // Navigate
            setDashView('detail')
            await new Promise(r => setTimeout(r, 1000))

            // 2. SHARE & COPY (Again, but in Dashboard context)
            setCursor(getElementPos("demo-sharing-button-dash", { x: 90, y: 8 }))
            await new Promise(r => setTimeout(r, 1000))
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))

            setIsModalOpen(true)
            await new Promise(r => setTimeout(r, 600))

            // Click Copy
            setCursor(getElementPos("demo-sharing-copy", { x: 74, y: 55 }))
            await new Promise(r => setTimeout(r, 1000))
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setIsCopied(true)
            setCursor(prev => ({ ...prev, clicking: false }))

            await new Promise(r => setTimeout(r, 2000))
        }

        const interval = setInterval(() => {
            runSequence()
        }, 22000)

        runSequence()
        return () => clearInterval(interval)
    }, [])

    return (
        <DemoContainer id="demo-sharing-container" className="bg-slate-50 relative">
            {/* FLUID LAYOUT: Scale 0.6 */}
            <div className="relative w-[166.6%] h-[166.6%] bg-slate-50 text-slate-900 scale-[0.6] origin-top-left font-sans shadow-inner selection:bg-blue-100">

                {/* 
                    SCENARIO 1: ACTUAL APP/STUDIO SIMULATION
                */}
                <div className={cn(
                    "absolute inset-0 flex flex-col bg-slate-50 transition-opacity duration-700",
                    scenario === 'studio' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                )}>
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
                            {studioView === 'viewer' && (
                                <Button id="demo-sharing-button-studio" variant="outline" size="sm" className="h-8 text-xs gap-2 px-3 animate-in fade-in">
                                    <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Share</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden relative">
                        {/* Sidebar - Detailed Scene Tab */}
                        {/* Sidebar - Detailed Scene Tab - Fluid 25% */}
                        <div className="w-[25%] bg-white border-r border-slate-200 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
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

                            {/* Sidebar Content (Detailed) */}
                            <div className="p-4 space-y-6 overflow-y-auto">
                                {/* Upload Area (Drop Target) */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-2">Upload Model</h3>
                                    <div id="demo-sharing-dropzone" className={cn(
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
                                            <div key={scene.id} className={cn(
                                                "relative cursor-pointer rounded-lg border-2 overflow-hidden transition-all hover:border-blue-200",
                                                scene.active ? "border-blue-500 ring-2 ring-blue-500/10" : "border-slate-100"
                                            )}>
                                                <div className={cn("h-16 w-full", scene.preview)} />
                                                <div className="p-1.5 bg-white">
                                                    <div className="text-[10px] font-bold text-slate-700 truncate">{scene.name}</div>
                                                </div>
                                                {scene.active && (
                                                    <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Background Color (ADDED per user loss) */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 mb-3">Custom Background</h3>
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

                                {/* Floating Controls */}
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
                                            <div className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><RotateCcw className="w-3.5 h-3.5 text-slate-600" /></div>
                                        </div>
                                    </div>
                                )}

                                {/* Empty State (English) */}
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

                                {/* Viewer Content */}
                                <div className={cn(
                                    "flex-1 relative transition-opacity duration-700 h-full",
                                    studioView === 'viewer' ? "opacity-100" : "opacity-0"
                                )}>
                                    <BatmanModelMock />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer (English) */}
                    <div className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[10px] text-slate-500 shrink-0 z-20">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Ready</span>
                            {studioView === 'viewer' && <><span>•</span> <span>Model: batman_v2.stl</span></>}
                        </div>
                        <div className="flex items-center gap-4">
                            <span>1920x1080</span>
                            <span>•</span>
                            <span>High Quality</span>
                            <Info className="w-3 h-3 hover:text-slate-800 cursor-pointer" />
                        </div>
                    </div>
                </div>

                {/* 
                    SCENARIO 2: DASHBOARD VIEW 
                    (Only visible when scenario === 'dashboard')
                */}
                <div className={cn(
                    "absolute inset-0 flex transition-opacity duration-700",
                    scenario === 'dashboard' ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                )}>
                    {/* Dashboard Sidebar */}
                    <div className="w-[30%] bg-white border-r border-slate-200 h-full flex flex-col p-[5%] shadow-sm z-10">
                        <div className="flex-shrink-0 flex items-center mb-[15%]">
                            <span className="text-2xl font-bold" style={{ color: "rgb(15 23 42)" }}>
                                <span className="text-cyan-500">Viz</span>Cad
                            </span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-3 px-[8%] py-[6%] bg-blue-50 text-blue-700 rounded-xl text-base font-semibold">
                                <LayoutDashboard className="w-5 h-5 flex-shrink-0" /> <span className="truncate">Dashboard</span>
                            </div>
                            <div className="flex items-center gap-3 px-[8%] py-[6%] text-slate-500 rounded-xl text-base font-medium">
                                <Folder className="w-5 h-5 flex-shrink-0" /> <span className="truncate">My Files</span>
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 text-slate-500 rounded-xl text-base font-medium hover:bg-slate-50 transition-colors cursor-pointer">
                                <Users className="w-5 h-5" /> Shared
                            </div>
                        </div>
                        <div className="mt-auto">
                            <div className="p-[8%] rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-sm font-semibold text-slate-700 mb-2">Storage</div>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                                    <div className="h-full w-[70%] bg-blue-500 rounded-full" />
                                </div>
                                <div className="text-xs text-slate-500">3.5 GB used</div>
                            </div>
                        </div>
                    </div>

                    {/* Dashboard Content */}
                    <div className="flex-1 p-[5%] bg-slate-50/50 flex flex-col">
                        {/* Header */}
                        <div className={cn(
                            "flex justify-between items-center mb-[5%] shrink-0 transition-opacity duration-300",
                            dashView === 'list' ? "opacity-100" : "opacity-0 h-0 overflow-hidden mb-0"
                        )}>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">Welcome, Ferhat</h1>
                                <p className="text-slate-500 mt-1">Updates on your projects.</p>
                            </div>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 h-10 px-6 shrink-0">
                                <FileBox className="w-4 h-4 mr-2" /> New Project
                            </Button>
                        </div>

                        {/* List View */}
                        <div className={cn(
                            "transition-all duration-500",
                            dashView === 'list' ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10 absolute pointer-events-none"
                        )}>
                            <h2 className="text-lg font-semibold text-slate-700 mb-[2%] shrink-0">Recent Files</h2>
                            <div className="grid grid-cols-3 gap-[3%]">
                                <div id="demo-sharing-file" className="col-span-1 rounded-2xl bg-white border border-slate-200 p-0 overflow-hidden shadow-sm">
                                    <div className="aspect-[16/10] bg-slate-100 relative flex items-center justify-center border-b border-slate-50">
                                        <img src="/images/demo/batman-thumbnail.png" alt="Thumbnail" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-semibold text-slate-900 truncate">batman_v2.stl</h3>
                                        <div className="text-xs text-slate-500 font-medium">2 mins ago</div>
                                    </div>
                                </div>
                                {[1, 2].map(i => (
                                    <div key={i} className="col-span-1 rounded-2xl bg-white border border-slate-200 p-0 overflow-hidden opacity-60">
                                        <div className="aspect-[16/10] bg-slate-50" />
                                        <div className="p-4 space-y-2">
                                            <div className="h-4 w-3/4 bg-slate-100 rounded" />
                                            <div className="h-3 w-1/2 bg-slate-100 rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Detail View Wrapper (Overlay) */}
                        <div className={cn(
                            "absolute inset-0 flex flex-col bg-slate-50 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] z-20",
                            dashView === 'detail' ? "opacity-100 translate-x-0" : "opacity-0 translate-x-20 pointer-events-none"
                        )}>
                            {/* Detail Header */}
                            <div className="h-[10%] bg-white border-b border-slate-200 px-[4%] flex items-center justify-between shrink-0 shadow-sm z-20 relative">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center cursor-pointer">
                                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                                    </div>
                                    <div className="h-8 w-px bg-slate-200" />
                                    <h1 className="text-lg font-bold text-slate-800 leading-none">batman_v2.stl</h1>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button id="demo-sharing-button-dash" className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20">
                                        <Share2 className="w-4 h-4" /> <span className="hidden md:inline">Share</span>
                                    </Button>
                                </div>
                            </div>

                            {/* Detail Content */}
                            <div className="flex-1 p-[4%] flex gap-[4%] overflow-hidden">
                                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                                    <BatmanModelMock />
                                </div>
                                <div className="w-[35%] flex flex-col gap-[4%] shrink-0">
                                    <div className="bg-white p-[6%] rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">Details</h3>
                                        <div className="grid grid-cols-2 gap-y-3 text-sm">
                                            <span className="text-slate-500">Size</span> <span className="text-right">2.4 MB</span>
                                            <span className="text-slate-500">Owner</span>
                                            <div className="flex justify-end items-center gap-1.5"><Avatar className="h-5 w-5"><AvatarFallback className="bg-pink-600 text-[9px] text-white">F</AvatarFallback></Avatar> Ferhat</div>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
                                        <div className="p-[6%] border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                            <div className="font-semibold text-slate-800 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-500" /> Comments</div>
                                        </div>
                                        <div className="flex-1 p-[6%] overflow-y-auto space-y-4 bg-white/50">
                                            {comments.map(c => (
                                                <div key={c.id} className="flex gap-3">
                                                    <Avatar className="w-8 h-8 rounded-full"><AvatarFallback className={cn("text-[10px] text-white", c.color)}>{c.initials}</AvatarFallback></Avatar>
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex justify-between"><span className="text-xs font-bold text-slate-700">{c.author}</span><span className="text-[10px] text-slate-400">{c.time}</span></div>
                                                        <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-r-xl rounded-bl-xl">{c.text}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-[4%] bg-white border-t border-slate-100"><div className="relative"><input readOnly placeholder="Write..." className="w-full bg-slate-50 rounded-xl px-4 py-2 text-sm" /></div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- SHARE MODAL (Shared across scenarios) --- */}
                <div className={cn(
                    "absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 transition-all duration-300",
                    isModalOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                )}>
                    <div className={cn(
                        "bg-white w-[50%] max-w-[400px] rounded-2xl shadow-2xl border border-slate-200 p-[5%] transform transition-all duration-500",
                        isModalOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
                    )}>
                        <h3 className="text-lg font-bold text-slate-900 mb-[4%] flex items-center gap-2">
                            <Share2 className="w-5 h-5 text-blue-600" /> Share Project
                        </h3>
                        <p className="text-sm text-slate-500 mb-[6%]">Anyone with this link can view this file.</p>

                        <div className="flex gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 font-mono truncate">
                                https://vizcad.app/s/batman_v2
                            </div>
                            <Button id="demo-sharing-copy" size="icon" className={cn("shrink-0 transition-colors", isCopied ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700")}>
                                {isCopied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* --- DRAGGING GHOST (Scenario 1) --- */}
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
