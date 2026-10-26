import { PAGE } from "@/lib/layout";

export default function Loading() {
  return (
    <div className={`${PAGE} pt-5 md:pt-9`} aria-busy="true" aria-label="Loading">
      <div className="h-9 w-44 skeleton" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[200px] skeleton rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}
