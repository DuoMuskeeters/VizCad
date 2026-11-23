"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Smartphone, Share2, Zap, Cloud } from "lucide-react"
import type { ReactNode } from "react"

interface FeatureProps {
    icon: ReactNode
    titleKey: string
    descKey: string
}

const features: FeatureProps[] = [
    {
        icon: <Smartphone className="w-10 h-10 text-primary" />,
        titleKey: "landing_features_1_title",
        descKey: "landing_features_1_desc",
    },
    {
        icon: <Share2 className="w-10 h-10 text-primary" />,
        titleKey: "landing_features_2_title",
        descKey: "landing_features_2_desc",
    },
    {
        icon: <Zap className="w-10 h-10 text-primary" />,
        titleKey: "landing_features_3_title",
        descKey: "landing_features_3_desc",
    },
    {
        icon: <Cloud className="w-10 h-10 text-primary" />,
        titleKey: "landing_features_4_title",
        descKey: "landing_features_4_desc",
    },
]

export const Features = () => {
    const { t } = useTranslation()

    return (
        <section id="features" className="w-full max-w-[1400px] mx-auto px-6 py-24 sm:py-32">
            <div className="text-center mb-16">
                <h2 className="text-3xl lg:text-4xl font-bold mb-4">
                    {t("landing_features_title")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                    {t("landing_features_subtitle")}
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {features.map(({ icon, titleKey, descKey }) => (
                    <Card key={titleKey} className="group hover:border-primary/50 transition-all hover:shadow-lg">
                        <CardHeader>
                            <div className="flex items-start gap-4">
                                <div className="bg-primary/10 w-16 h-16 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                    {icon}
                                </div>
                                <div>
                                    <CardTitle className="text-xl mb-2">{t(titleKey)}</CardTitle>
                                    <p className="text-muted-foreground leading-relaxed">
                                        {t(descKey)}
                                    </p>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </section>
    )
}
