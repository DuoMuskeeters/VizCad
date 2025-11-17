import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { detectLanguage, seoContent } from "@/utils/language"
import StepToGlbConverter from "@/components/StepToGlbConverter"

export const Route = createFileRoute("/converter")({
    head: () => {
        const lang = detectLanguage()

        return {
            title: "STEP to GLB Converter | VizCad - CAD Dosya Dönüştürücü",
            meta: [
                {
                    name: "description",
                    content: "STEP ve STP formatındaki CAD dosyalarınızı ücretsiz olarak GLB formatına dönüştürün. Tarayıcınızda çalışır, güvenli ve hızlı.",
                },
                {
                    name: "keywords",
                    content: "STEP to GLB, CAD converter, STEP converter, 3D model converter, STP to GLB, CAD dosya dönüştürücü",
                },
                {
                    property: "og:title",
                    content: "STEP to GLB Converter | VizCad",
                },
                {
                    property: "og:description",
                    content: "STEP CAD dosyalarınızı GLB formatına ücretsiz dönüştürün",
                },
                {
                    property: "og:type",
                    content: "website",
                },
            ],
        }
    },
    component: ConverterPage,
})

function ConverterPage() {
    const { t } = useTranslation()

    return (
        <div className="min-h-screen bg-background">
            <StepToGlbConverter />
        </div>
    )
}
