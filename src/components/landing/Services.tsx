"use client"

import { useTranslation } from "react-i18next"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Globe, Users } from "lucide-react"

export const Services = () => {
    const { t } = useTranslation()

    return (
        <section id="services" className="w-full max-w-[1400px] mx-auto px-6 py-24 sm:py-32">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                    {t("landing_services_title")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                    {t("landing_services_subtitle")}
                </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
                {/* Left side - Cards stacked vertically */}
                <div className="space-y-6">
                    {/* Public Sharing Card */}
                    <Card className="group hover:border-primary/50 transition-all hover:shadow-xl p-6">
                        <CardHeader className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="bg-primary/10 p-4 rounded-xl group-hover:bg-primary/20 transition-colors">
                                    <Globe className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl">{t("landing_services_1_title")}</CardTitle>
                                    <CardDescription className="text-base">{t("landing_services_1_badge")}</CardDescription>
                                </div>
                            </div>
                            <p className="text-muted-foreground text-lg leading-relaxed">
                                {t("landing_services_1_desc")}
                            </p>
                        </CardHeader>
                    </Card>

                    {/* Smart Collaboration Card */}
                    <Card className="group hover:border-primary/50 transition-all hover:shadow-xl p-6">
                        <CardHeader className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="bg-primary/10 p-4 rounded-xl group-hover:bg-primary/20 transition-colors">
                                    <Users className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-2xl">{t("landing_services_2_title")}</CardTitle>
                                    <CardDescription className="text-base">{t("landing_services_2_badge")}</CardDescription>
                                </div>
                            </div>
                            <p className="text-muted-foreground text-lg leading-relaxed">
                                {t("landing_services_2_desc")}
                            </p>
                        </CardHeader>
                    </Card>
                </div>

                {/* Right side - Image placeholder */}
                <div className="relative">
                    <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-dashed border-primary/20 flex items-center justify-center overflow-hidden">
                        {/* Placeholder for future image */}
                        <div className="text-center p-8">
                            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                                <svg className="w-12 h-12 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-muted-foreground text-sm">
                                {t("landing_services_image_placeholder") || "Görsel alanı"}
                            </p>
                        </div>
                    </div>
                    {/* Decorative elements */}
                    <div className="absolute -z-10 -top-4 -right-4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
                    <div className="absolute -z-10 -bottom-4 -left-4 w-48 h-48 bg-primary/10 rounded-full blur-2xl" />
                </div>
            </div>
        </section>
    )
}
