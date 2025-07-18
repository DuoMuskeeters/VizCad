import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen w-full bg-background flex-col justify-center items-center">
      <Button variant="default">
        <Link to="/app">Go to /app</Link>
      </Button>
    </div>
  );
}
