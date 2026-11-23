"use client"

import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Users, Share2, Sparkles } from "lucide-react"
import type { ReactNode } from "react"

import { CollaborationDemo } from "./demos/CollaborationDemo"
import { SharingDemo } from "./demos/SharingDemo"
import { StudioDemo } from "./demos/StudioDemo"

interface FeatureItemProps {
    icon: ReactNode
    titleKey: string
    descKey: string
    badgeKey: string
    imageSrc: string
    imageAlt: string
    reverse?: boolean
    DemoComponent?: React.ComponentType
}

const featureItems: Omit<FeatureItemProps, 'reverse'>[] = [
    {
        icon: <Users className="w-6 h-6" />,
        titleKey: "landing_showcase_collab_title",
        descKey: "landing_showcase_collab_desc",
        badgeKey: "landing_showcase_collab_badge",
        imageSrc: "/images/features/collaboration.png",
        imageAlt: "Collaboration Feature",
        DemoComponent: CollaborationDemo,
    },
    {
        icon: <Share2 className="w-6 h-6" />,
        titleKey: "landing_showcase_sharing_title",
        descKey: "landing_showcase_sharing_desc",
        badgeKey: "landing_showcase_sharing_badge",
        imageSrc: "/images/features/file-sharing.png",
        imageAlt: "File Sharing Feature",
        DemoComponent: SharingDemo,
    },
    {
        icon: <Sparkles className="w-6 h-6" />,
        titleKey: "landing_showcase_studio_title",
        descKey: "landing_showcase_studio_desc",
        badgeKey: "landing_showcase_studio_badge",
        imageSrc: "/images/features/vizcad-studio.png",
        imageAlt: "VizCad Studio Feature",
        DemoComponent: StudioDemo,
    },
]

const FeatureItem = ({ icon, titleKey, descKey, badgeKey, imageSrc, imageAlt, reverse, DemoComponent }: FeatureItemProps) => {
    const { t } = useTranslation()

    return (
        <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${reverse ? 'lg:flex-row-reverse' : ''}`}>
            {/* Text Content */}
            <div className={`space-y-6 ${reverse ? 'lg:order-2' : 'lg:order-1'}`}>
                <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium bg-primary/10 text-primary border-0">
                    <span className="mr-2">{icon}</span>
                    {t(badgeKey)}
                </Badge>
                <h3 className="text-3xl md:text-4xl font-bold leading-tight">
                    {t(titleKey)}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                    {t(descKey)}
                </p>
            </div>

            {/* Image */}
            <div className={`relative ${reverse ? 'lg:order-1' : 'lg:order-2'}`}>
                <div className="relative aspect-square max-w-[500px] mx-auto">
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-3xl blur-2xl opacity-60" />

                    {/* Image container */}
                    {/* Image container or Demo Component */}
                    {DemoComponent ? (
                        <DemoComponent />
                    ) : (
                        <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm shadow-2xl">
                            <img
                                src={imageSrc}
                                alt={imageAlt}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Decorative elements */}
                    <div className="absolute -z-10 top-1/4 -right-8 w-32 h-32 bg-primary/10 rounded-full blur-xl" />
                    <div className="absolute -z-10 bottom-1/4 -left-8 w-24 h-24 bg-primary/5 rounded-full blur-lg" />
                </div>
            </div>
        </div>
    )
}

export const FeatureShowcase = () => {
    const { t } = useTranslation()

    return (
        <section id="showcase" className="w-full max-w-[1400px] mx-auto px-6 py-24 sm:py-32">
            {/* Section Header */}
            <div className="text-center mb-20">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                    {t("landing_showcase_title")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                    {t("landing_showcase_subtitle")}
                </p>
            </div>

            {/* Feature Items */}
            <div className="space-y-32 lg:space-y-56">
                {featureItems.map((item, index) => (
                    <FeatureItem
                        key={item.titleKey}
                        {...item}
                        reverse={index % 2 === 1}
                    />
                ))}
            </div>
        </section>
    )
}
