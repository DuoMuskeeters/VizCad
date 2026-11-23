"use client"

import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Check } from "lucide-react"

enum PopularPlanType {
    NO = 0,
    YES = 1,
}

interface PricingProps {
    titleKey: string
    popular: PopularPlanType
    priceKey: string
    descriptionKey: string
    buttonTextKey: string
    benefitKeys: string[]
}

const pricingList: PricingProps[] = [
    {
        titleKey: "pricing_free_title",
        popular: 0,
        priceKey: "pricing_free_price",
        descriptionKey: "pricing_free_description",
        buttonTextKey: "pricing_free_button",
        benefitKeys: [
            "pricing_free_benefit_1",
            "pricing_free_benefit_2",
            "pricing_free_benefit_3",
            "pricing_free_benefit_4",
            "pricing_free_benefit_5",
        ],
    },
    {
        titleKey: "pricing_premium_title",
        popular: 1,
        priceKey: "pricing_premium_price",
        descriptionKey: "pricing_premium_description",
        buttonTextKey: "pricing_premium_button",
        benefitKeys: [
            "pricing_premium_benefit_1",
            "pricing_premium_benefit_2",
            "pricing_premium_benefit_3",
            "pricing_premium_benefit_4",
            "pricing_premium_benefit_5",
        ],
    },
    {
        titleKey: "pricing_enterprise_title",
        popular: 0,
        priceKey: "pricing_enterprise_price",
        descriptionKey: "pricing_enterprise_description",
        buttonTextKey: "pricing_enterprise_button",
        benefitKeys: [
            "pricing_enterprise_benefit_1",
            "pricing_enterprise_benefit_2",
            "pricing_enterprise_benefit_3",
            "pricing_enterprise_benefit_4",
            "pricing_enterprise_benefit_5",
        ],
    },
]

export const Pricing = () => {
    const { t } = useTranslation()

    return (
        <section id="pricing" className="w-full max-w-[1400px] mx-auto px-6 py-24 sm:py-32">
            <h2 className="text-3xl md:text-4xl font-bold text-center">
                {t("pricing_title_1")}
                <span className="bg-gradient-to-b from-primary/60 to-primary text-transparent bg-clip-text">
                    {" "}{t("pricing_title_highlight")}{" "}
                </span>
                {t("pricing_title_2")}
            </h2>
            <h3 className="text-xl text-center text-muted-foreground pt-4 pb-8">
                {t("pricing_subtitle")}
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {pricingList.map((pricing: PricingProps) => (
                    <Card
                        key={pricing.titleKey}
                        className={
                            pricing.popular === PopularPlanType.YES
                                ? "drop-shadow-xl shadow-black/10 dark:shadow-white/10"
                                : ""
                        }
                    >
                        <CardHeader>
                            <CardTitle className="flex item-center justify-between">
                                {t(pricing.titleKey)}
                                {pricing.popular === PopularPlanType.YES ? (
                                    <Badge variant="secondary" className="text-sm text-primary">
                                        {t("pricing_most_popular")}
                                    </Badge>
                                ) : null}
                            </CardTitle>
                            <div>
                                <span className="text-3xl font-bold">{t(pricing.priceKey)}</span>
                                <span className="text-muted-foreground"> {t("pricing_per_month")}</span>
                            </div>

                            <CardDescription>{t(pricing.descriptionKey)}</CardDescription>
                        </CardHeader>

                        <CardContent>
                            <Button className="w-full">{t(pricing.buttonTextKey)}</Button>
                        </CardContent>

                        <hr className="w-4/5 m-auto mb-4" />

                        <CardFooter className="flex">
                            <div className="space-y-4">
                                {pricing.benefitKeys.map((benefitKey: string) => (
                                    <span key={benefitKey} className="flex">
                                        <Check className="text-green-500" />{" "}
                                        <h3 className="ml-2">{t(benefitKey)}</h3>
                                    </span>
                                ))}
                            </div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </section>
    )
}
