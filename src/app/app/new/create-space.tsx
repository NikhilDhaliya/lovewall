"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createSpace } from "@/app/actions/spaces";
import { inputClass } from "@/components/ui/field";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

export function CreateSpace({ first }: { first?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const res = await createSpace({ name });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/app/${res.data.id}`);
    });
  }

  return (
    <main className="grid min-h-[calc(100dvh-56px)] place-items-center px-4 py-12 md:min-h-dvh">
      <form onSubmit={submit} className="w-full max-w-[400px] animate-view text-center">
        <LogoMark size={52} className="mx-auto" />
        <h1 className="mt-6 font-display text-[30px] leading-tight font-semibold">{first ? "Create your first space" : "New space"}</h1>
        <p className="mt-1.5 text-[15px] text-muted">One per product or brand.</p>
        <div className="mt-8 flex gap-2">
          <input
            autoFocus
            aria-label="Space name"
            placeholder="Product name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputClass, "h-12 flex-1 md:h-12 md:text-[15px]")}
          />
          <button
            disabled={pending || !name.trim()}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-accent text-on-accent transition-[background-color,scale] hover:bg-accent-hover active:scale-95 disabled:opacity-40"
            aria-label="Create space"
          >
            {pending ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
          </button>
        </div>
      </form>
    </main>
  );
}
