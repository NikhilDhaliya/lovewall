import type { Metadata } from "next";
import { AccountSettings } from "@/components/app/account-settings";
import { LegalSettings } from "@/components/app/legal-settings";
import { planFor } from "@/lib/data/billing";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage(props: PageProps<"/app/settings">) {
  const user = await requireUser("/app/settings");
  const plan = await planFor(user.id);
  const { subscribed } = await props.searchParams;
  return (
    <AccountSettings
      user={{ name: user.name, email: user.email, image: user.image }}
      billing={plan ? { plan, subscribed: subscribed === "1" } : null}
    >
      <LegalSettings />
    </AccountSettings>
  );
}
