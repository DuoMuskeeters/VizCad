"use client"

import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export const Cta = () => {
    const { t } = useTranslation()

    return (
        <section id="cta" className="bg-gradient-to-br from-primary/10 via-background to-primary/5 py-24 sm:py-32">
            <div className="w-full max-w-[1400px] mx-auto px-6 text-center space-y-8">
                <h2 className="text-3xl md:text-5xl font-bold max-w-4xl mx-auto leading-tight">
                    {t("landing_cta_title")}
                </h2>

                <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                    {t("landing_cta_desc")}
                </p>

                <div className="pt-4">
                    <Button asChild size="lg" className="text-lg px-8 py-6">
                        <Link to="/dashboard" className="flex items-center gap-2">
                            {t("landing_cta_button")}
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    )
}
