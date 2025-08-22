"use client"

import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/faq")({
  component: FAQ,
})

function FAQ() {
  const navigate = useNavigate()

  const faqs = [
    {
      id: "what-is-vizcad",
      question: "What is VizCAD?",
      answer:
        "VizCAD is a powerful 3D visualization and CAD application that allows you to create, edit, and visualize 3D models directly in your web browser. It provides professional-grade tools for 3D modeling, rendering, and analysis without requiring any software installation.",
    },
    {
      id: "browser-support",
      question: "Which browsers are supported?",
      answer:
        "VizCAD works best on modern browsers including Chrome, Firefox, Safari, and Edge. We recommend using the latest version of your browser for optimal performance. WebGL support is required for 3D rendering capabilities.",
    },
    {
      id: "file-formats",
      question: "What file formats does VizCAD support?",
      answer:
        "VizCAD supports a wide range of 3D file formats including STL, OBJ, PLY, VTK, and many others. You can import existing 3D models and export your work in various formats for compatibility with other CAD software.",
    },
    {
      id: "getting-started",
      question: "How do I get started with VizCAD?",
      answer:
        "Simply click the 'Launch App' button in the header to start using VizCAD immediately. No registration or download is required. The interface is intuitive with helpful tooltips and guides to help you begin creating 3D models right away.",
    },
    {
      id: "performance",
      question: "What are the system requirements?",
      answer:
        "VizCAD runs entirely in your web browser, so you only need a modern browser with WebGL support. For best performance, we recommend at least 4GB of RAM and a dedicated graphics card, especially when working with complex 3D models.",
    },
    {
      id: "collaboration",
      question: "Can I collaborate with others on VizCAD projects?",
      answer:
        "Currently, VizCAD focuses on individual 3D modeling and visualization. However, you can easily export and share your 3D models with colleagues using supported file formats. Collaboration features are planned for future releases.",
    },
    {
      id: "pricing",
      question: "Is VizCAD free to use?",
      answer:
        "VizCAD offers a free tier with core 3D modeling and visualization features. Advanced features and enhanced performance options may be available through premium plans. Check our pricing section for the most current information.",
    },
    {
      id: "data-security",
      question: "How secure is my data in VizCAD?",
      answer:
        "Your 3D models and data are processed locally in your browser whenever possible. We take data security seriously and implement industry-standard security measures. Your files are only uploaded when you explicitly choose to save or share them.",
    },
  ]

  const handleContactClick = () => {
    navigate({ to: "/" })
    setTimeout(() => {
      const element = document.getElementById("contact")
      if (element) {
        element.scrollIntoView({ behavior: "smooth" })
      }
    }, 100)
  }

  return (
    <div className="min-h-screen bg-background pt-16 sm:pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Frequently Asked <span className="text-primary">Questions</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find answers to common questions about VizCAD's features, capabilities, and how to get the most out of our
            3D visualization platform.
          </p>
        </div>

        {/* FAQ Content */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Common Questions</CardTitle>
            <CardDescription className="text-center">Click on any question below to see the answer</CardDescription>
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

        {/* Contact Section */}
        <div className="mt-12 text-center">
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 dark:from-primary/5 dark:to-accent/5 border-primary/20 dark:border-primary/30">
            <CardContent className="pt-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">Still have questions?</h3>
              <p className="text-muted-foreground mb-4">
                Can't find the answer you're looking for? We're here to help!
              </p>
              <button
                onClick={handleContactClick}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-3 rounded-lg transition-all duration-200 hover:shadow-md"
              >
                Contact Support
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
