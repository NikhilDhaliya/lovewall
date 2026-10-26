import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return <ListSkeleton groups={[2, 1, 2, 1]} />;
}
