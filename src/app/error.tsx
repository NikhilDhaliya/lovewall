"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="animate-view">
        <h1 className="font-display text-[24px] font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-[15px] text-muted">It’s on us. Try again.</p>
        <Button onClick={reset} className="mt-6">
          <RotateCw className="size-4" /> Try again
        </Button>
      </div>
    </main>
  );
}
