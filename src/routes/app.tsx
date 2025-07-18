import { VtkApp } from "@/components/vtk"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/app")({
  component: AppPage,
})

function AppPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      {/* Main Application Window */}
      <div className="w-full max-w-7xl h-[57.5vh] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
        <VtkApp />
      </div>
    </div>
  )
}
