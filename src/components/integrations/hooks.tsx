"use client";

import { ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@/components/app/link";
import { useState } from "react";
import { toast } from "sonner";
import { addWebhook, connectChat } from "@/app/actions/integrations";
import { Group } from "@/components/app/grouped";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { CodeBlock } from "@/components/widgets/code-block";
import { cn } from "@/lib/cn";
import { CHAT_KINDS, EVENT_LABELS, EVENTS, type ChatKind } from "@/lib/webhook-events";
import type { DeliveryView, HookView } from "@/lib/webhooks";
import { deliveryLine, failing, HookSheet, hookTitle } from "./hook-sheet";
import { AddRow, CheckRow, Note } from "./ui";

const CHAT: Record<ChatKind, { name: string; placeholder: string; help: string }> = {
  slack: {
    name: "Slack",
    placeholder: "https://hooks.slack.com/services/…",
    help: "https://api.slack.com/messaging/webhooks",
  },
  discord: {
    name: "Discord",
    placeholder: "https://discord.com/api/webhooks/…",
    help: "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
  },
};

function Status({ last, empty, chat }: { last: DeliveryView | null; empty: string; chat?: boolean }) {
  if (!last) return <span>{empty}</span>;
  return (
    <span className={cn(failing(last) && "text-danger")} suppressHydrationWarning>
      {deliveryLine(last, chat)}
    </span>
  );
}

const rowClass =
  "flex min-h-[60px] w-full items-center gap-3 py-2.5 pr-3 pl-4 text-left transition-colors outline-none hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring)]";

export function Hooks({ spaceId, initial }: { spaceId: string; initial: HookView[] }) {
  const [hooks, setHooks] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState<ChatKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const endpoints = hooks.filter((h) => h.kind === "webhook" || h.kind === "rest");
  const opened = hooks.find((h) => h.id === openId) ?? null;

  const upsert = (hook: HookView) =>
    setHooks((list) => (list.some((h) => h.id === hook.id) ? list.map((h) => (h.id === hook.id ? hook : h)) : [...list, hook]));

  return (
    <>
      <Group title="Slack and Discord">
        {CHAT_KINDS.map((kind) => {
          const hook = hooks.find((h) => h.kind === kind);
          return hook ? (
            <button key={kind} type="button" className={rowClass} onClick={() => setOpenId(hook.id)} data-testid={`chat-${kind}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px]">{CHAT[kind].name}</span>
                <span className="block truncate text-[13px] text-muted">
                  <Status last={hook.last} empty="Connected" chat />
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </button>
          ) : (
            <div key={kind} className="flex min-h-[52px] items-center justify-between gap-4 py-2 pr-2.5 pl-4">
              <span className="text-[14.5px]">{CHAT[kind].name}</span>
              <Button variant="secondary" size="sm" onClick={() => setConnecting(kind)} aria-label={`Connect ${CHAT[kind].name}`}>
                Connect
              </Button>
            </div>
          );
        })}
      </Group>

      <Group
        title="Webhooks"
        hint={
          <Link href="/docs/api#webhooks" className="underline decoration-muted/40 underline-offset-2 hover:text-ink">
            Payloads and signatures
          </Link>
        }
      >
        <AnimatePresence initial={false}>
          {endpoints.map((hook) => (
            <motion.button
              key={hook.id}
              type="button"
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className={rowClass}
              onClick={() => setOpenId(hook.id)}
              data-testid="webhook"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]">{hookTitle(hook)}</span>
                <span className="block truncate text-[13px] text-muted">
                  {hook.events.length === EVENTS.length ? "All events" : hook.events.map((e) => EVENT_LABELS[e]).join(", ")} ·{" "}
                  <Status last={hook.last} empty="No deliveries yet" />
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </motion.button>
          ))}
        </AnimatePresence>
        <AddRow label="Add endpoint" onClick={() => setAdding(true)} />
      </Group>

      <AddWebhookSheet spaceId={spaceId} open={adding} onOpenChange={setAdding} onAdded={upsert} />
      <ConnectSheet
        spaceId={spaceId}
        kind={connecting}
        onClose={() => setConnecting(null)}
        onConnected={(hook) => {
          upsert(hook);
          setConnecting(null);
        }}
      />
      <HookSheet
        spaceId={spaceId}
        hook={opened}
        open={opened !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={upsert}
        onDeleted={(id) => setHooks((list) => list.filter((h) => h.id !== id))}
        onReplace={
          opened && (opened.kind === "slack" || opened.kind === "discord")
            ? () => {
                const kind = opened.kind as ChatKind;
                setOpenId(null);
                setConnecting(kind);
              }
            : undefined
        }
      />
    </>
  );
}

function AddWebhookSheet({
  spaceId,
  open,
  onOpenChange,
  onAdded,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: (hook: HookView) => void;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["testimonial.created"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The signing secret exists only here, until the sheet closes.
  const [secret, setSecret] = useState<string | null>(null);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setUrl("");
      setEvents(["testimonial.created"]);
      setError(null);
      setSecret(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!url.trim()) return setError("Add a link");
    if (!events.length) return setError("Pick at least one event");
    setBusy(true);
    const res = await addWebhook(spaceId, { url, events });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onAdded(res.data.hook);
    setSecret(res.data.secret);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setSecret(null);
        onOpenChange(o);
      }}
      title={secret ? "Endpoint added" : "Add endpoint"}
      footer={
        secret ? (
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-webhook" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Add
            </Button>
          </div>
        )
      }
    >
      {secret ? (
        <div className="space-y-3 p-5" data-testid="webhook-secret">
          <CodeBlock code={secret} label="Signing secret" />
          <Note>Shown once. Copy it now.</Note>
        </div>
      ) : (
        <form id="add-webhook" onSubmit={submit} className="space-y-4 p-5" noValidate>
          <Field label="URL" htmlFor="webhook-url">
            <Input
              id="webhook-url"
              autoFocus
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              placeholder="https://example.com/webhooks"
              value={url}
              maxLength={500}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="webhook-error"
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
                  onChange={(on) => {
                    setEvents((list) => (on ? [...list, ev] : list.filter((x) => x !== ev)));
                    setError(null);
                  }}
                />
              ))}
            </div>
          </fieldset>
          <p id="webhook-error" className="min-h-[18px] text-[13px] text-danger" aria-live="polite">
            {error}
          </p>
        </form>
      )}
    </Sheet>
  );
}

function ConnectSheet({
  spaceId,
  kind,
  onClose,
  onConnected,
}: {
  spaceId: string;
  kind: ChatKind | null;
  onClose: () => void;
  onConnected: (hook: HookView) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(kind);
  if (seen !== kind) {
    setSeen(kind);
    if (kind) {
      setUrl("");
      setError(null);
    }
  }
  const info = CHAT[kind ?? seen ?? "slack"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind || busy) return;
    if (!url.trim()) return setError("Paste the webhook link");
    setBusy(true);
    const res = await connectChat(spaceId, kind, url);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onConnected(res.data.hook);
    if (res.data.test.state === "delivered") toast.success(`${info.name} connected. Test sent.`);
    else toast.error(`Saved, but the test failed: ${res.data.test.error ?? res.data.test.code}`);
  }

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Connect ${info.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="connect-chat" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Connect
          </Button>
        </div>
      }
    >
      <form id="connect-chat" onSubmit={submit} className="space-y-3 p-5" noValidate>
        <Field label="Webhook link" htmlFor="chat-url">
          <Input
            id="chat-url"
            autoFocus
            inputMode="url"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder={info.placeholder}
            value={url}
            maxLength={500}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby="chat-error"
          />
        </Field>
        <p id="chat-error" className="min-h-[18px] text-[13px] text-danger" aria-live="polite">
          {error}
        </p>
        <a
          href={info.help}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-muted underline decoration-muted/40 underline-offset-2 hover:text-ink"
        >
          Get a link from {info.name} <ExternalLink className="size-3" />
        </a>
      </form>
    </Sheet>
  );
}
