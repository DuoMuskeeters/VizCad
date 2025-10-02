"use client"

import { createFileRoute } from "@tanstack/react-router"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "react-i18next"
import { detectLanguage, seoContent } from "@/utils/language"

// faq.tsx (FAQ Page)
export const Route = createFileRoute("/faq")({
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].faq
    
    return {
      title: content.title,
      meta: [
        {
          name: "description",
          content: content.description,
        },
        {
          name: "keywords",
          content: content.keywords,
        },
        {
          property: "og:title",
          content: content.ogTitle,
        },
        {
          property: "og:description",
          content: content.ogDescription,
        },
        {
          property: "og:url",
          content: "https://vizcad.com/faq",
        },
        {
          property: "og:image",
          content: `https://vizcad.com/og-faq-${lang}.png`,
        },
        {
          name: "twitter:title",
          content: content.twitterTitle,
        },
        {
          name: "twitter:description",
          content: content.twitterDescription,
        },
        {
          name: "twitter:image",
          content: `https://vizcad.com/twitter-faq-${lang}.png`,
        },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://vizcad.com/faq",
        },
      ],
    }
  },
  component: FAQ,
})

function FAQ() {
  const { t } = useTranslation()
  const faqs = [
    {
      id: "what-is-vizcad",
      question: t("faq.questions.what-is-vizcad.question"),
      answer: t("faq.questions.what-is-vizcad.answer"),
    },
    {
      id: "supported-browsers",
      question: t("faq.questions.supported-browsers.question"),
      answer: t("faq.questions.supported-browsers.answer"),
    },
    {
      id: "file-formats",
      question: t("faq.questions.file-formats.question"),
      answer: t("faq.questions.file-formats.answer"),
    },
    {
      id: "getting-started",
      question: t("faq.questions.getting-started.question"),
      answer: t("faq.questions.getting-started.answer"),
    },
    {
      id: "system-requirements",
      question: t("faq.questions.system-requirements.question"),
      answer: t("faq.questions.system-requirements.answer"),
    },
    {
      id: "collaboration",
      question: t("faq.questions.collaboration.question"),
      answer: t("faq.questions.collaboration.answer"),
    },
    {
      id: "is-it-free",
      question: t("faq.questions.is-it-free.question"),
      answer: t("faq.questions.is-it-free.answer"),
    },
    {
      id: "data-security",
      question: t("faq.questions.data-security.question"),
      answer: t("faq.questions.data-security.answer"),
    },
    {
      id: "how-is-it-different",
      question: t("faq.questions.how-is-it-different.question"),
      answer: t("faq.questions.how-is-it-different.answer"),
    },
    {
      id: "development-process",
      question: t("faq.questions.development-process.question"),
      answer: t("faq.questions.development-process.answer"),
    },
  ]

  return (
    <div className="min-h-screen bg-background pt-20 sm:pt-24 lg:pt-28">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t("faq.header.title")} <span className="text-primary-foreground bg-primary/20 px-2 rounded">{t("faq.header.titleAccent")}</span>
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
                  <AccordionTrigger className="text-left hover:text-primary-foreground transition-colors data-[state=open]:text-primary-foreground">
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
