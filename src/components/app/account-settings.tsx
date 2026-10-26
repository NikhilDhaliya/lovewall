"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { deleteAccount, updateName } from "@/app/actions/account";
import { Page, PageHeader } from "@/components/app/shell";
import { BillingSettings } from "@/components/billing/billing-settings";
import { Avatar } from "@/components/ui/avatar";
import { confirmAction } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/segmented";
import { authClient } from "@/lib/auth-client";
import type { Plan } from "@/lib/billing/plan";
import { currentPref, setTheme, subscribeTheme, type ThemePref } from "@/lib/theme";
import { Group, GroupRow, rowInputClass } from "./grouped";

export function AccountSettings({
  user,
  children,
  billing,
}: {
  user: { name: string; email: string; image: string | null };
  children?: React.ReactNode;
  // Hosted billing only (null when self-hosted).
  billing: { plan: Plan; subscribed: boolean } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const pref = useSyncExternalStore(subscribeTheme, currentPref, () => "system" as ThemePref);
  const paying = billing ? ["active", "canceling", "past_due"].includes(billing.plan.state) : false;

  return (
    <div className="pb-24">
      <PageHeader title="Account" width="max-w-[680px]" />
      <Page width="max-w-[680px]">
        <Group>
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <Avatar src={user.image} size={48} />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold">{savedName || user.email.split("@")[0]}</div>
              <div className="truncate text-[14px] text-muted">{user.email}</div>
            </div>
          </div>
          <GroupRow label="Name" htmlFor="account-name">
            <input
              id="account-name"
              value={name}
              placeholder="Your name"
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                if (!name.trim() || name === savedName) return setName(savedName);
                const res = await updateName(name);
                if (!res.ok) return toast.error(res.error);
                setSavedName(name);
                toast.success("Saved");
                router.refresh();
              }}
              className={rowInputClass}
            />
          </GroupRow>
        </Group>

        {billing && <BillingSettings plan={billing.plan} subscribed={billing.subscribed} />}

        <Group title="Appearance">
          <GroupRow label="Theme">
            <Segmented
              size="sm"
              fit
              label="Theme"
              value={pref}
              onChange={(v) => setTheme(v)}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </GroupRow>
        </Group>

        <Group title="Security">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmAction({
                title: "Sign out everywhere?",
                message: "Every device, this one included.",
                confirmLabel: "Sign out",
              });
              if (!ok) return;
              const { error } = await authClient.revokeSessions();
              if (error) return toast.error("Couldn’t sign out everywhere");
              window.location.assign("/login");
            }}
            className="flex min-h-[52px] w-full items-center px-4 text-left text-[15px] transition-colors hover:bg-surface-2"
          >
            Sign out everywhere
          </button>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/login");
            }}
            className="flex min-h-[52px] w-full items-center px-4 text-left text-[15px] transition-colors hover:bg-surface-2"
          >
            Sign out
          </button>
        </Group>

        <Group title="Your data">
          <a
            href="/api/account/export"
            download
            className="flex min-h-[52px] w-full items-center justify-between gap-4 px-4 text-left text-[15px] transition-colors hover:bg-surface-2"
          >
            Export data
            <span className="text-[13px] text-muted">JSON</span>
          </a>
        </Group>

        {children}

        <Group>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmAction({
                title: "Delete your account?",
                message: `Spaces you own are deleted with their testimonials, widgets and files. You leave the others.${
                  paying ? " Your plan is canceled." : ""
                } This can’t be undone.`,
                confirmLabel: "Delete account",
                destructive: true,
              });
              if (!ok) return;
              const res = await deleteAccount();
              if (!res.ok) return toast.error(res.error);
              window.location.assign("/");
            }}
            className="flex min-h-[52px] w-full items-center justify-center px-4 text-[15px] font-medium text-danger transition-colors hover:bg-danger-soft/50"
          >
            Delete account
          </button>
        </Group>
      </Page>
    </div>
  );
}
