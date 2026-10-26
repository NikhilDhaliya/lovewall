"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { checkDomain, removeDomain, saveDomain } from "@/app/actions/domains";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy";
import type { DomainInfo } from "@/lib/data/domains";
import { Group, GroupRow, rowInputClass } from "./grouped";

// The DNS name to put the record on: "love" for love.acme.com, "@" for the bare domain.
function recordName(domain: string) {
  const labels = domain.split(".");
  return labels.length > 2 ? labels.slice(0, -2).join(".") : "@";
}

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-[13.5px]">{value}</code>
      <CopyButton
        text={value}
        iconOnly
        label={`Copy ${label}`}
        className="size-8 shrink-0 rounded-[8px] text-muted hover:bg-surface-2 hover:text-ink"
      />
    </span>
  );
}

// Space settings: serve this space's forms and wall pages on the owner's own domain.
export function DomainSettings({
  spaceId,
  initial,
  target,
  hosted,
}: {
  spaceId: string;
  initial: DomainInfo | null;
  target: string;
  hosted: boolean;
}) {
  const [domain, setDomain] = useState(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"save" | "verify" | null>(null);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy) return;
    setBusy("save");
    const res = await saveDomain(spaceId, input);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setDomain(res.data);
    setInput("");
  }

  async function verify() {
    setBusy("verify");
    const res = await checkDomain(spaceId);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setDomain(res.data);
    if (res.data.verified) toast.success("Domain verified");
    else toast.error("The record isn’t there yet. DNS can take a while.");
  }

  async function remove() {
    if (!domain) return;
    const ok = await confirmAction({
      title: `Remove ${domain.domain}?`,
      message: "Links on it stop working.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const res = await removeDomain(spaceId);
    if (!res.ok) return toast.error(res.error);
    setDomain(null);
  }

  return (
    <Group
      title="Custom domain"
      hint={hosted ? "TLS is set up for you once the record is live." : "Point DNS at your server. Your reverse proxy handles TLS."}
    >
      {domain ? (
        <>
          <GroupRow label="Domain">
            <span className="truncate text-[15px] font-medium md:text-[14px]" data-testid="domain">
              {domain.domain}
            </span>
          </GroupRow>
          <GroupRow label="Status">
            {domain.verified ? (
              <span className="flex items-center gap-1 text-[14px] font-medium" data-testid="domain-status">
                <Check className="size-4" strokeWidth={2.5} /> Verified
              </span>
            ) : (
              <>
                <span className="text-[14px] text-muted" data-testid="domain-status">
                  Not verified
                </span>
                <Button size="sm" onClick={() => void verify()} disabled={busy !== null}>
                  {busy === "verify" && <Loader2 className="size-3.5 animate-spin" />} Verify
                </Button>
              </>
            )}
          </GroupRow>
          {!domain.verified && (
            <>
              <GroupRow label="Type">
                <code className="font-mono text-[13.5px]">CNAME</code>
              </GroupRow>
              <GroupRow label="Name">
                <Copyable value={recordName(domain.domain)} label="record name" />
              </GroupRow>
              <GroupRow label="Value">
                <Copyable value={target} label="record value" />
              </GroupRow>
              <GroupRow label="Type">
                <code className="font-mono text-[13.5px]">TXT</code>
              </GroupRow>
              <GroupRow label="Name">
                <Copyable value={recordName(domain.txt.name)} label="TXT record name" />
              </GroupRow>
              <GroupRow label="Value">
                <Copyable value={domain.txt.value} label="TXT record value" />
              </GroupRow>
            </>
          )}
          <button
            type="button"
            onClick={() => void remove()}
            className="flex min-h-[48px] w-full items-center px-4 text-[14.5px] text-danger transition-colors hover:bg-danger-soft/50"
          >
            Remove domain
          </button>
        </>
      ) : (
        <form onSubmit={save} className="flex min-h-[52px] items-center gap-2 py-1.5 pr-2 pl-4">
          <label htmlFor="domain" className="shrink-0 text-[14.5px]">
            Domain
          </label>
          <input
            id="domain"
            value={input}
            placeholder="love.acme.com"
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            maxLength={253}
            onChange={(e) => setInput(e.target.value)}
            className={rowInputClass}
          />
          <Button type="submit" size="sm" disabled={!input.trim() || busy !== null}>
            {busy === "save" && <Loader2 className="size-3.5 animate-spin" />} Add
          </Button>
        </form>
      )}
    </Group>
  );
}
