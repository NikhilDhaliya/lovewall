import { PAGE } from "@/lib/layout";

export default function Loading() {
  return (
    <div className={`${PAGE} pt-5 md:pt-9`} aria-busy="true" aria-label="Loading">
      <div className="h-8 w-32 skeleton" />
      <div className="mt-8 h-8 w-full max-w-[400px] skeleton" />
      <div className="mt-5 max-w-[880px] divide-y divide-line overflow-hidden rounded-[12px] bg-surface ring-1 ring-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3.5 px-5 py-4">
            <div className="size-9 shrink-0 skeleton rounded-full" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-40 skeleton" />
              <div className="h-3 w-24 skeleton" />
              <div className="h-3.5 w-full skeleton" />
              <div className="h-3.5 w-4/5 skeleton" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
