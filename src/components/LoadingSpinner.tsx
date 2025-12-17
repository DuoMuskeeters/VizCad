import { Loader2 } from "lucide-react";

export function LoadingSpinner() {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
      aria-label="Yükleniyor"
      role="status"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-lg font-medium text-foreground">Model yükleniyor...</span>
      </div>
    </div>
  );
}
