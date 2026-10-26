"use client";

import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@/components/app/link";
import { useState } from "react";
import { toast } from "sonner";
import { createApiKey, revokeApiKey, type KeyItem } from "@/app/actions/integrations";
import { Group } from "@/components/app/grouped";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { CodeBlock } from "@/components/widgets/code-block";
import { AddRow, ago, Note } from "./ui";

type Scope = KeyItem["scope"];

const SCOPES: { value: Scope; label: string }[] = [
  { value: "write", label: "Read and write" },
  { value: "read", label: "Read only" },
];

export function ApiKeys({ spaceId, initial }: { spaceId: string; initial: KeyItem[] }) {
  const [keys, setKeys] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function revoke(k: KeyItem) {
    const ok = await confirmAction({
      title: `Revoke “${k.name}”?`,
      message: "Apps using it stop working at once.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    const before = keys;
    setKeys((list) => list.filter((x) => x.id !== k.id));
    const res = await revokeApiKey(spaceId, k.id);
    if (!res.ok) {
      setKeys(before);
      toast.error(res.error);
    } else toast.success("Key revoked");
  }

  return (
    <>
      <Group
        title="API keys"
        hint={
          <>
            For the{" "}
            <Link href="/docs/api" className="underline decoration-muted/40 underline-offset-2 hover:text-ink">
              API
            </Link>
            ,{" "}
            <Link href="/docs/mcp" className="underline decoration-muted/40 underline-offset-2 hover:text-ink">
              MCP
            </Link>
            , Zapier, Make and the Chrome extension.
          </>
        }
      >
        <AnimatePresence initial={false}>
          {keys.map((k) => (
            <motion.div
              key={k.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="flex min-h-[60px] items-center gap-3 py-2.5 pr-2 pl-4"
              data-testid="api-key"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px]">{k.name}</div>
                <div className="truncate text-[13px] text-muted" suppressHydrationWarning>
                  {k.scope === "write" ? "Read and write" : "Read only"} · {k.lastUsedAt ? `Used ${ago(k.lastUsedAt)}` : "Never used"}
                </div>
              </div>
              <span className="font-mono text-[12.5px] text-faint max-sm:hidden">{k.prefix}…</span>
              <Button
                variant="plain"
                size="sm"
                className="hover:text-danger"
                onClick={() => void revoke(k)}
                aria-label={`Revoke ${k.name}`}
              >
                Revoke
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
        <AddRow label="New key" onClick={() => setCreating(true)} />
      </Group>
      <NewKeySheet spaceId={spaceId} open={creating} onOpenChange={setCreating} onCreated={(item) => setKeys((list) => [...list, item])} />
    </>
  );
}

function NewKeySheet({
  spaceId,
  open,
  onOpenChange,
  onCreated,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (item: KeyItem) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The key exists only here, until the sheet closes.
  const [key, setKey] = useState<string | null>(null);
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    if (open) {
      setName("");
      setScope("write");
      setError(null);
      setKey(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Add a name");
    setBusy(true);
    const res = await createApiKey(spaceId, { name, scope });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onCreated(res.data.item);
    setKey(res.data.key);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setKey(null);
        onOpenChange(o);
      }}
      title={key ? "Your new key" : "New API key"}
      footer={
        key ? (
          <div className="flex justify-end">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-key" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Create key
            </Button>
          </div>
        )
      }
    >
      {key ? (
        <div className="space-y-3 p-5" data-testid="new-key">
          <CodeBlock code={key} label="API key" />
          <Note>Shown once. Copy it now.</Note>
        </div>
      ) : (
        <form id="new-key" onSubmit={submit} className="space-y-4 p-5" noValidate>
          <Field label="Name" htmlFor="key-name">
            <Input
              id="key-name"
              autoFocus
              placeholder="Zapier"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="key-error"
            />
          </Field>
          <Field label="Access">
            <Segmented label="Access" value={scope} onChange={setScope} options={SCOPES} />
          </Field>
          <p id="key-error" className="min-h-[18px] text-[13px] text-danger" aria-live="polite">
            {error}
          </p>
        </form>
      )}
    </Sheet>
  );
}
