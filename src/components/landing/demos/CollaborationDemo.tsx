"use client"

import { useState, useEffect } from "react"
import { DemoContainer } from "./DemoContainer"
import { Cursor } from "./Cursor"
import {
    MessageSquare,
    Send,
    ChevronLeft,
    Download,
    Share2,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Maximize,
    Users,
    Clock,
    MoreVertical,
    FileBox,
    LayoutDashboard,
    Folder
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// --- Mock Components Replaced with Images ---

const BatmanModelMock = () => (
    <div className="w-full h-full bg-white flex items-center justify-center relative overflow-hidden">
        {/* User to place image at: /public/images/demo/batman-viewer.png */}
        <img
            src="/images/demo/batman-viewer.png"
            alt="3D Viewer Content"
            className="w-full h-full object-contain p-4"
            onError={(e) => {
                // Fallback if image isn't placed yet
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.classList.add('bg-slate-100');
            }}
        />
        {/* Fallback geometric shape if image fails (hidden by default) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
            <div className="relative w-32 h-48 opacity-20 bg-slate-500" style={{
                clipPath: 'polygon(50% 0%, 70% 20%, 80% 15%, 85% 35%, 80% 50%, 90% 90%, 80% 100%, 50% 90%, 20% 100%, 10% 90%, 20% 50%, 15% 35%, 20% 15%, 30% 20%)'
            }} />
        </div>

        <div className="absolute bottom-4 left-4 flex flex-col gap-1 w-8">
            <div className="h-0.5 w-6 bg-red-500" />
            <div className="h-6 w-0.5 bg-green-500" />
        </div>
    </div>
)

export const CollaborationDemo = () => {
    const [view, setView] = useState<'dashboard' | 'detail'>('dashboard')
    const [inputValue, setInputValue] = useState("")
    const [cursor, setCursor] = useState({ x: 95, y: 95, clicking: false })

    // Initial comments only
    const [comments, setComments] = useState<{ id: number, author: string, text: string, time: string, initials: string, color: string, isNew?: boolean }[]>([
        { id: 1, author: "Sarah Miller", text: "Is it good? Waiting for approval.", time: "2m ago", initials: "SM", color: "bg-purple-600" },
    ])

    useEffect(() => {
        const typeText = async (text: string) => {
            for (let i = 0; i <= text.length; i++) {
                setInputValue(text.slice(0, i))
                await new Promise(r => setTimeout(r, 80))
            }
        }

        const sequence = async () => {
            // --- RESET ---
            setView('dashboard')
            setInputValue("")
            setComments([{ id: 1, author: "Sarah Miller", text: "Is it good? Waiting for approval.", time: "2m ago", initials: "SM", color: "bg-purple-600" }])
            setCursor({ x: 95, y: 95, clicking: false })

            await new Promise(r => setTimeout(r, 1000))

            // --- STEP 1: DASHBOARD -> CLICK FILE ---
            // Move cursor to the first file card
            setCursor({ x: 30, y: 45, clicking: false })
            await new Promise(r => setTimeout(r, 1000))

            // Click
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))

            // Navigate
            setView('detail')
            await new Promise(r => setTimeout(r, 500)) // Wait for transition

            // --- STEP 2: READ & COMMENT ---
            // Move to input area
            setCursor({ x: 60, y: 85, clicking: false })
            await new Promise(r => setTimeout(r, 1200))

            // Click Input
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))
            setCursor(prev => ({ ...prev, clicking: false }))

            // Type "Good job"
            await new Promise(r => setTimeout(r, 300))
            await typeText("Good job")
            await new Promise(r => setTimeout(r, 500))

            // --- STEP 3: SEND ---
            // Move to send button
            setCursor({ x: 92, y: 85, clicking: false })
            await new Promise(r => setTimeout(r, 600))

            // Click Send
            setCursor(prev => ({ ...prev, clicking: true }))
            await new Promise(r => setTimeout(r, 200))

            // Add Comment - CHANGED INITIALS TO "F"
            setComments(prev => [...prev, { id: 2, author: "Me", text: "Good job", time: "Just now", initials: "F", color: "bg-pink-600", isNew: true }])
            setInputValue("")
            setCursor(prev => ({ ...prev, clicking: false }))

            // Move away
            await new Promise(r => setTimeout(r, 500))
            setCursor({ x: 80, y: 90, clicking: false })

            // --- LOOP ---
            await new Promise(r => setTimeout(r, 4000))
        }

        const interval = setInterval(() => {
            sequence()
        }, 14000)

        sequence()
        return () => clearInterval(interval)
    }, [])

    return (
        <DemoContainer className="bg-slate-50">
            {/* VIRTUAL RESOLUTION WRAPPER: Width 833px scaled to 500px (0.6) */}
            <div className="relative w-[166.6%] h-[166.6%] bg-slate-50 text-slate-900 scale-[0.6] origin-top-left font-sans shadow-inner">

                {/* --- DASHBOARD VIEW --- */}
                <div className={cn(
                    "absolute inset-0 flex transition-opacity duration-500 ease-in-out",
                    view === 'dashboard' ? "opacity-100 z-20" : "opacity-0 z-0 pointer-events-none"
                )}>
                    {/* Sidebar */}
                    <div className="w-64 bg-white border-r border-slate-200 h-full flex flex-col p-6 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
                        <div className="flex-shrink-0 flex items-center mb-10">
                            <span className="text-2xl font-bold" style={{ color: "rgb(15 23 42)" }}>
                                <span className="text-cyan-500">Viz</span>Cad
                            </span>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-base font-semibold transition-colors cursor-pointer">
                                <LayoutDashboard className="w-5 h-5" /> Dashboard
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 text-slate-500 rounded-xl text-base font-medium hover:bg-slate-50 transition-colors cursor-pointer">
                                <Folder className="w-5 h-5" /> My Files
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 text-slate-500 rounded-xl text-base font-medium hover:bg-slate-50 transition-colors cursor-pointer">
                                <Users className="w-5 h-5" /> Shared
                            </div>
                        </div>

                        <div className="mt-auto">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="text-sm font-semibold text-slate-700 mb-2">Storage</div>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                                    <div className="h-full w-[70%] bg-blue-500 rounded-full" />
                                </div>
                                <div className="text-xs text-slate-500">3.5 GB used</div>
                            </div>
                        </div>
                    </div>

                    {/* Dashboard Content */}
                    <div className="flex-1 p-8 bg-slate-50/50">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">Welcome, Ferhat</h1>
                                <p className="text-slate-500 mt-1">Updates on your projects.</p>
                            </div>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 h-10 px-6">
                                <FileBox className="w-4 h-4 mr-2" /> New Project
                            </Button>
                        </div>

                        <h2 className="text-lg font-semibold text-slate-700 mb-4">Recent Files</h2>
                        <div className="grid grid-cols-3 gap-6">
                            {/* ACTIVE FILE CARD */}
                            <div className="col-span-1 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-2xl bg-white border border-slate-200 p-0 overflow-hidden cursor-pointer group shadow-sm ring-blue-500/0 hover:ring-2 hover:ring-blue-500/50">
                                <div className="aspect-[16/10] bg-slate-100 relative flex items-center justify-center border-b border-slate-50">
                                    {/* User to place image at: /public/images/demo/batman-thumbnail.png */}
                                    <img
                                        src="/images/demo/batman-thumbnail.png"
                                        alt="Thumbnail"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.parentElement!.classList.add('bg-slate-200');
                                        }}
                                    />
                                    {/* Fallback shape */}
                                    <div className="absolute w-24 h-32 bg-slate-300 opacity-60 shadow-inner -z-10" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />
                                </div>
                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">batman_v2.stl</h3>
                                        <MoreVertical className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="text-xs text-slate-500 font-medium">2 mins ago</div>
                                </div>
                            </div>

                            {/* DUMMY CARDS */}
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
                </div>


                {/* --- DETAIL VIEW --- */}
                <div className={cn(
                    "absolute inset-0 flex flex-col bg-slate-50 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
                    view === 'detail' ? "opacity-100 translate-x-0 z-30" : "opacity-0 translate-x-20 pointer-events-none z-0"
                )}>
                    {/* Header */}
                    <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-20 relative">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all"
                                onClick={() => setView('dashboard')}
                            >
                                <ChevronLeft className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="h-8 w-px bg-slate-200" />
                            <div>
                                <h1 className="text-lg font-bold text-slate-800 leading-none">batman_v2.stl</h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                                <Avatar className="h-8 w-8 border-2 border-white ring-1 ring-slate-100"><AvatarFallback className="bg-pink-600 text-white text-xs">F</AvatarFallback></Avatar>
                                <Avatar className="h-8 w-8 border-2 border-white ring-1 ring-slate-100"><AvatarFallback className="bg-purple-600 text-white text-xs">S</AvatarFallback></Avatar>
                            </div>

                            {/* ADDED DOWNLOAD BUTTON */}
                            <Button variant="outline" className="h-9 gap-2 text-slate-600">
                                <Download className="w-4 h-4" /> Download
                            </Button>

                            <Button className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20">
                                <Share2 className="w-4 h-4" /> Share
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex gap-6 overflow-hidden">
                        {/* 3D Scene */}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex bg-white/90 backdrop-blur border border-slate-200 rounded-full shadow-lg p-1 gap-1 z-10">
                            </div>
                            <BatmanModelMock />
                        </div>

                        {/* Right Panel */}
                        <div className="w-80 flex flex-col gap-6 shrink-0">
                            {/* Stats Card */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    <FileBox className="w-4 h-4 text-blue-500" /> Details
                                </h3>

                                <div className="grid grid-cols-2 gap-y-3 text-sm">
                                    <span className="text-slate-500">File Size</span>
                                    <span className="text-right font-medium text-slate-900">2.4 MB</span>
                                    <span className="text-slate-500">Owner</span>
                                    <div className="flex justify-end items-center gap-1.5">
                                        <div className="flex justify-end items-center gap-1.5"><Avatar className="h-5 w-5"><AvatarFallback className="bg-pink-600 text-[9px] text-white">F</AvatarFallback></Avatar> Ferhat</div>
                                    </div>
                                </div>
                            </div>

                            {/* Comments Card - Fills remaining height */}
                            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-0">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-blue-500" /> Comments
                                    </div>
                                </div>

                                <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-white/50">
                                    {comments.map((comment) => (
                                        <div key={comment.id} className={cn(
                                            "flex gap-3 group animate-in slide-in-from-bottom-2 duration-500",
                                        )}>
                                            <Avatar className="w-8 h-8 border border-white shadow-sm shrink-0">
                                                <AvatarFallback className={cn("text-[10px] text-white font-bold", comment.color)}>{comment.initials}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-xs font-bold text-slate-700">{comment.author}</span>
                                                    <span className="text-[10px] text-slate-400 font-medium">{comment.time}</span>
                                                </div>
                                                <div className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded-r-xl rounded-bl-xl leading-relaxed">
                                                    {comment.text}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Input Area */}
                                <div className="p-3 bg-white border-t border-slate-100">
                                    <div className="relative flex items-center">
                                        <input
                                            value={inputValue}
                                            readOnly
                                            placeholder="Write a comment..."
                                            className="w-full bg-slate-50 border-0 rounded-xl px-4 py-3 pr-10 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                                        />
                                        <div className="absolute right-2">
                                            <Button size="icon" className="h-8 w-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95">
                                                <Send className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <Cursor x={cursor.x} y={cursor.y} clicking={cursor.clicking} />
        </DemoContainer>
    )
}
