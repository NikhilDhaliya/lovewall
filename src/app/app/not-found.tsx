import { Link } from "@/components/app/link";
import { buttonClass } from "@/components/ui/button";

export default function SpaceNotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="animate-view">
        <h1 className="font-display text-[26px] font-semibold">Space not found</h1>
        <p className="mt-1.5 text-[15px] text-muted">It doesn’t exist, or it isn’t yours.</p>
        <Link href="/app" className={buttonClass("primary", "md", "mt-6")}>
          Your spaces
        </Link>
      </div>
    </main>
  );
}
