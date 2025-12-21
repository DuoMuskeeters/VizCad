"use client"

import { detectLanguage } from "@/utils/language"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import {
    ArrowRight,
    Play,
    ChevronRight,
    Layers,
    Sparkles,
    Globe,
    BarChart3,
    Zap,
} from "lucide-react"

export const Route = createFileRoute("/b2b")({
    head: () => {
        const lang = detectLanguage()

        return {
            title: lang === "tr"
                ? "VizCad for Business - E-Ticaret 3D Görselleştirme"
                : "VizCad for Business - E-Commerce 3D Visualization",
            meta: [
                {
                    name: "description",
                    content: lang === "tr"
                        ? "E-ticaret sitenize 3D ürün görselleştirme ekleyin. Dönüşüm oranlarını %40 artırın."
                        : "Add 3D product visualization to your e-commerce. Increase conversion rates by 40%.",
                },
            ],
        }
    },
    component: B2BPage,
})

// Animated counter hook
function useAnimatedCounter(end: number, duration: number = 2000, suffix: string = "") {
    const [count, setCount] = useState(0)

    useEffect(() => {
        let startTime: number
        let animationFrame: number

        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime
            const progress = Math.min((currentTime - startTime) / duration, 1)
            setCount(Math.floor(progress * end))

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate)
            }
        }

        animationFrame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(animationFrame)
    }, [end, duration])

    return count + suffix
}

export function B2BPage() {
    const { i18n } = useTranslation()
    const isTR = i18n.language === "tr"
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        setIsLoaded(true)
    }, [])

    const conversionRate = useAnimatedCounter(40, 2500, "%")
    const returnReduction = useAnimatedCounter(35, 2500, "%")
    const engagementIncrease = useAnimatedCounter(3, 2500, "x")

    const content = {
        hero: {
            eyebrow: isTR ? "E-TİCARET İÇİN TASARLANDI" : "BUILT FOR E-COMMERCE",
            title: isTR ? "Ürünlerinizi Dijitalde Hayata Getirin" : "Bring Products to Life Online",
            subtitle: isTR
                ? "Müşterileriniz ürünleri satın almadan önce 360° keşfetsin. Tek satır kodla sitenize entegre edin."
                : "Let customers explore products in 360° before buying. Integrate with a single line of code.",
            cta1: isTR ? "Demo Talep Et" : "Request Demo",
            cta2: isTR ? "Nasıl Çalışır?" : "How It Works",
        },
        stats: {
            conversion: { label: isTR ? "Dönüşüm Artışı" : "Higher Conversion" },
            returns: { label: isTR ? "Daha Az İade" : "Fewer Returns" },
            engagement: { label: isTR ? "Daha Uzun Süre" : "Longer Sessions" },
        },
        trusted: isTR ? "Güvenilen Markalar" : "Trusted by Leading Brands",
        features: {
            title: isTR ? "Neden VizCad?" : "Why VizCad?",
            items: [
                {
                    icon: Layers,
                    title: isTR ? "Tek Satır Entegrasyon" : "One-Line Integration",
                    desc: isTR ? "Shopify, WooCommerce ve tüm platformlara" : "Works with Shopify, WooCommerce & more",
                },
                {
                    icon: Zap,
                    title: isTR ? "Anında Yükleme" : "Instant Loading",
                    desc: isTR ? "Optimize edilmiş WebGL, her cihazda" : "Optimized WebGL, works on any device",
                },
                {
                    icon: Globe,
                    title: isTR ? "Küresel CDN" : "Global CDN",
                    desc: isTR ? "Dünya çapında hızlı teslimat" : "Fast delivery worldwide",
                },
                {
                    icon: BarChart3,
                    title: isTR ? "Etkileşim Analitiği" : "Engagement Analytics",
                    desc: isTR ? "Hangi ürünler daha çok ilgi görüyor?" : "See which products get more attention",
                },
            ],
        },
        industries: {
            title: isTR ? "Her Sektör İçin" : "For Every Industry",
            items: [
                { emoji: "🛋️", name: isTR ? "Mobilya" : "Furniture", gradient: "from-amber-500 to-orange-600" },
                { emoji: "💎", name: isTR ? "Takı" : "Jewelry", gradient: "from-purple-500 to-pink-600" },
                { emoji: "👟", name: isTR ? "Moda" : "Fashion", gradient: "from-blue-500 to-cyan-600" },
                { emoji: "🔧", name: isTR ? "Endüstriyel" : "Industrial", gradient: "from-slate-500 to-zinc-600" },
            ],
        },
        cta: {
            title: isTR ? "Satışlarınızı Bugün Artırın" : "Boost Your Sales Today",
            subtitle: isTR ? "Ücretsiz demo ile başlayın" : "Start with a free demo",
            button: isTR ? "Ücretsiz Demo Al" : "Get Free Demo",
        },
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white overflow-hidden">
            {/* Hero Section */}
            <section className="relative min-h-screen flex items-center justify-center pt-20">
                {/* Animated gradient background - Light theme */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-violet-200/60 to-fuchsia-200/60 rounded-full blur-[120px] animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-r from-cyan-200/50 to-blue-200/50 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }}></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-primary/5 to-transparent rounded-full blur-[150px]"></div>
                </div>

                {/* Grid pattern overlay - Subtle */}
                <div
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
                        backgroundSize: "80px 80px",
                    }}
                ></div>

                <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
                    {/* Eyebrow */}
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 border border-violet-200 mb-8 transition-all duration-700 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                        <Sparkles className="w-4 h-4 text-violet-600" />
                        <span className="text-sm font-semibold text-violet-700 tracking-widest">{content.hero.eyebrow}</span>
                    </div>

                    {/* Main headline */}
                    <h1 className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 transition-all duration-700 delay-100 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                        <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-transparent">
                            {content.hero.title}
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className={`text-lg sm:text-xl md:text-2xl text-slate-600 max-w-2xl mx-auto mb-12 leading-relaxed transition-all duration-700 delay-200 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                        {content.hero.subtitle}
                    </p>

                    {/* CTA Buttons */}
                    <div className={`flex flex-col sm:flex-row gap-4 justify-center mb-20 transition-all duration-700 delay-300 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                        <Button
                            asChild
                            size="lg"
                            className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white px-8 py-6 text-lg font-semibold rounded-full shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 transition-all group"
                        >
                            <Link to="/contact" className="flex items-center gap-2">
                                {content.hero.cta1}
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="lg"
                            className="text-slate-700 hover:text-slate-900 hover:bg-slate-100 px-8 py-6 text-lg font-medium rounded-full border border-slate-200 transition-all group"
                        >
                            <Play className="w-5 h-5 mr-2" />
                            {content.hero.cta2}
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className={`grid grid-cols-3 gap-8 max-w-xl mx-auto transition-all duration-700 delay-400 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                        <div className="text-center p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 shadow-lg shadow-slate-200/50">
                            <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-emerald-500 to-green-600 bg-clip-text text-transparent">
                                +{conversionRate}
                            </div>
                            <div className="text-sm text-slate-500 mt-2 font-medium">{content.stats.conversion.label}</div>
                        </div>
                        <div className="text-center p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 shadow-lg shadow-slate-200/50">
                            <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent">
                                -{returnReduction}
                            </div>
                            <div className="text-sm text-slate-500 mt-2 font-medium">{content.stats.returns.label}</div>
                        </div>
                        <div className="text-center p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-100 shadow-lg shadow-slate-200/50">
                            <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
                                {engagementIncrease}
                            </div>
                            <div className="text-sm text-slate-500 mt-2 font-medium">{content.stats.engagement.label}</div>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-400">
                    <div className="w-6 h-10 rounded-full border-2 border-slate-300 flex items-start justify-center p-2">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    </div>
                </div>
            </section>

            {/* Trusted By Section */}
            <section className="py-16 bg-white border-t border-slate-100">
                <div className="max-w-6xl mx-auto px-6">
                    <p className="text-center text-sm text-slate-400 tracking-widest uppercase mb-8 font-medium">{content.trusted}</p>
                    <div className="flex flex-wrap justify-center items-center gap-12">
                        {["IKEA", "Wayfair", "Etsy", "Amazon", "Shopify"].map((brand) => (
                            <div key={brand} className="text-2xl font-bold text-slate-300 hover:text-slate-500 transition-colors">{brand}</div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-32 relative bg-gradient-to-b from-white to-slate-50">
                <div className="max-w-6xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-6">{content.features.title}</h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {content.features.items.map((feature, index) => (
                            <div
                                key={index}
                                className="group p-8 rounded-3xl bg-white border border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-violet-200/30 hover:border-violet-200 transition-all duration-500"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <feature.icon className="w-7 h-7 text-violet-600" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-900 mb-3">{feature.title}</h3>
                                <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Code Demo Section */}
            <section className="py-24 bg-slate-50">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
                            {isTR ? "3 Dakikada Entegre Edin" : "Integrate in 3 Minutes"}
                        </h2>
                        <p className="text-slate-500 text-lg">
                            {isTR ? "Tek satır kod, sonsuz olasılık" : "One line of code, endless possibilities"}
                        </p>
                    </div>

                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-2xl">
                        <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            </div>
                            <span className="text-sm text-slate-400 ml-3">index.html</span>
                        </div>
                        <pre className="p-6 overflow-x-auto">
                            <code className="text-sm sm:text-base">
                                <span className="text-slate-500">{"<!-- VizCad 3D Viewer -->"}</span>{"\n"}
                                <span className="text-pink-400">{"<div "}</span>
                                <span className="text-violet-400">id</span>
                                <span className="text-slate-400">=</span>
                                <span className="text-green-400">"vizcad"</span>
                                <span className="text-pink-400">{" />"}</span>{"\n"}
                                <span className="text-pink-400">{"<script "}</span>
                                <span className="text-violet-400">src</span>
                                <span className="text-slate-400">=</span>
                                <span className="text-green-400">"https://cdn.vizcad.com/v1.js"</span>
                                <span className="text-pink-400">{" />"}</span>
                            </code>
                        </pre>
                    </div>
                </div>
            </section>

            {/* Industries Section */}
            <section className="py-24 bg-white">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">{content.industries.title}</h2>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {content.industries.items.map((industry, index) => (
                            <div
                                key={index}
                                className={`group p-8 rounded-2xl bg-gradient-to-br ${industry.gradient} text-center transition-all duration-300 hover:scale-105 cursor-pointer shadow-lg`}
                            >
                                <div className="text-5xl mb-4 filter drop-shadow-lg">{industry.emoji}</div>
                                <div className="text-lg font-semibold text-white">{industry.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 relative bg-gradient-to-br from-violet-600 via-fuchsia-600 to-purple-700">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]"></div>

                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6">{content.cta.title}</h2>
                    <p className="text-xl text-white/80 mb-10">{content.cta.subtitle}</p>

                    <Button
                        asChild
                        size="lg"
                        className="bg-white text-violet-700 hover:bg-slate-100 px-10 py-7 text-xl font-semibold rounded-full shadow-2xl hover:shadow-white/20 transition-all group"
                    >
                        <Link to="/contact" className="flex items-center gap-3">
                            {content.cta.button}
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    )
}
