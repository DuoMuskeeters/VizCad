"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, Lock, Globe } from "lucide-react"
import type { ReactNode } from "react"

interface StepProps {
    icon: ReactNode
    titleKey: string
    descKey: string
}

const steps: StepProps[] = [
    {
        icon: <Upload className="w-10 h-10 text-primary" />,
        titleKey: "landing_how_step1_title",
        descKey: "landing_how_step1_desc",
    },
    {
        icon: <Lock className="w-10 h-10 text-primary" />,
        titleKey: "landing_how_step2_title",
        descKey: "landing_how_step2_desc",
    },
    {
        icon: <Globe className="w-10 h-10 text-primary" />,
        titleKey: "landing_how_step3_title",
        descKey: "landing_how_step3_desc",
    },
]

export const HowItWorks = () => {
    const { t } = useTranslation()

    return (
        <section id="howItWorks" className="w-full max-w-[1400px] mx-auto px-6 text-center py-24 sm:py-32 bg-muted/30">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t("landing_how_title")}
            </h2>
            <p className="md:w-3/4 mx-auto mb-16 text-xl text-muted-foreground">
                {t("landing_how_subtitle")}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {steps.map(({ icon, titleKey, descKey }, index) => (
                    <Card key={titleKey} className="bg-background relative border-2 hover:border-primary/50 transition-colors">
                        {/* Step number */}
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                            {index + 1}
                        </div>
                        <CardHeader className="pt-8">
                            <CardTitle className="grid gap-4 place-items-center">
                                <div className="bg-primary/10 p-4 rounded-2xl">
                                    {icon}
                                </div>
                                <span className="text-xl">{t(titleKey)}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-muted-foreground">
                            {t(descKey)}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    )
}
