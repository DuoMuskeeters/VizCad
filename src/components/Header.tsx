import { Dumbbell } from "lucide-react";
import { Link } from "@tanstack/react-router";
export default function Header() {
  return (
    <header className="p-2 flex gap-2 bg-background justify-between border-b-2">
      <nav className="flex items-center gap-4 w-full">
        <div className="flex flex-row items-center">
          <Dumbbell className="inline size-6" />
        </div>
        <div className="flex flex-row gap-8 w-full justify-end px-4">
          <Link to="/">Home</Link>
          <Link to="/app">App</Link>
        </div>
      </nav>
    </header>
  );
}
