"use client";

import { FileUp, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { sendInviteBatch } from "@/app/actions/invites";
import { Link } from "@/components/app/link";
import { Group, GroupRow } from "@/components/app/grouped";
import { Page, PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { inputClass, textareaClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { InviteListItem, InviteStatus } from "@/lib/invites";
import { csvRecipients, parseRecipients, toLines } from "@/lib/recipients";
import { formatDate } from "@/lib/widget/render";
import { CollectTabs } from "./tabs";

const STATUS: Record<InviteStatus, string> = {
  sent: "Sent",
  opened: "Opened",
  clicked: "Clicked",
  submitted: "Submitted",
  unsubscribed: "Unsubscribed",
};

const DAYS = [1, 2, 3, 5, 7, 14];

export function Invites({
  spaceId,
  forms,
  invites,
  quota: initialQuota,
  defaults,
  hasAddress,
}: {
  spaceId: string;
  forms: { id: string; name: string }[];
  invites: InviteListItem[];
  quota: { today: number; max: number };
  defaults: { subject: string; message: string };
  // The space's mailing address (Settings) goes in every invite's footer.
  hasAddress: boolean;
}) {
  const router = useRouter();
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const [people, setPeople] = useState("");
  const [subject, setSubject] = useState(defaults.subject);
  const [message, setMessage] = useState(defaults.message);
  const [reminders, setReminders] = useState("1");
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(initialQuota);
  const csvInput = useRef<HTMLInputElement>(null);
  const recipients = parseRecipients(people);
  const valid = recipients.filter((r) => r.email).length;
  const left = Math.max(0, quota.max - quota.today);

  async function importCsv(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Up to 2 MB");
    const list = csvRecipients(await file.text());
    if (!list.length) return toast.error("No email column found");
    setPeople((p) => [p.trim(), toLines(list)].filter(Boolean).join("\n"));
    toast.success(list.length === 1 ? "1 person added" : `${list.length} people added`);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!valid) return toast.error("Add at least one email");
    setBusy(true);
    const res = await sendInviteBatch(spaceId, {
      formId,
      recipients: recipients.map((r) => ({ name: r.name, email: r.email })),
      subject,
      message,
      reminders: Number(reminders),
      days: Number(days),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const r = res.data;
    setQuota({ today: r.today, max: r.max });
    const skipped = [
      r.unsubscribed && `${r.unsubscribed} unsubscribed`,
      r.duplicates && `${r.duplicates} repeated`,
      r.invalid && `${r.invalid} not valid`,
      r.overLimit && `${r.overLimit} over today’s limit`,
    ].filter(Boolean);
    if (r.sent) {
      toast.success(
        r.sent === 1 ? "Sent 1 invite" : `Sent ${r.sent} invites`,
        skipped.length ? { description: `Skipped: ${skipped.join(", ")}` } : undefined,
      );
      setPeople("");
    } else toast.error(skipped.length ? `Nothing sent: ${skipped.join(", ")}` : "Nothing sent");
    router.refresh();
  }

  return (
    <div className="pb-24">
      <PageHeader title="Collect" width="max-w-[880px]" />
      <Page width="max-w-[880px]">
        <CollectTabs spaceId={spaceId} />
        <form onSubmit={send}>
          <Group title="New invites">
            <GroupRow label="Form">
              <Select<string>
                aria-label="Form"
                value={formId}
                onChange={setFormId}
                options={forms.map((f) => ({ value: f.id, label: f.name }))}
                className="w-[200px]"
              />
            </GroupRow>
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="invite-people" className="text-[13px] font-medium text-muted">
                  People
                </label>
                <button
                  type="button"
                  onClick={() => csvInput.current?.click()}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <FileUp className="size-4" /> CSV
                </button>
                <input
                  ref={csvInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => void importCsv(e.target.files?.[0])}
                />
              </div>
              <textarea
                id="invite-people"
                rows={4}
                value={people}
                spellCheck={false}
                placeholder={"Ada Lovelace, ada@example.com\ngrace@example.com"}
                onChange={(e) => setPeople(e.target.value)}
                className={cn(textareaClass, "min-h-[104px]")}
              />
              <p className="mt-1.5 text-[13px] text-muted tabular-nums" aria-live="polite">
                {valid === 1 ? "1 person" : `${valid} people`}
                {recipients.length > valid && <span className="text-danger"> · {recipients.length - valid} without an email</span>}
              </p>
            </div>
            <div className="p-4">
              <label htmlFor="invite-subject" className="mb-2 block text-[13px] font-medium text-muted">
                Subject
              </label>
              <input
                id="invite-subject"
                value={subject}
                maxLength={150}
                onChange={(e) => setSubject(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="p-4">
              <label htmlFor="invite-message" className="mb-2 block text-[13px] font-medium text-muted">
                Message
              </label>
              <textarea
                id="invite-message"
                rows={7}
                value={message}
                maxLength={3000}
                onChange={(e) => setMessage(e.target.value)}
                className={textareaClass}
                aria-describedby="invite-message-hint"
              />
              <p id="invite-message-hint" className="mt-1.5 text-[13px] text-muted">
                {"{name}"} becomes their first name. Each email has their own link.
              </p>
            </div>
            <GroupRow label="Reminder">
              <Select<string>
                aria-label="Reminders"
                value={reminders}
                onChange={setReminders}
                options={[
                  { value: "0", label: "None" },
                  { value: "1", label: "Once" },
                  { value: "2", label: "Twice" },
                ]}
                className="w-[100px]"
              />
              {reminders !== "0" && (
                <Select<string>
                  aria-label="Days before a reminder"
                  value={days}
                  onChange={setDays}
                  options={DAYS.map((d) => ({ value: String(d), label: d === 1 ? "In 1 day" : `In ${d} days` }))}
                  className="w-[116px]"
                />
              )}
            </GroupRow>
          </Group>
          {!hasAddress && (
            <p className="pt-2 text-[13px] text-muted" data-testid="no-address">
              No mailing address in the footer yet.{" "}
              <Link href={`/app/${spaceId}/settings#address`} className="font-medium text-ink underline underline-offset-2">
                Add
              </Link>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted tabular-nums">
              {quota.today} of {quota.max} sent today
            </p>
            <Button type="submit" disabled={busy || !valid || !left}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {valid > 1 ? `Send to ${valid}` : "Send"}
            </Button>
          </div>
        </form>

        {invites.length > 0 && (
          <Group title="Sent" className="mt-10">
            <ul className="divide-y divide-line">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3 md:px-5" data-testid="invite">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-medium">{i.name || i.email}</div>
                    <div className="truncate text-[13px] text-muted">
                      {i.name ? `${i.email} · ` : ""}
                      {i.form}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn("text-[13.5px]", i.status === "submitted" ? "font-medium text-ink" : "text-muted")}
                      data-testid="invite-status"
                    >
                      {i.status === "sent" && i.reminders > 0 ? "Reminded" : STATUS[i.status]}
                    </div>
                    <time className="text-[12px] text-faint tabular-nums" dateTime={i.date}>
                      {formatDate(i.date)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </Group>
        )}
      </Page>
    </div>
  );
}
