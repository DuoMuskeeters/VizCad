"use client"

import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Phone, MapPin, Send, MessageCircle } from "lucide-react"
import { useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import emailjs from "@emailjs/browser";

import { detectLanguage, seoContent } from "@/utils/language"

export const Route = createFileRoute("/contact")({
  head: () => {
    const lang = detectLanguage()
    const content = seoContent[lang].contact

    return {
      meta: [
        {
          title: content.title,
        },
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
          content: "https://viz-cad.com/contact",
        },
        {
          property: "og:image",
          content: `https://viz-cad.com/og-contact-${lang}.png`,
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
          content: `https://viz-cad.com/twitter-contact-${lang}.png`,
        },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://viz-cad.com/contact",
        },
      ],
    }
  },
  component: ContactPage,
})


function ContactPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Create mailto link with form data
    const subject = encodeURIComponent(formData.subject || "VizCad Contact Form")
    const body = encodeURIComponent(`Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`)
    const mailtoLink = `mailto:info@viz-cad.com?subject=${subject}&body=${body}`

    // Open email client
    window.location.href = mailtoLink

    // Reset form after a short delay
    setTimeout(() => {
      setFormData({ name: "", email: "", subject: "", message: "" })
      setIsSubmitting(false)
    }, 1000)
  }

  const sendEmail = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (form.current) {
      emailjs
        .sendForm('service_7d3dqff', 'template_o6ug7u5', form.current, {
          publicKey: '2EhLYfAt6PzN8J5Ue',
        })
        .then(
          () => {
            if (form.current) {
              form.current.reset();
            }
            alert('Your message has been sent successfully!');
          },
          (error: { text: string }) => {
            alert('Message could not be sent');
          },
        );
    } else {
      console.error("Form reference is null.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900 pt-20 sm:pt-24 lg:pt-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t("contact.header.title")} <span className="text-primary-foreground bg-primary/20 px-2 rounded">{t("contact.header.titleAccent")}</span>
          </h1>
          <p className="text-lg text-muted-foreground dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {t("contact.header.subtitle")}
          </p>
        </div>

        {/* Contact Content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                {t("contact.form.title")}
              </CardTitle>
              <CardDescription>{t("contact.form.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={form} onSubmit={sendEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{t("contact.form.name")}</label>
                  <input
                    type="text"
                    name="user_name"
                    required
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder={t("contact.form.namePlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{t("contact.form.email")}</label>
                  <input
                    type="email"
                    name="user_email"
                    required
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder={t("contact.form.emailPlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{t("contact.form.subject")}</label>
                  <input
                    type="text"
                    name="subject"
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder={t("contact.form.subjectPlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{t("contact.form.message")}</label>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground resize-vertical"
                    placeholder={t("contact.form.messagePlaceholder")}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={isSubmitting}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isSubmitting ? t("contact.form.sending") : t("contact.form.send")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                    <Mail className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t("contact.info.email")}</h3>
                    <p className="text-muted-foreground">{t("contact.info.emailDesc")}</p>
                    <a
                      href="mailto:info@viz-cad.com"
                      className="text-primary-foreground hover:text-primary/80 transition-colors font-medium"
                    >
                      info@viz-cad.com
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                    <Phone className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t("contact.info.phone")}</h3>
                    <p className="text-muted-foreground">{t("contact.info.phoneDesc")}</p>
                    <a
                      href="tel:+90-536-247-1019"
                      className="text-primary-foreground hover:text-primary/80 transition-colors font-medium"
                    >
                      +90 (536) 247-1019
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{t("contact.info.location")}</h3>
                    <p className="text-muted-foreground">{t("contact.info.locationDesc")}</p>
                    <p className="text-foreground font-medium">{t("contact.info.locationValue")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQ Link */}
            <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-2">{t("contact.faq.title")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("contact.faq.desc")}
                </p>
                <Button variant="outline" asChild className="border-primary/30 hover:bg-primary/10 bg-transparent">
                  <a href="/faq">{t("contact.faq.button")}</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContactPage;
