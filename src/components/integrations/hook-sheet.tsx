"use client";

import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteWebhook,
  loadDeliveries,
  retryDelivery,
  rollWebhookSecret,
  sendWebhookTest,
  updateWebhook,
} from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Field, Input, Label } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CodeBlock } from "@/components/widgets/code-block";
import { cn } from "@/lib/cn";
import { EVENT_LABELS, EVENTS } from "@/lib/webhook-events";
import type { DeliveryView, HookView } from "@/lib/webhooks";
import { ago, CheckRow, Note } from "./ui";

export function hookTitle(hook: Pick<HookView, "kind" | "url">) {
  if (hook.kind === "slack") return "Slack";
  if (hook.kind === "discord") return "Discord";
  if (hook.kind === "rest") {
    if (/zapier\.com/.test(hook.url)) return "Zapier";
    if (/make\.com|integromat/.test(hook.url)) return "Make";
    return hook.url.split("/")[0];
  }
  return hook.url.replace(/^https?:\/\//, "");
}

// One line about a delivery: code and time when it worked, the reason in red when it didn't.
// Chat messages read plainer ("Sent 2 min ago").
export function deliveryLine(d: DeliveryView, chat = false) {
  if (d.state === "delivered") return chat ? `Sent ${ago(d.at)}` : `${d.code ?? "OK"} · ${ago(d.at)}${d.ms != null ? ` · ${d.ms} ms` : ""}`;
  if (d.state === "failed") return `Failed · ${d.error ?? d.code ?? "No answer"} · ${ago(d.at)}`;
  if (!d.attempts) return "Sending…";
  return `Retrying · ${d.error ?? "No answer"} · ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}`;
}

// Delivered, or still on its first try: quiet. Failed or retrying: red.
export const failing = (d: DeliveryView) => d.state === "failed" || (d.state === "pending" && d.attempts > 0);

export function HookSheet({
  spaceId,
  hook,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
  onReplace,
}: {
  spaceId: string;
  hook: HookView | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: (hook: HookView) => void;
  onDeleted: (id: string) => void;
  onReplace?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryView[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "roll" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const id = open && hook ? hook.id : null;
  if (seen !== id) {
    setSeen(id);
    if (hook) {
      setUrl(hook.url);
      setEvents(hook.events);
      setDeliveries(null);
      setSecret(null);
      setError(null);
      setLoadError(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    let live = true;
    void loadDeliveries(spaceId, id).then((res) => {
      if (!live) return;
      setDeliveries(res.ok ? res.data : []);
      if (!res.ok) setLoadError(res.error);
    });
    return () => {
      live = false;
    };
  }, [id, spaceId]);

  if (!hook) return null;
  const editable = hook.kind === "webhook";
  const chat = hook.kind === "slack" || hook.kind === "discord";
  const dirty = editable && (url.trim() !== hook.url || events.slice().sort().join() !== hook.events.slice().sort().join());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!hook || !dirty || busy) return;
    setBusy("save");
    const res = await updateWebhook(spaceId, hook.id, { url, events });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    onChanged(res.data);
    toast.success("Saved");
  }

  async function test() {
    if (!hook) return;
    setBusy("test");
    const res = await sendWebhookTest(spaceId, hook.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setDeliveries((list) => [res.data, ...(list ?? [])]);
    onChanged({ ...hook, last: res.data });
    if (res.data.state === "delivered") toast.success("Test delivered");
    else toast.error(`Test failed: ${res.data.error ?? res.data.code}`);
  }

  async function roll() {
    if (!hook) return;
    const ok = await confirmAction({
      title: "Roll the signing secret?",
      message: "The old one stops working at once.",
      confirmLabel: "Roll secret",
    });
    if (!ok) return;
    setBusy("roll");
    const res = await rollWebhookSecret(spaceId, hook.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setSecret(res.data.secret);
  }

  async function retry(d: DeliveryView) {
    setBusy(d.id);
    const res = await retryDelivery(spaceId, d.id);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setDeliveries((list) => (list ?? []).map((x) => (x.id === d.id ? res.data : x)));
    if (hook?.last?.id === d.id) onChanged({ ...hook, last: res.data });
    if (res.data.state === "delivered") toast.success("Delivered");
    else toast.error(`Still failing: ${res.data.error ?? res.data.code}`);
  }

  async function remove() {
    if (!hook) return;
    const title = hookTitle(hook);
    const ok = await confirmAction({
      title: chat ? `Disconnect ${title}?` : editable ? "Delete this webhook?" : `Remove ${title}?`,
      message: chat ? "New testimonials stop showing there." : "Its deliveries stop at once.",
      confirmLabel: chat ? "Disconnect" : editable ? "Delete" : "Remove",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteWebhook(spaceId, hook.id);
    if (!res.ok) return toast.error(res.error);
    onDeleted(hook.id);
    onOpenChange(false);
    toast.success(chat ? "Disconnected" : "Removed");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editable ? "Webhook" : hookTitle(hook)}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="plain" className="px-0 text-danger hover:text-danger" onClick={() => void remove()}>
            {chat ? "Disconnect" : editable ? "Delete webhook" : "Remove"}
          </Button>
          {editable && (
            <Button type="submit" form="hook-edit" disabled={!dirty || busy === "save"}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 p-5">
        {editable ? (
          <form id="hook-edit" onSubmit={save} className="space-y-4" noValidate>
            <Field label="URL" htmlFor="hook-url">
              <Input
                id="hook-url"
                inputMode="url"
                spellCheck={false}
                autoCapitalize="off"
                value={url}
                maxLength={500}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby="hook-error"
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-muted">Events</legend>
              <div className="divide-y divide-line overflow-hidden rounded-[10px] ring-1 ring-line">
                {EVENTS.map((ev) => (
                  <CheckRow
                    key={ev}
                    label={EVENT_LABELS[ev]}
                    checked={events.includes(ev)}
                    onChange={(on) => setEvents((list) => (on ? [...list, ev] : list.filter((x) => x !== ev)))}
                  />
                ))}
              </div>
            </fieldset>
            {error && (
              <p id="hook-error" className="text-[13px] text-danger" aria-live="polite">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div>
            <Label>{chat ? "Webhook link" : "Sends to"}</Label>
            <p className="truncate font-mono text-[13px] text-muted">{hook.url}</p>
            {!chat && <p className="mt-1 text-[13px] text-muted">{hook.events.map((e) => EVENT_LABELS[e] ?? e).join(", ")}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void test()} disabled={busy === "test"}>
            {busy === "test" && <Loader2 className="size-3.5 animate-spin" />}
            Send test
          </Button>
          {editable && (
            <Button variant="secondary" size="sm" onClick={() => void roll()} disabled={busy === "roll"}>
              Roll secret
            </Button>
          )}
          {chat && onReplace && (
            <Button variant="secondary" size="sm" onClick={onReplace}>
              Replace link
            </Button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {secret && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2 overflow-hidden">
              <CodeBlock code={secret} label="Signing secret" />
              <Note>Shown once. Copy it now.</Note>
            </motion.div>
          )}
        </AnimatePresence>

        <section aria-labelledby="deliveries">
          <h3 id="deliveries" className="pb-2 text-[13px] font-medium text-muted">
            Deliveries
          </h3>
          <div className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line" aria-busy={deliveries === null}>
            {deliveries === null ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="flex h-[56px] items-center justify-between px-4">
                  <div className="h-3.5 w-28 skeleton" />
                  <div className="h-3.5 w-20 skeleton" />
                </div>
              ))
            ) : deliveries.length === 0 ? (
              <p className={cn("px-4 py-4 text-[14px]", loadError ? "text-danger" : "text-muted")}>{loadError ?? "None yet"}</p>
            ) : (
              deliveries.map((d) => (
                <div key={d.id} className="flex min-h-[56px] items-center gap-3 py-2 pr-2 pl-4" data-testid="delivery">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{EVENT_LABELS[d.event] ?? d.event}</div>
                    <div className={cn("truncate text-[13px]", failing(d) ? "text-danger" : "text-muted")} suppressHydrationWarning>
                      {deliveryLine(d, chat)}
                    </div>
                  </div>
                  {d.state !== "delivered" && (
                    <Button variant="secondary" size="sm" onClick={() => void retry(d)} disabled={busy === d.id}>
                      {busy === d.id && <Loader2 className="size-3.5 animate-spin" />}
                      Retry
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
