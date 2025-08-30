"use client"

import { createFileRoute } from "@tanstack/react-router"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "react-i18next"

export const Route = createFileRoute("/faq")({
  component: FAQ,
})

function FAQ() {
  const { t } = useTranslation()
  const faqs = [
    {
      id: "what-is-vizcad",
      question: t("faq.what-is-vizcad.question"),
      answer: t("faq.what-is-vizcad.answer"),
    },
    {
      id: "browser-support",
      question: t("faq.browser-support.question"),
      answer: t("faq.browser-support.answer"),
    },
    {
      id: "file-formats",
      question: t("faq.file-formats.question"),
      answer: t("faq.file-formats.answer"),
    },
    {
      id: "getting-started",
      question: t("faq.getting-started.question"),
      answer: t("faq.getting-started.answer"),
    },
    {
      id: "performance",
      question: t("faq.performance.question"),
      answer: t("faq.performance.answer"),
    },
    {
      id: "collaboration",
      question: t("faq.collaboration.question"),
      answer: t("faq.collaboration.answer"),
    },
    {
      id: "pricing",
      question: t("faq.pricing.question"),
      answer: t("faq.pricing.answer"),
    },
    {
      id: "data-security",
      question: t("faq.data-security.question"),
      answer: t("faq.data-security.answer"),
    },
  ]

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t("faq.header.title")} <span className="text-primary">{t("faq.header.titleAccent")}</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("faq.header.subtitle")}
          </p>
        </div>

        {/* FAQ Content */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">{t("faq.card.title")}</CardTitle>
            <CardDescription className="text-center">{t("faq.card.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-left hover:text-primary transition-colors data-[state=open]:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
