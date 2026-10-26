import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PlanLock } from "@/components/billing/plan-lock";
import { planFor } from "@/lib/data/billing";
import { listSpaces } from "@/lib/data/spaces";
import { requireUser } from "@/lib/session";
import { CreateSpace } from "./new/create-space";

export const metadata: Metadata = { title: "Spaces" };

export default async function AppHome() {
  const user = await requireUser("/app");
  const spaces = await listSpaces(user.id);
  if (spaces.length) {
    const last = (await cookies()).get("lw-space")?.value;
    redirect(`/app/${spaces.find((s) => s.id === last)?.id ?? spaces[0].id}`);
  }
  const plan = await planFor(user.id);
  if (plan?.state === "ended") return <PlanLock reason={plan.reason} />;
  return <CreateSpace first />;
}
