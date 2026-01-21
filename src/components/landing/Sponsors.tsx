"use client"

import { useTranslation } from "react-i18next"
import { Box } from "lucide-react"

interface FormatProps {
    name: string
    extension: string
}

const formats: FormatProps[] = [
    { name: "STEP", extension: ".step" },
    { name: "IGES", extension: ".iges" },
    { name: "STL", extension: ".stl" },
    { name: "OBJ", extension: ".obj" },
    { name: "GLTF", extension: ".gltf" },
    { name: "FBX", extension: ".fbx" },
    { name: "3MF", extension: ".3mf" },
    { name: "PLY", extension: ".ply" },
]

export const Sponsors = () => {
    const { t } = useTranslation()

    return (
        <section id="sponsors" className="w-full max-w-[1400px] mx-auto px-6 pt-24 sm:py-32">
            <h2 className="text-center text-md lg:text-xl font-bold mb-8 text-primary">
                {t("landing_sponsors_title")}
            </h2>

            <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8">
                {formats.map(({ name, extension }: FormatProps) => (
                    <div
                        key={name}
                        className="flex items-center gap-2 text-muted-foreground/60 hover:text-primary transition-colors cursor-default"
                    >
                        <Box size={28} />
                        <div className="flex flex-col">
                            <span className="text-lg font-bold">{name}</span>
                            <span className="text-xs opacity-70">{extension}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
