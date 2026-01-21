"use client"

import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { HardDrive, Clock, Smartphone, Infinity } from "lucide-react"
import type { ReactNode } from "react"

interface StatProps {
    icon: ReactNode
    valueKey: string
    labelKey: string
}

const stats: StatProps[] = [
    {
        icon: <HardDrive className="w-8 h-8 text-primary" />,
        valueKey: "landing_stats_1_value",
        labelKey: "landing_stats_1_label",
    },
    {
        icon: <Clock className="w-8 h-8 text-primary" />,
        valueKey: "landing_stats_2_value",
        labelKey: "landing_stats_2_label",
    },
    {
        icon: <Smartphone className="w-8 h-8 text-primary" />,
        valueKey: "landing_stats_3_value",
        labelKey: "landing_stats_3_label",
    },
    {
        icon: <Infinity className="w-8 h-8 text-primary" />,
        valueKey: "landing_stats_4_value",
        labelKey: "landing_stats_4_label",
    },
]

export const Statistics = () => {
    const { t } = useTranslation()

    return (
        <section id="statistics" className="w-full max-w-[1400px] mx-auto px-6 py-24 sm:py-32">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
                {stats.map(({ icon, valueKey, labelKey }) => (
                    <Card key={valueKey} className="bg-muted/50 border-none">
                        <CardContent className="pt-6 text-center space-y-4">
                            <div className="flex justify-center">{icon}</div>
                            <div>
                                <p className="text-4xl font-bold text-primary">{t(valueKey)}</p>
                                <p className="text-muted-foreground mt-1">{t(labelKey)}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    )
}
