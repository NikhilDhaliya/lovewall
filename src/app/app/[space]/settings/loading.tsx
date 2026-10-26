import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return <ListSkeleton groups={[4, 1, 2, 1, 1, 1]} />;
}
