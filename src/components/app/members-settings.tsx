"use client";

import { Crown, Loader2, Mail, MoreHorizontal, RotateCw, UserMinus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { inviteMember, makeOwner, removeMember, resendInvite, revokeInvite } from "@/app/actions/members";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { Role } from "@/lib/types";
import { Group } from "./grouped";

export type MemberView = { id: string; name: string; email: string; image: string | null; role: Role };
export type InviteView = { id: string; email: string };

const menuButton =
  "grid size-8 shrink-0 place-items-center rounded-[8px] text-muted transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-soft data-[state=open]:bg-surface-2";

// Space settings: who can open this space. The owner invites, hands over and removes; editors see the list.
export function MembersSettings({
  spaceId,
  me,
  role,
  billing,
  members,
  invites: initialInvites,
}: {
  spaceId: string;
  me: string;
  role: Role;
  billing: boolean;
  members: MemberView[];
  invites: InviteView[];
}) {
  const router = useRouter();
  const owner = role === "owner";
  const [people, setPeople] = useState(members);
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    const res = await inviteMember(spaceId, email);
    setSending(false);
    if (!res.ok) return toast.error(res.error);
    setInvites((list) => [...list.filter((i) => i.id !== res.data.id && i.email !== res.data.email), res.data]);
    setEmail("");
    toast.success("Invite sent");
  }

  const nameOf = (m: MemberView) => m.name || m.email.split("@")[0];

  return (
    <Group title="Members">
      {people.map((m) => (
        <div key={m.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5" data-member={m.email}>
          <Avatar src={m.image} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px]">
              {nameOf(m)}
              {m.id === me && <span className="text-muted"> (you)</span>}
            </div>
            <div className="truncate text-[13px] text-muted">{m.email}</div>
          </div>
          <span className="shrink-0 text-[13px] text-muted">{m.role === "owner" ? "Owner" : "Editor"}</span>
          {owner &&
            (m.role === "owner" ? (
              <span className="size-8 shrink-0" aria-hidden />
            ) : (
              <Menu>
                <MenuTrigger className={menuButton} aria-label={`More for ${nameOf(m)}`}>
                  <MoreHorizontal className="size-[18px]" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem
                    onSelect={async () => {
                      const ok = await confirmAction({
                        title: `Make ${nameOf(m)} the owner?`,
                        message: billing
                          ? "They manage members and billing. You stay on as an editor."
                          : "They manage members. You stay on as an editor.",
                        confirmLabel: "Make owner",
                      });
                      if (!ok) return;
                      const res = await makeOwner(spaceId, m.id);
                      if (!res.ok) return toast.error(res.error);
                      toast.success(`${nameOf(m)} is the owner`);
                      router.refresh();
                    }}
                  >
                    <Crown /> Make owner
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    destructive
                    onSelect={async () => {
                      const ok = await confirmAction({
                        title: `Remove ${nameOf(m)}?`,
                        message: "They lose access to this space.",
                        confirmLabel: "Remove",
                        destructive: true,
                      });
                      if (!ok) return;
                      const res = await removeMember(spaceId, m.id);
                      if (!res.ok) return toast.error(res.error);
                      setPeople((list) => list.filter((p) => p.id !== m.id));
                      toast.success("Removed");
                    }}
                  >
                    <UserMinus /> Remove
                  </MenuItem>
                </MenuContent>
              </Menu>
            ))}
        </div>
      ))}

      {owner &&
        invites.map((i) => (
          <div key={i.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5" data-invite={i.email}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-faint" aria-hidden>
              <Mail className="size-4" />
            </span>
            <div className="min-w-0 flex-1 truncate text-[14.5px]">{i.email}</div>
            <span className="shrink-0 text-[13px] text-muted">Invited</span>
            <Menu>
              <MenuTrigger className={menuButton} aria-label={`More for ${i.email}`}>
                <MoreHorizontal className="size-[18px]" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  onSelect={async () => {
                    const res = await resendInvite(spaceId, i.id);
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Invite sent again");
                  }}
                >
                  <RotateCw /> Resend
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onSelect={async () => {
                    const res = await revokeInvite(spaceId, i.id);
                    if (!res.ok) return toast.error(res.error);
                    setInvites((list) => list.filter((x) => x.id !== i.id));
                    toast.success("Invite canceled");
                  }}
                >
                  <X /> Cancel invite
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        ))}

      {owner && (
        <form onSubmit={invite} className="flex min-h-[56px] items-center gap-2 py-2 pr-3 pl-2">
          <label htmlFor="invite-email" className="sr-only">
            Email to invite
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="Invite by email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-[8px] bg-transparent px-2 text-[15px] text-ink transition-colors outline-none placeholder:text-faint hover:bg-surface-2 focus:bg-surface-2 md:text-[14px]"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!email.trim() || sending} className="min-w-[68px]">
            {sending ? <Loader2 className="size-4 animate-spin" aria-label="Sending" /> : "Invite"}
          </Button>
        </form>
      )}
    </Group>
  );
}
