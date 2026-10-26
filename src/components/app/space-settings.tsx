"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { saveBusinessAddress } from "@/app/actions/invites";
import { leaveSpace } from "@/app/actions/members";
import { checkSlug, deleteSpace, updateSpace } from "@/app/actions/spaces";
import { Page, PageHeader, useShell } from "@/components/app/shell";
import { confirmAction } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { Group, GroupRow, rowInputClass } from "./grouped";
import { MembersSettings } from "./members-settings";

type Space = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  brandColor: string;
  notify: boolean;
  // Printed in the footer of invite emails (anti-spam laws ask for the sender's postal address).
  address: string;
};

// One calm list: the space and its link (`domain` goes right after it), who works on it, then what it sends and
// connects to (`children`: notifications' chat hooks, webhooks, API keys, AI, activity), and "Delete space" last.
export function SpaceSettings({
  space,
  appHost,
  email,
  domain,
  children,
  members,
}: {
  space: Space;
  appHost: string;
  email: string;
  domain?: React.ReactNode;
  children?: React.ReactNode;
  members: React.ComponentProps<typeof MembersSettings>;
}) {
  const router = useRouter();
  const { patchSpace } = useShell();
  const [name, setName] = useState(space.name);
  const [slug, setSlug] = useState(space.slug);
  const [slugState, setSlugState] = useState<{ ok: boolean; error?: string } | null>(null);
  const [website, setWebsite] = useState(space.website ?? "");
  const [color, setColor] = useState(space.brandColor);
  const [notify, setNotify] = useState(space.notify);
  const [address, setAddress] = useState(space.address);
  const saved = useRef({ ...space, website: space.website ?? "" });
  const [savedSlug, setSavedSlug] = useState(space.slug);

  async function save(patch: Parameters<typeof updateSpace>[1], label = "Saved") {
    const res = await updateSpace(space.id, patch);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(label);
    return true;
  }

  // Live availability check for the link.
  useEffect(() => {
    if (slug === savedSlug) return;
    const id = setTimeout(async () => {
      const res = await checkSlug(space.id, slug);
      if (res.ok) setSlugState({ ok: res.data.free, error: res.data.error });
    }, 300);
    return () => clearTimeout(id);
  }, [slug, savedSlug, space.id]);

  const slugMessage = slug === savedSlug ? null : slugState;

  return (
    <div className="pb-24">
      <PageHeader title="Settings" width="max-w-[680px]" />
      <Page width="max-w-[680px]">
        <Group title="Space">
          <GroupRow label="Name" htmlFor="name">
            <input
              id="name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                if (!name.trim() || name === saved.current.name) return setName(saved.current.name);
                if (await save({ name })) {
                  saved.current.name = name;
                  patchSpace(space.id, { name });
                }
              }}
              className={rowInputClass}
            />
          </GroupRow>
          <GroupRow label="Link" htmlFor="slug">
            <span className="flex min-w-0 items-center justify-end rounded-[10px] px-2 transition-colors focus-within:bg-surface-2 hover:bg-surface-2">
              <span className="truncate text-[15px] text-faint md:text-[14px]">
                <span className="max-sm:hidden">{appHost}</span>/
              </span>
              <input
                id="slug"
                value={slug}
                maxLength={40}
                // The public link is the owner's to change (it breaks every shared link and embed).
                readOnly={members.role !== "owner"}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                onBlur={async () => {
                  if (slug === savedSlug) return;
                  if (slugMessage && !slugMessage.ok) return;
                  if (await save({ slug }, "Link updated")) {
                    setSavedSlug(slug);
                    patchSpace(space.id, { slug });
                    setSlugState(null);
                    router.refresh();
                  } else setSlug(savedSlug);
                }}
                className="[field-sizing:content] h-10 min-w-[2ch] bg-transparent text-[15px] text-ink outline-none md:text-[14px]"
                aria-describedby="slug-state"
              />
            </span>
          </GroupRow>
          <GroupRow label="Website" htmlFor="website">
            <input
              id="website"
              inputMode="url"
              placeholder="acme.com"
              value={website}
              maxLength={300}
              onChange={(e) => setWebsite(e.target.value)}
              onBlur={async () => {
                if (website === saved.current.website) return;
                if (await save({ website })) saved.current.website = website;
              }}
              className={rowInputClass}
            />
          </GroupRow>
          <GroupRow label="Mailing address" htmlFor="address" className="items-start [&>label]:pt-[9px]">
            <textarea
              id="address"
              rows={1}
              placeholder="Optional"
              value={address}
              maxLength={300}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={async () => {
                if (address === saved.current.address) return;
                const res = await saveBusinessAddress(space.id, address);
                if (!res.ok) return toast.error(res.error);
                saved.current.address = res.data.address;
                setAddress(res.data.address);
                toast.success("Saved");
              }}
              className={cn(rowInputClass, "[field-sizing:content] h-auto min-h-10 max-w-[300px] resize-none py-2.5 leading-snug")}
            />
          </GroupRow>
          <GroupRow label="Brand colour" htmlFor="color">
            <span className="font-mono text-[13px] text-muted">{color}</span>
            <input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={async () => {
                if (color === saved.current.brandColor) return;
                if (await save({ brand_color: color })) saved.current.brandColor = color;
              }}
              className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0 ring-1 ring-line [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
            />
          </GroupRow>
        </Group>
        <p
          id="slug-state"
          className={cn("pt-2 text-[13px]", slugMessage ? (slugMessage.ok ? "text-muted" : "text-danger") : "text-muted")}
          aria-live="polite"
        >
          {slugMessage ? (
            slugMessage.ok ? (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3.5" strokeWidth={2.5} /> Available
              </span>
            ) : (
              slugMessage.error
            )
          ) : (
            "New widgets use the brand colour."
          )}
        </p>

        {domain}

        <MembersSettings {...members} />

        {/* Owner only: the emails go to the owner. */}
        {members.role === "owner" && (
          <Group title="Notifications" hint={`Sent to ${email}`}>
            <GroupRow label="Email me new testimonials" htmlFor="notify">
              <Switch
                id="notify"
                on={notify}
                onChange={async (v) => {
                  setNotify(v);
                  if (!(await save({ notify: v }, v ? "Emails on" : "Emails off"))) setNotify(!v);
                }}
              />
            </GroupRow>
          </Group>
        )}

        {children}

        {members.role === "owner" ? (
          <Group>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmAction({
                  title: `Delete ${space.name}?`,
                  message: "Its testimonials, widgets and files go too, for every member. This can’t be undone.",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (!ok) return;
                const res = await deleteSpace(space.id);
                if (!res.ok) return toast.error(res.error);
                toast.success("Space deleted");
                router.replace("/app");
              }}
              className="flex min-h-[52px] w-full items-center justify-center px-4 text-[15px] font-medium text-danger transition-colors hover:bg-danger-soft/50"
            >
              Delete space
            </button>
          </Group>
        ) : (
          <Group>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmAction({
                  title: `Leave ${space.name}?`,
                  message: "You lose access until someone invites you again.",
                  confirmLabel: "Leave",
                  destructive: true,
                });
                if (!ok) return;
                const res = await leaveSpace(space.id);
                if (!res.ok) return toast.error(res.error);
                toast.success(`You left ${space.name}`);
                router.replace("/app");
              }}
              className="flex min-h-[52px] w-full items-center justify-center px-4 text-[15px] font-medium text-danger transition-colors hover:bg-danger-soft/50"
            >
              Leave space
            </button>
          </Group>
        )}
      </Page>
    </div>
  );
}

export function SavingDot({ busy }: { busy: boolean }) {
  return busy ? <Loader2 className="size-4 animate-spin text-faint" /> : null;
}
