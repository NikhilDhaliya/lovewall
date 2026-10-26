import type { Metadata } from "next";
import { PlanLock } from "@/components/billing/plan-lock";
import { planFor } from "@/lib/data/billing";
import { requireUser } from "@/lib/session";
import { CreateSpace } from "./create-space";

export const metadata: Metadata = { title: "New space" };

export default async function NewSpacePage() {
  const user = await requireUser("/app/new");
  const plan = await planFor(user.id);
  if (plan?.state === "ended") return <PlanLock reason={plan.reason} />;
  return <CreateSpace />;
}
