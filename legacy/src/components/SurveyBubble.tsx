import { useState, useEffect } from "react"
import { submitSurveyResponse } from "@/lib/survey.functions"

const SOURCES = [
    "Google Search",
    "Social Media",
    "Friend / Colleague",
    "Blog / Article",
    "YouTube",
    "Other",
]

export function SurveyBubble() {
    const [isOpen, setIsOpen] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [dismissed, setDismissed] = useState(true) // start hidden until mount

    // Check localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("vizcad-survey-done")
        setDismissed(!!stored)
    }, [])

    const handleSelect = async (source: string) => {
        console.log("Survey response:", source)
        localStorage.setItem("vizcad-survey-done", "true")

        // Log to DB
        try {
            await submitSurveyResponse({ data: { source } })
        } catch (e) {
            console.error("Failed to log survey response", e)
        }

        setSubmitted(true)
        setTimeout(() => {
            setIsOpen(false)
            setDismissed(true)
        }, 2000)
    }

    const handleDismiss = async () => {
        localStorage.setItem("vizcad-survey-done", "true")
        setIsOpen(false)
        setDismissed(true)

        // Log dismissal
        try {
            await submitSurveyResponse({ data: { source: "Dismissed" } })
        } catch (e) {
            console.error("Failed to log survey dismissal", e)
        }
    }

    if (dismissed) return null

    return (
        <>
            {/* Bubble button */}
            {!isOpen && (
                <button
                    onClick={() => {
                        setIsOpen(true)
                        // Log opened
                        submitSurveyResponse({ data: { source: "Opened" } }).catch(e => {
                            console.error("Failed to log survey open", e)
                        })
                    }}
                    className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 
                     w-12 h-12 sm:w-14 sm:h-14 
                     rounded-full bg-primary text-primary-foreground 
                     shadow-lg hover:shadow-xl hover:scale-105
                     flex items-center justify-center 
                     transition-all duration-300"
                    aria-label="Survey"
                    style={{ animation: "bounce-gentle 3s ease-in-out infinite" }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
            )}

            {/* Panel */}
            {isOpen && (
                <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 
                        w-[calc(100vw-2rem)] max-w-[280px] sm:max-w-[300px]
                        bg-card border border-border/60 rounded-2xl shadow-2xl 
                        overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                        <h4 className="text-sm font-bold text-foreground">Quick question 👋</h4>
                        <button
                            onClick={handleDismiss}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            aria-label="Close"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-4 pb-4">
                        {submitted ? (
                            <div className="text-center py-4">
                                <p className="text-sm text-primary font-medium">Thank you! 🎉</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-muted-foreground mb-3">
                                    How did you hear about VizCad?
                                </p>
                                <div className="space-y-1.5">
                                    {SOURCES.map((source) => (
                                        <button
                                            key={source}
                                            onClick={() => handleSelect(source)}
                                            className="w-full text-left px-3 py-2 text-sm rounded-lg 
                                 text-foreground bg-muted/50 hover:bg-primary/10 
                                 hover:text-primary transition-colors duration-150"
                                        >
                                            {source}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Gentle bounce animation */}
            <style>{`
        @keyframes bounce-gentle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
        </>
    )
}
