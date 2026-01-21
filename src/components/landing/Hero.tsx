"use client"

import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ArrowRight, Play } from "lucide-react"
import { HeroVtkViewer } from "./HeroVtkViewer"

export const Hero = () => {
    const { t } = useTranslation()

    return (
        <section className="w-full max-w-[1400px] mx-auto px-6 grid lg:grid-cols-2 place-items-center py-20 md:py-32 gap-10">
            <div className="text-center lg:text-start space-y-6">
                {/* Main Title */}
                <main className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                    <h1>
                        <span className="bg-gradient-to-r from-primary to-primary/60 text-transparent bg-clip-text">
                            {t("landing_hero_title_1")}
                        </span>
                    </h1>
                    <h2 className="text-foreground mt-2">
                        {t("landing_hero_title_2")}
                    </h2>
                </main>

                {/* Description */}
                <p className="text-lg text-muted-foreground md:w-11/12 mx-auto lg:mx-0 leading-relaxed">
                    {t("landing_hero_desc")}
                </p>

                {/* Buttons */}
                <div className="space-y-4 md:space-y-0 md:space-x-4 pt-4">
                    <Button asChild size="lg" className="w-full md:w-auto">
                        <Link to="/app" className="flex items-center gap-2">
                            {t("landing_hero_cta_primary")}
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </Button>

                    <Button
                        variant="outline"
                        size="lg"
                        asChild
                        className="w-full md:w-auto"
                    >
                        <Link to="/app" className="flex items-center gap-2">
                            <Play className="w-5 h-5" />
                            {t("landing_hero_cta_secondary")}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* 3D VTK Viewer */}
            <div className="w-full max-w-[600px] h-[600px] lg:h-[600px]">
                <HeroVtkViewer
                    modelUrl="/Robotic-Arm.stl"
                    className="w-full h-full"
                />
            </div>

            {/* Shadow effect */}
            <div className="shadow"></div>
        </section>
    )
}
