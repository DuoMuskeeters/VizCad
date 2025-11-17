export function LoadingSpinner() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background font-semibold"
      aria-label="Yükleniyor"
      role="status"
    >
      <div className="relative h-28 w-28">
        {/* Dönen Barbell Plakası SVG'si */}
        <svg
          className="h-full w-full animate-spin"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          style={{ animationDuration: "1.5s" }} // Dönüş hızını ayarlayabilirsiniz
        >
          {/* Dış halka */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="8"
          />

          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="8"
            strokeDasharray="283"
            strokeDashoffset="210"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="https://atalaythecoach.com/darkLogo.png"
            alt="Loading Icon"
            className="hidden h-16 w-16 dark:block"
          />
          <img
            src="https://atalaythecoach.com/lightLogo.png"
            alt="Loading Icon"
            className="h-16 w-16 dark:hidden"
          />
        </div>
      </div>

      <p className="mt-6 animate-pulse font-semibold text-lg text-muted-foreground">
        Antrenman zili çalmak üzere...
      </p>
    </div>
  );
}
