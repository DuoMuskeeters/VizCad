"use client"

import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ArrowRight, Play, Sparkles, FileBox } from "lucide-react"
import { HeroVtkViewer } from "./HeroVtkViewer"
import { Badge } from "@/components/ui/badge"

const SUPPORTED_FORMATS = ['STL', 'OBJ', 'STEP', 'IGES', 'PLY']

export const Hero = () => {
    const { t } = useTranslation()

    return (
        <section className="w-full relative overflow-hidden">

            {/* Main Content */}
            <div className="w-full max-w-[1400px] mx-auto px-8 md:px-12 lg:px-20 flex flex-col md:grid md:grid-cols-2 place-items-center py-24 md:py-28 gap-10">
                <div className="text-center md:text-start space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 order-2 md:order-1">

                    {/* Main Title */}
                    <main className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
                        <h1>
                            <span className="bg-gradient-to-r from-primary via-primary/80 to-accent text bg-clip-text">
                                {t("landing_hero_title_1")}
                            </span>
                        </h1>
                    </main>

                    {/* Description */}
                    <p className="text-xl text-muted-foreground md:w-11/12 mx-auto lg:mx-0 leading-relaxed font-light">
                        {t("landing_hero_desc")}
                    </p>

                    {/* Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-4">
                        <Button asChild size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 rounded-full transition-all hover:scale-105 active:scale-95">
                            <Link to="/dashboard" className="flex items-center gap-2">
                                {t("landing_hero_cta_primary")}
                                <ArrowRight className="w-5 h-5 ml-1" />
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* 3D VTK Viewer */}
                <div className="w-full relative group order-1 md:order-2">
                    {/* Decorative Blobs */}
                    <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl -z-10 animate-pulse" />
                    <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-accent/20 rounded-full blur-3xl -z-10 animate-pulse delay-700" />

                    <div className="bg-white/40 backdrop-blur-sm border border-white/50 rounded-3xl p-1 shadow-2xl shadow-blue-900/5 ring-1 ring-white/50">
                        <div className="w-full h-[25vh] min-h-[250px] md:h-[450px] lg:h-[500px] rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50 to-white relative">
                            <HeroVtkViewer
                                modelUrl="/Robotic-Arm.stl"
                                className="w-full h-full mix-blend-multiply"
                            />
                            {/* Viewer Overlay UI Mock */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur border border-slate-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-4 text-slate-500 scale-90 md:scale-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" /></div>
                                <span className="text-xs font-mono">Robotic_Arm_Final_v2.stl</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
