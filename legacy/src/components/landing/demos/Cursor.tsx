import { cn } from "@/lib/utils"

interface CursorProps {
    x: number
    y: number
    clicking?: boolean
    className?: string
    color?: string
}

export const Cursor = ({ x, y, clicking, className, color = "black" }: CursorProps) => {
    return (
        <div
            className={cn(
                "absolute pointer-events-none transition-all duration-700 ease-in-out z-50",
                className
            )}
            style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-20%, -20%) scale(${clicking ? 0.9 : 1})`,
            }}
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={cn("drop-shadow-lg", color === "white" ? "text-white" : "text-black")}
            >
                <path
                    d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                    fill="currentColor"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            {/* Click ripple effect */}
            {clicking && (
                <div className="absolute top-0 left-0 -inset-4 rounded-full bg-primary/30 animate-ping" />
            )}
        </div>
    )
}
