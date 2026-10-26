import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser } from "@/lib/session";
import { spaceLocked } from "./billing";
import { getMemberSpace } from "./spaces";

// The signed-in member, their space and role for a page; a space they aren't a member of (or none) is a 404.
// `locked`: the owner's hosted plan has ended, so the space layout shows the subscribe screen instead of the page.
export const loadSpace = cache(async (spaceId: string) => {
  const user = await requireUser(`/app/${spaceId}`);
  const space = await getMemberSpace(user.id, spaceId);
  if (!space) notFound();
  return { user, space, role: space.role, locked: await spaceLocked(space) };
});
