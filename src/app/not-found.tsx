import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <div className="animate-view">
        <LogoMark size={44} className="mx-auto" />
        <h1 className="mt-6 font-display text-[28px] font-semibold">Page not found</h1>
        <p className="mt-1.5 text-[15px] text-muted">This link doesn’t go anywhere.</p>
        <Link href="/" className={buttonClass("primary", "md", "mt-7")}>
          Go home
        </Link>
      </div>
    </main>
  );
}
