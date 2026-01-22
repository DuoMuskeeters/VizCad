import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface DemoContainerProps {
    children: ReactNode
    className?: string
}

export const DemoContainer = ({ children, className }: DemoContainerProps) => {
    return (
        <div className={cn(
            "relative w-full aspect-square max-w-[500px] mx-auto overflow-hidden",
            "rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm shadow-2xl",
            "flex flex-col",
            className
        )}>
            {/* Fake Browser Header */}
            <div className="h-8 border-b border-border/10 bg-muted/20 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-background/50">
                {children}
            </div>
        </div>
    )
}
