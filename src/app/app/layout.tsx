import { Shell } from "@/components/app/shell";
import { daysLeftLabel } from "@/lib/billing/plan";
import { planFor } from "@/lib/data/billing";
import { fileUrl } from "@/lib/data/files";
import { listSpaces } from "@/lib/data/spaces";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser("/app");
  const [spaces, plan] = await Promise.all([listSpaces(user.id), planFor(user.id)]);
  // Hosted: a quiet line about the user's own plan, unless they only work in other people's spaces.
  const pays = !spaces.length || spaces.some((s) => s.role === "owner");
  const notice =
    plan && pays
      ? plan.state === "trialing"
        ? { label: daysLeftLabel(plan.daysLeft), href: "/app/settings#billing" }
        : plan.state === "past_due"
          ? { label: "Payment failed", href: "/app/settings#billing", danger: true }
          : null
      : null;
  return (
    <Shell
      user={{ name: user.name, email: user.email, image: user.image }}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name, slug: s.slug, logo: fileUrl(s.logo_key), fresh: s.fresh }))}
      notice={notice}
    >
      {children}
    </Shell>
  );
}
