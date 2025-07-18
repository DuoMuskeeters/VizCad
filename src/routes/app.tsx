import { VtkApp } from "@/components/vtk";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  component: RouteComponent,
});

function RouteComponent() {
  return <VtkApp />;
}
