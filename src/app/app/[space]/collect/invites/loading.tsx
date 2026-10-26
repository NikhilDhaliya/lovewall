import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return <ListSkeleton width="max-w-[880px]" groups={[5, 3]} />;
}
