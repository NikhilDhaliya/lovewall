// Page-shaped placeholders shown while a page loads (no spinners).
import { PAGE } from "@/lib/layout";

export function ListSkeleton({ width = "max-w-[680px]", groups = [4, 1] }: { width?: string; groups?: number[] }) {
  return (
    <div className={PAGE}>
      <div className={`${width} pt-5 md:pt-9`} aria-busy="true" aria-label="Loading">
        <div className="h-9 w-40 skeleton" />
        {groups.map((rows, g) => (
          <div key={g} className="mt-8 divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex h-[52px] items-center justify-between px-4">
                <div className="h-3.5 w-24 skeleton" />
                <div className="h-3.5 w-32 skeleton" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className={`${PAGE} pt-5 md:pt-9`} aria-busy="true" aria-label="Loading">
      <div className="h-9 w-40 skeleton" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="h-14 skeleton rounded-[12px]" />
          <div className="h-72 skeleton rounded-[12px]" />
        </div>
        <div className="h-[520px] skeleton rounded-[36px] max-lg:hidden" />
      </div>
    </div>
  );
}

export function ConfiguratorSkeleton() {
  return (
    <div className={`${PAGE} pt-3`} aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 skeleton" />
      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="h-[60vh] skeleton rounded-[12px]" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}
